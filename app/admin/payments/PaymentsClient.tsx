"use client";
// app/admin/payments/PaymentsClient.tsx — WHITE THEME + FIXED APPROVE LOGIC
// ─────────────────────────────────────────────────────────────────────────────
// FIXES:
//  FIX-1  approveCrypto sends paymentId (matches fixed API route)
//  FIX-2  manualActivateNode sends paymentId correctly
//  FIX-3  White/light admin theme throughout
//  FIX-4  "Pending Crypto" count covers both "crypto" and "crypto_wallet"
//  FIX-5  Gateway filter works correctly for crypto variants
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  RefreshCw,
  Wallet,
  Copy,
  Check,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Search,
  Zap,
  Pickaxe,
  Shield,
} from "lucide-react";

interface Payment {
  id: number;
  user_id: string;
  node_key: string;
  amount: number;
  currency: string;
  gateway: string;
  gateway_reference?: string;
  gateway_transaction_id?: string;
  crypto_currency?: string;
  crypto_amount?: number;
  crypto_wallet?: string;
  receiving_wallet?: string;
  crypto_network?: string;
  crypto_tx_hash?: string;
  status: string;
  verified_by_admin?: boolean;
  failure_reason?: string;
  metadata?: string;
  created_at: string;
  confirmed_at?: string;
  updated_at?: string;
}

const PERIOD_LABELS: Record<string, string> = {
  hourly: "1 Hour",
  daily: "1 Day",
  weekly: "1 Week",
  monthly: "1 Month",
  contract: "Contract",
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-1.5 p-1 rounded hover:bg-gray-100 transition-colors"
    >
      {copied ? (
        <Check size={12} className="text-emerald-500" />
      ) : (
        <Copy size={12} className="text-gray-400" />
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<
    string,
    { bg: string; text: string; border: string; label: string }
  > = {
    pending: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      label: "Pending",
    },
    confirmed: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      label: "Confirmed",
    },
    confmrmed: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      label: "Confirmed",
    },
    completed: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      label: "Completed",
    },
    declined: {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      label: "Declined",
    },
    failed: {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      label: "Failed",
    },
    rejected: {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      label: "Rejected",
    },
  };
  const c = cfg[status] || {
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-200",
    label: status,
  };
  return (
    <span
      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${c.bg} ${c.border} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

function GatewayBadge({ gateway }: { gateway: string }) {
  if (gateway === "crypto" || gateway === "crypto_wallet")
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
        ₿ Crypto
      </span>
    );
  if (
    gateway === "korapay" ||
    gateway === "bank_transfer" ||
    gateway === "korapay_confirmed"
  )
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
        🏦 Bank
      </span>
    );
  if (gateway === "gpu_mining")
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
        ⛏️ GPU
      </span>
    );
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
      💳 Card
    </span>
  );
}

export default function PaymentsClient({
  initialPayments,
}: {
  initialPayments: Payment[];
}) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGateway, setFilterGateway] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [txHashInput, setTxHashInput] = useState("");

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("payment_transactions").select("*");
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    if (filterGateway !== "all") {
      if (filterGateway === "crypto")
        q = q.in("gateway", ["crypto", "crypto_wallet"]);
      else q = q.eq("gateway", filterGateway);
    }
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) showToast("Failed to load payments", false);
    else setPayments(data || []);
    setLoading(false);
  }, [filterStatus, filterGateway]);

  // FIX-1: Sends paymentId — matches the fixed API route
  async function approveCrypto(payment: Payment) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/approve-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payment.id, // ← FIX: was sending reference
          txHash: txHashInput || undefined,
          cryptoAmount: payment.crypto_amount,
          cryptoType: payment.crypto_currency,
          walletAddress: payment.crypto_wallet,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      showToast(
        result.type === "license"
          ? "✅ License activated!"
          : `✅ Mining session started! (${result.miningPeriod ?? ""})`,
      );
      setSelectedPayment(null);
      setTxHashInput("");
      fetchPayments();
    } catch (e: any) {
      showToast("Failed: " + e.message, false);
    }
    setActionLoading(false);
  }

  // FIX-2: Sends paymentId correctly
  async function manualActivateNode(payment: Payment) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/activate-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }), // ← FIX
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      showToast(
        result.alreadyExisted
          ? "Already active — no duplicate created."
          : "Node allocation created!",
      );
      setSelectedPayment(null);
      fetchPayments();
    } catch (e: any) {
      showToast("Failed: " + e.message, false);
    }
    setActionLoading(false);
  }

  async function rejectPayment(payment: Payment) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/reject-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      showToast("Payment rejected.");
      setSelectedPayment(null);
      fetchPayments();
    } catch (e: any) {
      showToast("Failed: " + e.message, false);
    }
    setActionLoading(false);
  }

  const filtered = payments.filter((p) => {
    const s = search.toLowerCase();
    return (
      (p.gateway_reference || "").toLowerCase().includes(s) ||
      (p.node_key || "").toLowerCase().includes(s) ||
      (p.user_id || "").toLowerCase().includes(s) ||
      (p.crypto_wallet || "").toLowerCase().includes(s)
    );
  });

  const totalRevenue = payments
    .filter((p) => ["confirmed", "confmrmed", "completed"].includes(p.status))
    .reduce((s, p) => s + (p.amount || 0), 0);

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const pendingCryptoCount = payments.filter(
    (p) =>
      p.status === "pending" &&
      (p.gateway === "crypto_wallet" || p.gateway === "crypto"),
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 max-w-sm ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Payments</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Approve crypto → GPU node or license activates instantly.
          </p>
        </div>
        <button
          onClick={fetchPayments}
          className="flex items-center gap-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />{" "}
          Refresh
        </button>
      </div>

      {/* Alert banner */}
      {pendingCryptoCount > 0 && (
        <div className="rounded-xl p-4 flex items-start gap-3 bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-800 text-sm">
            <strong>
              {pendingCryptoCount} crypto payment
              {pendingCryptoCount > 1 ? "s" : ""}
            </strong>{" "}
            awaiting approval. Verify USDT received, then click Approve to
            instantly activate.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Transactions",
            value: payments.length,
            icon: TrendingUp,
            color: "text-gray-900",
          },
          {
            label: "Confirmed Revenue",
            value: `$${totalRevenue.toFixed(2)}`,
            icon: DollarSign,
            color: "text-emerald-600",
          },
          {
            label: "Pending (All)",
            value: pendingCount,
            icon: Clock,
            color: "text-amber-600",
          },
          {
            label: "Pending Crypto",
            value: pendingCryptoCount,
            icon: Wallet,
            color: "text-violet-600",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} className="text-gray-400" />
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">
                {label}
              </p>
            </div>
            <p className={`font-black text-2xl ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search ref, node, user, wallet…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 rounded-xl text-sm text-gray-800 bg-white border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-72"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm text-gray-700 bg-white border border-gray-200 shadow-sm focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Failed</option>
          <option value="declined">Declined</option>
        </select>
        <select
          value={filterGateway}
          onChange={(e) => setFilterGateway(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm text-gray-700 bg-white border border-gray-200 shadow-sm focus:outline-none"
        >
          <option value="all">All Gateways</option>
          <option value="crypto">Crypto Wallet</option>
          <option value="korapay">Bank / KoraPay</option>
          <option value="gpu_mining">GPU Mining</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-gray-900 font-bold text-sm">
            Payment Transactions{" "}
            <span className="text-gray-400 font-normal">
              ({filtered.length})
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="text-gray-300 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No payments found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    "Ref",
                    "Node / Type",
                    "Amount",
                    "Gateway",
                    "Period",
                    "Status",
                    "Date",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => {
                  const meta = (() => {
                    try {
                      return JSON.parse(p.metadata || "{}");
                    } catch {
                      return {};
                    }
                  })();
                  const isPendingCrypto =
                    p.status === "pending" &&
                    (p.gateway === "crypto_wallet" || p.gateway === "crypto");
                  const periodLabel =
                    PERIOD_LABELS[meta.miningPeriod] ??
                    meta.miningPeriod ??
                    "—";

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-gray-50 transition-colors ${isPendingCrypto ? "bg-amber-50/40" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {(
                          p.gateway_reference ||
                          p.gateway_transaction_id ||
                          "N/A"
                        ).slice(0, 16)}
                        …
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 text-xs font-semibold">
                          {p.node_key || "N/A"}
                        </p>
                        <p className="text-gray-400 text-[10px]">
                          {meta.purchaseType || "gpu_plan"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 font-bold text-xs">
                          ${(p.amount || 0).toFixed(2)}
                        </p>
                        <p className="text-gray-400 text-[10px]">
                          {p.currency}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <GatewayBadge gateway={p.gateway} />
                      </td>
                      <td className="px-4 py-3">
                        {meta.miningPeriod ? (
                          <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                            <Pickaxe size={10} /> {periodLabel}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setSelectedPayment(p);
                            setTxHashInput("");
                          }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 text-gray-600 hover:text-gray-900 transition-all flex items-center gap-1 bg-white"
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

      {/* ── DETAIL MODAL ── */}
      {selectedPayment &&
        (() => {
          const meta = (() => {
            try {
              return JSON.parse(selectedPayment.metadata || "{}");
            } catch {
              return {};
            }
          })();
          const isPendingCrypto =
            selectedPayment.status === "pending" &&
            (selectedPayment.gateway === "crypto_wallet" ||
              selectedPayment.gateway === "crypto");
          const isConfirmed = ["confirmed", "confmrmed", "completed"].includes(
            selectedPayment.status,
          );
          const isGpuPlan = (meta.purchaseType || "gpu_plan") !== "license";
          const periodLabel =
            PERIOD_LABELS[meta.miningPeriod] ?? meta.miningPeriod;

          return (
            <div
              className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => setSelectedPayment(null)}
            >
              <div
                className="w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[88vh] overflow-y-auto border border-gray-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div>
                    <h3 className="text-gray-900 font-bold text-sm">
                      Payment #{selectedPayment.id}
                    </h3>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {selectedPayment.node_key}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPayment(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={selectedPayment.status} />
                    <GatewayBadge gateway={selectedPayment.gateway} />
                    {selectedPayment.verified_by_admin && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Shield size={9} /> Admin Verified
                      </span>
                    )}
                    {meta.miningPeriod && (
                      <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Pickaxe size={9} /> {periodLabel} session
                      </span>
                    )}
                  </div>

                  {/* Core details */}
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    {(
                      [
                        ["Payment ID", String(selectedPayment.id)],
                        ["User ID", selectedPayment.user_id],
                        ["Node / Plan", selectedPayment.node_key || "—"],
                        [
                          "Amount",
                          `$${(selectedPayment.amount || 0).toFixed(2)} ${selectedPayment.currency}`,
                        ],
                        ["Gateway", selectedPayment.gateway],
                        ["Purchase Type", meta.purchaseType || "gpu_plan"],
                        ...(meta.miningPeriod
                          ? [
                              [
                                "Mining Period",
                                `${periodLabel} (${meta.miningPeriod})`,
                              ],
                            ]
                          : []),
                        ...(meta.paymentModel
                          ? [["Payment Model", meta.paymentModel]]
                          : []),
                        [
                          "Gateway Ref",
                          selectedPayment.gateway_reference ||
                            selectedPayment.gateway_transaction_id ||
                            "—",
                        ],
                        [
                          "Created",
                          new Date(selectedPayment.created_at).toLocaleString(),
                        ],
                        ...(selectedPayment.confirmed_at
                          ? [
                              [
                                "Confirmed",
                                new Date(
                                  selectedPayment.confirmed_at,
                                ).toLocaleString(),
                              ],
                            ]
                          : []),
                        ...(selectedPayment.failure_reason
                          ? [["Failure", selectedPayment.failure_reason]]
                          : []),
                      ] as [string, string][]
                    ).map(([l, v], idx, arr) => (
                      <div
                        key={l}
                        className={`flex justify-between items-start px-4 py-2.5 ${idx < arr.length - 1 ? "border-b border-gray-50" : ""} ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                      >
                        <span className="text-gray-500 text-xs shrink-0 mr-4">
                          {l}
                        </span>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-gray-900 text-xs text-right break-all font-medium">
                            {v}
                          </span>
                          {(l === "User ID" || l === "Gateway Ref") && (
                            <CopyBtn text={v} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Crypto details */}
                  {(selectedPayment.gateway === "crypto_wallet" ||
                    selectedPayment.gateway === "crypto") && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 space-y-2.5">
                      <p className="text-violet-700 text-xs font-bold uppercase tracking-wider">
                        Crypto Details
                      </p>
                      {[
                        [
                          "Receiving Wallet",
                          selectedPayment.receiving_wallet || "—",
                        ],
                        [
                          "Sender Wallet",
                          selectedPayment.crypto_wallet || "Not provided",
                        ],
                        ["Network", selectedPayment.crypto_network || "—"],
                        ["Currency", selectedPayment.crypto_currency || "USDT"],
                      ].map(([l, v]) => (
                        <div
                          key={l}
                          className="flex justify-between items-start gap-4"
                        >
                          <span className="text-gray-500 text-xs shrink-0">
                            {l}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-900 text-xs font-mono break-all text-right">
                              {v as string}
                            </span>
                            {v !== "—" && v !== "Not provided" && (
                              <CopyBtn text={v as string} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Metadata */}
                  {selectedPayment.metadata &&
                    (() => {
                      try {
                        const parsedMeta = JSON.parse(selectedPayment.metadata);
                        return (
                          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-1.5">
                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                              Purchase Metadata
                            </p>
                            {Object.entries(parsedMeta).map(([k, v]) => (
                              <div
                                key={k}
                                className="flex justify-between gap-4"
                              >
                                <span className="text-gray-400 text-[11px] shrink-0">
                                  {k}
                                </span>
                                <span
                                  className={`text-[11px] text-right break-all ${k === "miningPeriod" ? "text-emerald-600 font-bold" : "text-gray-700"}`}
                                >
                                  {String(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}

                  {/* ── PENDING CRYPTO: Approve / Reject ── */}
                  {isPendingCrypto && (
                    <div className="space-y-3 pt-1">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                        <p className="text-emerald-800 text-xs font-semibold">
                          ⚡ Approving will <strong>instantly activate</strong>{" "}
                          the user's{" "}
                          {meta.miningPeriod ? (
                            <span className="text-emerald-700 font-bold">
                              {periodLabel} mining session
                            </span>
                          ) : meta.purchaseType === "license" ? (
                            "operator license"
                          ) : (
                            "GPU node"
                          )}
                          . Verify USDT received first.
                        </p>
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs font-medium block mb-1.5">
                          Blockchain TX Hash{" "}
                          <span className="text-gray-300">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={txHashInput}
                          onChange={(e) => setTxHashInput(e.target.value)}
                          placeholder="0x… or TRC20 hash"
                          className="w-full px-3 py-2.5 rounded-lg text-xs font-mono text-gray-800 bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveCrypto(selectedPayment)}
                          disabled={actionLoading}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm"
                        >
                          {actionLoading ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle size={14} />
                          )}
                          Approve &amp; Activate Now
                        </button>
                        <button
                          onClick={() => rejectPayment(selectedPayment)}
                          disabled={actionLoading}
                          className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 text-red-600 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── CONFIRMED: Manual activate ── */}
                  {isConfirmed && isGpuPlan && (
                    <div className="pt-1 space-y-2">
                      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                        <p className="text-blue-800 text-xs font-semibold mb-1">
                          ✅ Payment confirmed
                        </p>
                        <p className="text-blue-600 text-xs">
                          If the session isn't visible in the user's portfolio,
                          click Manual Activate. Safe to click — idempotency
                          prevents duplicates.
                          {meta.miningPeriod && (
                            <span className="font-bold text-blue-700">
                              {" "}
                              Creates {periodLabel} session.
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => manualActivateNode(selectedPayment)}
                        disabled={actionLoading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm"
                      >
                        {actionLoading ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Zap size={14} />
                        )}
                        Manual Activate Node
                      </button>
                    </div>
                  )}

                  {["failed", "declined", "rejected"].includes(
                    selectedPayment.status,
                  ) && (
                    <p className="text-gray-400 text-xs text-center pt-1">
                      ❌ This payment was declined or failed.
                      {selectedPayment.failure_reason && (
                        <span className="block text-red-400 mt-0.5">
                          {selectedPayment.failure_reason}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
