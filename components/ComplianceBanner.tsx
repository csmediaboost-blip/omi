"use client";
// components/ComplianceBanner.tsx
// Place this at: components/ComplianceBanner.tsx
// Add <ComplianceBanner userId={user.id} /> inside your DashboardNavigation or at top of dashboard

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Lock,
  CheckCircle,
  X,
  CreditCard,
  Upload,
  ShieldCheck,
} from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  body: string;
  type: string;
  requires_action: boolean;
  action_type: string | null;
  action_fee: number | null;
};

type FreezeStatus = {
  is_frozen: boolean;
  reason: string | null;
  announcement_id: string | null;
};

export default function ComplianceBanner({ userId }: { userId: string }) {
  const router = useRouter();
  const [freeze, setFreeze] = useState<FreezeStatus | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [userExempt, setUserExempt] = useState(false);

  useEffect(() => {
    load();
  }, [userId]);

  async function load() {
    const [freezeRes, annRes, completionsRes, userRes] = await Promise.all([
      supabase.from("withdrawal_freeze").select("*").limit(1).maybeSingle(),
      supabase
        .from("platform_announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("announcement_completions")
        .select("announcement_id")
        .eq("user_id", userId),
      supabase
        .from("users")
        .select("withdrawal_freeze_exempt")
        .eq("id", userId)
        .single(),
    ]);

    setFreeze(freezeRes.data);
    setAnnouncements(annRes.data || []);
    setCompletedIds(
      new Set((completionsRes.data || []).map((c: any) => c.announcement_id)),
    );
    setUserExempt(userRes.data?.withdrawal_freeze_exempt || false);
  }

  async function completeAction(ann: Announcement) {
    setSubmitting(ann.id);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_announcement_action",
          user_id: userId,
          announcement_id: ann.id,
          method: ann.action_type || "acknowledged",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setCompletedIds((prev) => new Set([...prev, ann.id]));
      setToast("✓ Action completed — withdrawals restored");
      setTimeout(() => setToast(null), 3000);
      load();
    } catch {
      setToast("Failed — please try again");
    } finally {
      setSubmitting(null);
    }
  }

  // Don't show anything if no active announcements and no freeze
  const activeAnns = announcements.filter(
    (a) => !completedIds.has(a.id) && !dismissed.has(a.id),
  );
  const isFrozen = freeze?.is_frozen && !userExempt;

  if (!isFrozen && activeAnns.length === 0) return null;

  return (
    <div className="w-full space-y-2 px-4 pt-3">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-emerald-500 text-slate-950 font-bold text-sm px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      {/* Global freeze banner */}
      {isFrozen && (
        <div className="bg-red-950/60 border border-red-700/60 rounded-2xl p-4 flex items-start gap-3">
          <Lock size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-red-400 font-black text-sm">
              ⚠ Withdrawals Temporarily Suspended
            </p>
            {freeze?.reason && (
              <p className="text-red-400/70 text-xs mt-0.5">{freeze.reason}</p>
            )}
            <p className="text-red-400/50 text-xs mt-1">
              Complete the required action below to restore your withdrawal
              access.
            </p>
          </div>
        </div>
      )}

      {/* Announcement cards */}
      {activeAnns.map((ann) => {
        const isDone = completedIds.has(ann.id);
        return (
          <div
            key={ann.id}
            className={`border rounded-2xl p-4 ${
              ann.type === "critical"
                ? "bg-red-950/40 border-red-800/50"
                : ann.type === "compliance"
                  ? "bg-amber-950/40 border-amber-800/50"
                  : "bg-slate-900/60 border-slate-800"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <AlertTriangle
                  size={16}
                  className={
                    ann.type === "critical"
                      ? "text-red-400 mt-0.5 shrink-0"
                      : ann.type === "compliance"
                        ? "text-amber-400 mt-0.5 shrink-0"
                        : "text-blue-400 mt-0.5 shrink-0"
                  }
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-white font-black text-sm">{ann.title}</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${
                        ann.type === "critical"
                          ? "text-red-400 bg-red-900/20 border-red-800"
                          : ann.type === "compliance"
                            ? "text-amber-400 bg-amber-900/20 border-amber-800"
                            : "text-blue-400 bg-blue-900/20 border-blue-800"
                      }`}
                    >
                      {ann.type}
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    {ann.body}
                  </p>

                  {/* Action button */}
                  {ann.requires_action && !isDone && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ann.action_type === "kyc_upload" && (
                        <button
                          onClick={() => {
                            router.push("/dashboard/verification");
                          }}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-2 rounded-xl transition-all"
                        >
                          <Upload size={12} /> Upload ID Document
                        </button>
                      )}
                      {ann.action_type === "pay_fee" && ann.action_fee && (
                        <button
                          onClick={() => router.push("/dashboard/financials")}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-2 rounded-xl transition-all"
                        >
                          <CreditCard size={12} /> Pay ${ann.action_fee}{" "}
                          Compliance Fee
                        </button>
                      )}
                      {ann.action_type === "acknowledge" && (
                        <button
                          onClick={() => completeAction(ann)}
                          disabled={submitting === ann.id}
                          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                        >
                          <ShieldCheck size={12} />
                          {submitting === ann.id
                            ? "Processing…"
                            : "I Acknowledge & Accept"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Done state */}
                  {isDone && (
                    <div className="mt-2 flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                      <CheckCircle size={12} /> Action completed — access
                      restored
                    </div>
                  )}
                </div>
              </div>

              {/* Dismiss (only for non-required announcements) */}
              {!ann.requires_action && (
                <button
                  onClick={() =>
                    setDismissed((prev) => new Set([...prev, ann.id]))
                  }
                  className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
