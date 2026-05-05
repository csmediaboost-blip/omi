import crypto from "crypto";

export function generateDeviceFingerprint(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const userAgent = req.headers.get("user-agent") || "unknown";

  const fingerprint = crypto
    .createHash("sha256")
    .update(ip + userAgent)
    .digest("hex");

  return fingerprint;
}
