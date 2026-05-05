"use client";
// app/dashboard/tasks/page.tsx
// OPTIMIZED: Uses caching service for instant loads, lazy loading for non-critical data
// 1. RLHF Validation — admin-set questions, one answer per user per question, disappears after answered
// 2. GPU Allocation — sign allocation contract, 70% loss / 30% high gain random ticks every 30s

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cacheService } from "@/lib/cache-service";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  Zap,
  CheckCircle,
  Lock,
  Clock,
  Star,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Activity,
  Cpu,
  Shield,
  DollarSign,
  BarChart2,
  ArrowRight,
  FileCheck,
  Brain,
  Thermometer,
  Server,
  Wallet,
  Info,
  Award,
} from "lucide-react";

// ── TYPES ────────────────────────────────────────────────────
type LicenseType =
  | "thermal_optimization"
  | "rlhf_validation"
  | "gpu_allocation";

type RLHFQuestion = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  category: string;
  reward: number;
  is_active: boolean;
  already_answered?: boolean; // set client-side after fetching user's answers
};

type GPUContract = {
  id: string;
  contract_ref: string;
  allocated_amount: number;
  status: string;
  outcome_type: string;
  current_value: number;
  total_pnl: number;
  last_tick_at: string;
  last_tick_pnl: number;
  tick_count: number;
  created_at: string;
};

type GPUTick = {
  id: string;
  tick_type: string;
  amount: number;
  pct_change: number;
  running_value: number;
  created_at: string;
};

type License = {
  id: string;
  license_type: string;
  status: string;
  expires_at: string;
};

// ── CONSTANTS ────────────────────────────────────────────────
const BG = "#06080f";
const TICK_INTERVAL_MS = 30000; // 30 seconds between ticks
const LOSS_PROBABILITY = 0.7; // 70% chance of loss
const GAIN_PROBABILITY = 0.3; // 30% chance of high gain

// ── HELPERS ──────────────────────────────────────────────────
function generateContractRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (len: number) =>
    Array.from(
      { length: len },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `GPUA-${seg(4)}-${new Date().getFullYear()}`;
}

function generateTickPnL(currentValue: number): {
  type: "gain" | "loss";
  pct: number;
  amount: number;
} {
  const isLoss = Math.random() < LOSS_PROBABILITY;
  if (isLoss) {
    // Loss: -0.5% to -8%
    const pct = -(0.5 + Math.random() * 7.5);
    const amount = Math.abs((currentValue * pct) / 100);
    return { type: "loss", pct, amount };
  } else {
    // High gain: +3% to +25%
    const pct = 3 + Math.random() * 22;
    const amount = (currentValue * pct) / 100;
    return { type: "gain", pct, amount };
  }
}

// ── PURCHASE MODAL ────────────────────────────────────────────
function PurchaseModal({
  type,
  onClose,
}: {
  type: LicenseType;
  onClose: () => void;
}) {
  const router = useRouter();
  const info = {
    thermal_optimization: {
      name: "Thermal & Neural Operator License",
      icon: Thermometer,
      color: "#f59e0b",
    },
    rlhf_validation: {
      name: "RLHF Validation Operator License",
      icon: Brain,
      color: "#8b5cf6",
    },
    gpu_allocation: {
      name: "GPU Allocation Operator License",
      icon: Server,
      color: "#10b981",
    },
  }[type];
  const Icon = info.icon;
  
  const handleNavigateToLicense = () => {
    router.push(`/dashboard/license?licenseType=${type}`);
  };
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{
          background: "rgb(10,15,26)",
          border: `1px solid ${info.color}40`,
        }}
      >
        <div
          className="p-6"
          style={{
            background: `${info.color}08`,
            borderBottom: `1px solid ${info.color}25`,
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: `${info.color}15`,
                border: `1px solid ${info.color}30`,
              }}
            >
              <Icon size={22} style={{ color: info.color }} />
            </div>
            <div>
              <p
                className="text-[9px] font-black uppercase tracking-[0.2em] mb-1"
                style={{ color: info.color }}
              >
                Operator License Required
              </p>
              <h3 className="text-white font-black text-lg">{info.name}</h3>
              <p className="text-slate-400 text-sm mt-1">
                4-year license · Renewable · Unlocks this task
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div
            className="rounded-xl p-4 space-y-2"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {[
              ["License Fee", "$200"],
              ["Duration", "4 Years"],
              ["Task Access", "Full"],
              ["Renewal", "Eligible"],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-slate-500">{l}</span>
                <span className="text-white font-bold">{v}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleNavigateToLicense}
            className="w-full py-3.5 rounded-2xl font-black text-slate-950 text-sm flex items-center justify-center gap-2"
            style={{ background: info.color }}
          >
            <FileCheck size={16} /> Get License — $200 <ArrowRight size={14} />
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-slate-600 text-xs hover:text-slate-400"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RLHF TASK SECTION ─────────────────────────────────────────
function RLHFSection({
  userId,
  license,
  onEarned,
}: {
  userId: string;
  license: License | null;
  onEarned: (amt: number) => void;
}) {
  const [questions, setQuestions] = useState<RLHFQuestion[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [count, setCount] = useState({ today: 0, total: 0 });

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    // Load active questions
    const { data: qs } = await supabase
      .from("rlhf_questions")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    // Load what this user has already answered
    const { data: ans } = await supabase
      .from("rlhf_answers")
      .select("question_id")
      .eq("user_id", userId);
    const answered = new Set((ans || []).map((a) => a.question_id));
    setAnsweredIds(answered);
    // Mark which questions are already answered
    const enriched = (qs || []).map((q) => ({
      ...q,
      already_answered: answered.has(q.id),
    }));
    setQuestions(enriched);
    // Stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayAns } = await supabase
      .from("rlhf_answers")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", today.toISOString());
    setCount({ today: todayAns?.length || 0, total: ans?.length || 0 });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: new questions added by admin appear instantly
  useEffect(() => {
    const channel = supabase
      .channel("rlhf_questions_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rlhf_questions" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rlhf_questions" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function submitAnswer(
    questionId: string,
    chosen: "A" | "B",
    reward: number,
  ) {
    if (answeredIds.has(questionId)) return;
    setAnswering(questionId);
    try {
      const { error } = await supabase.from("rlhf_answers").insert({
        question_id: questionId,
        user_id: userId,
        chosen_option: chosen,
        reward_earned: reward,
      });
      if (error) throw new Error(error.message);
      // Credit earnings to user
      const { data: u } = await supabase
        .from("users")
        .select("balance_available, earnings")
        .eq("id", userId)
        .single();
      await supabase
        .from("users")
        .update({
          balance_available: ((u as any)?.balance_available || 0) + reward,
          earnings: ((u as any)?.earnings || 0) + reward,
        })
        .eq("id", userId);
      // Ledger
      try {
        await supabase
          .from("transaction_ledger")
          .insert({
            user_id: userId,
            type: "task_reward",
            amount: reward,
            description: `RLHF validation reward`,
            created_at: new Date().toISOString(),
          });
      } catch (_) {}
      flash(`+$${reward.toFixed(2)} — RLHF response recorded!`);
      onEarned(reward);
      load();
    } catch (e: any) {
      flash("Error: " + e.message);
    }
    setAnswering(null);
  }

  const unanswered = questions.filter((q) => !q.already_answered);
  const hasLicense = !!license && license.status === "active";

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold bg-emerald-500 text-slate-950 flex items-center gap-2 shadow-2xl">
          <CheckCircle size={14} /> {toast}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Answered Today", value: count.today, color: "#10b981" },
          { label: "Total Answered", value: count.total, color: "#8b5cf6" },
          { label: "Remaining", value: unanswered.length, color: "#f59e0b" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl p-3 text-center"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p className="font-black text-xl" style={{ color }}>
              {value}
            </p>
            <p className="text-slate-600 text-[10px] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {!hasLicense ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: "rgba(139,92,246,0.06)",
            border: "1px solid rgba(139,92,246,0.2)",
          }}
        >
          <Lock size={28} className="text-violet-400 mx-auto mb-3" />
          <p className="text-white font-black text-base">
            RLHF Validation License Required
          </p>
          <p className="text-slate-400 text-sm mt-2">
            Purchase the RLHF Operator License ($200) to access AI training
            tasks and earn per validated response.
          </p>
        </div>
      ) : loading ? (
        <div className="text-center py-10">
          <div className="w-8 h-8 border-2 border-t-violet-400 rounded-full animate-spin mx-auto" />
        </div>
      ) : unanswered.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <CheckCircle size={32} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-white font-black text-base">
            All questions answered!
          </p>
          <p className="text-slate-400 text-sm mt-2">
            You've completed all {questions.length} available RLHF questions.
            Check back when the admin adds new ones.
          </p>
          <p className="text-slate-600 text-xs mt-3 font-mono">
            Total earned: {count.total} responses validated
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">
              {unanswered.length} question{unanswered.length !== 1 ? "s" : ""}{" "}
              pending
            </p>
            <button
              onClick={load}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
            >
              <RefreshCw size={10} /> Refresh
            </button>
          </div>
          {unanswered.map((q) => (
            <div
              key={q.id}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(139,92,246,0.2)",
              }}
            >
              <div
                className="px-5 py-4"
                style={{
                  background: "rgba(139,92,246,0.08)",
                  borderBottom: "1px solid rgba(139,92,246,0.15)",
                }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-violet-400">
                    TASK PROMPT
                  </p>
                  <span
                    className="text-[10px] font-black px-2.5 py-1 rounded-full"
                    style={{
                      color: "#10b981",
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    +${q.reward.toFixed(2)} reward
                  </span>
                </div>
                <p className="text-white font-bold text-sm mt-2">
                  {q.question}
                </p>
              </div>
              <div className="p-5 space-y-3">
                {(["A", "B"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => submitAnswer(q.id, opt, q.reward)}
                    disabled={answering === q.id}
                    className="w-full text-left rounded-xl p-4 transition-all disabled:opacity-60"
                    style={{
                      background: "rgba(8,13,24,0.8)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.border =
                        "1px solid rgba(139,92,246,0.4)";
                      e.currentTarget.style.background =
                        "rgba(139,92,246,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.border =
                        "1px solid rgba(255,255,255,0.06)";
                      e.currentTarget.style.background = "rgba(8,13,24,0.8)";
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                        style={{
                          background: "rgba(139,92,246,0.15)",
                          border: "1px solid rgba(139,92,246,0.3)",
                          color: "#a78bfa",
                        }}
                      >
                        {opt}
                      </span>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        {opt === "A" ? q.option_a : q.option_b}
                      </p>
                    </div>
                    {answering === q.id && (
                      <div className="flex items-center gap-1.5 mt-2 text-violet-400 text-xs">
                        <RefreshCw size={11} className="animate-spin" />{" "}
                        Recording...
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── GPU ALLOCATION SECTION ─────────────────────────────────────
function GPUAllocationSection({
  userId,
  license,
  onEarned,
}: {
  userId: string;
  license: License | null;
  onEarned: (amt: number) => void;
}) {
  const [contracts, setContracts] = useState<GPUContract[]>([]);
  const [ticks, setTicks] = useState<Record<string, GPUTick[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [allocAmount, setAllocAmount] = useState("500");
  const [toast, setToast] = useState<{
    msg: string;
    type: "gain" | "loss" | "info";
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const tickTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  function flash(msg: string, type: "gain" | "loss" | "info" = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    const { data: cs } = await supabase
      .from("gpu_allocation_contracts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setContracts(cs || []);
    setLoading(false);
    // Load ticks for each contract
    if (cs && cs.length > 0) {
      for (const c of cs) {
        const { data: ts } = await supabase
          .from("gpu_allocation_ticks")
          .select("*")
          .eq("contract_id", c.id)
          .order("created_at", { ascending: false })
          .limit(20);
        setTicks((prev) => ({ ...prev, [c.id]: ts || [] }));
      }
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Run ticks for active contracts
  useEffect(() => {
    contracts
      .filter((c) => c.status === "active")
      .forEach((contract) => {
        if (tickTimers.current[contract.id]) return; // already running
        tickTimers.current[contract.id] = setInterval(
          () => runTick(contract),
          TICK_INTERVAL_MS,
        );
      });
    return () => {
      Object.values(tickTimers.current).forEach((t) => clearInterval(t));
      tickTimers.current = {};
    };
  }, [contracts]);

  async function runTick(contract: GPUContract) {
    const currentValue = contract.current_value || contract.allocated_amount;
    const { type, pct, amount } = generateTickPnL(currentValue);
    const newValue =
      type === "gain"
        ? currentValue + amount
        : Math.max(0, currentValue - amount);
    const totalPnl = newValue - contract.allocated_amount;
    const now = new Date().toISOString();

    // Insert tick
    await supabase.from("gpu_allocation_ticks").insert({
      contract_id: contract.id,
      user_id: userId,
      tick_type: type,
      amount,
      pct_change: pct,
      running_value: newValue,
      created_at: now,
    });

    // Update contract
    const isLiquidated = newValue <= contract.allocated_amount * 0.05; // liquidate at 5% of original
    await supabase
      .from("gpu_allocation_contracts")
      .update({
        current_value: newValue,
        total_pnl: totalPnl,
        last_tick_at: now,
        last_tick_pnl: type === "gain" ? amount : -amount,
        tick_count: contract.tick_count + 1,
        outcome_type: totalPnl >= 0 ? "gain" : "loss",
        status: isLiquidated ? "liquidated" : "active",
        ...(isLiquidated ? { closed_at: now } : {}),
      })
      .eq("id", contract.id);

    // If gain, credit user
    if (type === "gain") {
      const { data: u } = await supabase
        .from("users")
        .select("balance_available, earnings")
        .eq("id", userId)
        .single();
      const credit = amount * 0.8; // 80% of gain credited to user balance
      await supabase
        .from("users")
        .update({
          balance_available: ((u as any)?.balance_available || 0) + credit,
          earnings: ((u as any)?.earnings || 0) + credit,
        })
        .eq("id", userId);
      onEarned(credit);
      flash(
        `+$${amount.toFixed(2)} gain on ${contract.contract_ref} (+${pct.toFixed(1)}%)`,
        "gain",
      );
    } else {
      flash(
        `-$${amount.toFixed(2)} loss on ${contract.contract_ref} (${pct.toFixed(1)}%)`,
        "loss",
      );
    }

    load();
  }

  async function createContract() {
    const amt = parseFloat(allocAmount);
    if (!amt || amt < 100) {
      flash("Minimum allocation is $100", "loss");
      return;
    }
    setCreating(true);
    const ref = generateContractRef();
    const { error } = await supabase.from("gpu_allocation_contracts").insert({
      user_id: userId,
      contract_ref: ref,
      allocated_amount: amt,
      status: "active",
      outcome_type: "pending",
      current_value: amt,
      total_pnl: 0,
      last_tick_at: new Date().toISOString(),
      last_tick_pnl: 0,
      tick_count: 0,
    });
    if (error) flash(error.message, "loss");
    else {
      flash(`Contract ${ref} created! First tick in 30s.`, "info");
      load();
    }
    setCreating(false);
  }

  async function closeContract(id: string) {
    if (
      !confirm(
        "Close this allocation contract? Remaining value will be settled.",
      )
    )
      return;
    const contract = contracts.find((c) => c.id === id);
    if (!contract) return;
    const finalValue = contract.current_value;
    if (finalValue > 0) {
      const { data: u } = await supabase
        .from("users")
        .select("balance_available")
        .eq("id", userId)
        .single();
      await supabase
        .from("users")
        .update({
          balance_available: ((u as any)?.balance_available || 0) + finalValue,
        })
        .eq("id", userId);
    }
    await supabase
      .from("gpu_allocation_contracts")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", id);
    if (tickTimers.current[id]) {
      clearInterval(tickTimers.current[id]);
      delete tickTimers.current[id];
    }
    flash(
      `Contract closed. $${finalValue.toFixed(2)} settled to balance.`,
      "info",
    );
    load();
  }

  const hasLicense = !!license && license.status === "active";
  const activeContracts = contracts.filter((c) => c.status === "active");
  const totalValue = activeContracts.reduce(
    (s, c) => s + (c.current_value || 0),
    0,
  );
  const totalInvested = activeContracts.reduce(
    (s, c) => s + (c.allocated_amount || 0),
    0,
  );
  const totalPnL = totalValue - totalInvested;

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-2xl ${toast.type === "gain" ? "bg-emerald-500 text-slate-950" : toast.type === "loss" ? "bg-red-500 text-white" : "bg-blue-600 text-white"}`}
        >
          {toast.type === "gain" ? (
            <TrendingUp size={14} />
          ) : toast.type === "loss" ? (
            <TrendingDown size={14} />
          ) : (
            <Info size={14} />
          )}{" "}
          {toast.msg}
        </div>
      )}

      {!hasLicense ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <Lock size={28} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-white font-black text-base">
            GPU Allocation License Required
          </p>
          <p className="text-slate-400 text-sm mt-2">
            Purchase the GPU Allocation Operator License ($200) to sign
            allocation contracts and earn compute revenue.
          </p>
        </div>
      ) : (
        <>
          {/* Overview stats */}
          {activeContracts.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Total Allocated",
                  value: `$${totalInvested.toFixed(2)}`,
                  color: "#fff",
                },
                {
                  label: "Current Value",
                  value: `$${totalValue.toFixed(2)}`,
                  color: totalValue >= totalInvested ? "#10b981" : "#ef4444",
                },
                {
                  label: "Total P&L",
                  value: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`,
                  color: totalPnL >= 0 ? "#10b981" : "#ef4444",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="rounded-xl p-3 text-center"
                  style={{
                    background: "rgba(15,23,42,0.8)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="font-black text-lg" style={{ color }}>
                    {value}
                  </p>
                  <p className="text-slate-600 text-[10px] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Risk disclaimer */}
          <div
            className="rounded-xl p-3 flex items-start gap-2.5"
            style={{
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.2)",
            }}
          >
            <AlertTriangle
              size={13}
              className="text-amber-400 mt-0.5 shrink-0"
            />
            <p className="text-amber-400/80 text-[11px] leading-relaxed">
              <strong className="text-amber-300">High Risk:</strong> GPU
              allocation contracts have a 70% probability of loss per cycle.
              Markets are simulated based on real compute demand patterns. Never
              allocate more than you can afford to lose.
            </p>
          </div>

          {/* Create new contract */}
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            <div>
              <p className="text-white font-black text-sm flex items-center gap-2">
                <Server size={14} className="text-emerald-400" /> Sign New
                Allocation Contract
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Allocate funds to enterprise GPU clients. Earnings distributed
                every 30 seconds based on compute demand.
              </p>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">
                  Allocation Amount (min $100)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    min="100"
                    value={allocAmount}
                    onChange={(e) => setAllocAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 rounded-xl text-white font-black bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 text-lg"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[100, 500, 1000, 5000].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAllocAmount(String(v))}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-all"
                    >
                      ${v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={createContract}
                disabled={creating}
                className="px-5 py-3 rounded-xl font-black text-sm text-slate-950 flex items-center gap-2 disabled:opacity-50 shrink-0"
                style={{ background: "#10b981" }}
              >
                {creating ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} />
                )}
                Sign Contract
              </button>
            </div>
            {/* Expected outcome info */}
            {parseFloat(allocAmount) >= 100 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.15)",
                  }}
                >
                  <p className="text-red-400 text-[9px] uppercase tracking-wide font-bold mb-1">
                    Loss Scenario (70% chance)
                  </p>
                  <p className="text-red-400 font-black text-sm">
                    -${(parseFloat(allocAmount || "0") * 0.08).toFixed(2)} to -$
                    {(parseFloat(allocAmount || "0") * 0.005).toFixed(2)}
                  </p>
                  <p className="text-slate-600 text-[10px] mt-0.5">
                    -0.5% to -8% per cycle
                  </p>
                </div>
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(16,185,129,0.06)",
                    border: "1px solid rgba(16,185,129,0.15)",
                  }}
                >
                  <p className="text-emerald-400 text-[9px] uppercase tracking-wide font-bold mb-1">
                    Gain Scenario (30% chance)
                  </p>
                  <p className="text-emerald-400 font-black text-sm">
                    +${(parseFloat(allocAmount || "0") * 0.03).toFixed(2)} to +$
                    {(parseFloat(allocAmount || "0") * 0.25).toFixed(2)}
                  </p>
                  <p className="text-slate-600 text-[10px] mt-0.5">
                    +3% to +25% per cycle
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Active contracts */}
          {loading ? (
            <div className="text-center py-8">
              <div
                className="w-7 h-7 border-2 border-t-emerald-400 rounded-full animate-spin mx-auto"
                style={{ borderColor: "#0e1d38 #0e1d38 #0e1d38 #10b981" }}
              />
            </div>
          ) : contracts.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{
                background: "rgba(15,23,42,0.5)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <Server
                size={28}
                className="mx-auto mb-3"
                style={{ color: "#1e3a5f" }}
              />
              <p className="text-slate-500 text-sm">
                No allocation contracts yet. Sign your first contract above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">
                {contracts.length} contract{contracts.length !== 1 ? "s" : ""}
              </p>
              {contracts.map((c) => {
                const pnl = c.total_pnl || 0;
                const pnlPct =
                  c.allocated_amount > 0 ? (pnl / c.allocated_amount) * 100 : 0;
                const isActive = c.status === "active";
                const statusColor =
                  c.status === "active"
                    ? "#10b981"
                    : c.status === "closed"
                      ? "#64748b"
                      : "#ef4444";
                const contractTicks = ticks[c.id] || [];

                return (
                  <div
                    key={c.id}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "rgba(10,16,28,0.9)",
                      border: `1px solid ${pnl >= 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                    }}
                  >
                    {/* Contract header */}
                    <div
                      className="px-5 py-4"
                      style={{
                        background:
                          pnl >= 0
                            ? "rgba(16,185,129,0.06)"
                            : "rgba(239,68,68,0.06)",
                        borderBottom: `1px solid ${pnl >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="text-white font-black text-sm font-mono">
                              {c.contract_ref}
                            </p>
                            <span
                              className="text-[9px] font-black px-2 py-0.5 rounded-full"
                              style={{
                                color: statusColor,
                                background: `${statusColor}15`,
                                border: `1px solid ${statusColor}30`,
                              }}
                            >
                              {c.status.toUpperCase()}
                            </span>
                            {isActive && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-900/20 border border-emerald-800/40 text-emerald-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                                LIVE
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 text-[10px]">
                            Allocated ${c.allocated_amount.toFixed(2)} ·{" "}
                            {c.tick_count} ticks · Started{" "}
                            {new Date(c.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-black text-lg">
                            ${(c.current_value || 0).toFixed(2)}
                          </p>
                          <p
                            className={`text-sm font-black ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (
                            {pnl >= 0 ? "+" : ""}
                            {pnlPct.toFixed(1)}%)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Last tick indicator */}
                    {c.last_tick_pnl !== 0 && (
                      <div
                        className="px-5 py-2.5 flex items-center justify-between text-xs"
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <span className="text-slate-600">
                          Last tick{" "}
                          {new Date(c.last_tick_at).toLocaleTimeString()}
                        </span>
                        <span
                          className={`font-black ${c.last_tick_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {c.last_tick_pnl >= 0 ? "+" : ""}$
                          {c.last_tick_pnl.toFixed(4)}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="px-5 py-3 flex items-center gap-3">
                      <button
                        onClick={() =>
                          setExpanded(expanded === c.id ? null : c.id)
                        }
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
                      >
                        {expanded === c.id ? (
                          <ChevronUp size={11} />
                        ) : (
                          <ChevronDown size={11} />
                        )}
                        {contractTicks.length} ticks history
                      </button>
                      {isActive && (
                        <button
                          onClick={() => closeContract(c.id)}
                          className="ml-auto text-[11px] font-bold px-3 py-1.5 rounded-lg border border-red-700/40 text-red-400 hover:bg-red-900/20 transition-all"
                        >
                          Close & Settle
                        </button>
                      )}
                    </div>

                    {/* Tick history */}
                    {expanded === c.id && contractTicks.length > 0 && (
                      <div className="px-5 pb-4">
                        <div
                          className="rounded-xl overflow-hidden"
                          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <div
                            className="px-3 py-2"
                            style={{
                              background: "rgba(8,13,24,0.8)",
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                            }}
                          >
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                              Tick History (last {contractTicks.length})
                            </p>
                          </div>
                          <div
                            className="divide-y"
                            style={{ divideColor: "rgba(255,255,255,0.03)" }}
                          >
                            {contractTicks.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center justify-between px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  {t.tick_type === "gain" ? (
                                    <TrendingUp
                                      size={11}
                                      className="text-emerald-400"
                                    />
                                  ) : (
                                    <TrendingDown
                                      size={11}
                                      className="text-red-400"
                                    />
                                  )}
                                  <span className="text-[10px] text-slate-600">
                                    {new Date(
                                      t.created_at,
                                    ).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px]">
                                  <span
                                    className={
                                      t.tick_type === "gain"
                                        ? "text-emerald-400 font-black"
                                        : "text-red-400 font-black"
                                    }
                                  >
                                    {t.tick_type === "gain" ? "+" : "-"}$
                                    {t.amount.toFixed(4)} (
                                    {t.pct_change >= 0 ? "+" : ""}
                                    {t.pct_change.toFixed(2)}%)
                                  </span>
                                  <span className="text-slate-600 font-mono">
                                    ${t.running_value.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MAIN TASKS PAGE ───────────────────────────────────────────
export default function TasksPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"thermal" | "rlhf" | "gpu">(
    "rlhf",
  );
  const [purchaseModal, setPurchaseModal] = useState<LicenseType | null>(null);
  const [balance, setBalance] = useState(0);
  const [totalEarnedToday, setTotalEarnedToday] = useState(0);

  const getLicense = (type: LicenseType) =>
    licenses.find((l) => l.license_type === type || l.license_type === "all") ||
    null;

  const loadAll = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push("/auth/signin");
      return;
    }
    setUserId(session.user.id);
    const [{ data: lics }, { data: u }] = await Promise.all([
      supabase
        .from("operator_licenses")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString()),
      supabase
        .from("users")
        .select("balance_available")
        .eq("id", session.user.id)
        .single(),
    ]);
    setLicenses(lics || []);
    setBalance((u as any)?.balance_available || 0);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function handleLicensePurchase(type: LicenseType) {
    setPurchaseModal(null);
    if (typeof window !== "undefined")
      sessionStorage.setItem("checkout_redirect", "/dashboard/tasks");
    router.push(`/dashboard/license?licenseType=${type}`);
  }

  function handleEarned(amt: number) {
    setBalance((b) => b + amt);
    setTotalEarnedToday((t) => t + amt);
  }

  if (loading)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: BG }}
      >
        <div className="w-10 h-10 border-2 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );

  const rlhfLic = getLicense("rlhf_validation");
  const gpuLic = getLicense("gpu_allocation");
  const thermalLic = getLicense("thermal_optimization");
  const licCount = licenses.length;
  const totalLics = 3;

  const TABS = [
    {
      id: "rlhf" as const,
      label: "RLHF Validation",
      icon: Brain,
      color: "#8b5cf6",
      hasLic: !!rlhfLic,
    },
    {
      id: "gpu" as const,
      label: "GPU Allocation",
      icon: Server,
      color: "#10b981",
      hasLic: !!gpuLic,
    },
    {
      id: "thermal" as const,
      label: "Thermal Calibration",
      icon: Thermometer,
      color: "#f59e0b",
      hasLic: !!thermalLic,
    },
  ];

  return (
    <div
      className="flex min-h-screen"
      style={{ background: BG, color: "#cbd5e1" }}
    >
      <DashboardNavigation />

      {purchaseModal && (
        <PurchaseModal
          type={purchaseModal}
          onClose={() => setPurchaseModal(null)}
          onBuy={() => handleLicensePurchase(purchaseModal)}
        />
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 pt-6 pb-36 md:pb-16 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span
                  className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full flex items-center gap-1.5"
                  style={{
                    color: "#10b981",
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                  LIVE NODE TASKS
                </span>
                <span
                  className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full"
                  style={{
                    color: "#8b5cf6",
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.2)",
                  }}
                >
                  {licCount}/{totalLics} LICENSES ACTIVE
                </span>
                {licenses.some((l) => l.license_type === "all") && (
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full"
                    style={{
                      color: "#10b981",
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.2)",
                    }}
                  >
                    <CheckCircle size={9} className="inline mr-1" /> KYC
                    VERIFIED
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black text-white">
                Node Operator Tasks
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Earn rewards by operating your GPU compute infrastructure
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                Current Balance
              </p>
              <p className="text-white font-black text-3xl tabular-nums">
                ${balance.toFixed(2)}
              </p>
              {totalEarnedToday > 0 && (
                <p className="text-emerald-400 text-xs font-bold mt-0.5">
                  +${totalEarnedToday.toFixed(2)} this session
                </p>
              )}
            </div>
          </div>

          {/* Task tabs */}
          <div className="mt-8 space-y-6">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full rounded-2xl p-6 text-left transition-all"
                  style={{
                    background: isActive
                      ? `${tab.color}12`
                      : "rgba(10,16,28,0.7)",
                    border: `1px solid ${isActive ? `${tab.color}40` : "rgba(255,255,255,0.07)"}`,
                    boxShadow: isActive ? `0 0 20px ${tab.color}10` : "none",
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${tab.color}15`,
                        border: `1px solid ${tab.color}30`,
                      }}
                    >
                      <Icon size={16} style={{ color: tab.color }} />
                    </div>
                    {tab.hasLic ? (
                      <span
                        className="text-[9px] font-black px-2 py-0.5 rounded-full"
                        style={{
                          color: tab.color,
                          background: `${tab.color}15`,
                          border: `1px solid ${tab.color}25`,
                        }}
                      >
                        LICENSED
                      </span>
                    ) : (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500 flex items-center gap-1">
                        <Lock size={7} /> $200
                      </span>
                    )}
                  </div>
                  <p className="text-white font-black text-sm">{tab.label}</p>
                  {!tab.hasLic && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPurchaseModal(
                          tab.id === "rlhf"
                            ? "rlhf_validation"
                            : tab.id === "gpu"
                              ? "gpu_allocation"
                              : "thermal_optimization",
                        );
                      }}
                      className="text-[10px] font-bold mt-2 px-2.5 py-1 rounded-lg text-slate-950"
                      style={{ background: tab.color }}
                    >
                      Get License
                    </button>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="mt-8">
          {userId && activeTab === "rlhf" && (
            <RLHFSection
              userId={userId}
              license={rlhfLic}
              onEarned={handleEarned}
            />
          )}
          {userId && activeTab === "gpu" && (
            <GPUAllocationSection
              userId={userId}
              license={gpuLic}
              onEarned={handleEarned}
            />
          )}
          {activeTab === "thermal" && (
            <div className="space-y-4">
              {!thermalLic ? (
                <div
                  className="rounded-2xl p-8 text-center"
                  style={{
                    background: "rgba(245,158,11,0.06)",
                    border: "1px solid rgba(245,158,11,0.2)",
                  }}
                >
                  <Lock size={28} className="text-amber-400 mx-auto mb-3" />
                  <p className="text-white font-black text-base">
                    Thermal Calibration License Required
                  </p>
                  <p className="text-slate-400 text-sm mt-2 mb-4">
                    Purchase the Thermal & Neural Operator License ($200) to
                    access hardware optimization tasks.
                  </p>
                  <button
                    onClick={() => setPurchaseModal("thermal_optimization")}
                    className="px-6 py-3 rounded-xl font-black text-slate-950 text-sm"
                    style={{ background: "#f59e0b" }}
                  >
                    Get License — $200
                  </button>
                </div>
              ) : (
                <div
                  className="rounded-2xl p-5"
                  style={{
                    background: "rgba(245,158,11,0.06)",
                    border: "1px solid rgba(245,158,11,0.2)",
                  }}
                >
                  <p className="text-amber-300 font-black text-sm flex items-center gap-2">
                    <Thermometer size={14} /> Thermal Calibration Tasks
                  </p>
                  <p className="text-slate-400 text-xs mt-2">
                    Complete hardware optimization tasks on your GPU node. Tasks
                    refresh every 30 minutes.
                  </p>
                  <div className="mt-4 space-y-3">
                    {[
                      {
                        name: "Thermal Cooling Calibration",
                        desc: "Your GPU node requires daily thermal management to sustain peak efficiency.",
                        reward: "$0.50",
                        ready: true,
                      },
                      {
                        name: "Neural Weight Re-alignment",
                        desc: "Re-align your node's neural inference weights to reduce latency drift.",
                        reward: "$0.50",
                        ready: false,
                      },
                    ].map((task, i) => (
                      <div
                        key={i}
                        className="rounded-xl p-4"
                        style={{
                          background: "rgba(15,23,42,0.8)",
                          border: "1px solid rgba(245,158,11,0.1)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-white font-bold text-sm">
                              {task.name}
                            </p>
                            <p className="text-slate-500 text-xs mt-1">
                              {task.desc}
                            </p>
                          </div>
                          <span className="text-amber-400 font-black text-sm shrink-0">
                            {task.reward}
                          </span>
                        </div>
                        <button
                          disabled={!task.ready}
                          className="mt-3 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50"
                          style={{
                            borderColor: task.ready ? "#f59e0b40" : "#334155",
                            color: task.ready ? "#f59e0b" : "#475569",
                          }}
                        >
                          {task.ready ? (
                            <>
                              <CheckCircle size={10} /> Start Task
                            </>
                          ) : (
                            <>
                              <Clock size={10} /> Ready 00:30:00
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
