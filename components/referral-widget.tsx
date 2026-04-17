"use client";
// components/referral-widget.tsx
// Drop this anywhere on the dashboard/home page
// Props: trigger = "post_earn" | "post_withdrawal" | "idle"

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Share2,
  Zap,
  Users,
  ChevronRight,
  X,
  Gift,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  trigger?: "post_earn" | "post_withdrawal" | "idle";
  className?: string;
};

export function ReferralWidget({ trigger = "idle", className = "" }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [activeNodes, setActiveNodes] = useState(0);
  const [weeklyEarnings, setWeeklyEarnings] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("users")
        .select("referral_code, referral_earnings")
        .eq("id", user.id)
        .single();
      setCode(profile?.referral_code || "");
      setWeeklyEarnings(profile?.referral_earnings || 0);

      const now = new Date();
      const { data: collabs } = await supabase
        .from("users")
        .select("node_expiry_date")
        .eq("referred", user.id);
      const active = (collabs || []).filter(
        (c) => c.node_expiry_date && new Date(c.node_expiry_date) > now,
      ).length;
      setActiveNodes(active);
    }
    load();
  }, []);

  if (dismissed || !code) return null;

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/signup?ref=${code}`
      : "";

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const messages: Record<
    string,
    { headline: string; sub: string; emoji: string }
  > = {
    post_earn: {
      headline: "Boost this even further",
      sub: "You just earned — now make it passive. Earn 20–25% of every node you bring in.",
      emoji: "⚡",
    },
    post_withdrawal: {
      headline: "Make withdrawals automatic",
      sub: "Every active referral adds to your weekly payout. Zero extra work.",
      emoji: "💰",
    },
    idle: {
      headline: "Grow your GPU network",
      sub: "Earn 20–25% of your collaborators' GPU income — for life.",
      emoji: "🌐",
    },
  };

  const msg = messages[trigger];

  return (
    <div
      className={`relative bg-gradient-to-br from-blue-950/60 to-slate-900/80 border border-blue-900/40 rounded-2xl p-4 space-y-3 ${className}`}
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-slate-600 hover:text-slate-400 transition-colors"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      >
        <X size={14} />
      </button>

      <div className="flex items-start gap-3 pr-5">
        <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
          <span className="text-lg">{msg.emoji}</span>
        </div>
        <div>
          <p className="text-white font-black text-sm">{msg.headline}</p>
          <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
            {msg.sub}
          </p>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 rounded-xl p-2.5">
          <p className="text-slate-600 text-[9px] uppercase tracking-widest">
            Active Nodes
          </p>
          <p className="text-white font-black text-base">{activeNodes}</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-2.5">
          <p className="text-slate-600 text-[9px] uppercase tracking-widest">
            Network Earned
          </p>
          <p className="text-emerald-400 font-black text-base">
            ${weeklyEarnings.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/40 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all"
          style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        >
          {copied ? (
            "✓ Copied!"
          ) : (
            <>
              <Share2 size={11} /> Copy Link
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/network")}
          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all"
          style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        >
          View Network <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini inline prompt — use inline in any text/button area
// ─────────────────────────────────────────────────────────────────────────────
export function ReferralInlineBanner() {
  const [code, setCode] = useState("");
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("users")
        .select("referral_code")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.referral_code) setCode(data.referral_code);
        });
    });
  }, []);

  if (!code) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/dashboard/network")}
      className="w-full flex items-center gap-3 bg-gradient-to-r from-blue-950/50 to-slate-900/50 border border-blue-900/30 rounded-xl px-4 py-3 hover:border-blue-800/60 transition-all group"
      style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
    >
      <div className="w-7 h-7 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0">
        <Gift size={13} className="text-blue-400" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-white text-xs font-bold">
          Invite operators → earn 20–25% of their GPU income
        </p>
        <p className="text-slate-500 text-[10px]">
          Your code: <span className="text-blue-400 font-mono">{code}</span>
        </p>
      </div>
      <ChevronRight
        size={14}
        className="text-slate-600 group-hover:text-slate-400 transition-colors"
      />
    </button>
  );
}
