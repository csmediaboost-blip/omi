"use client";
// app/admin/withdrawals/page.tsx — FIXED VERSION
// Reads from 'withdrawals' table (not 'withdrawal_requests')
// Shows fraud flags, payout account info, full audit trail
// NO 'gateway' column referenced

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import AdminLayout from "@/components/AdminLayout";
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Shield,
  Lock,
  Copy,
  Check,
  Eye,
  DollarSign,
  TrendingUp,
  Search,
  Unlock,
} from "lucide-react";

interface Withdrawal {
  id: string | number;
  user_id: string;
  amount: number;
  wallet_address: string;
  payout_method?: string;
  payout_account_name?: string;
  payout_bank_name?: string;
  status: string;
  tracking_status?: string;
  expected_date?: string | null;
  created_at: string;
  paid_at?: string | null;
  failure_reason?: string | null;
  fraud_flag?: string | null;
  fraud_flagged_at?: string | null;
  // joined
  user_email?: string;
  user_kyc_status?: string;
  user_payout_kyc_match?: boolean;
  user_account_flagged?: boolean;
  user_withdwals_fronzen?: boolean;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className="ml-1 p-1 rounded hover:bg-slate-700">
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
    setTimeout(() => setToast(null), 4000);
  }

  async function fetchWithdrawals() {
    setLoading(true);
    let q = supabase
      .from("withdrawals")
      .select(
        "id, user_id, amount, wallet_address, payout_method, payout_account_name, payout_bank_name, status, tracking_status, expected_date, created_at, paid_at, failure_reason, fraud_flag, fraud_flagged_at",
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

    // Enrich with user data
    const enriched: Withdrawal[] = [];
    for (const w of data || []) {
      const { data: u } = await supabase
        .from("users")
        .select(
          "email, kyc_status, payout_kyc_match, account_flagged, withdwals_fronzen",
        )
        .eq("id", w.user_id)
        .single();
      enriched.push({
        ...w,
        user_email: (u as any)?.email || "",
        user_kyc_status: (u as any)?.kyc_status || "",
        user_payout_kyc_match: (u as any)?.payout_kyc_match ?? false,
        user_account_flagged: (u as any)?.account_flagged ?? false,
        user_withdwals_fronzen: (u as any)?.withdwals_fronzen ?? false,
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
      // Update user total_withrawn
      const { data: u } = await supabase
        .from("users")
        .select("total_withrawn")
        .eq("id", w.user_id)
        .single();
      await supabase
        .from("users")
        .update({
          total_withrawn: ((u as any)?.total_withrawn || 0) + w.amount,
          last_withhrawal_at: new Date().toISOString(),
        })
        .eq("id", w.user_id);
      // Ledger
      try {
        await supabase.from("transaction_ledger").insert({
          user_id: w.user_id,
          type: "withdrawal_paid",
          amount: -w.amount,
          description: `Withdrawal paid by admin — ${w.payout_method || "manual"}`,
          reference_id: String(w.id),
          created_at: new Date().toISOString(),
        });
      } catch (_) {}
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
      const { error } = await supabase
        .from("withdrawals")
        .update({
          status: "rejected",
          tracking_status: "rejected",
          failure_reason: reason,
        })
        .eq("id", w.id);
      if (error) throw error;
      // REFUND balance
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
      // Ledger refund
      try {
        await supabase.from("transaction_ledger").insert({
          user_id: w.user_id,
          type: "withdrawal_refund",
          amount: w.amount,
          description: `Withdrawal rejected & refunded — ${reason}`,
          reference_id: String(w.id),
          created_at: new Date().toISOString(),
        });
      } catch (_) {}
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
      await supabase
        .from("users")
        .update({ account_flagged: true, withdwals_fronzen: true })
        .eq("id", w.user_id);
      // Ledger
      try {
        await supabase.from("transaction_ledger").insert({
          user_id: w.user_id,
          type: "fraud_flag",
          amount: 0,
          description: `Withdrawal flagged as fraud — ID: ${w.id}`,
          created_at: new Date().toISOString(),
        });
      } catch (_) {}
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
      // Call the RPC function to unfreeze
      const { data, error } = await supabase.rpc("unfreeze_user_account", {
        p_user_id: w.user_id,
        p_reason_code: reasonCode,
        p_admin_notes: `Unfrozen by admin from withdrawal ${w.id}`,
        p_admin_id: (await supabase.auth.getUser()).data.user?.id,
      });

      if (error) throw error;
      if (data && !data.success)
        throw new Error(data.error || "Unfreeze failed");

      showToast("Account unfrozen successfully.");
      setSelected(null);
      fetchWithdrawals();
    } catch (e: any) {
      showToast("Error unfreezing: " + e.message, false);
    }
    setActionLoading(false);
  }

  const filtered = withdrawals.filter((w) => {
    const s = search.toLowerCase();
    return (
      (w.user_email || "").toLowerCase().includes(s) ||
      (w.payout_account_name || "").toLowerCase().includes(s) ||
      (w.wallet_address || "").toLowerCase().includes(s) ||
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

  return (
    <AdminLayout>
      <div className="space-y-6 bg-white min-h-screen">
        {toast && (
          <div
            className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
          >
            {toast.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{" "}
            {toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Withdrawal Requests</h1>
            <p className="text-gray-600 text-sm mt-1">
              Process user withdrawal requests · Balance auto-deducted on submit
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            queued and awaiting processing. Funds have already been deducted
            from user balances.
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
            placeholder="Search by email, name, account..."
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
                {filtered.map((w) => (
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
                    <td className="px-4 py-3 font-black text-white">
                      ${w.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white text-xs font-bold">
                        {w.payout_account_name || "—"}
                      </p>
                      <p className="text-slate-500 text-[10px] font-mono">
                        {(w.wallet_address || "").slice(0, 20)}...
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs capitalize">
                      {w.payout_method || "—"}
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
                ))}
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
              <h3 className="text-white font-black text-sm">
                Withdrawal Detail #{selected.id}
              </h3>
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
                {selected.fraud_flag && (
                  <span className="text-[10px] bg-red-900/30 border border-red-700/40 text-red-400 px-2 py-0.5 rounded-full font-bold">
                    🚨 FRAUD FLAG
                  </span>
                )}
                {selected.user_account_flagged && (
                  <span className="text-[10px] bg-orange-900/30 border border-orange-700/40 text-orange-400 px-2 py-0.5 rounded-full">
                    Acct Flagged
                  </span>
                )}
              </div>

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
                {[
                  ["User Email", selected.user_email || "—"],
                  ["User ID", selected.user_id],
                  ["Amount", `$${selected.amount.toFixed(2)}`],
                  ["Payout Account Name", selected.payout_account_name || "—"],
                  ["Payout Method", selected.payout_method || "—"],
                  ["Account / Wallet", selected.wallet_address || "—"],
                  ["Bank", selected.payout_bank_name || "—"],
                  ["KYC Status", selected.user_kyc_status || "—"],
                  [
                    "KYC Match",
                    selected.user_payout_kyc_match ? "✅ Match" : "❌ Mismatch",
                  ],
                  ["Submitted", new Date(selected.created_at).toLocaleString()],
                  ...(selected.expected_date
                    ? [
                        [
                          "Expected",
                          new Date(selected.expected_date).toLocaleDateString(),
                        ],
                      ]
                    : []),
                  ...(selected.paid_at
                    ? [["Paid At", new Date(selected.paid_at).toLocaleString()]]
                    : []),
                  ...(selected.failure_reason
                    ? [["Failure", selected.failure_reason]]
                    : []),
                ].map(([l, v]) => (
                  <div
                    key={l}
                    className="flex justify-between items-start gap-4"
                  >
                    <span className="text-slate-500 shrink-0">{l}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-white text-right break-all">
                        {v}
                      </span>
                      {(l === "User ID" || l === "Account / Wallet") && (
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
                      Mark as Paid
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
                      <AlertTriangle size={14} /> Flag as Fraud & Freeze Account
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
                  ❌ Rejected/Flagged. Balance has been refunded if applicable.
                </p>
              )}

              {/* UNFREEZE SECTION — Show if user is frozen OR withdrawal is flagged */}
              {(selected.user_withdwals_fronzen ||
                selected.status === "flagged") && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.3)",
                  }}
                >
                  <p className="text-amber-400 text-xs font-black mb-3">
                    <Unlock size={12} className="inline mr-1" /> Account Frozen
                    — Unfreeze Options
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={() =>
                        unfreezeAccount(selected, "false_positive")
                      }
                      disabled={actionLoading}
                      className="w-full py-2 rounded-lg font-black text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 hover:bg-amber-900/40 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Unlock size={12} /> False Positive
                    </button>
                    <button
                      onClick={() =>
                        unfreezeAccount(selected, "appeal_approved")
                      }
                      disabled={actionLoading}
                      className="w-full py-2 rounded-lg font-black text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 hover:bg-amber-900/40 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Unlock size={12} /> Appeal Approved
                    </button>
                    <button
                      onClick={() =>
                        unfreezeAccount(selected, "payment_received")
                      }
                      disabled={actionLoading}
                      className="w-full py-2 rounded-lg font-black text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 hover:bg-amber-900/40 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Unlock size={12} /> Payment Received
                    </button>
                    <button
                      onClick={() =>
                        unfreezeAccount(selected, "manual_review_passed")
                      }
                      disabled={actionLoading}
                      className="w-full py-2 rounded-lg font-black text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 hover:bg-amber-900/40 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Unlock size={12} /> Manual Review Passed
                    </button>
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
