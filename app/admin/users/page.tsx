"use client";
// app/admin/users/page.tsx — calls /api/admin/users server route, no client-side RLS

import { useEffect, useState, useCallback, useRef } from "react";
import AdminLayout from "@/components/AdminLayout";
import {
  Search,
  RefreshCw,
  X,
  CheckCircle,
  Shield,
  Lock,
  Unlock,
  Eye,
  DollarSign,
  Users,
  Star,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Save,
  Hash,
  AlertTriangle,
} from "lucide-react";

type DBUser = {
  id: string;
  email: string;
  full_name: string | null;
  tier: string | null;
  role: string | null;
  country: string | null;
  phone: string | null;
  phone_verified: boolean;
  kyc_verified: boolean;
  kyc_status: string;
  kyc_full_name: string | null;
  cla_signed: boolean;
  terms_signed: boolean;
  balance_available: number;
  wallet_balance: number;
  pending_balance: number;
  earnings: number;
  earnings_withdrawn: number;
  referral_earnings: number;
  weekly_withdrawn: number;
  total_task_completed: number;
  total_submissions: number;
  approved_count: number;
  rejected_count: number;
  cheat_flags_count: number;
  quality_score: number;
  fraud_score: number;
  streak_count: number;
  weekly_tasks_count: number;
  consecutive_inactive_days: number;
  total_teraflops: number;
  has_operator_license: boolean;
  license_expires_at: string | null;
  node_expiry_date: string | null;
  node_activated_at: string | null;
  pin_locked: boolean;
  pin_attempts: number;
  withdrawals_frozen: boolean;
  payout_registered: boolean;
  payout_gateway: string | null;
  payout_currency: string | null;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_bank_name: string | null;
  payout_account_type: string | null;
  payout_kyc_match: boolean;
  payout_locked: boolean;
  payout_change_requested: boolean;
  device_verification: boolean;
  wallet_address: string | null;
  ip_address: string | null;
  referral_code: string | null;
  last_active_at: string | null;
  last_withdrawal_at: string | null;
  earnings_locked_until: string | null;
  withdrawal_freeze_exempt: boolean;
  freeze_exemption_reason: string | null;
  tax_form_submitted: boolean;
  withdrawal_compliance_status: string | null;
  created_at: string;
  updated_at: string;
};

const PAGE_SIZE = 20;
const BG = "#ffffff";
const SURFACE = "#f8f9fa";
const BORDER = "#e0e0e0";
const BORDER_HI = "#d0d0d0";
const C = "#10b981";
const TEXT_PRIMARY = "#1a1a1a";
const TEXT_SECONDARY = "#666666";

async function apiGet(params: Record<string, string>) {
  const r = await fetch(`/api/admin/users?${new URLSearchParams(params)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function apiPatch(id: string, updates: Record<string, any>) {
  const r = await fetch("/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: any;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[9px] font-mono uppercase tracking-widest"
          style={{ color: TEXT_SECONDARY }}
        >
          {label}
        </p>
        <Icon size={11} style={{ color }} />
      </div>
      <p
        className="font-black text-2xl tabular-nums leading-none"
        style={{ color }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[9px] font-mono" style={{ color: TEXT_SECONDARY }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function KycBadge({ status }: { status: string }) {
  const m: Record<string, [string, string]> = {
    verified: [C, "Verified"],
    pending: ["#f59e0b", "Pending"],
    not_started: ["#999999", "Not Started"],
    rejected: ["#ef4444", "Rejected"],
  };
  const [color, label] = m[status] || m.not_started;
  return (
    <span
      className="text-[9px] font-bold px-2 py-0.5 rounded-full"
      style={{
        color,
        background: `${color}15`,
        border: `1px solid ${color}30`,
      }}
    >
      {label}
    </span>
  );
}

function Pill({
  label,
  ok,
  warn,
}: {
  label: string;
  ok?: boolean;
  warn?: boolean;
}) {
  const color = ok ? C : warn ? "#f59e0b" : "#ef4444";
  return (
    <span
      className="text-[9px] font-black px-2 py-0.5 rounded-full"
      style={{
        color,
        background: `${color}12`,
        border: `1px solid ${color}25`,
      }}
    >
      {label}
    </span>
  );
}

function UserDrawer({
  user,
  onClose,
  onUpdate,
}: {
  user: DBUser;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [tab, setTab] = useState<
    "profile" | "finance" | "kyc" | "payout" | "security" | "edit"
  >("profile");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [ev, setEv] = useState({
    tier: user.tier || "free",
    role: user.role || "worker",
    balance_available: user.balance_available ?? 0,
    earnings: user.earnings ?? 0,
    earnings_withdrawn: user.earnings_withdrawn ?? 0,
    kyc_verified: user.kyc_verified ?? false,
    kyc_status: user.kyc_status || "not_started",
    has_operator_license: user.has_operator_license ?? false,
    withdrawals_frozen: user.withdrawals_frozen ?? false,
    pin_locked: user.pin_locked ?? false,
    payout_locked: user.payout_locked ?? false,
    fraud_score: user.fraud_score ?? 0,
    consecutive_inactive_days: user.consecutive_inactive_days ?? 0,
  });

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  }

  async function patch(data: Record<string, any>) {
    try {
      await apiPatch(user.id, data);
      flash("Saved ✓");
      onUpdate();
    } catch (e: any) {
      flash(e.message, false);
    }
  }

  function R({
    l,
    v,
    mono,
  }: {
    l: string;
    v: React.ReactNode;
    mono?: boolean;
  }) {
    return (
      <div
        className="flex items-start justify-between gap-4 py-2 border-b"
        style={{ borderColor: BORDER }}
      >
        <span
          className="text-[10px] uppercase tracking-wide shrink-0"
          style={{ color: TEXT_SECONDARY }}
        >
          {l}
        </span>
        <span
          className={`text-xs text-right break-all ${mono ? "font-mono" : "font-medium"}`}
          style={{ color: mono ? TEXT_SECONDARY : TEXT_PRIMARY }}
        >
          {v ?? <span style={{ color: BORDER }}>—</span>}
        </span>
      </div>
    );
  }

  function Toggle({ label, field }: { label: string; field: keyof typeof ev }) {
    const val = ev[field] as boolean;
    return (
      <div
        className="flex items-center justify-between py-2.5 border-b"
        style={{ borderColor: BORDER }}
      >
        <span className="text-xs" style={{ color: TEXT_SECONDARY }}>
          {label}
        </span>
        <button
          onClick={() => setEv((e) => ({ ...e, [field]: !val }))}
          className="w-11 h-6 rounded-full relative transition-all"
          style={{ background: val ? C : "#d0d0d0" }}
        >
          <div
            className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${val ? "left-6" : "left-1"}`}
          />
        </button>
      </div>
    );
  }

  const licenseActive = user.license_expires_at
    ? new Date(user.license_expires_at) > new Date()
    : false;
  const daysLeft = user.license_expires_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(user.license_expires_at).getTime() - Date.now()) / 86400000,
        ),
      )
    : 0;

  const TABS = [
    { id: "profile", label: "Profile" },
    { id: "finance", label: "Finance" },
    { id: "kyc", label: "KYC" },
    { id: "payout", label: "Payout" },
    { id: "security", label: "Security" },
    { id: "edit", label: "✏ Edit" },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl flex flex-col"
        style={{ background: BG, borderLeft: `1px solid ${BORDER_HI}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-5 flex items-start justify-between gap-3 shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2
                className="font-black text-base truncate"
                style={{ color: TEXT_PRIMARY }}
              >
                {user.full_name ||
                  user.kyc_full_name ||
                  user.email.split("@")[0]}
              </h2>
              <KycBadge status={user.kyc_status || "not_started"} />
              {user.withdrawals_frozen && <Pill label="Frozen" />}
              {user.pin_locked && <Pill label="PIN Locked" warn />}
            </div>
            <p className="text-xs truncate" style={{ color: TEXT_SECONDARY }}>
              {user.email}
            </p>
            <p
              className="text-[9px] font-mono mt-0.5 truncate"
              style={{ color: TEXT_SECONDARY }}
            >
              {user.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: BORDER, color: TEXT_SECONDARY }}
          >
            <X size={14} />
          </button>
        </div>

        {msg && (
          <div
            className={`mx-6 mt-3 shrink-0 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${msg.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
          >
            {msg.ok ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {msg.text}
          </div>
        )}

        <div
          className="px-6 py-3 flex gap-2 flex-wrap shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <button
            onClick={() =>
              patch({ withdrawals_frozen: !user.withdrawals_frozen })
            }
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border"
            style={
              user.withdrawals_frozen
                ? { borderColor: `${C}40`, color: C, background: `${C}08` }
                : {
                    borderColor: "#ef444440",
                    color: "#ef4444",
                    background: "rgba(239,68,68,0.08)",
                  }
            }
          >
            {user.withdrawals_frozen ? (
              <>
                <Unlock size={10} />
                Unfreeze
              </>
            ) : (
              <>
                <Lock size={10} />
                Freeze
              </>
            )}
          </button>
          <button
            onClick={() =>
              patch({
                pin_locked: !user.pin_locked,
                pin_attempts: user.pin_locked ? 0 : 5,
              })
            }
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border"
            style={{
              borderColor: "#f59e0b40",
              color: "#f59e0b",
              background: "rgba(245,158,11,0.08)",
            }}
          >
            <Hash size={10} />
            {user.pin_locked ? "Unlock PIN" : "Lock PIN"}
          </button>
          {!user.kyc_verified ? (
            <button
              onClick={() =>
                patch({ kyc_verified: true, kyc_status: "verified" })
              }
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border"
              style={{ borderColor: `${C}40`, color: C, background: `${C}08` }}
            >
              <Shield size={10} />
              Approve KYC
            </button>
          ) : (
            <button
              onClick={() =>
                patch({ kyc_verified: false, kyc_status: "rejected" })
              }
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border"
              style={{
                borderColor: "#ef444440",
                color: "#ef4444",
                background: "rgba(239,68,68,0.08)",
              }}
            >
              <X size={10} />
              Revoke KYC
            </button>
          )}
          <button
            onClick={() => patch({ fraud_score: 0, cheat_flags_count: 0 })}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border"
            style={{
              borderColor: BORDER_HI,
              color: "#64748b",
              background: SURFACE,
            }}
          >
            <AlertTriangle size={10} />
            Reset Fraud
          </button>
        </div>

        <div
          className="flex px-6 pt-3 gap-0 shrink-0 overflow-x-auto"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 pb-3 text-[11px] font-bold whitespace-nowrap border-b-2 transition-all ${tab === t.id ? "border-emerald-400 text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-0.5">
          {tab === "profile" && (
            <>
              <R l="ID" v={user.id} mono />
              <R l="Email" v={user.email} />
              <R l="Full Name" v={user.full_name} />
              <R l="KYC Full Name" v={user.kyc_full_name} />
              <R
                l="Tier"
                v={
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-900/30 border border-blue-800/40 text-blue-300">
                    {user.tier}
                  </span>
                }
              />
              <R l="Role" v={user.role} />
              <R l="Country" v={user.country} />
              <R l="Phone" v={user.phone} />
              <R
                l="Phone Verified"
                v={
                  <Pill
                    label={user.phone_verified ? "Yes" : "No"}
                    ok={user.phone_verified}
                  />
                }
              />
              <R l="Referral Code" v={user.referral_code} mono />
              <R
                l="Referral Earnings"
                v={`$${(user.referral_earnings || 0).toFixed(2)}`}
              />
              <R l="Streak" v={`${user.streak_count || 0}d`} />
              <R l="Total Tasks" v={user.total_task_completed || 0} />
              <R l="Quality Score" v={(user.quality_score || 0).toFixed(2)} />
              <R l="IP Address" v={user.ip_address} mono />
              <R
                l="Device Verified"
                v={
                  <Pill
                    label={user.device_verification ? "Yes" : "No"}
                    ok={user.device_verification}
                  />
                }
              />
              <R
                l="Last Active"
                v={
                  user.last_active_at
                    ? new Date(user.last_active_at).toLocaleString()
                    : null
                }
              />
              <R l="Created" v={new Date(user.created_at).toLocaleString()} />
            </>
          )}
          {tab === "finance" && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {(
                  [
                    [
                      "Available",
                      `$${(user.balance_available || 0).toFixed(4)}`,
                      C,
                    ],
                    [
                      "Wallet Balance",
                      `$${(user.wallet_balance || 0).toFixed(4)}`,
                      "#3b82f6",
                    ],
                    [
                      "Pending",
                      `$${(user.pending_balance || 0).toFixed(4)}`,
                      "#f59e0b",
                    ],
                    ["Total Earned", `$${(user.earnings || 0).toFixed(4)}`, C],
                    [
                      "Withdrawn",
                      `$${(user.earnings_withdrawn || 0).toFixed(4)}`,
                      "#a78bfa",
                    ],
                    [
                      "Weekly Withdrawn",
                      `$${(user.weekly_withdrawn || 0).toFixed(2)}`,
                      "#64748b",
                    ],
                  ] as [string, string, string][]
                ).map(([l, v, c]) => (
                  <div
                    key={l}
                    className="rounded-xl p-3"
                    style={{
                      background: SURFACE,
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    <p className="text-[9px] text-slate-600 uppercase tracking-wide">
                      {l}
                    </p>
                    <p className="font-black text-sm mt-1" style={{ color: c }}>
                      {v}
                    </p>
                  </div>
                ))}
              </div>
              <R
                l="Withdrawals Frozen"
                v={
                  <Pill
                    label={user.withdrawals_frozen ? "Frozen" : "Open"}
                    ok={!user.withdrawals_frozen}
                  />
                }
              />
              <R
                l="Earnings Locked Until"
                v={
                  user.earnings_locked_until
                    ? new Date(user.earnings_locked_until).toLocaleString()
                    : null
                }
              />
              <R
                l="Last Withdrawal"
                v={
                  user.last_withdrawal_at
                    ? new Date(user.last_withdrawal_at).toLocaleString()
                    : null
                }
              />
              <R l="Wallet Address" v={user.wallet_address} mono />
              <R
                l="Freeze Exempt"
                v={
                  <Pill
                    label={user.withdrawal_freeze_exempt ? "Exempt" : "No"}
                    ok={user.withdrawal_freeze_exempt}
                  />
                }
              />
              <R
                l="Tax Form"
                v={
                  <Pill
                    label={user.tax_form_submitted ? "Submitted" : "No"}
                    ok={user.tax_form_submitted}
                  />
                }
              />
              <R
                l="Withdrawal Compliance"
                v={user.withdrawal_compliance_status}
              />
            </>
          )}
          {tab === "kyc" && (
            <>
              <R
                l="KYC Status"
                v={<KycBadge status={user.kyc_status || "not_started"} />}
              />
              <R
                l="KYC Verified"
                v={
                  <Pill
                    label={user.kyc_verified ? "Verified" : "No"}
                    ok={user.kyc_verified}
                  />
                }
              />
              <R l="KYC Full Name" v={user.kyc_full_name} />
              <R
                l="CLA Signed"
                v={
                  <Pill
                    label={user.cla_signed ? "Yes" : "No"}
                    ok={user.cla_signed}
                  />
                }
              />
              <R
                l="Terms Signed"
                v={
                  <Pill
                    label={user.terms_signed ? "Yes" : "No"}
                    ok={user.terms_signed}
                  />
                }
              />
              <R
                l="Has License"
                v={
                  <Pill
                    label={user.has_operator_license ? "Licensed" : "None"}
                    ok={user.has_operator_license}
                  />
                }
              />
              <R
                l="License Expires"
                v={
                  user.license_expires_at
                    ? new Date(user.license_expires_at).toLocaleString()
                    : null
                }
              />
              {licenseActive && <R l="Days Left" v={`${daysLeft}d`} />}
              <R
                l="Node Expiry"
                v={
                  user.node_expiry_date
                    ? new Date(user.node_expiry_date).toLocaleString()
                    : null
                }
              />
              <R
                l="PIN Locked"
                v={
                  <Pill
                    label={user.pin_locked ? "Locked" : "Open"}
                    ok={!user.pin_locked}
                  />
                }
              />
              <R l="PIN Attempts" v={user.pin_attempts || 0} />
            </>
          )}
          {tab === "payout" && (
            <>
              <R
                l="Registered"
                v={
                  <Pill
                    label={user.payout_registered ? "Yes" : "No"}
                    ok={user.payout_registered}
                  />
                }
              />
              <R l="Gateway" v={user.payout_gateway} />
              <R l="Currency" v={user.payout_currency} />
              <R l="Account Name" v={user.payout_account_name} />
              <R l="Account Number" v={user.payout_account_number} mono />
              <R l="Bank Name" v={user.payout_bank_name} />
              <R l="Account Type" v={user.payout_account_type} />
              <R
                l="KYC Match"
                v={
                  <Pill
                    label={user.payout_kyc_match ? "Match" : "Mismatch"}
                    ok={user.payout_kyc_match}
                  />
                }
              />
              <R
                l="Payout Locked"
                v={
                  <Pill
                    label={user.payout_locked ? "Locked" : "Open"}
                    ok={!user.payout_locked}
                  />
                }
              />
              <R
                l="Change Requested"
                v={
                  <Pill
                    label={user.payout_change_requested ? "Pending" : "No"}
                    warn={user.payout_change_requested}
                  />
                }
              />
            </>
          )}
          {tab === "security" && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(
                  [
                    [
                      "Fraud Score",
                      user.fraud_score || 0,
                      (user.fraud_score || 0) >= 3 ? "#ef4444" : C,
                    ],
                    [
                      "Cheat Flags",
                      user.cheat_flags_count || 0,
                      (user.cheat_flags_count || 0) > 0 ? "#f59e0b" : C,
                    ],
                    ["Approved", user.approved_count || 0, C],
                    ["Rejected", user.rejected_count || 0, "#ef4444"],
                    ["Submissions", user.total_submissions || 0, "#3b82f6"],
                    [
                      "Inactive Days",
                      user.consecutive_inactive_days || 0,
                      (user.consecutive_inactive_days || 0) > 2 ? "#f59e0b" : C,
                    ],
                  ] as [string, number, string][]
                ).map(([l, v, c]) => (
                  <div
                    key={l}
                    className="rounded-xl p-3 text-center"
                    style={{
                      background: SURFACE,
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    <p className="font-black text-xl" style={{ color: c }}>
                      {v}
                    </p>
                    <p className="text-[9px] text-slate-600 mt-1">{l}</p>
                  </div>
                ))}
              </div>
              <R l="IP Address" v={user.ip_address} mono />
              <R
                l="Freeze Exempt"
                v={
                  <Pill
                    label={user.withdrawal_freeze_exempt ? "Exempt" : "No"}
                    ok={user.withdrawal_freeze_exempt}
                  />
                }
              />
              <R l="Freeze Reason" v={user.freeze_exemption_reason} />
            </>
          )}
          {tab === "edit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest block">
                    Tier
                  </label>
                  <select
                    value={ev.tier}
                    onChange={(e) =>
                      setEv((v) => ({ ...v, tier: e.target.value }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    {[
                      "free",
                      "rtx3060",
                      "foundation",
                      "intelligence",
                      "compute",
                      "a100",
                      "h100",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest block">
                    Role
                  </label>
                  <select
                    value={ev.role}
                    onChange={(e) =>
                      setEv((v) => ({ ...v, role: e.target.value }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    {["worker", "admin", "moderator"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              {(
                [
                  ["balance_available", "Available Balance ($)", "$"],
                  ["earnings", "Total Earnings ($)", "$"],
                  ["earnings_withdrawn", "Earnings Withdrawn ($)", "$"],
                  ["fraud_score", "Fraud Score", ""],
                  [
                    "consecutive_inactive_days",
                    "Consecutive Inactive Days",
                    "",
                  ],
                ] as [keyof typeof ev, string, string][]
              ).map(([field, label, prefix]) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest block">
                    {label}
                  </label>
                  <div className="relative">
                    {prefix && (
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        {prefix}
                      </span>
                    )}
                    <input
                      type="number"
                      value={String(ev[field])}
                      onChange={(e) =>
                        setEv((v) => ({ ...v, [field]: e.target.value }))
                      }
                      className={`w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 ${prefix ? "pl-8 pr-4" : "px-4"}`}
                    />
                  </div>
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest block">
                  KYC Status
                </label>
                <select
                  value={ev.kyc_status}
                  onChange={(e) =>
                    setEv((v) => ({ ...v, kyc_status: e.target.value }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {["not_started", "pending", "verified", "rejected"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </div>
              <div
                className="rounded-xl p-4"
                style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
              >
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">
                  Toggle Flags
                </p>
                <Toggle label="KYC Verified" field="kyc_verified" />
                <Toggle
                  label="Has Operator License"
                  field="has_operator_license"
                />
                <Toggle label="Withdrawals Frozen" field="withdrawals_frozen" />
                <Toggle label="PIN Locked" field="pin_locked" />
                <Toggle label="Payout Locked" field="payout_locked" />
              </div>
              <button
                onClick={async () => {
                  setSaving(true);
                  await patch({
                    tier: ev.tier,
                    role: ev.role,
                    balance_available: Number(ev.balance_available),
                    earnings: Number(ev.earnings),
                    earnings_withdrawn: Number(ev.earnings_withdrawn),
                    fraud_score: Number(ev.fraud_score),
                    consecutive_inactive_days: Number(
                      ev.consecutive_inactive_days,
                    ),
                    kyc_verified: ev.kyc_verified,
                    kyc_status: ev.kyc_status,
                    has_operator_license: ev.has_operator_license,
                    withdrawals_frozen: ev.withdrawals_frozen,
                    pin_locked: ev.pin_locked,
                    payout_locked: ev.payout_locked,
                  });
                  setSaving(false);
                }}
                disabled={saving}
                className="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: C, color: "#020b04" }}
              >
                {saving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {saving ? "Saving…" : "Save All Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<DBUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DBUser | null>(null);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [fKyc, setFKyc] = useState("all");
  const [fFrozen, setFFrozen] = useState("all");
  const [fLicense, setFLicense] = useState("all");
  const [fTier, setFTier] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    kyc: 0,
    frozen: 0,
    licensed: 0,
    balance: 0,
  });
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await apiGet({ statsOnly: "true" });
      if (data)
        setStats({
          total: data.length,
          kyc: data.filter((u: any) => u.kyc_verified).length,
          frozen: data.filter((u: any) => u.withdrawals_frozen).length,
          licensed: data.filter((u: any) => u.has_operator_license).length,
          balance: data.reduce(
            (s: number, u: any) => s + Number(u.balance_available || 0),
            0,
          ),
        });
    } catch {}
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, count } = await apiGet({
        search,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sortBy,
        sortAsc: String(sortAsc),
        kyc: fKyc,
        frozen: fFrozen,
        license: fLicense,
        tier: fTier,
      });
      setUsers(data || []);
      setTotal(count || 0);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [search, page, sortBy, sortAsc, fKyc, fFrozen, fLicense, fTier]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  function handleSearch(v: string) {
    setSearchInput(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSearch(v);
      setPage(1);
    }, 450);
  }

  function sortCol(col: string) {
    if (sortBy === col) setSortAsc((a) => !a);
    else {
      setSortBy(col);
      setSortAsc(false);
    }
    setPage(1);
  }

  function TH({ l, col, cls = "" }: { l: string; col?: string; cls?: string }) {
    const active = col && sortBy === col;
    return (
      <th className={`px-4 py-3 text-left ${cls}`}>
        {col ? (
          <button
            onClick={() => sortCol(col)}
            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest"
            style={{ color: active ? C : TEXT_SECONDARY }}
          >
            {l}
            {active ? (
              sortAsc ? (
                <ChevronUp size={9} />
              ) : (
                <ChevronDown size={9} />
              )
            ) : (
              <ChevronDown size={9} style={{ color: TEXT_SECONDARY }} />
            )}
          </button>
        ) : (
          <span
            className="text-[9px] font-black uppercase tracking-widest"
            style={{ color: TEXT_SECONDARY }}
          >
            {l}
          </span>
        )}
      </th>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <div
        className="min-h-screen"
        style={{ background: BG, color: TEXT_PRIMARY }}
      >
        {selected && (
          <UserDrawer
            user={selected}
            onClose={() => setSelected(null)}
            onUpdate={() => {
              setSelected(null);
              loadUsers();
              loadStats();
            }}
          />
        )}
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p
                className="text-[9px] font-mono uppercase tracking-[0.2em] mb-1"
                style={{ color: C }}
              >
                User Management
              </p>
              <h1
                className="text-2xl font-black flex items-center gap-2.5"
                style={{ color: TEXT_PRIMARY }}
              >
                <Users size={20} style={{ color: C }} />
                User Management
              </h1>
              <p className="text-sm mt-1" style={{ color: TEXT_SECONDARY }}>
                {total.toLocaleString()} users — server-side access
              </p>
            </div>
            <button
              onClick={() => {
                loadUsers();
                loadStats();
              }}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl border"
              style={{
                borderColor: BORDER_HI,
                color: "#64748b",
                background: SURFACE,
              }}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm font-bold bg-red-900/20 border border-red-700/40 text-red-400 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {error} — Make sure SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_)
                is in .env.local and restart your dev server
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="Total Users"
              value={stats.total.toLocaleString()}
              color={C}
              icon={Users}
            />
            <StatCard
              label="KYC Verified"
              value={stats.kyc}
              sub={`${stats.total ? Math.round((stats.kyc / stats.total) * 100) : 0}%`}
              color="#3b82f6"
              icon={Shield}
            />
            <StatCard
              label="Frozen"
              value={stats.frozen}
              color="#ef4444"
              icon={Lock}
            />
            <StatCard
              label="Licensed"
              value={stats.licensed}
              color="#f59e0b"
              icon={Star}
            />
            <StatCard
              label="Total Balance"
              value={`$${stats.balance.toFixed(2)}`}
              color="#a78bfa"
              icon={DollarSign}
            />
          </div>

          <div
            className="rounded-2xl p-4 flex gap-3 flex-wrap items-center"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div className="flex-1 min-w-52 relative">
              <Search
                size={12}
                className="absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: "#1e3a5f" }}
              />
              <input
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search email, name, referral code…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white bg-slate-900 border border-slate-700/60 focus:outline-none focus:border-emerald-500 placeholder-slate-700"
              />
            </div>
            {(
              [
                {
                  val: fKyc,
                  set: (v: string) => {
                    setFKyc(v);
                    setPage(1);
                  },
                  opts: [
                    ["all", "All KYC"],
                    ["verified", "Verified"],
                    ["pending", "Pending"],
                    ["not_started", "Not Started"],
                    ["rejected", "Rejected"],
                  ],
                },
                {
                  val: fFrozen,
                  set: (v: string) => {
                    setFFrozen(v);
                    setPage(1);
                  },
                  opts: [
                    ["all", "All Accounts"],
                    ["frozen", "Frozen"],
                    ["active", "Active"],
                  ],
                },
                {
                  val: fLicense,
                  set: (v: string) => {
                    setFLicense(v);
                    setPage(1);
                  },
                  opts: [
                    ["all", "All License"],
                    ["licensed", "Licensed"],
                    ["unlicensed", "No License"],
                  ],
                },
                {
                  val: fTier,
                  set: (v: string) => {
                    setFTier(v);
                    setPage(1);
                  },
                  opts: [
                    ["all", "All Tiers"],
                    ["free", "free"],
                    ["rtx3060", "rtx3060"],
                    ["foundation", "foundation"],
                    ["intelligence", "intelligence"],
                    ["compute", "compute"],
                    ["a100", "a100"],
                    ["h100", "h100"],
                  ],
                },
              ] as const
            ).map(({ val, set, opts }, i) => (
              <select
                key={i}
                value={val}
                onChange={(e) => set(e.target.value)}
                className="bg-slate-900 border border-slate-700/60 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {opts.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ))}
            <span
              className="text-[10px] font-mono ml-auto"
              style={{ color: "#1e3a5f" }}
            >
              {total.toLocaleString()} results
            </span>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <TH l="User" col="email" cls="min-w-[200px]" />
                    <TH l="Tier" col="tier" cls="w-28" />
                    <TH l="KYC" col="kyc_status" cls="w-28" />
                    <TH l="Balance" col="balance_available" cls="w-28" />
                    <TH l="Earnings" col="earnings" cls="w-28" />
                    <TH l="Streak" col="streak_count" cls="w-20" />
                    <TH l="License" cls="w-24" />
                    <TH l="Fraud" col="fraud_score" cls="w-20" />
                    <TH l="Status" cls="w-32" />
                    <TH l="Joined" col="created_at" cls="w-28" />
                    <TH l="" cls="w-14" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="py-20 text-center">
                        <div
                          className="w-8 h-8 border-2 border-t-emerald-400 rounded-full animate-spin mx-auto mb-3"
                          style={{
                            borderColor: `${BORDER} ${BORDER} ${BORDER} ${C}`,
                          }}
                        />
                        <p className="text-slate-600 text-xs font-mono">
                          Loading users…
                        </p>
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-20 text-center">
                        <Users
                          size={32}
                          className="mx-auto mb-3"
                          style={{ color: "#1e3a5f" }}
                        />
                        <p className="text-slate-500 text-sm">No users found</p>
                        <p className="text-slate-700 text-xs mt-1 font-mono">
                          Ensure SUPABASE_SERVICE_ROLE_KEY is in .env.local (not
                          NEXT_PUBLIC_), then restart server
                        </p>
                      </td>
                    </tr>
                  ) : (
                    users.map((u, i) => (
                      <tr
                        key={u.id}
                        className="cursor-pointer transition-all"
                        style={{
                          borderBottom: `1px solid ${BORDER}40`,
                          background: i % 2 === 1 ? `${BG}80` : "transparent",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = `${BORDER}60`)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            i % 2 === 1 ? `${BG}80` : "transparent")
                        }
                        onClick={() => setSelected(u)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-white font-semibold text-xs truncate max-w-[190px]">
                            {u.full_name ||
                              u.kyc_full_name ||
                              u.email.split("@")[0]}
                          </p>
                          <p className="text-slate-500 text-[10px] truncate max-w-[190px]">
                            {u.email}
                          </p>
                          {u.country && (
                            <p className="text-slate-700 text-[9px]">
                              {u.country}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-900/20 border border-blue-800/30 text-blue-400">
                            {u.tier || "free"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <KycBadge status={u.kyc_status || "not_started"} />
                        </td>
                        <td className="px-4 py-3">
                          <p
                            className="font-black text-xs"
                            style={{ color: C }}
                          >
                            ${(u.balance_available || 0).toFixed(2)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-300 text-xs">
                            ${(u.earnings || 0).toFixed(2)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-amber-400 text-xs font-bold">
                            {u.streak_count || 0}d
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Pill
                            label={u.has_operator_license ? "Licensed" : "None"}
                            ok={u.has_operator_license}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-black ${(u.fraud_score || 0) >= 3 ? "text-red-400" : (u.fraud_score || 0) > 0 ? "text-amber-400" : "text-slate-700"}`}
                          >
                            {u.fraud_score || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.withdrawals_frozen ? (
                            <Pill label="Frozen" />
                          ) : u.pin_locked ? (
                            <Pill label="PIN Locked" warn />
                          ) : (
                            <Pill label="Active" ok />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-600 text-[9px] font-mono">
                            {new Date(u.created_at).toLocaleDateString()}
                          </p>
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setSelected(u)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center border transition-all"
                            style={{ borderColor: BORDER_HI, color: C }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = `${C}15`)
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            <Eye size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: `1px solid ${BORDER}` }}
            >
              <p className="text-[10px] font-mono" style={{ color: "#1e3a5f" }}>
                {total === 0
                  ? "No results"
                  : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()}`}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-7 h-7 rounded-lg flex items-center justify-center border disabled:opacity-30"
                  style={{ borderColor: BORDER_HI, color: "#475569" }}
                >
                  <ChevronLeft size={12} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  if (p > totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold border"
                      style={{
                        borderColor: p === page ? C : BORDER_HI,
                        color: p === page ? C : "#475569",
                        background: p === page ? `${C}15` : "transparent",
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="w-7 h-7 rounded-lg flex items-center justify-center border disabled:opacity-30"
                  style={{ borderColor: BORDER_HI, color: "#475569" }}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
