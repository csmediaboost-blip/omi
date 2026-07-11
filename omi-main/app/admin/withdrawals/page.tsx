"use client";
// app/admin/withdrawals/page.tsx
// UPDATED: Reject dialog now has a "Reset payout account" checkbox.
// When checked, the reject API clears the user's payout account details
// so they can re-enter correct information before withdrawing again.

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  amount_gross?: number;
  amount_fee?: number;
  amount_net?: number;
  wallet_address: string | null;
  payout_method: string | null;
  payout_account_name: string | null;
  payout_bank_name: string | null;
  payout_currency: string | null;
  status: string;
  tracking_status: string | null;
  gateway_reference: string | null;
  auto_processed: boolean;
  reference: string | null;
  created_at: string;
  paid_at: string | null;
  flagged?: boolean;
  fraud_flag?: string | null;
  user_email?: string;
  user_full_name?: string;
}

type ActionType = "mark-paid" | "reject" | "view" | null;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-yellow-100 text-yellow-700 border-yellow-300",
    processing: "bg-blue-100 text-blue-700 border-blue-300",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-300",
    failed: "bg-red-100 text-red-700 border-red-300",
    rejected: "bg-slate-100 text-slate-600 border-slate-300",
    flagged: "bg-orange-100 text-orange-700 border-orange-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin ${className || "w-6 h-6"}`} />
  );
}

export default function WithdrawalQueuePage() {
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("queued");

  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [resetPayout, setResetPayout] = useState(true); // NEW: default ON
  const [korapayRef, setKorapayRef] = useState("");
  const [acting, setActing] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/withdrawals/list?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Failed to load"); return; }
      setItems(json.withdrawals ?? []);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const callApi = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: json.error ?? `HTTP ${res.status}` };
    return { ok: true, data: json, message: json.message };
  };

  const handleMarkPaid = async () => {
    if (!selected) return;
    setActing(true);
    try {
      const result = await callApi("/api/admin/withdrawals/mark-paid", {
        withdrawal_id: selected.id,
        korapay_reference: korapayRef.trim() || undefined,
      });
      if (result.ok) {
        toast.success(result.message ?? "Marked as paid.");
        closeDialog();
        fetchItems();
      } else {
        toast.error(result.message ?? "Failed.");
      }
    } finally {
      setActing(false);
    }
  };

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
        reset_payout: resetPayout, // NEW: pass reset flag
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

  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.wallet_address ?? "").toLowerCase().includes(q) ||
      (item.user_email ?? "").toLowerCase().includes(q) ||
      (item.user_full_name ?? "").toLowerCase().includes(q) ||
      (item.reference ?? "").toLowerCase().includes(q) ||
      (item.payout_account_name ?? "").toLowerCase().includes(q) ||
      (item.payout_bank_name ?? "").toLowerCase().includes(q)
    );
  });

  const closeDialog = () => {
    setSelected(null);
    setActionType(null);
    setRejectReason("");
    setKorapayRef("");
    setResetPayout(true); // reset back to default ON
  };

  const isPayable = (s: string) => ["queued", "processing"].includes(s);
  const toNgn = (usd: number) => (usd * 1600).toLocaleString("en-NG");

  return (
    <div className="min-h-screen bg-white text-slate-800 p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Withdrawal Queue</h1>
        <p className="text-slate-500 text-sm mt-1">
          Review withdrawal requests — pay manually via KoraPay then mark as paid here
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <Input
          placeholder="Search email, name, account, ref…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs bg-white border-slate-300 text-slate-800 placeholder:text-slate-400"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md text-sm"
        >
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="rejected">Rejected</option>
          <option value="flagged">Flagged</option>
        </select>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md text-sm disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="font-semibold text-slate-800">
            {statusFilter === "all" ? "All" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}{" "}
            Withdrawals ({filteredItems.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center text-slate-400 py-16">No withdrawals found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide bg-slate-50">
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
                {filteredItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 transition-colors ${
                      item.flagged ? "bg-orange-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    } hover:bg-slate-50`}
                  >
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      <br />
                      {new Date(item.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 text-sm">{item.user_full_name}</div>
                      <div className="text-xs text-slate-400">{item.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">${(item.amount_net ?? item.amount ?? 0).toFixed(2)}</div>
                      <div className="text-xs text-slate-400">≈ ₦{toNgn(item.amount_net ?? item.amount ?? 0)}</div>
                      {item.amount_fee ? <div className="text-xs text-slate-300">fee: ${item.amount_fee.toFixed(2)}</div> : null}
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      {item.payout_account_name && <div className="font-medium text-slate-800 text-xs">{item.payout_account_name}</div>}
                      {item.payout_bank_name && <div className="text-xs text-slate-500">{item.payout_bank_name}</div>}
                      {item.wallet_address && <div className="text-xs font-mono text-slate-400">{item.wallet_address}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.payout_method ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                      {item.flagged && <div className="text-xs text-orange-500 mt-0.5">⚠ flagged</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {isPayable(item.status) && (
                          <>
                            <button
                              onClick={() => { setSelected(item); setActionType("mark-paid"); setKorapayRef(""); }}
                              className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                            >
                              ✓ Mark Paid
                            </button>
                            <button
                              onClick={() => { setSelected(item); setActionType("reject"); setRejectReason(""); setResetPayout(true); }}
                              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded font-medium"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { setSelected(item); setActionType("view"); }}
                          className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg bg-white border-slate-200 text-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {actionType === "mark-paid" ? "✓ Mark as Paid"
                : actionType === "reject" ? "🚫 Reject Withdrawal"
                : "📄 Withdrawal Detail"}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 text-sm">
              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 rounded-lg p-3 text-xs border border-slate-200">
                {([
                  ["User", <span key="user">{selected.user_full_name}<br /><span className="text-slate-400">{selected.user_email}</span></span>],
                  ["Gross", <span key="gross">${(selected.amount_gross ?? selected.amount ?? 0).toFixed(2)}</span>],
                  ["Fee", <span key="fee">${(selected.amount_fee ?? 0).toFixed(2)}</span>],
                  ["Net (to pay)", <span key="net" className="font-semibold text-slate-900">${(selected.amount_net ?? selected.amount ?? 0).toFixed(2)} <span className="text-slate-400">(≈ ₦{toNgn(selected.amount_net ?? selected.amount ?? 0)})</span></span>],
                  ["Account Name", selected.payout_account_name || "—"],
                  ["Bank", selected.payout_bank_name || "—"],
                  ["Account No.", <span key="acct" className="font-mono">{selected.wallet_address || "—"}</span>],
                  ["Status", <StatusBadge key="status" status={selected.status} />],
                ] as [string, React.ReactNode][]).map(([label, value], i) => (
                  <>
                    <div key={`l-${i}`} className="text-slate-500">{label}</div>
                    <div key={`v-${i}`} className="text-slate-800">{value}</div>
                  </>
                ))}
              </div>

              {/* Mark Paid */}
              {actionType === "mark-paid" && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
                    <p className="font-semibold mb-1">Manual Payment Confirmation</p>
                    <p>Pay <strong>₦{toNgn(selected.amount_net ?? selected.amount ?? 0)}</strong> to <strong>{selected.payout_account_name}</strong> at <strong>{selected.payout_bank_name}</strong> manually via KoraPay dashboard, then enter the reference below and confirm.</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">KoraPay Reference <span className="text-slate-400">(optional)</span></label>
                    <Input
                      className="mt-1 bg-white border-slate-300 text-slate-800 placeholder:text-slate-400"
                      placeholder="e.g. KPY-123456789"
                      value={korapayRef}
                      onChange={(e) => setKorapayRef(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleMarkPaid}
                      disabled={acting}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {acting ? <><Spinner className="w-4 h-4" /> Saving…</> : "✓ Confirm Paid"}
                    </button>
                    <button onClick={closeDialog} disabled={acting} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Reject */}
              {actionType === "reject" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-red-600">
                      Rejection reason <span className="text-red-500">*</span>
                    </label>
                    <Input
                      className="mt-1 bg-white border-red-300 text-slate-800 placeholder:text-slate-400"
                      placeholder="e.g. Account name doesn't match KYC, wrong account number…"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      The user's balance will be refunded automatically.
                    </p>
                  </div>

                  {/* ── NEW: Reset payout account checkbox ── */}
                  <div
                    className={`rounded-xl p-3 border cursor-pointer transition-all ${
                      resetPayout
                        ? "bg-orange-50 border-orange-300"
                        : "bg-slate-50 border-slate-200 hover:border-slate-300"
                    }`}
                    onClick={() => setResetPayout(v => !v)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${resetPayout ? "bg-orange-500 border-orange-500" : "border-slate-400"}`}>
                        {resetPayout && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${resetPayout ? "text-orange-700" : "text-slate-600"}`}>
                          Reset user's payout account
                        </p>
                        <p className={`text-xs mt-0.5 leading-relaxed ${resetPayout ? "text-orange-600" : "text-slate-400"}`}>
                          Clears their saved bank account details so they are forced to re-enter correct information before withdrawing again. Use this when the account name or number is wrong.
                        </p>
                      </div>
                    </div>
                  </div>

                  {resetPayout && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                      <p className="font-semibold mb-1">⚠️ What will happen:</p>
                      <ul className="space-y-1 list-disc list-inside text-amber-700">
                        <li>Withdrawal rejected + balance refunded</li>
                        <li>Payout account fully cleared</li>
                        <li>User must go to Verification → Payout Setup to add correct details</li>
                        <li>User notified via in-app notification</li>
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleReject}
                      disabled={acting || !rejectReason.trim()}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {acting
                        ? <><Spinner className="w-4 h-4" /> Rejecting…</>
                        : resetPayout
                          ? "✗ Reject & Reset Payout Account"
                          : "✗ Reject & Refund"}
                    </button>
                    <button onClick={closeDialog} disabled={acting} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}