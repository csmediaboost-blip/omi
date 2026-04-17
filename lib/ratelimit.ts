import { NextRequest, NextResponse } from "next/server";

// In-memory store (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60_000,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options?: { max?: number; windowMs?: number },
) {
  return async (req: NextRequest) => {
    const ip = getClientIp(req);
    const { allowed, remaining } = rateLimit(
      ip,
      options?.max ?? 10,
      options?.windowMs ?? 60_000,
    );

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        },
      );
    }

    const response = await handler(req);
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  };
}
