import crypto from "crypto";

export function deviceFingerprint(req: any) {
  const ip = req.headers["x-forwarded-for"] || "unknown";

  const agent = req.headers["user-agent"] || "unknown";

  return crypto
    .createHash("sha256")
    .update(ip + agent)
    .digest("hex");
}
