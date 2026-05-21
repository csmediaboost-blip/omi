"use client";
// app/admin/withdrawals/page.tsx — FIXED
// - Uses correct DB column names (withdrawals_frozen, total_withdrawn, etc.)
// - markPaid updates total_withdrawn (not total_withrawn)
// - Shows auto_processed flag
// - Crypto withdrawals shown with wallet address for manual sending
// - Korapay transfers show reference

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Shield,
  Copy,
  Check,
  Eye,
  DollarSign,
  Search,
  Unlock,
  Cpu,
  Zap,
} from "lucide-react";

interface Withdrawal {
  id: string | number;
  user_id: string;
  amount: number;
  wallet_address: string;
  payout_method?: string;
  payout_account_name?: string;
  payout_bank_name?: string;
  payout_currency?: string;
  status: string;
  tracking_status?: string;
  expected_date?: string | null;
  created_at: string;
  paid_at?: string | null;
  failure_reason?: string | null;
  fraud_flag?: string | null;
  fraud_flagged_at?: string | null;
  auto_processed?: boolean;
  reference?: string | null;
  gateway_reference?: string | null;
  // joined from users
  user_email?: string;
  user_kyc_status?: string;
  user_payout_kyc_match?: boolean;
  user_account_flagged?: boolean;
  user_withdrawals_frozen?: boolean;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="ml-1 p-1 rounded hover:bg-slate-700"
    >
      {copied ? (
        <Check size={11} className="text-emerald-400" />
      ) : (
        <Copy size={11} className="text-slate-500" />
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-blue-900/30 border-blue-700/40 text-blue-400",
    processing: "bg-violet-900/30 border-violet-700/40 text-violet-400",
    paid: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    failed: "bg-red-900/30 border-red-700/40 text-red-400",
    rejected: "bg-red-900/30 border-red-700/40 text-red-400",
    flagged: "bg-orange-900/30 border-orange-700/40 text-orange-400",
  };
  return (
    <span
      className={`text-[10px] font-black px-2 py-0.5 rounded-full border capitalize ${map[status] || "bg-slate-800 border-slate-700 text-slate-400"}`}
    >
      {status}
    </span>
  );
}

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  }

  async function fetchWithdrawals() {
    setLoading(true);
    let q = supabase
      .from("withdrawals")
      .select(
        "id, user_id, amount, wallet_address, payout_method, payout_account_name, payout_bank_name, payout_currency, status, tracking_status, expected_date, created_at, paid_at, failure_reason, fraud_flag, fraud_flagged_at, auto_processed, reference, gateway_reference",
      );
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      showToast("Failed to load: " + error.message, false);
      setLoading(false);
      return;
    }

    // Enrich with user data — using CORRECT column names
    const enriched: Withdrawal[] = [];
    for (const w of data || []) {
      const { data: u } = await supabase
        .from("users")
        .select(
          "email, kyc_status, payout_kyc_match, status, withdrawals_frozen",
        )
        .eq("id", w.user_id)
        .single();
      enriched.push({
        ...w,
        user_email: (u as any)?.email || "",
        user_kyc_status: (u as any)?.kyc_status || "",
        user_payout_kyc_match: (u as any)?.payout_kyc_match ?? false,
        user_account_flagged: (u as any)?.status === "flagged",
        user_withdrawals_frozen: (u as any)?.withdrawals_frozen ?? false,
      });
    }
    setWithdrawals(enriched);
    setLoading(false);
  }

  useEffect(() => {
    fetchWithdrawals();
  }, [filterStatus]);

  async function markPaid(w: Withdrawal) {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("withdrawals")
        .update({
          status: "paid",
          tracking_status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", w.id);
      if (error) throw error;

      // FIXED: correct column name = total_withdrawn
      const { data: u } = await supabase
        .from("users")
        .select("total_withdrawn")
        .eq("id", w.user_id)
        .single();
      await supabase
        .from("users")
        .update({
          total_withdrawn: ((u as any)?.total_withdrawn || 0) + w.amount,
        })
        .eq("id", w.user_id);

      // Ledger
      await supabase.from("transaction_ledger").insert({
        user_id: w.user_id,
        type: "withdrawal_paid",
        amount: -w.amount,
        description: `Withdrawal paid by admin — ${w.payout_method || "manual"} — Ref: ${w.reference || w.id}`,
        reference_id: String(w.id),
        created_at: new Date().toISOString(),
      });

      showToast("Marked as paid!");
      setSelected(null);
      fetchWithdrawals();
    } catch (e: any) {
      showToast("Error: " + e.message, false);
    }
    setActionLoading(false);
  }

  async function markProcessing(w: Withdrawal) {
    setActionLoading(true);
    const { error } = await supabase
      .from("withdrawals")
      .update({ status: "processing", tracking_status: "processing" })
      .eq("id", w.id);
    if (!error) {
      showToast("Marked as processing");
      fetchWithdrawals();
    } else showToast("Error: " + error.message, false);
    setActionLoading(false);
  }

  async function rejectWithdrawal(w: Withdrawal, reason: string) {
    setActionLoading(true);
    try {
      await supabase
        .from("withdrawals")
        .update({
          status: "rejected",
          tracking_status: "rejected",
          failure_reason: reason,
        })
        .eq("id", w.id);

      // Refund balance
      const { data: u } = await supabase
        .from("users")
        .select("balance_available")
        .eq("id", w.user_id)
        .single();
      await supabase
        .from("users")
        .update({
          balance_available: ((u as any)?.balance_available || 0) + w.amount,
        })
        .eq("id", w.user_id);

      await supabase.from("transaction_ledger").insert({
        user_id: w.user_id,
        type: "withdrawal_refund",
        amount: w.amount,
        description: `Withdrawal rejected & refunded — ${reason} — Ref: ${w.reference || w.id}`,
        reference_id: String(w.id),
        created_at: new Date().toISOString(),
      });

      showToast("Rejected & balance refunded.");
      setSelected(null);
      fetchWithdrawals();
    } catch (e: any) {
      showToast("Error: " + e.message, false);
    }
    setActionLoading(false);
  }

  async function flagFraud(w: Withdrawal) {
    setActionLoading(true);
    const reason = "Manual fraud flag by admin";
    try {
      await supabase
        .from("withdrawals")
        .update({
          status: "flagged",
          fraud_flag: reason,
          fraud_flagged_at: new Date().toISOString(),
        })
        .eq("id", w.id);

      // FIXED: correct column names
      await supabase
        .from("users")
        .update({ status: "flagged", withdrawals_frozen: true })
        .eq("id", w.user_id);

      await supabase.from("transaction_ledger").insert({
        user_id: w.user_id,
        type: "fraud_flag",
        amount: 0,
        description: `Withdrawal flagged as fraud — ID: ${w.id}`,
        created_at: new Date().toISOString(),
      });

      showToast("User flagged and withdrawals frozen.");
      setSelected(null);
      fetchWithdrawals();
    } catch (e: any) {
      showToast("Error: " + e.message, false);
    }
    setActionLoading(false);
  }

  async function unfreezeAccount(w: Withdrawal, reasonCode: string) {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc("unfreeze_user_account", {
        p_user_id: w.user_id,
        p_reason_code: reasonCode,
        p_admin_notes: `Unfrozen by admin from withdrawal ${w.id}`,
        p_admin_id: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      if (data && !data.success)
        throw new Error(data.error || "Unfreeze failed");
      showToast("Account unfrozen.");
      setSelected(null);
      fetchWithdrawals();
    } catch (e: any) {
      showToast("Error: " + e.message, false);
    }
    setActionLoading(false);
  }

  const filtered = withdrawals.filter((w) => {
    const s = search.toLowerCase();
    return (
      (w.user_email || "").toLowerCase().includes(s) ||
      (w.payout_account_name || "").toLowerCase().includes(s) ||
      (w.wallet_address || "").toLowerCase().includes(s) ||
      (w.reference || "").toLowerCase().includes(s) ||
      String(w.id).includes(s)
    );
  });

  const totalQueued = withdrawals.filter((w) => w.status === "queued").length;
  const totalProcessing = withdrawals.filter(
    (w) => w.status === "processing",
  ).length;
  const totalAmount = withdrawals
    .filter((w) => w.status === "queued" || w.status === "processing")
    .reduce((s, w) => s + (w.amount || 0), 0);
  const flaggedCount = withdrawals.filter(
    (w) => w.fraud_flag || w.status === "flagged",
  ).length;
  const cryptoPending = withdrawals.filter(
    (w) =>
      (w.status === "queued" || w.status === "processing") &&
      (w.payout_method === "crypto" ||
        w.payout_method === "crypto_wallet" ||
        w.payout_method === "usdt" ||
        w.payout_method === "btc"),
  ).length;

  return (
    <AdminLayout>
      <div
        className="space-y-6 min-h-screen p-6"
        style={{ background: "rgb(8,12,20)", color: "#e2e8f0" }}
      >
        {toast && (
          <div
            className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
          >
            {toast.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{" "}
            {toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">
              Withdrawal Requests
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Bank transfers auto-processed via Korapay · Crypto requires manual
              sending
            </p>
          </div>
          <button
            onClick={fetchWithdrawals}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-sm font-bold"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            {
              label: "Queued",
              value: totalQueued,
              color: "text-blue-400",
              icon: Clock,
            },
            {
              label: "Processing",
              value: totalProcessing,
              color: "text-violet-400",
              icon: RefreshCw,
            },
            {
              label: "Pending Amount",
              value: `$${totalAmount.toFixed(2)}`,
              color: "text-amber-400",
              icon: DollarSign,
            },
            {
              label: "Fraud Flags",
              value: flaggedCount,
              color: "text-red-400",
              icon: AlertTriangle,
            },
            {
              label: "Crypto Pending",
              value: cryptoPending,
              color: "text-violet-400",
              icon: Cpu,
            },
          ].map(({ label, value, color, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl p-4"
              style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={13} className="text-slate-600" />
                <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                  {label}
                </p>
              </div>
              <p className={`font-black text-xl ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {cryptoPending > 0 && (
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.3)",
            }}
          >
            <Cpu size={16} className="text-violet-400 shrink-0" />
            <p className="text-violet-300 text-sm">
              <strong>
                {cryptoPending} crypto withdrawal
                {cryptoPending !== 1 ? "s" : ""}
              </strong>{" "}
              require manual processing — open each one to see the wallet
              address and amount to send.
            </p>
          </div>
        )}

        {totalQueued > 0 && (
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.25)",
            }}
          >
            <Clock size={16} className="text-blue-400 shrink-0" />
            <p className="text-blue-300 text-sm">
              <strong>
                {totalQueued} withdrawal{totalQueued !== 1 ? "s" : ""}
              </strong>{" "}
              queued. Bank transfers were auto-processed via Korapay; click{" "}
              <em>Mark as Paid</em> to confirm. Crypto requires manual sending
              first.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              placeholder="Search by email, name, reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2.5 rounded-xl text-sm text-white bg-slate-900 border border-slate-700 focus:outline-none w-72"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm text-white bg-slate-900 border border-slate-700 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>

        {/* Table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(10,16,28,0.9)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="px-5 py-4 border-b border-slate-800/60">
            <h3 className="text-white font-black text-sm">Withdrawal Queue</h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={24} className="text-slate-600 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              No withdrawals found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60">
                    {[
                      "User",
                      "Amount",
                      "Payout Account",
                      "Method",
                      "Status",
                      "Flags",
                      "Date",
                      "Action",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filtered.map((w) => {
                    const isCrypto =
                      w.payout_method === "crypto" ||
                      w.payout_method === "crypto_wallet" ||
                      w.payout_method === "usdt" ||
                      w.payout_method === "btc";
                    return (
                      <tr
                        key={w.id}
                        className={`hover:bg-slate-800/20 transition-colors ${w.fraud_flag || w.status === "flagged" ? "bg-red-900/5" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-white text-xs font-bold">
                            {w.user_email}
                          </p>
                          <p className="text-slate-600 text-[10px] font-mono">
                            {String(w.user_id).slice(0, 12)}...
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-black text-white">
                            ${w.amount.toFixed(2)}
                          </p>
                          <p className="text-slate-600 text-[10px]">
                            {w.payout_currency || "USD"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-white text-xs font-bold">
                            {w.payout_account_name || "—"}
                          </p>
                          <p className="text-slate-500 text-[10px] font-mono">
                            {(w.wallet_address || "").slice(0, 18)}...
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {isCrypto ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-400">
                                ₿ Crypto
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-400">
                                🏦 Bank
                              </span>
                            )}
                            {w.auto_processed && (
                              <span title="Auto-processed via Korapay">
                                <Zap size={10} className="text-emerald-400" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={w.tracking_status || w.status} />
                        </td>
                        <td className="px-4 py-3">
                          {w.fraud_flag ? (
                            <span className="text-[10px] text-red-400 flex items-center gap-1">
                              <AlertTriangle size={10} /> Flagged
                            </span>
                          ) : !w.user_payout_kyc_match ? (
                            <span className="text-[10px] text-amber-400 flex items-center gap-1">
                              <AlertTriangle size={10} /> KYC mismatch
                            </span>
                          ) : w.user_account_flagged ? (
                            <span className="text-[10px] text-red-400 flex items-center gap-1">
                              <Shield size={10} /> Acct flagged
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <CheckCircle size={10} /> Clean
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {new Date(w.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelected(w)}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white flex items-center gap-1"
                          >
                            <Eye size={11} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* DETAIL MODAL */}
        {selected && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
              style={{
                background: "rgb(10,16,28)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <div>
                  <h3 className="text-white font-black text-sm">
                    Withdrawal #{selected.id}
                  </h3>
                  {selected.reference && (
                    <p className="text-slate-500 text-[10px] font-mono">
                      Ref: {selected.reference}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-slate-500 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge
                    status={selected.tracking_status || selected.status}
                  />
                  {selected.auto_processed && (
                    <span className="text-[10px] bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Zap size={9} /> Auto-processed via Korapay
                    </span>
                  )}
                  {(() => {
                    const isCrypto =
                      selected.payout_method === "crypto" ||
                      selected.payout_method === "crypto_wallet" ||
                      selected.payout_method === "usdt" ||
                      selected.payout_method === "btc";
                    return isCrypto ? (
                      <span className="text-[10px] bg-violet-900/30 border border-violet-700/40 text-violet-400 px-2 py-0.5 rounded-full font-bold">
                        ₿ Crypto — Manual Send Required
                      </span>
                    ) : null;
                  })()}
                  {selected.fraud_flag && (
                    <span className="text-[10px] bg-red-900/30 border border-red-700/40 text-red-400 px-2 py-0.5 rounded-full font-bold">
                      🚨 FRAUD FLAG
                    </span>
                  )}
                </div>

                {/* Crypto manual send instructions */}
                {(selected.payout_method === "crypto" ||
                  selected.payout_method === "crypto_wallet" ||
                  selected.payout_method === "usdt" ||
                  selected.payout_method === "btc") &&
                  (selected.status === "queued" ||
                    selected.status === "processing") && (
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: "rgba(124,58,237,0.1)",
                        border: "1px solid rgba(124,58,237,0.4)",
                      }}
                    >
                      <p className="text-violet-300 text-xs font-black mb-2">
                        ₿ CRYPTO — MANUAL SENDING REQUIRED
                      </p>
                      <p className="text-violet-400 text-xs mb-2">
                        Send exactly{" "}
                        <strong>
                          ${selected.amount.toFixed(2)} USD worth of{" "}
                          {(selected.payout_method || "crypto").toUpperCase()}
                        </strong>{" "}
                        to:
                      </p>
                      <div className="bg-slate-900 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-white font-mono text-xs break-all">
                          {selected.wallet_address}
                        </span>
                        <CopyBtn text={selected.wallet_address} />
                      </div>
                      <p className="text-violet-500/60 text-[10px] mt-2">
                        After sending, click &ldquo;Mark as Paid&rdquo; below.
                      </p>
                    </div>
                  )}

                {/* Fraud warnings */}
                {(!selected.user_payout_kyc_match ||
                  selected.user_account_flagged ||
                  selected.fraud_flag) && (
                  <div
                    className="rounded-xl p-3"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.3)",
                    }}
                  >
                    <p className="text-red-300 text-xs font-black mb-1">
                      ⚠️ Security Warnings
                    </p>
                    {!selected.user_payout_kyc_match && (
                      <p className="text-red-400 text-xs">
                        • Payout account name does not match KYC identity
                      </p>
                    )}
                    {selected.user_account_flagged && (
                      <p className="text-red-400 text-xs">
                        • User account is flagged
                      </p>
                    )}
                    {selected.fraud_flag && (
                      <p className="text-red-400 text-xs">
                        • Fraud flag: {selected.fraud_flag}
                      </p>
                    )}
                  </div>
                )}

                {/* Details */}
                <div
                  className="rounded-xl p-4 space-y-2 text-xs"
                  style={{
                    background: "rgba(15,23,42,0.8)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {(
                    [
                      ["User Email", selected.user_email || "—"],
                      ["User ID", selected.user_id],
                      [
                        "Amount",
                        `$${selected.amount.toFixed(2)} ${selected.payout_currency || "USD"}`,
                      ],
                      [
                        "Payout Account Name",
                        selected.payout_account_name || "—",
                      ],
                      ["Payout Method", selected.payout_method || "—"],
                      ["Account / Wallet", selected.wallet_address || "—"],
                      ["Bank", selected.payout_bank_name || "—"],
                      ["KYC Status", selected.user_kyc_status || "—"],
                      [
                        "KYC Match",
                        selected.user_payout_kyc_match
                          ? "✅ Match"
                          : "❌ Mismatch",
                      ],
                      [
                        "Auto-processed",
                        selected.auto_processed
                          ? "Yes (Korapay)"
                          : "No (manual)",
                      ],
                      ...(selected.gateway_reference
                        ? [["Korapay Ref", selected.gateway_reference]]
                        : []),
                      [
                        "Submitted",
                        new Date(selected.created_at).toLocaleString(),
                      ],
                      ...(selected.expected_date
                        ? [
                            [
                              "Expected",
                              new Date(
                                selected.expected_date,
                              ).toLocaleDateString(),
                            ],
                          ]
                        : []),
                      ...(selected.paid_at
                        ? [
                            [
                              "Paid At",
                              new Date(selected.paid_at).toLocaleString(),
                            ],
                          ]
                        : []),
                      ...(selected.failure_reason
                        ? [["Failure", selected.failure_reason]]
                        : []),
                    ] as [string, string][]
                  ).map(([l, v]) => (
                    <div
                      key={l}
                      className="flex justify-between items-start gap-4"
                    >
                      <span className="text-slate-500 shrink-0">{l}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-white text-right break-all">
                          {v}
                        </span>
                        {(l === "User ID" ||
                          l === "Account / Wallet" ||
                          l === "Korapay Ref") && (
                          <CopyBtn text={v as string} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {(selected.status === "queued" ||
                  selected.status === "processing") &&
                  !selected.fraud_flag && (
                    <div className="space-y-2">
                      {selected.status === "queued" && (
                        <button
                          onClick={() => markProcessing(selected)}
                          disabled={actionLoading}
                          className="w-full py-3 rounded-xl font-black text-sm text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {actionLoading ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}{" "}
                          Mark Processing
                        </button>
                      )}
                      <button
                        onClick={() => markPaid(selected)}
                        disabled={actionLoading}
                        className="w-full py-3 rounded-xl font-black text-sm text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {actionLoading ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle size={14} />
                        )}{" "}
                        Mark as Paid ✓
                      </button>
                      <button
                        onClick={() =>
                          rejectWithdrawal(selected, "Rejected by admin")
                        }
                        disabled={actionLoading}
                        className="w-full py-3 rounded-xl font-black text-sm text-red-400 bg-red-900/20 border border-red-700/40 hover:bg-red-900/40 disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        <XCircle size={14} /> Reject & Refund Balance
                      </button>
                      <button
                        onClick={() => flagFraud(selected)}
                        disabled={actionLoading}
                        className="w-full py-3 rounded-xl font-black text-sm text-orange-400 bg-orange-900/20 border border-orange-700/40 hover:bg-orange-900/40 disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        <AlertTriangle size={14} /> Flag as Fraud & Freeze
                        Account
                      </button>
                    </div>
                  )}

                {selected.status === "paid" && (
                  <p className="text-emerald-400 text-sm text-center font-bold">
                    ✅ This withdrawal has been paid.
                  </p>
                )}
                {(selected.status === "rejected" ||
                  selected.status === "flagged") && (
                  <p className="text-red-400 text-sm text-center">
                    ❌ Rejected/Flagged. Balance has been refunded if
                    applicable.
                  </p>
                )}

                {/* Unfreeze section */}
                {(selected.user_withdrawals_frozen ||
                  selected.status === "flagged") && (
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: "rgba(245,158,11,0.08)",
                      border: "1px solid rgba(245,158,11,0.3)",
                    }}
                  >
                    <p className="text-amber-400 text-xs font-black mb-3">
                      <Unlock size={12} className="inline mr-1" /> Account
                      Frozen — Unfreeze Options
                    </p>
                    <div className="space-y-2">
                      {[
                        ["false_positive", "False Positive"],
                        ["appeal_approved", "Appeal Approved"],
                        ["payment_received", "Payment Received"],
                        ["manual_review_passed", "Manual Review Passed"],
                      ].map(([code, label]) => (
                        <button
                          key={code}
                          onClick={() => unfreezeAccount(selected, code)}
                          disabled={actionLoading}
                          className="w-full py-2 rounded-lg font-black text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 hover:bg-amber-900/40 disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          <Unlock size={12} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
