"use client";
// app/admin/withdrawals/page.tsx

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  wallet_address: string | null;
  payout_method: string | null;
  payout_account_name: string | null;
  payout_bank_name: string | null;
  payout_bank_code: string | null;
  payout_currency: string | null;
  status: string;
  tracking_status: string | null;
  gateway_reference: string | null;
  auto_processed: boolean;
  reference: string;
  created_at: string;
  paid_at: string | null;
  user_email?: string;
  user_full_name?: string;
}

type ActionType = "pay" | "reject" | "view" | null;

interface BulkResult {
  withdrawal_id: string;
  reference: string;
  amount: number;
  account_name: string;
  bank_name: string;
  success: boolean;
  korapay_reference?: string;
  error?: string;
  skipped?: boolean;
  skip_reason?: string;
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    processing: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    paid: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    failed: "bg-red-500/20 text-red-300 border-red-500/30",
    rejected: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${map[status] ?? "bg-slate-500/20 text-slate-300"}`}>
      {status}
    </span>
  );
}

// ─── SPINNER ──────────────────────────────────────────────────────────────────
function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin ${className || "w-6 h-6"}`} />
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function WithdrawalQueuePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("queued");

  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [showBulkResults, setShowBulkResults] = useState(false);

  // ── Fetch — FIX: query users separately to avoid ambiguous relationship ────
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      // Step 1: fetch withdrawals
      let q = supabase
        .from("withdrawals")
        .select(
          `id, user_id, amount, wallet_address, payout_method,
           payout_account_name, payout_bank_name, payout_bank_code,
           payout_currency, status, tracking_status,
           gateway_reference, auto_processed, reference,
           created_at, paid_at`
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data: wds, error } = await q;

      if (error) {
        console.error("[admin/withdrawals] fetch:", error.message);
        toast.error(`Failed to load: ${error.message}`);
        return;
      }

      if (!wds?.length) {
        setItems([]);
        return;
      }

      // Step 2: fetch user details separately — avoids ambiguous FK error
      const userIds = [...new Set(wds.map((w) => w.user_id))];
      const { data: users } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", userIds);

      const userMap: Record<string, { email: string; full_name: string }> = {};
      (users ?? []).forEach((u: any) => {
        userMap[u.id] = { email: u.email, full_name: u.full_name };
      });

      setItems(
        wds.map((w: any) => ({
          ...w,
          user_email: userMap[w.user_id]?.email ?? "—",
          user_full_name: userMap[w.user_id]?.full_name ?? "—",
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter]); // eslint-disable-line

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── API helper ────────────────────────────────────────────────────────────
  const callApi = async (
    path: string,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; data?: any; message?: string }> => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: json.error ?? `HTTP ${res.status}` };
    return { ok: true, data: json, message: json.message };
  };

  // ── Single pay ────────────────────────────────────────────────────────────
  const handleSinglePay = async () => {
    if (!selected) return;
    setActing(true);
    try {
      const result = await callApi("/api/admin/withdrawals/disburse", {
        withdrawal_id: selected.id,
      });
      if (result.ok) {
        toast.success(result.message ?? "Payment sent.");
        closeDialog();
        fetchItems();
      } else {
        toast.error(result.message ?? "Payment failed.");
      }
    } finally {
      setActing(false);
    }
  };

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) {
      toast.error("Rejection reason is required.");
      return;
    }
    setActing(true);
    try {
      const result = await callApi("/api/admin/withdrawals/reject", {
        withdrawal_id: selected.id,
        reason: rejectReason.trim(),
      });
      if (result.ok) {
        toast.success(result.message ?? "Rejected and refunded.");
        closeDialog();
        fetchItems();
      } else {
        toast.error(result.message ?? "Rejection failed.");
      }
    } finally {
      setActing(false);
    }
  };

  // ── Bulk helpers ──────────────────────────────────────────────────────────
  const payableItems = items.filter((i) => ["queued", "processing"].includes(i.status));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const payableFiltered = filteredItems.filter((i) =>
      ["queued", "processing"].includes(i.status)
    );
    setSelectedIds(new Set(payableFiltered.map((i) => i.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Bulk pay ──────────────────────────────────────────────────────────────
  const handleBulkPay = async () => {
    if (selectedIds.size === 0) { toast.error("No withdrawals selected."); return; }
    const confirmed = window.confirm(
      `Pay ${selectedIds.size} withdrawal(s) via KoraPay?\n\nThis will send real money. Cannot be undone.`
    );
    if (!confirmed) return;

    setBulkActing(true);
    try {
      const result = await callApi("/api/admin/withdrawals/bulk-disburse", {
        withdrawal_ids: Array.from(selectedIds),
      });
      if (result.ok) {
        const { summary, results } = result.data;
        setBulkResults(results);
        setShowBulkResults(true);
        clearSelection();
        fetchItems();
        if (summary.failed === 0 && summary.skipped === 0) {
          toast.success(`All ${summary.succeeded} payments sent. Total: $${summary.total_paid_usd} (₦${summary.total_paid_ngn})`);
        } else {
          toast.warning(`${summary.succeeded} paid, ${summary.failed} failed, ${summary.skipped} skipped.`);
        }
      } else {
        toast.error(result.message ?? "Bulk pay failed.");
      }
    } finally {
      setBulkActing(false);
    }
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.wallet_address ?? "").toLowerCase().includes(q) ||
      (item.user_email ?? "").toLowerCase().includes(q) ||
      (item.user_full_name ?? "").toLowerCase().includes(q) ||
      item.reference.toLowerCase().includes(q) ||
      (item.payout_account_name ?? "").toLowerCase().includes(q) ||
      (item.payout_bank_name ?? "").toLowerCase().includes(q)
    );
  });

  const closeDialog = () => { setSelected(null); setActionType(null); setRejectReason(""); };
  const isPayable = (s: string) => ["queued", "processing"].includes(s);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Withdrawal Queue</h1>
        <p className="text-slate-400 text-sm mt-1">
          Review and pay withdrawal requests via KoraPay
        </p>
      </div>

      {/* Filters + bulk actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <Input
          placeholder="Search email, name, account, ref…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-md text-sm"
        >
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="rejected">Rejected</option>
        </select>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-md text-sm disabled:opacity-50"
        >
          Refresh
        </button>

        {payableItems.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            {selectedIds.size > 0 && (
              <span className="text-sm text-slate-400">{selectedIds.size} selected</span>
            )}
            <button
              onClick={selectedIds.size > 0 ? clearSelection : selectAll}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-md"
            >
              {selectedIds.size > 0 ? "Clear" : "Select All Payable"}
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkPay}
                disabled={bulkActing}
                className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md disabled:opacity-50 flex items-center gap-2"
              >
                {bulkActing ? <><Spinner className="w-4 h-4" /> Processing…</> : `💸 Pay ${selectedIds.size} Selected`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">
            {statusFilter === "all" ? "All" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}{" "}
            Withdrawals ({filteredItems.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="w-8 h-8" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center text-slate-500 py-16">No withdrawals found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Account Details</th>
                  <th className="px-4 py-3 text-left">Method</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const payable = isPayable(item.status);
                  const isChecked = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-slate-800/50 transition-colors ${
                        isChecked
                          ? "bg-emerald-900/20"
                          : idx % 2 === 0
                          ? "bg-slate-900"
                          : "bg-slate-900/50"
                      } hover:bg-slate-800/50`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3">
                        {payable && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(item.id)}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          />
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString("en-NG", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                        <br />
                        {new Date(item.created_at).toLocaleTimeString("en-NG", {
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>

                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-white text-sm">{item.user_full_name}</div>
                        <div className="text-xs text-slate-400">{item.user_email}</div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">${(item.amount ?? 0).toFixed(2)}</div>
                        <div className="text-xs text-slate-400">
                          ≈ ₦{((item.amount ?? 0) * 1600).toLocaleString("en-NG")}
                        </div>
                      </td>

                      {/* Account details */}
                      <td className="px-4 py-3 max-w-[180px]">
                        {item.payout_account_name && (
                          <div className="font-medium text-white text-xs">{item.payout_account_name}</div>
                        )}
                        {item.payout_bank_name && (
                          <div className="text-xs text-slate-400">{item.payout_bank_name}</div>
                        )}
                        {item.wallet_address && (
                          <div className="text-xs font-mono text-slate-500">{item.wallet_address}</div>
                        )}
                      </td>

                      {/* Method */}
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {item.payout_method ?? "—"}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                        {item.auto_processed && (
                          <div className="text-xs text-slate-500 mt-0.5">auto</div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {payable && (
                            <>
                              <button
                                onClick={() => { setSelected(item); setActionType("pay"); }}
                                className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                              >
                                Pay Now
                              </button>
                              <button
                                onClick={() => { setSelected(item); setActionType("reject"); setRejectReason(""); }}
                                className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded font-medium"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => { setSelected(item); setActionType("view"); }}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Single action dialog ─────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-white">
              {actionType === "pay" ? "💸 Pay via KoraPay"
                : actionType === "reject" ? "🚫 Reject Withdrawal"
                : "📄 Withdrawal Detail"}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 text-sm">
              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-800 rounded-lg p-3 text-xs">
                {[
                  ["Reference", <span className="font-mono">{selected.reference}</span>],
                  ["User", <span>{selected.user_full_name}<br /><span className="text-slate-400">{selected.user_email}</span></span>],
                  ["Amount", <span className="font-semibold text-white">${selected.amount.toFixed(2)} <span className="text-slate-400">(≈ ₦{(selected.amount * 1600).toLocaleString("en-NG")})</span></span>],
                  ["Account Name", selected.payout_account_name || "—"],
                  ["Bank", selected.payout_bank_name || "—"],
                  ["Account No.", <span className="font-mono">{selected.wallet_address || "—"}</span>],
                  ["Bank Code", <span className="font-mono">{selected.payout_bank_code || "—"}</span>],
                  ["Status", <StatusBadge status={selected.status} />],
                  ...(selected.gateway_reference
                    ? [["KoraPay Ref", <span className="font-mono">{selected.gateway_reference}</span>]]
                    : []),
                ].map(([label, value], i) => (
                  <>
                    <div key={`l-${i}`} className="text-slate-400">{label}</div>
                    <div key={`v-${i}`} className="text-slate-200">{value as any}</div>
                  </>
                ))}
              </div>

              {/* Pay */}
              {actionType === "pay" && (
                <div className="space-y-3">
                  <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-3 text-xs text-emerald-300">
                    <p className="font-semibold mb-1">⚠️ Confirm payment</p>
                    <p>
                      Disburse <strong>₦{(selected.amount * 1600).toLocaleString("en-NG")}</strong> to{" "}
                      <strong>{selected.payout_account_name}</strong> at{" "}
                      <strong>{selected.payout_bank_name}</strong> via KoraPay.
                    </p>
                    <p className="mt-1 text-emerald-400">This action cannot be undone.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSinglePay}
                      disabled={acting}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {acting ? <><Spinner className="w-4 h-4" /> Sending…</> : "✓ Confirm & Pay"}
                    </button>
                    <button
                      onClick={closeDialog}
                      disabled={acting}
                      className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Reject */}
              {actionType === "reject" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-red-400">
                      Rejection reason <span className="text-red-500">*</span>
                    </label>
                    <Input
                      className="mt-1 bg-slate-800 border-red-700/50 text-white placeholder:text-slate-500"
                      placeholder="e.g. KYC name mismatch, suspicious activity…"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      The user's balance will be refunded automatically.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReject}
                      disabled={acting || !rejectReason.trim()}
                      className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {acting ? <><Spinner className="w-4 h-4" /> Rejecting…</> : "✗ Reject & Refund"}
                    </button>
                    <button
                      onClick={closeDialog}
                      disabled={acting}
                      className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk results dialog ──────────────────────────────────────────── */}
      <Dialog open={showBulkResults} onOpenChange={setShowBulkResults}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-white">Bulk Payment Results</DialogTitle>
          </DialogHeader>
          {bulkResults && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-3">
                  <div className="text-2xl font-bold text-emerald-400">
                    {bulkResults.filter((r) => r.success).length}
                  </div>
                  <div className="text-xs text-emerald-500">Paid</div>
                </div>
                <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3">
                  <div className="text-2xl font-bold text-red-400">
                    {bulkResults.filter((r) => !r.success && !r.skipped).length}
                  </div>
                  <div className="text-xs text-red-500">Failed</div>
                </div>
                <div className="bg-yellow-900/30 border border-yellow-700/40 rounded-lg p-3">
                  <div className="text-2xl font-bold text-yellow-400">
                    {bulkResults.filter((r) => r.skipped).length}
                  </div>
                  <div className="text-xs text-yellow-500">Skipped</div>
                </div>
              </div>

              <div className="space-y-2">
                {bulkResults.map((r) => (
                  <div
                    key={r.withdrawal_id}
                    className={`rounded-lg p-3 text-xs border ${
                      r.success
                        ? "bg-emerald-900/20 border-emerald-700/30"
                        : r.skipped
                        ? "bg-yellow-900/20 border-yellow-700/30"
                        : "bg-red-900/20 border-red-700/30"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold text-white">{r.account_name}</span>
                        <span className="text-slate-400 ml-2">{r.bank_name}</span>
                      </div>
                      <span className="font-semibold text-white">${r.amount.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-slate-500 font-mono">{r.reference}</div>
                    {r.success && (
                      <div className="mt-1 text-emerald-400">✓ Paid · KoraPay ref: {r.korapay_reference}</div>
                    )}
                    {r.skipped && (
                      <div className="mt-1 text-yellow-400">⚠ Skipped: {r.skip_reason}</div>
                    )}
                    {!r.success && !r.skipped && (
                      <div className="mt-1 text-red-400">✗ Failed: {r.error}</div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowBulkResults(false)}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
              >
                Close
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}