// app/api/checkout/verify/route.ts  (WEBSITE A — NEW FILE)
// ─────────────────────────────────────────────────────────────────────────────
// Website B calls this (bridge-signed, same as /api/checkout/cross-site) to
// check the REAL status of a transaction with Korapay directly — used when a
// user lands back on B's redirect page and B needs to know: did they actually
// pay, or did they just close the checkout tab? Only A can ask Korapay this,
// since only A holds the Korapay secret key.
//
// Korapay's verify endpoint: GET /merchant/api/v1/charges/:reference
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const BRIDGE_SECRET = process.env.BRIDGE_SECRET || "";
const KORAPAY_SECRET_KEY = process.env.KORAPAY_SECRET_KEY || "";
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

function verifyBridgeSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !BRIDGE_SECRET) return false;
  try {
    const expected = crypto.createHmac("sha256", BRIDGE_SECRET).update(rawBody).digest("hex");
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
      console.warn("[checkout-verify] Invalid bridge signature — rejecting");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as { reference?: string; timestamp?: number };
    const { reference, timestamp } = body;

    if (!reference || !timestamp) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    const age = Date.now() - timestamp;
    if (age > MAX_REQUEST_AGE_MS || age < -30_000) {
      return NextResponse.json({ error: "Request expired" }, { status: 401 });
    }

    if (!reference.startsWith("B-")) {
      return NextResponse.json({ error: "Not a cross-site reference" }, { status: 400 });
    }

    const korapayRes = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${KORAPAY_SECRET_KEY}` },
      },
    );

    const korapayData = await korapayRes.json();

    if (!korapayRes.ok || !korapayData?.status) {
      // Korapay has no record of this reference at all — treat as failed/abandoned.
      return NextResponse.json({ transactionStatus: "not_found" });
    }

    // Korapay's transaction_status is typically: success, failed, processing, pending
    return NextResponse.json({
      transactionStatus: korapayData.data?.status || "unknown",
      amount: korapayData.data?.amount,
      currency: korapayData.data?.currency,
    });
  } catch (err: any) {
    console.error("[checkout-verify] Error:", err.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}