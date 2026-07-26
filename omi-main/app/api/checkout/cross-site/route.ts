// app/api/checkout/cross-site/route.ts  (WEBSITE A — NEW FILE)
// ─────────────────────────────────────────────────────────────────────────────
// Website B calls this endpoint (server-to-server) whenever a user on B wants
// to pay. This creates the actual Korapay charge using Website A's Korapay
// account/keys and returns a checkout_url. B then redirects the user's
// browser straight to that checkout_url — the whole payment experience runs
// on Korapay's hosted page, A never needs to touch B's database, and B never
// needs its own Korapay keys.
//
// Docs: https://developers.korapay.com/docs/checkout-redirect
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const BRIDGE_SECRET = process.env.BRIDGE_SECRET || ""; // must match Website B
const KORAPAY_SECRET_KEY = process.env.KORAPAY_SECRET_KEY || "";
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000; // reject stale/replayed requests

function verifyBridgeSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !BRIDGE_SECRET) return false;
  try {
    const expected = crypto
      .createHmac("sha256", BRIDGE_SECRET)
      .update(rawBody)
      .digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-bridge-signature");

    if (!verifyBridgeSignature(rawBody, signature)) {
      console.warn("[cross-site-checkout] Invalid bridge signature — rejecting");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as {
      reference?: string;
      amount?: number;
      currency?: string;
      customerEmail?: string;
      customerName?: string;
      redirectUrl?: string;
      narration?: string;
      timestamp?: number;
    };

    const {
      reference,
      amount,
      currency,
      customerEmail,
      customerName,
      redirectUrl,
      narration,
      timestamp,
    } = body;

    if (!reference || !amount || !currency || !customerEmail || !timestamp) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Replay protection
    const age = Date.now() - timestamp;
    if (age > MAX_REQUEST_AGE_MS || age < -30_000) {
      return NextResponse.json({ error: "Request expired" }, { status: 401 });
    }

    // Enforce the prefix convention so our webhook knows to route this back to B
    if (!reference.startsWith("B-")) {
      return NextResponse.json(
        { error: "Cross-site reference must be prefixed 'B-'" },
        { status: 400 },
      );
    }

    const korapayRes = await fetch(
      "https://api.korapay.com/merchant/api/v1/charges/initialize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KORAPAY_SECRET_KEY}`,
        },
        body: JSON.stringify({
          amount,
          currency,
          reference,
          redirect_url: redirectUrl,
          narration: narration || "Payment",
          customer: { email: customerEmail, name: customerName },
        }),
      },
    );

    const korapayData = await korapayRes.json();

    if (!korapayRes.ok || !korapayData?.status) {
      console.error("[cross-site-checkout] Korapay initialize failed:", korapayData);
      return NextResponse.json({ error: "Failed to initialize charge" }, { status: 502 });
    }

    return NextResponse.json({
      checkout_url: korapayData.data.checkout_url,
      reference: korapayData.data.reference,
    });
  } catch (err: any) {
    console.error("[cross-site-checkout] Error:", err.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}