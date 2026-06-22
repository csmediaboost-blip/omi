// lib/webhook-security.ts
// Webhook signature verification utilities

import * as crypto from "crypto";

/**
 * Verifies a KoraPay webhook signature
 * Documentation: https://docs.korapay.com/webhooks
 */
export function verifyKorapaySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // KoraPay uses HMAC-SHA512
    const expected = crypto
      .createHmac("sha512", secret)
      .update(payload)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Verifies a Stripe webhook signature
 * Documentation: https://stripe.com/docs/webhooks/signatures
 */
export function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // Stripe uses HMAC-SHA256
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(`t=0,v1=${expected}`),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Verifies a generic HMAC signature
 */
export function verifyHMACSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: "sha256" | "sha512" = "sha256"
): boolean {
  try {
    const expected = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}
