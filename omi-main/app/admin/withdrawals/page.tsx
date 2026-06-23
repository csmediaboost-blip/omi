"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
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
  expected_date: string | null;
  gateway_reference: string | null;
  auto_processed: boolean;
  reference: string;
  created_at: string;
  // joined from users
  user_email?: string;
  user_full_name?: string;
  kyc_verified?: boolean;
  kyc_status?: string;
  payout_kyc_match?: boolean;
}

type ActionType = "approve" | "reject" | "mark_paid" | null;

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    rejected: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function WithdrawalQueuePage() {
  // NOTE: we use the anon client here for READ only (admin RLS must allow select
  // for authenticated admins). All WRITES go through /api/admin/withdrawals/*
  // which uses the service-role key server-side — this prevents RLS rejections
  // from bouncing the admin to the sign-in page.
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("queued");
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [gatewayRef, setGatewayRef] = useState("");
  const [acting, setActing] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("withdrawals")
        .select(
          `id, user_id, amount, wallet_address, payout_method,
           payout_account_name, payout_bank_name, payout_bank_code,
           payout_currency, status, tracking_status, expected_date,
           gateway_reference, auto_processed, reference, created_at,
           users!inner(email, full_name, kyc_verified, kyc_status, payout_kyc_match)`,
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data, error } = await q;
      if (error) {
        console.error("[admin/withdrawals] fetch error:", error.message);
        // If this is an auth/RLS error it means admin RLS is misconfigured —
        // don't redirect, just show the error so we can diagnose it here.
        toast.error(`Failed to load: ${error.message}`);
        return;
      }

      const rows: Withdrawal[] = (data ?? []).map((r: any) => ({
        ...r,
        user_email: r.users?.email ?? "—",
        user_full_name: r.users?.full_name ?? "—",
        kyc_verified: r.users?.kyc_verified,
        kyc_status: r.users?.kyc_status,
        payout_kyc_match: r.users?.payout_kyc_match,
      }));
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ── Action helper — ALL writes go to API routes (service-role server-side) ──
  const callAdminApi = async (
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; message?: string }> => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, message: json.message };
  };

  const handleAction = async () => {
    if (!selected || !actionType) return;
    setActing(true);
    try {
      let result: { ok: boolean; message?: string };

      if (actionType === "approve") {
        result = await callAdminApi("/api/admin/withdrawals/approve", {
          withdrawal_id: selected.id,
          gateway_reference: gatewayRef.trim() || undefined,
        });
      } else if (actionType === "reject") {
        if (!rejectReason.trim()) {
          toast.error("Rejection reason is required.");
          return;
        }
        result = await callAdminApi("/api/admin/withdrawals/reject", {
          withdrawal_id: selected.id,
          reason: rejectReason.trim(),
        });
      } else {
        // mark_paid
        result = await callAdminApi("/api/admin/withdrawals/mark-paid", {
          withdrawal_id: selected.id,
          gateway_reference: gatewayRef.trim() || undefined,
        });
      }

      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setSelected(null);
        setActionType(null);
        setRejectReason("");
        setGatewayRef("");
        fetchItems();
      } else {
        toast.error(result.message ?? "Action failed.");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Unexpected error.");
    } finally {
      setActing(false);
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.wallet_address ?? "").toLowerCase().includes(q) ||
      (item.user_email ?? "").toLowerCase().includes(q) ||
      (item.user_full_name ?? "").toLowerCase().includes(q) ||
      item.reference.toLowerCase().includes(q)
    );
  });

  // ── Fraud flags ────────────────────────────────────────────────────────────
  function fraudFlags(item: Withdrawal): string[] {
    const flags: string[] = [];
    if (!item.kyc_verified && item.kyc_status !== "approved")
      flags.push("KYC unverified");
    if (!item.payout_kyc_match) flags.push("Name mismatch");
    if (item.amount >= 10_000) flags.push("Large amount");
    return flags;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Withdrawal Queue</h1>
        <p className="text-muted-foreground mt-1">
          Review and process pending withdrawal requests
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by email, name, address, ref…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="rejected">Rejected</option>
        </select>
        <Button variant="outline" onClick={fetchItems} disabled={loading}>
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {statusFilter === "all" ? "All" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}{" "}
            Withdrawals ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No withdrawals found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bank / Wallet</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const flags = fraudFlags(item);
                    return (
                      <TableRow key={item.id} className={flags.length > 0 ? "bg-red-50/50" : ""}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(item.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          <br />
                          {new Date(item.created_at).toLocaleTimeString("en-NG", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{item.user_full_name}</div>
                          <div className="text-xs text-muted-foreground">{item.user_email}</div>
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${(item.amount ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-[160px] truncate">
                          {item.payout_account_name && (
                            <div className="font-sans font-medium not-italic mb-0.5">
                              {item.payout_account_name}
                            </div>
                          )}
                          {item.payout_bank_name && (
                            <div className="text-muted-foreground">{item.payout_bank_name}</div>
                          )}
                          <div className="truncate">{item.wallet_address ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">{item.payout_method ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                          {item.auto_processed && (
                            <div className="text-xs text-muted-foreground mt-0.5">auto</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {flags.length > 0 ? (
                            <div className="space-y-0.5">
                              {flags.map((f) => (
                                <Badge key={f} variant="destructive" className="text-xs block w-fit">
                                  ⚠ {f}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-green-600">✓ Clear</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {(item.status === "queued" || item.status === "processing") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="text-xs"
                                  onClick={() => {
                                    setSelected(item);
                                    setActionType("mark_paid");
                                    setGatewayRef(item.gateway_reference ?? "");
                                  }}
                                >
                                  Mark Paid
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="text-xs"
                                  onClick={() => {
                                    setSelected(item);
                                    setActionType("reject");
                                    setRejectReason("");
                                  }}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => {
                                setSelected(item);
                                setActionType(null);
                              }}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action / detail dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setActionType(null);
            setRejectReason("");
            setGatewayRef("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionType === "mark_paid"
                ? "Mark as Paid"
                : actionType === "reject"
                  ? "Reject Withdrawal"
                  : "Withdrawal Detail"}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 text-sm">
              {/* Detail rows */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted/40 rounded-lg p-3">
                <div className="text-muted-foreground">Reference</div>
                <div className="font-mono text-xs">{selected.reference}</div>

                <div className="text-muted-foreground">User</div>
                <div>
                  {selected.user_full_name}
                  <br />
                  <span className="text-muted-foreground text-xs">{selected.user_email}</span>
                </div>

                <div className="text-muted-foreground">Amount</div>
                <div className="font-semibold">${selected.amount.toFixed(2)}</div>

                <div className="text-muted-foreground">Bank</div>
                <div>
                  {selected.payout_account_name}
                  <br />
                  <span className="text-xs text-muted-foreground">
                    {selected.payout_bank_name} · {selected.wallet_address}
                  </span>
                </div>

                <div className="text-muted-foreground">KYC</div>
                <div>
                  {selected.kyc_verified || selected.kyc_status === "approved" ? (
                    <span className="text-green-600">✓ Verified</span>
                  ) : (
                    <span className="text-red-600">✗ Not verified</span>
                  )}
                  {" · "}
                  {selected.payout_kyc_match ? (
                    <span className="text-green-600">Name match</span>
                  ) : (
                    <span className="text-red-600">Name mismatch ⚠</span>
                  )}
                </div>

                <div className="text-muted-foreground">Status</div>
                <div>
                  <StatusBadge status={selected.status} />
                </div>

                {selected.gateway_reference && (
                  <>
                    <div className="text-muted-foreground">Gateway ref</div>
                    <div className="font-mono text-xs">{selected.gateway_reference}</div>
                  </>
                )}
              </div>

              {/* Action inputs */}
              {(actionType === "mark_paid" || actionType === "approve") && (
                <div>
                  <label className="text-sm font-medium">
                    Gateway reference (optional)
                  </label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. KP-TXN-1234567"
                    value={gatewayRef}
                    onChange={(e) => setGatewayRef(e.target.value)}
                  />
                </div>
              )}

              {actionType === "reject" && (
                <div>
                  <label className="text-sm font-medium text-red-700">
                    Rejection reason <span className="text-red-500">*</span>
                  </label>
                  <Input
                    className="mt-1 border-red-300"
                    placeholder="e.g. KYC name mismatch, suspicious activity…"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The user&apos;s balance will be refunded and they will see this reason.
                  </p>
                </div>
              )}

              {/* Buttons */}
              {actionType && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleAction}
                    disabled={acting}
                    variant={actionType === "reject" ? "destructive" : "default"}
                    className="flex-1"
                  >
                    {acting ? <Spinner className="w-4 h-4 mr-2" /> : null}
                    {actionType === "mark_paid"
                      ? "Confirm — Mark Paid"
                      : actionType === "reject"
                        ? "Confirm — Reject & Refund"
                        : "Confirm — Approve"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setActionType(null)}
                    disabled={acting}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}