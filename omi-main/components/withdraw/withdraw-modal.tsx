"use client";
// components/withdraw/withdraw-modal.tsx
// FIXES:
// 1. Numeric PIN pad (no QWERTY) using shared PinPad component
// 2. Company language throughout (no "admin")
// 3. Calls /api/withdraw server route — not client-side supabase directly
// 4. Exact error messages surfaced from server

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  X,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  RefreshCw,
  Send,
  Clock,
  Info,
} from "lucide-react";
import { PinPad } from "@/components/ui/pin-pad";
import {
  isBusinessDay,
  getTodayHoliday,
  nextBusinessDayLabel,
  getBusinessDayMessage,
} from "@/lib/business-days";
import { logWithdrawalEvent } from "@/lib/withdrawal-security";
import { supabase } from "@/lib/supabase";

type UserProfile = {
  id: string;
  kyc_verified: boolean;
  kyc_status: string | null;
  payout_registered: boolean;
  payout_account_name: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_gateway: string | null;
  payout_kyc_match: boolean;
  withdrawals_frozen: boolean;
  pin_set: boolean;
};

function resolveKycOk(profile: UserProfile): boolean {
  if (profile.kyc_verified === true) return true;
  if (profile.kyc_status === "approved" || profile.kyc_status === "verified")
    return true;
  return false;
}

type WithdrawModalProps = {
  userId: string;
  availableBalance: number;
  isFrozen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

export function WithdrawModal({
  userId,
  availableBalance,
  isFrozen,
  profile,
  onClose,
  onSuccess,
}: WithdrawModalProps) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [step, setStep] = useState<"amount" | "pin">("amount");
  const router = useRouter();

  const MIN = 10;
  const amt = parseFloat(amount) || 0;
  const available = Math.max(0, availableBalance);
  const expDays = amt < 500 ? 1 : amt < 5000 ? 2 : amt < 50000 ? 5 : 7;
  const expDate = new Date(Date.now() + expDays * 86400000);
  const isBizDay = isBusinessDay();
  const holiday = getTodayHoliday();
  const nextDay = nextBusinessDayLabel();
  const bizMsg = getBusinessDayMessage();

  const payoutGateway = profile.payout_gateway ?? "unknown";
  const payoutName = profile.payout_account_name ?? "—";
  const payoutBank = profile.payout_bank_name ?? "";
  const payoutAcct = profile.payout_account_number ?? "—";
  const hasPayout = !!(
    profile.payout_registered && profile.payout_account_number
  );
  const kycOk = resolveKycOk(profile);

  const isCrypto =
    payoutGateway === "crypto" ||
    payoutGateway === "crypto_wallet" ||
    payoutGateway === "usdt" ||
    payoutGateway === "btc";

  const qualifications = [
    { label: "Identity (KYC) Verified", ok: kycOk, action: "complete_kyc" },
    {
      label: "Payout Account Registered",
      ok: hasPayout,
      action: "setup_payout",
    },
    {
      label: "Account Name Matches KYC",
      ok: profile.payout_kyc_match,
      action: "fix_payout",
    },
    { label: "Withdrawals Not Frozen", ok: !isFrozen, action: null },
    { label: "Balance ≥ $10.00", ok: available >= MIN, action: null },
    { label: "Security PIN Set", ok: profile.pin_set, action: "set_pin" },
  ];
  const allQualified = qualifications.every((q) => q.ok);

  const canProceedToPin = allQualified && amt >= MIN && amt <= available;

  async function handleSubmit() {
    setError("");
    setErrorAction(null);

    if (pin.length < 4) {
      setError("Please enter your full PIN.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, pin }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(
          data.error || "Withdrawal failed. Please refresh and try again.",
        );
        if (data.action) setErrorAction(data.action);
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: data.error,
          amount: amt,
        }).catch(() => {});
        setPin("");
        setLoading(false);
        return;
      }

      onSuccess(
        data.message ||
          `Withdrawal of $${amt.toFixed(2)} submitted successfully!`,
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
      setPin("");
    }
    setLoading(false);
  }

  function handleActionClick() {
    if (
      errorAction === "complete_kyc" ||
      errorAction === "setup_payout" ||
      errorAction === "fix_payout"
    ) {
      router.push("/dashboard/verification");
    } else if (errorAction === "set_pin") {
      router.push("/dashboard/settings");
    }
  }

  // PIN dots
  const pinDots = Array.from({ length: 6 }, (_, i) => i < pin.length);

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: "rgb(10,16,28)",
          border: "1px solid rgba(16,185,129,0.3)",
          maxHeight: "95vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{
            background: "rgba(16,185,129,0.08)",
            borderBottom: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ArrowUpRight size={16} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-black text-sm">
                Request Withdrawal
              </p>
              <p className="text-slate-500 text-xs">
                {isCrypto
                  ? "Processed to your registered crypto wallet"
                  : "Processed to your registered bank account"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {step === "amount" ? (
            // ── STEP 1: Amount selection ──────────────────────────────────────
            <div className="p-5 space-y-4">
              {/* Non-business day notice */}
              {!isBizDay && (
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.3)",
                  }}
                >
                  <p className="text-amber-400 text-sm font-bold">
                    {holiday
                      ? `🎌 Public Holiday — ${holiday.name}`
                      : "🏖️ Weekend"}
                  </p>
                  <p className="text-amber-500/80 text-xs mt-1">
                    Your request will be queued and processed on {nextDay}.
                  </p>
                </div>
              )}

              {/* Requirements checklist */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <p className="text-slate-400 text-[10px] uppercase tracking-wide mb-3">
                  Withdrawal Requirements
                </p>
                <div className="space-y-1.5">
                  {qualifications.map((q) => (
                    <div key={q.label} className="flex items-center gap-2">
                      {q.ok ? (
                        <CheckCircle
                          size={12}
                          className="text-emerald-400 shrink-0"
                        />
                      ) : (
                        <XCircle size={12} className="text-red-400 shrink-0" />
                      )}
                      <span
                        className={`text-xs ${q.ok ? "text-slate-400" : "text-red-400 font-semibold"}`}
                      >
                        {q.label}
                      </span>
                      {!q.ok && q.action && (
                        <button
                          onClick={() => {
                            setErrorAction(q.action);
                            handleActionClick();
                          }}
                          className="text-[10px] text-blue-400 underline ml-auto shrink-0"
                        >
                          Fix →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Payout account */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "rgba(59,130,246,0.06)",
                  border: "1px solid rgba(59,130,246,0.2)",
                }}
              >
                <p className="text-slate-400 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Shield size={9} className="text-blue-400" /> Registered
                  Payout Account
                </p>
                {hasPayout ? (
                  <div className="space-y-0.5">
                    <p className="text-white font-bold text-sm">{payoutName}</p>
                    {payoutBank && (
                      <p className="text-slate-400 text-xs">{payoutBank}</p>
                    )}
                    <p className="text-slate-500 text-xs font-mono">
                      {payoutAcct.length > 12
                        ? payoutAcct.slice(0, 12) + "…"
                        : payoutAcct}
                    </p>
                    <p className="text-blue-400 text-[10px] capitalize">
                      via {payoutGateway}
                    </p>
                    {isCrypto && (
                      <p className="text-violet-400 text-[10px] flex items-center gap-1 mt-1">
                        <Info size={9} /> Crypto processed by our team within
                        1–3 business days
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-red-400 text-sm font-bold">
                    No payout account registered
                  </p>
                )}
              </div>

              {/* Balance */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}
              >
                <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
                  Available Balance
                </p>
                <p className="text-emerald-400 font-black text-2xl">
                  ${available.toFixed(4)}
                </p>
                <p className="text-slate-600 text-xs mt-0.5">Minimum: $10.00</p>
              </div>

              {/* Amount input */}
              <div>
                <label className="text-slate-300 text-sm font-bold block mb-2">
                  Amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    min={MIN}
                    max={available}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="w-full pl-9 pr-4 py-3.5 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        setAmount(((available * p) / 100).toFixed(2))
                      }
                      className="flex-1 text-[11px] font-bold py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-all"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Business day status */}
              <div
                className="rounded-xl p-3"
                style={{
                  background: isBizDay
                    ? "rgba(16,185,129,0.08)"
                    : "rgba(245,158,11,0.08)",
                  border: isBizDay
                    ? "1px solid rgba(16,185,129,0.2)"
                    : "1px solid rgba(245,158,11,0.3)",
                }}
              >
                <p
                  className={`text-sm font-bold flex items-center gap-2 ${isBizDay ? "text-emerald-400" : "text-amber-400"}`}
                >
                  <Clock size={13} />
                  {bizMsg}
                </p>
              </div>

              {/* Settlement preview */}
              {amt >= MIN && amt <= available && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(59,130,246,0.06)",
                    border: "1px solid rgba(59,130,246,0.2)",
                  }}
                >
                  <p className="text-blue-300 text-xs font-black uppercase tracking-wide mb-2">
                    Settlement Timeline
                  </p>
                  <p className="text-slate-400 text-xs">
                    Expected by{" "}
                    <span className="text-white font-bold">
                      {expDate.toLocaleDateString()}
                    </span>{" "}
                    ({expDays} business day{expDays !== 1 ? "s" : ""})
                  </p>
                </div>
              )}

              {/* Continue button */}
              <button
                onClick={() => {
                  if (amt < MIN) {
                    setError(`Minimum withdrawal is $${MIN.toFixed(2)}.`);
                    return;
                  }
                  if (amt > available) {
                    setError(
                      `Amount exceeds your available balance of $${available.toFixed(2)}.`,
                    );
                    return;
                  }
                  setError("");
                  setStep("pin");
                }}
                disabled={!canProceedToPin}
                className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                {!allQualified
                  ? "Complete requirements above first"
                  : `Continue — $${amount || "0.00"} →`}
              </button>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
            </div>
          ) : (
            // ── STEP 2: PIN entry (numeric pad) ──────────────────────────────
            <div className="p-5 space-y-5">
              {/* Summary */}
              <div
                className="rounded-xl p-4 flex items-center justify-between"
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}
              >
                <div>
                  <p className="text-slate-400 text-xs">Withdrawal amount</p>
                  <p className="text-emerald-400 font-black text-2xl">
                    ${amt.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setStep("amount");
                    setPin("");
                    setError("");
                  }}
                  className="text-xs text-slate-400 hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg"
                >
                  Edit
                </button>
              </div>

              <div className="text-center space-y-1">
                <Lock size={20} className="text-emerald-400 mx-auto" />
                <p className="text-white font-bold text-base">
                  Enter Security PIN
                </p>
                <p className="text-slate-500 text-xs">
                  Confirm your identity to complete the withdrawal
                </p>
              </div>

              {/* PIN dots */}
              <div className="flex justify-center gap-3">
                {pinDots.map((filled, i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                      filled
                        ? "bg-emerald-400 border-emerald-400 scale-110"
                        : "border-slate-600 bg-transparent"
                    }`}
                  />
                ))}
              </div>

              {/* FIX 3: Numeric PIN pad — no QWERTY */}
              <PinPad
                value={pin}
                onChange={(v) => {
                  setPin(v);
                  setError("");
                }}
                maxLength={6}
                disabled={loading}
              />

              {/* Error */}
              {error && (
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={13}
                      className="text-red-400 shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="text-red-400 text-sm">{error}</p>
                      {errorAction && (
                        <button
                          onClick={handleActionClick}
                          className="text-blue-400 text-xs underline mt-1"
                        >
                          {errorAction === "complete_kyc" &&
                            "Go to KYC Verification →"}
                          {errorAction === "setup_payout" &&
                            "Go to Payout Setup →"}
                          {errorAction === "fix_payout" &&
                            "Fix Payout Account →"}
                          {errorAction === "set_pin" && "Set PIN in Settings →"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={loading || pin.length < 4}
                className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    {isBizDay
                      ? `Confirm Withdrawal of $${amt.toFixed(2)}`
                      : `Queue Withdrawal for ${nextDay}`}
                  </>
                )}
              </button>

              <p className="text-slate-600 text-[11px] text-center">
                {isCrypto
                  ? "Crypto withdrawals are processed by our team within 1–3 business days."
                  : "Bank transfers are processed automatically via our secure payment system."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WithdrawModal;
