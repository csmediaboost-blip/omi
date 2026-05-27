/**
 * lib/safe-error.ts
 *
 * Never expose raw internal error messages to users in production.
 * Raw errors leak DB column names, schema info, and stack traces.
 *
 * Usage:
 *   return NextResponse.json({ error: safeError(err) }, { status: 500 });
 *   return NextResponse.json({ error: safeError(err, "Payment failed") }, { status: 500 });
 */

export function safeError(
  err: any,
  fallback = "An error occurred. Please try again.",
): string {
  if (process.env.NODE_ENV === "development") {
    return err?.message || fallback;
  }
  if (err?.message) {
    console.error("[safe-error] Internal:", err.message);
  }
  return fallback;
}

export const USER_ERRORS = {
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do this.",
  NOT_FOUND: "The requested resource was not found.",
  RATE_LIMITED: "Too many requests. Please slow down.",
  KYC_REQUIRED: "KYC verification required before withdrawing.",
  INSUFFICIENT_BALANCE: "Insufficient balance for this withdrawal.",
  ACCOUNT_FROZEN:
    "Your account is currently restricted. Please contact support.",
  INVALID_PIN: "Invalid PIN.",
  PIN_LOCKED: "Account locked due to too many failed PIN attempts.",
  BUSINESS_DAYS_ONLY: "Withdrawals are only available on business days.",
} as const;
