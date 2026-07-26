// app/api/korapay/webhook/route.ts  (WEBSITE A)
// ─────────────────────────────────────────────────────────────────────────────
// This is your original webhook, UNCHANGED for everything it already does
// (license activation, GPU mining allocation, users.license_paid stamping,
// referral commissions). The only addition is at the very top, right after
// we know the reference: if the reference is tagged "B-", it means this
// payment was for a product sold on Website B (checkout was just hosted
// here on A). In that case we do NOT touch any of A's own tables — we just
// forward the raw event to Website B's /api/activate endpoint, signed with
// a shared bridge secret, and let B run its own activation logic against
// its own database.
//
// Everything below the NEW block is your existing file, untouched.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { processReferralCommission } from "@/lib/referralCommission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function verifyKorapaySignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return hash === signature;
  } catch {
    return false;
  }
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

// ─── NEW: forward a cross-site event to Website B ──────────────────────────
// Signs the payload with BRIDGE_SECRET (same value must be set on Website B)
// so B can trust the request really came from A and not an attacker who
// guessed the /api/activate URL.
async function forwardToWebsiteB(event: string, data: unknown): Promise<void> {
  const bridgeSecret = process.env.BRIDGE_SECRET || "";
  const websiteBUrl = process.env.WEBSITE_B_ACTIVATE_URL || "";

  if (!bridgeSecret || !websiteBUrl) {
    console.error(
      "[webhook] Missing BRIDGE_SECRET or WEBSITE_B_ACTIVATE_URL — cannot forward to B",
    );
    return;
  }

  const payload = JSON.stringify({ event, data, timestamp: Date.now() });
  const signature = crypto
    .createHmac("sha256", bridgeSecret)
    .update(payload)
    .digest("hex");

  try {
    const res = await fetch(websiteBUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-signature": signature,
      },
      body: payload,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[webhook] Website B activation failed (${res.status}):`,
        text,
      );
      // TODO: alert yourself here (Slack/email) — the customer paid but
      // B's activation call did not succeed. Consider a retry queue.
    } else {
      console.log("[webhook] Successfully forwarded to Website B");
    }
  } catch (err: any) {
    console.error("[webhook] Error forwarding to Website B:", err.message);
    // TODO: same as above — this needs a retry/alert path in production.
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-korapay-signature") || "";
    const webhookSecret = process.env.KORAPAY_WEBHOOK_SECRET || "";

    if (webhookSecret && signature) {
      if (!verifyKorapaySignature(rawBody, signature, webhookSecret)) {
        console.error("[webhook] Invalid KoraPay signature — rejecting");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    } else if (webhookSecret && !signature) {
      console.error("[webhook] Missing signature header — rejecting");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as {
      event?: string;
      data?: { reference?: string; [key: string]: unknown };
    };

    const { data, event } = body;
    const reference = data?.reference;

    console.log("[webhook] Event:", event, "Reference:", reference);

    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    // ─── NEW: cross-site routing ──────────────────────────────────────────
    // References created via /api/checkout/cross-site are always prefixed
    // "B-". Anything else is business as usual for Website A below.
    if (reference.startsWith("B-")) {
      if (event === "charge.success" || event === "charge.failed" ||
          event === "charge.declined" || event === "charge.expired" ||
          event === "charge.cancelled") {
        await forwardToWebsiteB(event as string, data);
      }
      return NextResponse.json({ received: true });
    }
    // ─── end NEW block — everything from here down is your original file ──

    const supabase = getSupabaseClient();

    if (
      event === "charge.failed" ||
      event === "charge.declined" ||
      event === "charge.expired" ||
      event === "charge.cancelled"
    ) {
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_reason: `KoraPay event: ${event}`,
          updated_at: new Date().toISOString(),
        })
        .eq("gateway_reference", reference)
        .neq("status", "confirmed");

      console.log("[webhook] Marked as failed:", reference, "event:", event);
      return NextResponse.json({ received: true });
    }

    if (event !== "charge.success") {
      return NextResponse.json({ received: true });
    }

    const { data: txData, error: txError } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("gateway_reference", reference)
      .maybeSingle();

    if (txError || !txData) {
      console.error(
        "[webhook] Transaction not found:",
        reference,
        txError?.message,
      );
      return NextResponse.json({ received: true });
    }

    if (txData.status === "confirmed" || txData.status === "completed") {
      console.log("[webhook] Already confirmed, skipping:", reference);
      return NextResponse.json({ received: true });
    }

    const metadata = parseMetadata(txData.metadata);
    const now = new Date().toISOString();

    const purchaseType =
      (metadata.purchaseType as string) ||
      (txData.gateway === "gpu_mining" ? "gpu_mining" : "") ||
      (txData.node_key ? "gpu_mining" : "");

    console.log("[webhook] Processing payment:", {
      reference,
      purchaseType,
      userId: txData.user_id?.slice(0, 8),
      amount: txData.amount,
      node_key: txData.node_key,
    });

    await supabase
      .from("payment_transactions")
      .update({
        status: "confirmed",
        confirmed_at: now,
        verified_by_admin: true,
        updated_at: now,
      })
      .eq("gateway_reference", reference);

    try {
      const userUpdate: Record<string, unknown> = {
        license_paid: true,
      };
      if (purchaseType === "license") {
        const licenseExpiresAt = new Date();
        licenseExpiresAt.setFullYear(licenseExpiresAt.getFullYear() + 1);
        userUpdate.license_activated_at = now;
        userUpdate.license_expires_at = licenseExpiresAt.toISOString();
      }

      const { error: userUpdateErr } = await supabase
        .from("users")
        .update(userUpdate)
        .eq("id", txData.user_id);

      if (userUpdateErr) {
        console.error(
          "[webhook] users.license_paid update failed:",
          userUpdateErr.message,
        );
      } else {
        console.log(
          "[webhook] ✅ users.license_paid=true for user:",
          txData.user_id?.slice(0, 8),
        );
      }
    } catch (e: any) {
      console.error("[webhook] users.license_paid update error:", e.message);
    }

    try {
      await processReferralCommission(
        txData.user_id,
        txData.amount,
        reference,
        txData.node_key ?? undefined,
      );
    } catch (e: any) {
      console.error("[webhook] Referral commission error:", e.message);
    }

    if (purchaseType === "license") {
      const licenseType =
        (metadata.licenseType as string) ||
        txData.node_key ||
        "operator_license";

      const { data: existingLic } = await supabase
        .from("operator_licenses")
        .select("id")
        .eq("user_id", txData.user_id)
        .eq("license_type", licenseType)
        .eq("status", "active")
        .maybeSingle();

      if (!existingLic) {
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        const { error: licErr } = await supabase
          .from("operator_licenses")
          .insert({
            user_id: txData.user_id,
            license_type: licenseType,
            status: "active",
            purchased_at: now,
            activated_at: now,
            expires_at: expiresAt.toISOString(),
            amount_paid: txData.amount,
            transaction_ref: reference,
          });

        if (licErr) {
          console.error("[webhook] License insert failed:", licErr.message);
        } else {
          console.log(
            "[webhook] ✅ License activated for user:",
            txData.user_id?.slice(0, 8),
          );
        }
      } else {
        console.log("[webhook] License already active, skipping insert");
      }
    } else {
      const isSplit = metadata.isSplitPayment === true;
      const splitInstallment = Number(metadata.splitInstallment) || 1;
      const splitTotal = Number(metadata.splitTotal) || 1;
      const isFinalInstallment = !isSplit || splitInstallment >= splitTotal;

      if (!isFinalInstallment) {
        console.log(
          `[webhook] Split ${splitInstallment}/${splitTotal} — waiting for remaining installments`,
        );
        return NextResponse.json({ received: true });
      }

      const { data: existingAlloc } = await supabase
        .from("node_allocations")
        .select("id")
        .eq("user_id", txData.user_id)
        .eq("plan_id", txData.node_key)
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (!existingAlloc) {
        const paymentModel =
          purchaseType === "gpu_contract"
            ? "contract"
            : (metadata.paymentModel as string) || "flexible";

        const isContract = paymentModel === "contract";
        const miningPeriod = (metadata.miningPeriod as string) || "daily";
        const contractMonths = (metadata.contractMonths as number) ?? null;

        const periodMs: Record<string, number> = {
          hourly: 3_600_000,
          daily: 86_400_000,
          weekly: 7 * 86_400_000,
          monthly: 30 * 86_400_000,
        };

        let miningEndsAt: string | null = null;
        let maturityDate: string | null = null;

        if (isContract && contractMonths) {
          const end = new Date();
          end.setMonth(end.getMonth() + contractMonths);
          miningEndsAt = end.toISOString();
          maturityDate = end.toISOString();
        } else {
          miningEndsAt = new Date(
            Date.now() + (periodMs[miningPeriod] ?? periodMs.daily),
          ).toISOString();
        }

        const { error: allocErr } = await supabase
          .from("node_allocations")
          .insert({
            user_id: txData.user_id,
            plan_id: txData.node_key,
            amount_invested: txData.amount,
            currency: txData.currency || "USD",
            status: "active",
            payment_model: paymentModel,
            instance_type: (metadata.itype as string) || "on_demand",
            mining_period: miningPeriod,
            contract_months: contractMonths,
            contract_label: (metadata.contractLabel as string) || null,
            contract_min_pct: (metadata.contractMinPct as number) || null,
            contract_max_pct: (metadata.contractMaxPct as number) || null,
            lock_in_months: isContract ? (contractMonths ?? 0) : 0,
            lock_in_label:
              (metadata.contractLabel as string) ||
              (isContract ? `${contractMonths} Months` : "Flexible"),
            lock_in_multiplier: (metadata.lockInMultiplier as number) || 1.0,
            maturity_date: maturityDate,
            mining_ends_at: miningEndsAt,
            mining_completed: false,
            total_earned: 0,
            total_withdrawn: 0,
            final_profit: 0,
            capital_returned: false,
            auto_reinvest: (metadata.autoReinvest as boolean) || false,
            funded_from: "external",
            funded_amount: txData.amount,
            created_at: now,
            updated_at: now,
            tier_index: (metadata.tierIndex as number) ?? 0,
            lock_unlock_at: null,
          });

        if (allocErr) {
          console.error(
            "[webhook] ❌ Allocation insert failed:",
            allocErr.message,
          );
        } else {
          console.log(
            "[webhook] ✅ Mining started for user:",
            txData.user_id?.slice(0, 8),
            "plan:",
            txData.node_key,
          );
        }
      } else {
        console.log("[webhook] Allocation already exists, skipping insert");
      }
    }

    try {
      await supabase.from("user_notifications").insert({
        user_id: txData.user_id,
        type:
          purchaseType === "license" ? "license_activated" : "mining_started",
        title:
          purchaseType === "license"
            ? "🏆 License Activated!"
            : "⛏️ Mining Session Started!",
        body:
          purchaseType === "license"
            ? "Your operator license is now active."
            : `Your ${(metadata.miningPeriod as string) || "daily"} GPU mining session is now live.`,
        created_at: now,
      });
    } catch (e: any) {
      console.error("[webhook] Notification insert error:", e.message);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[webhook] Unhandled error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}