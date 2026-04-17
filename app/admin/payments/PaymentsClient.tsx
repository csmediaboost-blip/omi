"use client";
// app/admin/payments/PaymentsClient.tsx
// Full client component — all UI + actions via API routes

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";
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
  Settings,
  TrendingUp,
  DollarSign,
  Search,
  Zap,
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
  status: string;
  verified_by_admin?: boolean;
  failure_reason?: string;
  metadata?: string;
  created_at: string;
  confirmed_at?: string;
  updated_at?: string;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-1.5 p-1 rounded hover:bg-slate-700 transition-colors"
    >
      {copied ? (
        <Check size={12} className="text-emerald-400" />
      ) : (
        <Copy size={12} className="text-slate-500" />
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<
    string,
    { bg: string; border: string; text: string; label: string }
  > = {
    pending: {
      bg: "bg-amber-900/30",
      border: "border-amber-700/50",
      text: "text-amber-400",
      label: "Pending",
    },
    confirmed: {
      bg: "bg-emerald-900/30",
      border: "border-emerald-700/50",
      text: "text-emerald-400",
      label: "Confirmed",
    },
    confmrmed: {
      bg: "bg-emerald-900/30",
      border: "border-emerald-700/50",
      text: "text-emerald-400",
      label: "Confirmed",
    },
    failed: {
      bg: "bg-red-900/30",
      border: "border-red-700/50",
      text: "text-red-400",
      label: "Failed",
    },
    rejected: {
      bg: "bg-red-900/30",
      border: "border-red-700/50",
      text: "text-red-400",
      label: "Rejected",
    },
  };
  const c = cfg[status] || {
    bg: "bg-slate-800",
    border: "border-slate-700",
    text: "text-slate-400",
    label: status,
  };
  return (
    <span
      className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${c.bg} ${c.border} ${c.text}`}
    >
      {c.label}
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
  const [showConfig, setShowConfig] = useState(false);
  const [configValues, setConfigValues] = useState({
    crypto_wallet_usdt_trc20: "",
    crypto_network_label: "TRC-20 (TRON)",
    crypto_discount_percent: "5",
    crypto_qr_image_url: "",
  });
  const [configSaving, setConfigSaving] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("payment_transactions").select("*");
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    if (filterGateway !== "all") q = q.eq("gateway", filterGateway);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) showToast("Failed to load payments", false);
    else setPayments(data || []);
    setLoading(false);
  }, [filterStatus, filterGateway]);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase.from("payment_config").select("key,value");
    if (data) {
      const get = (k: string) =>
        data.find((d: any) => d.key === k)?.value || "";
      setConfigValues({
        crypto_wallet_usdt_trc20: get("crypto_wallet_usdt_trc20"),
        crypto_network_label: get("crypto_network_label") || "TRC-20 (TRON)",
        crypto_discount_percent: get("crypto_discount_percent") || "5",
        crypto_qr_image_url: get("crypto_qr_image_url"),
      });
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function saveConfig() {
    setConfigSaving(true);
    for (const [key, value] of Object.entries(configValues)) {
      await supabase
        .from("payment_config")
        .upsert({ key, value }, { onConflict: "key" });
    }
    showToast("Config saved!");
    setShowConfig(false);
    setConfigSaving(false);
  }

  // ── All approve/reject actions go through API routes (server-side, service role) ──
  async function approveCrypto(payment: Payment) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/approve-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      showToast(
        "✅ Payment approved — " +
          (result.type === "license"
            ? "license activated!"
            : "GPU node activated!"),
      );
      setSelectedPayment(null);
      fetchPayments();
    } catch (e: any) {
      showToast("Failed: " + e.message, false);
    }
    setActionLoading(false);
  }

  async function manualActivateNode(payment: Payment) {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/activate-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      showToast("Node allocation created!");
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
      (p.gateway_transaction_id || "").toLowerCase().includes(s) ||
      (p.node_key || "").toLowerCase().includes(s) ||
      (p.user_id || "").toLowerCase().includes(s) ||
      (p.crypto_wallet || "").toLowerCase().includes(s)
    );
  });

  const totalRevenue = payments
    .filter((p) => p.status === "confirmed" || p.status === "confmrmed")
    .reduce((s, p) => s + (p.amount || 0), 0);
  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const pendingCryptoCount = payments.filter(
    (p) => p.status === "pending" && p.gateway === "trustwallet",
  ).length;

  return (
    <div
      className="space-y-6 p-6"
      style={{ background: "#06080f", minHeight: "100vh", color: "white" }}
    >
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{" "}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Payments</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Approve crypto → node activates instantly.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPayments}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-sm font-bold"
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 px-3 py-2 rounded-xl text-sm font-bold"
          >
            <Settings size={13} /> Crypto Config
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: "rgba(139,92,246,0.06)",
            border: "1px solid rgba(139,92,246,0.25)",
          }}
        >
          <h3 className="text-white font-black text-base flex items-center gap-2">
            <Wallet size={16} className="text-violet-400" /> Crypto Payment
            Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                key: "crypto_wallet_usdt_trc20",
                label: "USDT Wallet (TRC-20)",
                placeholder: "T...",
              },
              {
                key: "crypto_network_label",
                label: "Network Label",
                placeholder: "TRC-20 (TRON)",
              },
              {
                key: "crypto_discount_percent",
                label: "Crypto Discount (%)",
                placeholder: "5",
              },
              {
                key: "crypto_qr_image_url",
                label: "QR Code URL",
                placeholder: "https://...",
              },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-slate-300 text-sm font-bold mb-2">
                  {label}
                </label>
                <input
                  type="text"
                  value={(configValues as any)[key]}
                  onChange={(e) =>
                    setConfigValues((v) => ({ ...v, [key]: e.target.value }))
                  }
                  placeholder={placeholder}
                  className="w-full px-4 py-3 rounded-xl text-sm font-mono text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-violet-500"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveConfig}
              disabled={configSaving}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2"
            >
              {configSaving && <RefreshCw size={13} className="animate-spin" />}
              {configSaving ? "Saving..." : "Save Configuration"}
            </button>
            <button
              onClick={() => setShowConfig(false)}
              className="border border-slate-700 text-slate-400 hover:text-white font-bold px-4 py-2.5 rounded-xl text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Transactions",
            value: payments.length,
            icon: TrendingUp,
            color: "text-white",
          },
          {
            label: "Confirmed Revenue",
            value: `$${totalRevenue.toFixed(2)}`,
            icon: DollarSign,
            color: "text-emerald-400",
          },
          {
            label: "Pending (All)",
            value: pendingCount,
            icon: Clock,
            color: "text-amber-400",
          },
          {
            label: "Pending Crypto",
            value: pendingCryptoCount,
            icon: Wallet,
            color: "text-violet-400",
          },
        ].map(({ label, value, icon: Icon, color }) => (
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

      {pendingCryptoCount > 0 && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
          }}
        >
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm">
            <strong>
              {pendingCryptoCount} crypto payment
              {pendingCryptoCount > 1 ? "s" : ""}
            </strong>{" "}
            awaiting approval. Clicking Approve instantly activates the user's
            node/license.
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
            placeholder="Search by ref, node, user, wallet..."
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
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={filterGateway}
          onChange={(e) => setFilterGateway(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm text-white bg-slate-900 border border-slate-700 focus:outline-none"
        >
          <option value="all">All Gateways</option>
          <option value="trustwallet">Crypto (TrustWallet)</option>
          <option value="korapay">KoraPay</option>
          <option value="moonpay">Card</option>
        </select>
        <button
          onClick={fetchPayments}
          className="text-slate-400 hover:text-white text-sm px-3 py-2 border border-slate-700 rounded-xl"
        >
          <RefreshCw size={13} />
        </button>
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
          <h3 className="text-white font-black text-sm">
            Payment Transactions
          </h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="text-slate-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            No payments found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60">
                  {[
                    "Gateway Ref",
                    "Node/Type",
                    "Amount",
                    "Gateway",
                    "Status",
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
                {filtered.map((p) => {
                  const meta = (() => {
                    try {
                      return JSON.parse(p.metadata || "{}");
                    } catch {
                      return {};
                    }
                  })();
                  const isPendingCrypto =
                    p.status === "pending" && p.gateway === "trustwallet";
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-800/20 transition-colors ${isPendingCrypto ? "bg-amber-900/5" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {(
                          p.gateway_reference ||
                          p.gateway_transaction_id ||
                          "N/A"
                        ).slice(0, 20)}
                        ...
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white text-xs font-bold">
                          {p.node_key || "N/A"}
                        </p>
                        <p className="text-slate-600 text-[10px]">
                          {meta.purchaseType || "gpu_plan"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white font-bold text-xs">
                          ${(p.amount || 0).toFixed(2)}
                        </p>
                        <p className="text-slate-600 text-[10px]">
                          {p.currency}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.gateway === "trustwallet" ? "bg-violet-900/30 text-violet-400" : p.gateway === "korapay" ? "bg-blue-900/30 text-blue-400" : "bg-slate-800 text-slate-400"}`}
                        >
                          {p.gateway === "trustwallet"
                            ? "₿ Crypto"
                            : p.gateway === "korapay"
                              ? "🏦 KoraPay"
                              : "💳 Card"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedPayment(p)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition-all flex items-center gap-1"
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

      {/* Payment detail modal */}
      {selectedPayment && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPayment(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[85vh] overflow-y-auto"
            style={{
              background: "rgb(10,16,28)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-white font-black text-sm">Payment Detail</h3>
              <button
                onClick={() => setSelectedPayment(null)}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={selectedPayment.status} />
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedPayment.gateway === "trustwallet" ? "bg-violet-900/30 text-violet-400" : selectedPayment.gateway === "korapay" ? "bg-blue-900/30 text-blue-400" : "bg-slate-800 text-slate-400"}`}
                >
                  {selectedPayment.gateway === "trustwallet"
                    ? "₿ Crypto (TrustWallet)"
                    : selectedPayment.gateway === "korapay"
                      ? "🏦 KoraPay"
                      : "💳 Card"}
                </span>
                {selectedPayment.verified_by_admin && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 px-2 py-0.5 rounded-full font-bold">
                    Admin Verified
                  </span>
                )}
              </div>

              <div
                className="rounded-xl p-4 space-y-3 text-sm"
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {(
                  [
                    ["Payment ID", String(selectedPayment.id)],
                    ["User ID", selectedPayment.user_id],
                    ["Node / Type", selectedPayment.node_key || "—"],
                    [
                      "Amount",
                      `$${(selectedPayment.amount || 0).toFixed(2)} ${selectedPayment.currency}`,
                    ],
                    ["Gateway", selectedPayment.gateway],
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
                ).map(([l, v]) => (
                  <div
                    key={l}
                    className="flex justify-between items-start gap-4"
                  >
                    <span className="text-slate-500 shrink-0 text-xs">{l}</span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-white text-xs text-right break-all">
                        {v}
                      </span>
                      {(l === "User ID" || l === "Gateway Ref") && (
                        <CopyBtn text={v} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {selectedPayment.gateway === "trustwallet" && (
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    background: "rgba(139,92,246,0.06)",
                    border: "1px solid rgba(139,92,246,0.2)",
                  }}
                >
                  <p className="text-violet-300 text-xs font-black uppercase tracking-wider">
                    Crypto Details
                  </p>
                  {[
                    [
                      "Admin Wallet (Receiving)",
                      selectedPayment.receiving_wallet || "—",
                    ],
                    [
                      "User Sender Wallet",
                      selectedPayment.crypto_wallet || "Not provided",
                    ],
                    ["Network", selectedPayment.crypto_network || "—"],
                    ["Currency", selectedPayment.crypto_currency || "USDT"],
                  ].map(([l, v]) => (
                    <div
                      key={l}
                      className="flex justify-between items-start gap-4"
                    >
                      <span className="text-slate-500 text-xs shrink-0">
                        {l}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-white text-xs font-mono break-all text-right">
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

              {selectedPayment.metadata &&
                (() => {
                  try {
                    const meta = JSON.parse(selectedPayment.metadata);
                    return (
                      <div
                        className="rounded-xl p-4 space-y-2"
                        style={{
                          background: "rgba(15,23,42,0.5)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                          Purchase Metadata
                        </p>
                        {Object.entries(meta).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4">
                            <span className="text-slate-600 text-[11px]">
                              {k}
                            </span>
                            <span className="text-slate-300 text-[11px] text-right break-all">
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

              {/* Pending: approve + reject */}
              {selectedPayment.status === "pending" && (
                <div className="space-y-2 pt-2">
                  <p className="text-emerald-300 text-xs font-bold bg-emerald-900/20 border border-emerald-800/30 rounded-xl p-3">
                    ⚡ Approving will <strong>instantly activate</strong> the
                    user's GPU node or license.
                    {selectedPayment.gateway === "trustwallet"
                      ? " Verify you received the USDT first."
                      : ""}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveCrypto(selectedPayment)}
                      disabled={actionLoading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      {actionLoading ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle size={14} />
                      )}
                      Approve & Activate Now
                    </button>
                    <button
                      onClick={() => rejectPayment(selectedPayment)}
                      disabled={actionLoading}
                      className="flex-1 bg-red-900/40 hover:bg-red-900/60 border border-red-700/40 disabled:opacity-50 text-red-400 font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmed: manual activate for legacy payments */}
              {(selectedPayment.status === "confirmed" ||
                selectedPayment.status === "confmrmed") &&
                (() => {
                  const meta = (() => {
                    try {
                      return JSON.parse(selectedPayment.metadata || "{}");
                    } catch {
                      return {};
                    }
                  })();
                  if ((meta.purchaseType || "gpu_plan") !== "gpu_plan")
                    return null;
                  return (
                    <div className="pt-2 space-y-2">
                      <div
                        className="rounded-xl p-3"
                        style={{
                          background: "rgba(16,185,129,0.06)",
                          border: "1px solid rgba(16,185,129,0.2)",
                        }}
                      >
                        <p className="text-emerald-300 text-xs font-bold mb-1">
                          ✅ Payment confirmed
                        </p>
                        <p className="text-slate-400 text-xs">
                          If this isn't in the user's portfolio, click Manual
                          Activate. Safe to click multiple times.
                        </p>
                      </div>
                      <button
                        onClick={() => manualActivateNode(selectedPayment)}
                        disabled={actionLoading}
                        className="w-full bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/40 disabled:opacity-50 text-emerald-300 font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2"
                      >
                        {actionLoading ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Zap size={14} />
                        )}{" "}
                        Manual Activate Node
                      </button>
                    </div>
                  );
                })()}

              {(selectedPayment.status === "failed" ||
                selectedPayment.status === "rejected") && (
                <p className="text-slate-500 text-xs text-center pt-2">
                  ❌ This payment was rejected or failed.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
