"use client";
// app/admin/withdrawals/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw,
  Lock, DollarSign, TrendingUp, Activity, BarChart3,
  Settings, AlertOctagon, Eye, Play, Pause, Percent, Calendar,
  ChevronDown, ChevronUp, Wallet, Receipt, X, Save, Edit3,
} from "lucide-react";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ─── TYPES ────────────────────────────────────────────────────────────────────
type WithdrawalSettings = {
  id: string;
  global_paused: boolean;
  pause_reason: string | null;
  max_per_tier: Record<string, number>;
  fee_schedule: Array<{ maxAmount: number | null; pct: number }>;
  cooldown_override_hours: number | null;
  lock_days_override: Record<string, number> | null;
  updated_at: string;
  updated_by: string | null;
};

type PendingWithdrawal = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  amount: number;
  amount_gross: number | null;
  amount_fee: number | null;
  amount_net: number | null;
  fee_pct: number | null;
  tier_at_time: number | null;
  status: string;
  tracking_status: string | null;
  flagged: boolean | null;
  risk_score: number | null;
  payout_method: string | null;
  payout_account_name: string | null;
  payout_account_number?: string | null;
  payout_bank_name?: string | null;
  payout_bank_code?: string | null;
  created_at: string;
  expected_date: string | null;
  admin_note: string | null;
};

type AuditEntry = {
  id: string;
  user_id: string;
  amount_gross: number;
  amount_fee: number;
  amount_net: number;
  fee_pct: number;
  tier_at_time: number | null;
  risk_score: number;
  flags: string[];
  flagged: boolean;
  window_state: string;
  action: string;
  note: string | null;
  created_at: string;
};

type TreasuryWeek = {
  week: string;
  fees_collected: number;
  tx_count: number;
};

type TreasurySummary = {
  total_fees: number;
  total_fees_30d: number;
  total_withdrawn_all_time: number;
  pending_count: number;
  flagged_count: number;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const TIER_NAMES = ["Lite", "Foundation", "RTX 4090", "A100", "H100"];
const DEFAULT_LOCK_DAYS = [7, 14, 21, 30, 45];

function StatusPill({ status, flagged }: { status: string; flagged?: boolean | null }) {
  const base = "text-[10px] font-black px-2 py-0.5 rounded-full border capitalize";
  if (flagged) return <span className={`${base} bg-orange-900/30 border-orange-700/40 text-orange-400`}>⚠ Flagged</span>;
  const map: Record<string, string> = {
    queued:       "bg-blue-900/30 border-blue-700/40 text-blue-400",
    processing:   "bg-violet-900/30 border-violet-700/40 text-violet-400",
    paid:         "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    approved:     "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    rejected:     "bg-red-900/30 border-red-700/40 text-red-400",
    failed:       "bg-red-900/30 border-red-700/40 text-red-400",
    under_review: "bg-orange-900/30 border-orange-700/40 text-orange-400",
  };
  return (
    <span className={`${base} ${map[status] ?? "bg-slate-800 border-slate-700 text-slate-400"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RiskBadge({ score }: { score: number | null }) {
  if (!score) return <span className="text-[10px] text-slate-600">—</span>;
  const color = score >= 60 ? "text-red-400" : score >= 30 ? "text-amber-400" : "text-emerald-400";
  return <span className={`text-[10px] font-black ${color}`}>{score}/100</span>;
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function SettingsPanel({
  settings,
  onSave,
}: {
  settings: WithdrawalSettings;
  onSave: (s: Partial<WithdrawalSettings>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pauseReason, setPauseReason] = useState(settings.pause_reason ?? "");
  const [tierLimits, setTierLimits] = useState<Record<string, number>>(
    settings.max_per_tier ?? { "0": 10, "1": 50, "2": 200, "3": 500, "4": 2000 },
  );
  const [feeSchedule, setFeeSchedule] = useState(
    settings.fee_schedule ?? [
      { maxAmount: 10, pct: 5 },
      { maxAmount: 100, pct: 2 },
      { maxAmount: null, pct: 1 },
    ],
  );
  const [lockDays, setLockDays] = useState<Record<string, number>>(
    settings.lock_days_override ?? { "0": 7, "1": 14, "2": 21, "3": 30, "4": 45 },
  );

  async function handleSave() {
    setSaving(true);
    await onSave({
      max_per_tier: tierLimits,
      fee_schedule: feeSchedule,
      lock_days_override: lockDays,
      ...(pauseReason !== settings.pause_reason ? { pause_reason: pauseReason } : {}),
    });
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white font-black text-sm flex items-center gap-2">
          <Settings size={14} className="text-slate-400" /> Withdrawal Settings
        </p>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-all"
        >
          <Edit3 size={11} /> {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {/* Tier weekly limits */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-slate-400 text-[10px] uppercase tracking-wide font-bold flex items-center gap-1.5">
          <Calendar size={10} /> Weekly Withdrawal Limits per Tier
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4].map((tier) => (
            <div key={tier} className="space-y-1">
              <p className="text-slate-500 text-[10px]">Tier {tier} — {TIER_NAMES[tier]}</p>
              {editing ? (
                <input
                  type="number"
                  value={tierLimits[tier] ?? 0}
                  onChange={(e) =>
                    setTierLimits((prev) => ({ ...prev, [tier]: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-bold focus:outline-none focus:border-emerald-500"
                />
              ) : (
                <p className="text-emerald-400 font-black text-sm">${tierLimits[tier] ?? "—"}/week</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Fee schedule */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-slate-400 text-[10px] uppercase tracking-wide font-bold flex items-center gap-1.5">
          <Percent size={10} /> Fee Schedule
        </p>
        {feeSchedule.map((tier, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-slate-500 text-xs w-28 shrink-0">
              {i === 0
                ? `Below $${tier.maxAmount}`
                : i === feeSchedule.length - 1
                  ? `Above $${feeSchedule[i - 1].maxAmount}`
                  : `$${feeSchedule[i - 1].maxAmount}–$${tier.maxAmount}`}
            </span>
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={20} step={0.5}
                  value={tier.pct}
                  onChange={(e) =>
                    setFeeSchedule((prev) =>
                      prev.map((t, j) => (j === i ? { ...t, pct: parseFloat(e.target.value) || 0 } : t)),
                    )
                  }
                  className="w-20 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-bold focus:outline-none focus:border-emerald-500"
                />
                <span className="text-slate-500 text-xs">%</span>
              </div>
            ) : (
              <span className="text-amber-400 font-black text-sm">{tier.pct}%</span>
            )}
            <span className="text-slate-600 text-[10px]">→ treasury</span>
          </div>
        ))}
      </div>

      {/* Lock periods */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-slate-400 text-[10px] uppercase tracking-wide font-bold flex items-center gap-1.5">
          <Lock size={10} /> Capital Lock Periods (days)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4].map((tier) => (
            <div key={tier} className="space-y-1">
              <p className="text-slate-500 text-[10px]">Tier {tier} — {TIER_NAMES[tier]}</p>
              {editing ? (
                <input
                  type="number" min={0}
                  value={lockDays[tier] ?? DEFAULT_LOCK_DAYS[tier]}
                  onChange={(e) =>
                    setLockDays((prev) => ({ ...prev, [tier]: parseInt(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-bold focus:outline-none focus:border-emerald-500"
                />
              ) : (
                <p className="text-amber-400 font-black text-sm">
                  {lockDays[tier] ?? DEFAULT_LOCK_DAYS[tier]} days
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <>
          <div className="space-y-2">
            <label className="text-slate-400 text-[10px] uppercase tracking-wide font-bold">
              Pause reason (shown to users)
            </label>
            <input
              type="text"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="e.g. Scheduled maintenance — resuming in 2 hours"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl font-black text-slate-950 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            style={{ background: "#10b981" }}
          >
            {saving ? (
              <><RefreshCw size={14} className="animate-spin" /> Saving…</>
            ) : (
              <><Save size={14} /> Save All Changes</>
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ─── WITHDRAWAL ROW ───────────────────────────────────────────────────────────
function WithdrawalRow({
  w,
  onApprove,
  onReject,
  onFlag,
}: {
  w: PendingWithdrawal;
  onApprove: (id: string, note: string) => Promise<void>;
  onReject: (id: string, note: string) => Promise<void>;
  onFlag: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(w.admin_note ?? "");
  const [acting, setActing] = useState<"approve" | "reject" | "flag" | null>(null);

  async function act(type: "approve" | "reject" | "flag", fn: () => Promise<void>) {
    setActing(type);
    await fn();
    setActing(null);
  }

  const gross = w.amount_gross ?? w.amount;
  const fee   = w.amount_fee  ?? 0;
  const net   = w.amount_net  ?? w.amount;
  const feeP  = w.fee_pct     ?? 0;

  const isTerminal = ["paid", "rejected", "failed"].includes(w.status);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(10,16,28,0.9)",
        border: `1px solid ${w.flagged ? "rgba(251,146,60,0.3)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-white font-bold text-sm truncate">
              {w.full_name ?? w.email ?? w.user_id.slice(0, 8)}
            </p>
            <StatusPill status={w.tracking_status ?? w.status} flagged={w.flagged} />
            {w.tier_at_time != null && (
              <span className="text-[10px] text-slate-500">
                {TIER_NAMES[w.tier_at_time] ?? `Tier ${w.tier_at_time}`}
              </span>
            )}
          </div>
          <p className="text-slate-500 text-[10px]">
            {new Date(w.created_at).toLocaleString()} · {w.payout_method ?? "—"} ·{" "}
            {w.payout_account_name ?? "—"}
            {w.payout_bank_name ? ` · ${w.payout_bank_name}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0 mr-2">
          <p className="text-white font-black text-lg">${gross.toFixed(2)}</p>
          <p className="text-slate-500 text-[10px]">
            ${fee.toFixed(2)} fee · ${net.toFixed(2)} net
          </p>
        </div>
        <RiskBadge score={w.risk_score} />
        {expanded ? (
          <ChevronUp size={13} className="text-slate-600 shrink-0" />
        ) : (
          <ChevronDown size={13} className="text-slate-600 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-800/60 space-y-3">
          {/* Details grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
            {[
              ["User ID",    w.user_id.slice(0, 16) + "…"],
              ["Email",      w.email ?? "—"],
              ["Gross",      `$${gross.toFixed(2)}`],
              ["Fee",        `$${fee.toFixed(2)} (${feeP}%)`],
              ["Net",        `$${net.toFixed(2)}`],
              ["Account",    w.payout_account_name ?? "—"],
              ["Bank",       w.payout_bank_name ?? "—"],
              ["Method",     w.payout_method ?? "—"],
              ["Risk Score", `${w.risk_score ?? 0}/100`],
              ["Expected",   w.expected_date ? new Date(w.expected_date).toLocaleDateString() : "—"],
              ["Status",     w.status],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg p-2.5" style={{ background: "rgba(15,23,42,0.6)" }}>
                <p className="text-slate-600 text-[10px] uppercase">{l}</p>
                <p className="text-white text-xs font-bold mt-0.5 break-all">{v}</p>
              </div>
            ))}
          </div>

          {/* Admin note */}
          {!isTerminal && (
            <div>
              <label className="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">
                Admin note (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for approval/rejection…"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Action buttons */}
          {!isTerminal && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => act("approve", () => onApprove(w.id, note))}
                disabled={acting !== null}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs text-slate-950 transition-all disabled:opacity-50"
                style={{ background: acting === "approve" ? "rgba(16,185,129,0.6)" : "#10b981" }}
              >
                {acting === "approve" ? (
                  <><RefreshCw size={11} className="animate-spin" /> Approving…</>
                ) : (
                  <><CheckCircle size={11} /> Approve & Disburse ${net.toFixed(2)}</>
                )}
              </button>

              <button
                onClick={() => act("reject", () => onReject(w.id, note))}
                disabled={acting !== null}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs text-white border border-red-700/50 bg-red-900/20 hover:bg-red-900/40 transition-all disabled:opacity-50"
              >
                {acting === "reject" ? (
                  <><RefreshCw size={11} className="animate-spin" /> Rejecting…</>
                ) : (
                  <><XCircle size={11} /> Reject</>
                )}
              </button>

              {!w.flagged && (
                <button
                  onClick={() => act("flag", () => onFlag(w.id))}
                  disabled={acting !== null}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs text-orange-400 border border-orange-700/40 bg-orange-900/10 hover:bg-orange-900/20 transition-all disabled:opacity-50"
                >
                  {acting === "flag" ? (
                    <><RefreshCw size={11} className="animate-spin" /> Flagging…</>
                  ) : (
                    <><AlertOctagon size={11} /> Flag for Review</>
                  )}
                </button>
              )}
            </div>
          )}

          {isTerminal && (
            <div className="rounded-lg px-3 py-2 text-xs text-slate-500 border border-slate-800"
              style={{ background: "rgba(15,23,42,0.4)" }}>
              This withdrawal has been {w.status} — no further actions available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const sb = getSupabase();

  const [settings, setSettings]     = useState<WithdrawalSettings | null>(null);
  const [pendingWDs, setPendingWDs] = useState<PendingWithdrawal[]>([]);
  const [auditLog, setAuditLog]     = useState<AuditEntry[]>([]);
  const [treasuryWeeks, setTreasuryWeeks] = useState<TreasuryWeek[]>([]);
  const [summary, setSummary]       = useState<TreasurySummary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<"queue" | "audit" | "treasury" | "settings">("queue");
  const [toast, setToast]           = useState<{ text: string; ok: boolean } | null>(null);
  const [pausing, setPausing]       = useState(false);
  const [adminToken, setAdminToken] = useState<string>("");

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 6000);
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: { user, session } } = await sb.auth.getUser().then(async (r) => {
      const sess = await sb.auth.getSession();
      return { data: { user: r.data.user, session: sess.data.session } };
    });

    if (!user) { router.push("/auth/signin"); return; }
    if (session?.access_token) setAdminToken(session.access_token);

    const { data: profile } = await sb.from("users").select("role, is_admin").eq("id", user.id).single();
    if (!(profile as any)?.is_admin && (profile as any)?.role !== "admin") {
      router.push("/dashboard");
      return;
    }

    const [
      { data: settingsData },
      { data: wdData },
      { data: auditData },
      { data: treasuryData },
    ] = await Promise.all([
      sb.from("withdrawal_settings").select("*").single(),
      // Try withdrawal_summary view first, fall back to raw withdrawals join
      sb.from("withdrawals")
        .select(`
          id, user_id, amount, amount_gross, amount_fee, amount_net, fee_pct,
          status, tracking_status, flagged, risk_score, payout_method,
          payout_account_name, payout_bank_name, created_at, expected_date, admin_note,
          wallet_address
        `)
        .in("status", ["queued", "processing", "flagged", "under_review"])
        .order("created_at", { ascending: false })
        .limit(100),
      sb.from("withdrawal_audit_log").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("treasury_analytics").select("*").limit(12),
    ]);

    if (settingsData) setSettings(settingsData as WithdrawalSettings);

    // Enrich withdrawal rows with user info
    if (wdData && wdData.length > 0) {
      const userIds = [...new Set(wdData.map((w: any) => w.user_id))];
      const { data: usersData } = await sb
        .from("users")
        .select("id, full_name, email, payout_account_number, payout_bank_code, payout_bank_name, payout_account_name, payout_gateway")
        .in("id", userIds);

      const userMap: Record<string, any> = {};
      (usersData ?? []).forEach((u: any) => { userMap[u.id] = u; });

      const enriched = wdData.map((w: any) => {
        const u = userMap[w.user_id] ?? {};
        return {
          ...w,
          full_name: u.full_name ?? null,
          email: u.email ?? null,
          payout_account_number: u.payout_account_number ?? w.wallet_address,
          payout_bank_code: u.payout_bank_code ?? null,
          payout_bank_name: u.payout_bank_name ?? w.payout_bank_name,
          payout_account_name: u.payout_account_name ?? w.payout_account_name,
          payout_method: u.payout_gateway ?? w.payout_method,
        };
      });
      setPendingWDs(enriched as PendingWithdrawal[]);
    } else {
      setPendingWDs([]);
    }

    if (auditData) setAuditLog(auditData as AuditEntry[]);
    if (treasuryData) setTreasuryWeeks(treasuryData as TreasuryWeek[]);

    // Summary stats — treasury_reserve table may not exist in all setups
    const { data: allWds } = await sb
      .from("withdrawals")
      .select("amount, status, flagged");

    let treasuryTotal: { amount: number }[] = [];
    let treasury30d: { amount: number }[] = [];
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: tt } = await sb
        .from("treasury_reserve")
        .select("amount")
        .eq("source_type", "withdrawal_fee");
      const { data: t30 } = await sb
        .from("treasury_reserve")
        .select("amount")
        .eq("source_type", "withdrawal_fee")
        .gte("created_at", thirtyDaysAgo);
      treasuryTotal = tt ?? [];
      treasury30d   = t30 ?? [];
    } catch {
      // treasury_reserve table may not exist — totals default to 0
    }

    setSummary({
      total_fees: treasuryTotal.reduce((s, r) => s + (r.amount ?? 0), 0),
      total_fees_30d: treasury30d.reduce((s, r) => s + (r.amount ?? 0), 0),
      total_withdrawn_all_time: (allWds ?? []).filter((w: any) => w.status === "paid").reduce((s: number, r: any) => s + (r.amount ?? 0), 0),
      pending_count: (allWds ?? []).filter((w: any) => ["queued", "processing"].includes(w.status)).length,
      flagged_count: (allWds ?? []).filter((w: any) => w.flagged).length,
    });

    setLoading(false);
  }, [router, sb]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Real-time updates
  useEffect(() => {
    const ch = sb.channel("admin_wd_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_settings" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals" }, loadAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [loadAll, sb]);

  async function toggleGlobalPause() {
    if (!settings) return;
    setPausing(true);
    const newVal = !settings.global_paused;
    const { error } = await sb
      .from("withdrawal_settings")
      .update({ global_paused: newVal, updated_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (!error) {
      setSettings((prev) => (prev ? { ...prev, global_paused: newVal } : prev));
      showToast(newVal ? "⏸ Withdrawals paused globally." : "▶ Withdrawals resumed.", !newVal);
    } else {
      showToast("Failed to toggle pause: " + error.message, false);
    }
    setPausing(false);
  }

  async function saveSettings(patch: Partial<WithdrawalSettings>) {
    if (!settings) return;
    const { error } = await sb
      .from("withdrawal_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (!error) {
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      showToast("✅ Settings saved.");
    } else {
      showToast("Save failed: " + error.message, false);
    }
  }

  // ── APPROVE: call the dedicated API route which handles KoraPay disbursal ──
  async function approveWithdrawal(id: string, note: string) {
    try {
      const res = await fetch("/api/admin/approve-withdrawal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ withdrawal_id: id, note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(`Approval failed: ${data.error ?? "Unknown error"}`, false);
        return;
      }
      showToast(`✅ ${data.message}`);
      await loadAll();
    } catch (err: any) {
      showToast(`Network error during approval: ${err?.message ?? "Please check your connection."}`, false);
    }
  }

  // ── REJECT: refund balance directly, no external API needed ──────────────
  async function rejectWithdrawal(id: string, note: string) {
    const wd = pendingWDs.find((w) => w.id === id);
    if (!wd) {
      showToast("Withdrawal not found.", false);
      return;
    }

    const grossAmount = wd.amount_gross ?? wd.amount ?? 0;
    const now = new Date().toISOString();

    try {
      // Step 1: Mark withdrawal as rejected
      const { error: rejectErr } = await sb
        .from("withdrawals")
        .update({
          status: "rejected",
          tracking_status: "rejected",
          failure_reason: note || "Rejected by admin",
          admin_note: note || null,
          updated_at: now,
        })
        .eq("id", id);

      if (rejectErr) {
        showToast(`Failed to reject: ${rejectErr.message}`, false);
        return;
      }

      // Step 2: Refund balance — fetch current balance then increment
      const { data: userRow, error: fetchErr } = await sb
        .from("users")
        .select("balance_available")
        .eq("id", wd.user_id)
        .single();

      if (fetchErr || !userRow) {
        showToast("Withdrawal rejected but balance refund failed — check manually.", false);
        await loadAll();
        return;
      }

      const currentBalance = (userRow as any).balance_available ?? 0;
      const { error: refundErr } = await sb
        .from("users")
        .update({
          balance_available: currentBalance + grossAmount,
        })
        .eq("id", wd.user_id);

      if (refundErr) {
        showToast(`Withdrawal rejected but refund failed: ${refundErr.message}`, false);
      } else {
        showToast(`❌ Withdrawal rejected. $${grossAmount.toFixed(2)} refunded to user.`);
      }

      // Step 3: Ledger entry (non-blocking)
      try {
        await sb.from("transaction_ledger").insert({
          user_id: wd.user_id,
          type: "withdrawal_refund",
          amount: grossAmount,
          description: `Withdrawal rejected by admin — $${grossAmount.toFixed(2)} refunded${note ? `: ${note}` : ""}`,
          reference_id: id,
          created_at: now,
        });
      } catch { /* non-blocking */ }

      // Step 4: Notify user (non-blocking)
      try {
        await sb.from("user_notifications").insert({
          user_id: wd.user_id,
          type: "withdrawal_rejected",
          title: "❌ Withdrawal Rejected",
          body: note
            ? `Your withdrawal of $${grossAmount.toFixed(2)} was rejected. Reason: ${note}. Your balance has been refunded.`
            : `Your withdrawal of $${grossAmount.toFixed(2)} was rejected by our team. Your balance has been refunded. Contact support if you have questions.`,
          created_at: now,
        });
      } catch { /* non-blocking */ }

      await loadAll();
    } catch (err: any) {
      showToast(`Unexpected error during rejection: ${err?.message ?? "Please try again."}`, false);
    }
  }

  // ── FLAG ──────────────────────────────────────────────────────────────────
  async function flagWithdrawal(id: string) {
    const { error } = await sb
      .from("withdrawals")
      .update({ flagged: true, tracking_status: "under_review" })
      .eq("id", id);
    if (!error) {
      showToast("⚠ Withdrawal flagged for manual review.");
      await loadAll();
    } else {
      showToast("Flag failed: " + error.message, false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06080f" }}>
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const isPaused = settings?.global_paused ?? false;
  const flaggedCount = pendingWDs.filter((w) => w.flagged).length;
  const queuedCount  = pendingWDs.filter((w) => !w.flagged && w.status === "queued").length;

  const TABS = [
    { id: "queue"    as const, label: "Withdrawal Queue", icon: Clock,     badge: queuedCount + flaggedCount },
    { id: "audit"    as const, label: "Audit Log",        icon: Eye,       badge: 0 },
    { id: "treasury" as const, label: "Treasury",         icon: BarChart3, badge: 0 },
    { id: "settings" as const, label: "Settings",         icon: Settings,  badge: 0 },
  ];

  return (
    <div className="min-h-screen text-slate-200" style={{ background: "#06080f" }}>
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl max-w-sm flex items-start gap-2 ${
            toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"
          }`}
        >
          {toast.ok ? (
            <CheckCircle size={14} className="shrink-0 mt-0.5" />
          ) : (
            <XCircle size={14} className="shrink-0 mt-0.5" />
          )}
          {toast.text}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
              <Shield size={22} className="text-emerald-400" /> Withdrawal Admin
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Approve to disburse via KoraPay · Reject to refund
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadAll}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-3 py-1.5 border border-slate-800 rounded-lg transition-all"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              onClick={toggleGlobalPause}
              disabled={pausing}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60 ${
                isPaused ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-700 hover:bg-red-600"
              }`}
            >
              {pausing ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : isPaused ? (
                <Play size={14} />
              ) : (
                <Pause size={14} />
              )}
              {isPaused ? "Resume Withdrawals" : "Pause All Withdrawals"}
            </button>
          </div>
        </div>

        {/* Pause banner */}
        {isPaused && (
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <AlertOctagon size={16} className="text-red-400 shrink-0" />
            <div>
              <p className="text-red-300 font-black text-sm">⏸ Withdrawals Globally Paused</p>
              {settings?.pause_reason && (
                <p className="text-red-400/70 text-xs mt-0.5">{settings.pause_reason}</p>
              )}
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Queue",         value: queuedCount,                                              color: "text-blue-400",    icon: Clock },
            { label: "Flagged",       value: flaggedCount,                                             color: "text-orange-400",  icon: AlertOctagon },
            { label: "Fees (all)",    value: `$${(summary?.total_fees ?? 0).toFixed(2)}`,              color: "text-emerald-400", icon: DollarSign },
            { label: "Fees (30d)",    value: `$${(summary?.total_fees_30d ?? 0).toFixed(2)}`,          color: "text-cyan-400",    icon: TrendingUp },
            { label: "Total Paid",    value: `$${(summary?.total_withdrawn_all_time ?? 0).toFixed(0)}`, color: "text-violet-400", icon: Wallet },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className={`w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center mb-2 ${color}`}>
                <Icon size={13} />
              </div>
              <p className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</p>
              <p className={`font-black text-lg ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                tab === id ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={11} /> {label}
              {badge > 0 && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── QUEUE TAB ── */}
        {tab === "queue" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-white font-bold">{pendingWDs.length} pending withdrawals</p>
              <div className="flex gap-3 text-xs">
                <span className="text-blue-400 font-bold">{queuedCount} queued</span>
                {flaggedCount > 0 && (
                  <span className="text-orange-400 font-bold">{flaggedCount} flagged</span>
                )}
              </div>
            </div>

            {/* Flagged first */}
            {flaggedCount > 0 && (
              <div className="space-y-2">
                <p className="text-orange-400 text-[10px] uppercase tracking-wide font-black flex items-center gap-1.5">
                  <AlertOctagon size={10} /> Flagged — requires manual review
                </p>
                {pendingWDs
                  .filter((w) => w.flagged)
                  .map((w) => (
                    <WithdrawalRow
                      key={w.id}
                      w={w}
                      onApprove={approveWithdrawal}
                      onReject={rejectWithdrawal}
                      onFlag={flagWithdrawal}
                    />
                  ))}
              </div>
            )}

            {/* Normal queue */}
            {queuedCount > 0 && (
              <div className="space-y-2">
                <p className="text-blue-400 text-[10px] uppercase tracking-wide font-black flex items-center gap-1.5">
                  <Clock size={10} /> Queued — waiting for approval
                </p>
                {pendingWDs
                  .filter((w) => !w.flagged)
                  .map((w) => (
                    <WithdrawalRow
                      key={w.id}
                      w={w}
                      onApprove={approveWithdrawal}
                      onReject={rejectWithdrawal}
                      onFlag={flagWithdrawal}
                    />
                  ))}
              </div>
            )}

            {pendingWDs.length === 0 && (
              <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl text-slate-600">
                <CheckCircle size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-bold">Queue is clear</p>
                <p className="text-xs mt-1">All withdrawals have been processed.</p>
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT LOG TAB ── */}
        {tab === "audit" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-bold">{auditLog.length} audit entries</p>
              <p className="text-slate-500 text-xs">Last 200 events</p>
            </div>
            {auditLog.length === 0 ? (
              <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-slate-600">
                <Receipt size={28} className="mx-auto mb-2 opacity-30" />
                <p>No audit entries yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{
                      background: "rgba(10,16,28,0.8)",
                      border: `1px solid ${entry.flagged ? "rgba(251,146,60,0.25)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        entry.action === "approved" || entry.action === "approved_and_paid"
                          ? "bg-emerald-900/30 text-emerald-400"
                          : entry.action === "rejected"
                            ? "bg-red-900/30 text-red-400"
                            : entry.flagged
                              ? "bg-orange-900/30 text-orange-400"
                              : "bg-blue-900/30 text-blue-400"
                      }`}
                    >
                      {entry.action === "approved" || entry.action === "approved_and_paid" ? (
                        <CheckCircle size={12} />
                      ) : entry.action === "rejected" ? (
                        <XCircle size={12} />
                      ) : entry.flagged ? (
                        <AlertOctagon size={12} />
                      ) : (
                        <Clock size={12} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white text-xs font-bold capitalize">
                          {entry.action.replace(/_/g, " ")}
                        </p>
                        {entry.flagged && (
                          <span className="text-[10px] text-orange-400 font-bold">⚠ Flagged</span>
                        )}
                        {entry.flags?.length > 0 && (
                          <span className="text-[10px] text-orange-400/70">{entry.flags.join(", ")}</span>
                        )}
                      </div>
                      <p className="text-slate-500 text-[10px] mt-0.5">
                        ${entry.amount_gross.toFixed(2)} gross · ${entry.amount_fee.toFixed(2)} fee ·{" "}
                        ${entry.amount_net.toFixed(2)} net · Risk {entry.risk_score}/100 ·{" "}
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                      {entry.note && (
                        <p className="text-slate-400 text-[10px] mt-0.5 italic">"{entry.note}"</p>
                      )}
                    </div>
                    <RiskBadge score={entry.risk_score} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TREASURY TAB ── */}
        {tab === "treasury" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Total Fees Collected",   value: `$${(summary?.total_fees ?? 0).toFixed(2)}`,             color: "text-emerald-400" },
                { label: "Fees Last 30 Days",      value: `$${(summary?.total_fees_30d ?? 0).toFixed(2)}`,         color: "text-cyan-400" },
                { label: "Total Withdrawn (paid)", value: `$${(summary?.total_withdrawn_all_time ?? 0).toFixed(2)}`, color: "text-violet-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</p>
                  <p className={`font-black text-xl mt-1 ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <p className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                <BarChart3 size={14} className="text-emerald-400" /> Weekly Fee Collection
              </p>
              {treasuryWeeks.length === 0 ? (
                <p className="text-slate-600 text-sm text-center py-6">No treasury data yet.</p>
              ) : (
                <div className="space-y-2">
                  {treasuryWeeks.map((tw, i) => {
                    const maxFee = Math.max(...treasuryWeeks.map((t) => t.fees_collected), 1);
                    const pct = (tw.fees_collected / maxFee) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-slate-500 text-[10px] w-24 shrink-0">
                          {new Date(tw.week).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                        </span>
                        <div className="flex-1 h-5 rounded-lg bg-slate-800 overflow-hidden">
                          <div
                            className="h-5 rounded-lg bg-emerald-500/40 flex items-center px-2"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          >
                            <span className="text-[10px] text-emerald-300 font-bold whitespace-nowrap">
                              ${tw.fees_collected.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <span className="text-slate-600 text-[10px] w-12 text-right">{tw.tx_count} txs</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && settings && (
          <div className="space-y-4">
            <SettingsPanel settings={settings} onSave={saveSettings} />
            <div
              className="rounded-xl p-4 space-y-2"
              style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="text-slate-400 text-[10px] uppercase tracking-wide font-bold">Last Updated</p>
              <p className="text-white text-sm font-bold">
                {new Date(settings.updated_at).toLocaleString()}
              </p>
              {settings.updated_by && (
                <p className="text-slate-600 text-xs">by {settings.updated_by}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}