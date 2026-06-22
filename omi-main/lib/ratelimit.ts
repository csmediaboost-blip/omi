/**
 * lib/ratelimit.ts
 *
 * Distributed rate limiter — uses Upstash Redis when configured,
 * falls back to in-memory for local development.
 *
 * ⚠️  PRODUCTION NOTE: The in-memory fallback resets on every serverless cold
 * start and is NOT shared across instances. For reliable production rate
 * limiting, set the two env vars below to get a free Upstash Redis instance:
 *
 *   UPSTASH_REDIS_REST_URL=https://...upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=...
 *
 * Get a free instance at https://upstash.com
 *
 * Alternative drop-in (if you prefer the official SDK):
 *   pnpm add @upstash/ratelimit @upstash/redis
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis }     from "@upstash/redis";
 *   const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, "1 m") });
 */

import { NextRequest, NextResponse } from "next/server";

// ─── In-memory fallback store ─────────────────────────────────────────────────
const memoryStore = new Map<string, { count: number; resetAt: number }>();

async function redisIncr(key: string, windowMs: number): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // ── Memory fallback (development / no Redis configured) ──────────────────
  if (!url || !token) {
    const now = Date.now();
    const record = memoryStore.get(key);
    if (!record || now > record.resetAt) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    record.count++;
    return record.count;
  }

  // ── Upstash Redis via HTTP pipeline ──────────────────────────────────────
  try {
    const windowSeconds = Math.ceil(windowMs / 1000);
    const pipeline = [
      ["INCR", key],
      // NX = set expiry only on first request, preserving the window
      ["EXPIRE", key, String(windowSeconds), "NX"],
    ];

    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });

    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);

    const results = await res.json();
    return results[0]?.result ?? 1;
  } catch (err) {
    // Degrade gracefully — allow the request rather than block everything
    console.warn(
      "[ratelimit] Redis unavailable, falling back to memory store:",
      err,
    );
    const now = Date.now();
    const record = memoryStore.get(key);
    if (!record || now > record.resetAt) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    record.count++;
    return record.count;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a keyed action is within its rate limit.
 *
 * @param key         Unique identifier, e.g. `register:${ip}`
 * @param maxRequests Maximum allowed requests within the window (default 10)
 * @param windowMs    Window length in milliseconds (default 60 000 = 1 min)
 */
export async function rateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60_000,
): Promise<{ allowed: boolean; remaining: number }> {
  const count = await redisIncr(`rl:${key}`, windowMs);
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  };
}

/**
 * Extract the real client IP from Next.js / Vercel request headers.
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Higher-order wrapper that applies IP-based rate limiting to any route handler.
 *
 * Usage:
 *   export const POST = withRateLimit(handler, { max: 5, windowMs: 60_000 });
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options?: { max?: number; windowMs?: number },
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const ip = getClientIp(req);
    const { allowed, remaining } = await rateLimit(
      ip,
      options?.max ?? 10,
      options?.windowMs ?? 60_000,
    );

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const response = await handler(req);
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  };
}
