// lib/sanitize.ts
// Input sanitization utilities — use on ALL user input before DB operations

/**
 * Strips HTML tags and dangerous characters.
 * Use for: names, descriptions, any free-text field.
 */
export function sanitizeText(input: unknown, maxLength = 500): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[<>"'`;\\]/g, "") // strip dangerous chars
    .replace(/--/g, "") // strip SQL comment syntax
    .replace(/\/\*/g, "") // strip SQL block comment
    .trim()
    .slice(0, maxLength);
}

/**
 * Validates an email address. Returns null if invalid.
 */
export function validateEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = input.toLowerCase().trim().slice(0, 254);
  const emailRegex = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(clean)) return null;
  const local = clean.split("@")[0];
  if (local.length < 2) return null;
  return clean;
}

/**
 * Validates a numeric amount. Returns null if invalid.
 */
export function validateAmount(
  input: unknown,
  min = 0.01,
  max = 1_000_000,
): number | null {
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  // Max 4 decimal places
  if (Math.round(n * 10000) / 10000 !== n) return null;
  return n;
}

/**
 * Validates a UUID. Returns null if invalid.
 */
export function validateUUID(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(input) ? input : null;
}

/**
 * Validates a wallet/account number. Alphanumeric + safe chars only.
 * Blocks special characters that could be used for injection.
 */
export function validateWalletAddress(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = input.trim().slice(0, 100);
  const safeRegex = /^[A-Za-z0-9\-_.]+$/;
  return safeRegex.test(clean) ? clean : null;
}

/**
 * Rate limit check via Supabase RPC.
 * Call from API routes (server-side only).
 */
export async function checkRateLimit(
  supabase: any,
  identifier: string,
  action: string,
  maxAttempts: number,
  windowMinutes: number,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_action: action,
      p_max_attempts: maxAttempts,
      p_window_minutes: windowMinutes,
    });
    return !!data;
  } catch {
    return true; // fail open — don't block on rate limit errors
  }
}
