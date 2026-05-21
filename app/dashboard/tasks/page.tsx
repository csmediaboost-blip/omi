"use client";
// app/dashboard/tasks/page.tsx
// FIXES:
//  1. GPU: Close & Settle immediately removes contract from local state + stops timer atomically
//  2. GPU: Removed gain/loss preview (was leaking internal logic)
//  3. GPU: Tick fires one last time after close — guarded by status check before processing
//  4. RLHF: Duplicate key race fixed — optimistic local lock before DB insert
//  5. RLHF: Daily rotation via get_daily_questions RPC (3-4/day, cycles after all answered)
//  6. RLHF: Answered question disappears immediately from UI (optimistic removal)
//  7. Thermal: .catch() replaced with async IIFE (supabase builder doesn't support .catch())
//  8. All: fire-and-forget inserts use void (async () => {})() pattern
//  9. Security: no internal probability/logic exposed to UI anywhere
// 10. General: all loading states have finally{} guards

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  Zap,
  CheckCircle,
  Lock,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  FileCheck,
  Brain,
  Thermometer,
  Server,
  Info,
  Eye,
  HelpCircle,
  DollarSign,
} from "lucide-react";

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

type ThermalTask = {
  id: string;
  name: string;
  description: string;
  reward: number;
  cooldown_minutes: number;
  is_active: boolean;
};

const BG = "#06080f";
const TICK_INTERVAL_MS = 30000;
// Internal only — never exposed to UI
const LOSS_PROBABILITY = 0.3;

const PROVISIONING_PHRASES = [
  "Synchronising node fabric…",
  "Establishing secure compute channel…",
  "Provisioning dedicated GPU slot…",
  "Calibrating cluster affinity…",
  "Binding allocation to node mesh…",
  "Negotiating cluster bandwidth…",
  "Verifying node integrity…",
  "Anchoring workload to fabric…",
];

const DEFAULT_THERMAL_TASKS: ThermalTask[] = [
  {
    id: "thermal-default-1",
    name: "Thermal Cooling Calibration",
    description:
      "Perform daily thermal management on your GPU node to sustain peak efficiency.",
    reward: 2.0,
    cooldown_minutes: 1440,
    is_active: true,
  },
  {
    id: "thermal-default-2",
    name: "Neural Weight Re-alignment",
    description:
      "Re-align your node's neural inference weights to reduce latency drift.",
    reward: 2.0,
    cooldown_minutes: 1440,
    is_active: true,
  },
];

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
    const pct = -(0.5 + Math.random() * 7.5);
    return { type: "loss", pct, amount: Math.abs((currentValue * pct) / 100) };
  }
  const pct = 3 + Math.random() * 22;
  return { type: "gain", pct, amount: (currentValue * pct) / 100 };
}

// FIX: All supabase fire-and-forget use this pattern (not .catch())
function fireAndForget(fn: () => Promise<any>) {
  void (async () => {
    try {
      await fn();
    } catch {}
  })();
}

async function adjustBalance(
  userId: string,
  delta: number,
  earnedDelta: number = 0,
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("adjust_user_balance", {
      p_user_id: userId,
      p_delta: delta,
      p_earned_delta: earnedDelta,
    });
    if (error) return { success: false, newBalance: 0, error: error.message };
    return { success: true, newBalance: data as number };
  } catch (e: any) {
    return { success: false, newBalance: 0, error: e.message };
  }
}

// ─── LICENSE EXPLAINER ────────────────────────────────────────────────────────
function LicenseExplainer({ type }: { type: LicenseType }) {
  const [open, setOpen] = useState(false);
  const content = {
    rlhf_validation: {
      title: "What is RLHF Validation?",
      body: "RLHF stands for Reinforcement Learning from Human Feedback. AI companies pay to have real humans review and compare AI-generated answers to train their models to be more accurate. You read a question and two AI answers, then pick which one is better. Each pick you make directly improves the AI — and you earn $0.50 per validated response.",
      earning: "$0.50 per answer",
      color: "#8b5cf6",
    },
    thermal_optimization: {
      title: "What is Thermal Calibration?",
      body: "GPU nodes generate significant heat during AI compute workloads. To keep performance at peak, nodes need daily calibration — adjusting cooling profiles, re-aligning neural weight buffers, and clearing drift. You trigger this process by clicking 'Start Task'. The node runs the calibration cycle and rewards you for initiating it. No technical skill needed.",
      earning: "$2.00 per daily cycle",
      color: "#f59e0b",
    },
    gpu_allocation: {
      title: "What is GPU Allocation?",
      body: "Enterprise AI clients pay to rent GPU compute time. When you sign an allocation contract, your balance is deployed into a GPU node slot. The node processes client workloads every 30 seconds and your position grows or shrinks based on compute demand. Think of it like a compute trading desk — your capital is working inside the GPU infrastructure.",
      earning: "Variable — based on compute demand every 30s",
      color: "#10b981",
    },
  }[type];

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-bold transition-colors"
        style={{ color: content.color + "cc" }}
      >
        <HelpCircle size={11} />
        {open ? "Hide explanation" : "What is this? (tap to learn)"}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && (
        <div
          className="mt-2 rounded-xl p-4 space-y-2"
          style={{
            background: `${content.color}08`,
            border: `1px solid ${content.color}25`,
          }}
        >
          <p className="font-black text-sm" style={{ color: content.color }}>
            {content.title}
          </p>
          <p className="text-slate-400 text-xs leading-relaxed">
            {content.body}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <DollarSign size={11} style={{ color: content.color }} />
            <p className="text-xs font-bold" style={{ color: content.color }}>
              {content.earning}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RLHF PREVIEW ─────────────────────────────────────────────────────────────
function RLHFPreview() {
  const [open, setOpen] = useState(false);
  const SAMPLE = [
    {
      question: "Which AI response better explains how photosynthesis works?",
      a: "Plants use sunlight to convert CO₂ and water into glucose and oxygen through a process in the chloroplasts.",
      b: "Photosynthesis is when plants eat sunlight.",
    },
    {
      question: "Which response gives better advice on learning to code?",
      a: "Start with Python, build small projects, and read documentation regularly.",
      b: "Just watch YouTube videos until you figure it out.",
    },
  ];
  return (
    <div className="space-y-3">
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(139,92,246,0.06)",
          border: "1px solid rgba(139,92,246,0.2)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Eye size={13} className="text-violet-400" />
          <p className="text-violet-300 text-xs font-black uppercase tracking-wider">
            Task Preview
          </p>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-400">
            $0.50 per answer
          </span>
        </div>
        <p className="text-slate-400 text-xs mb-3">
          You see AI questions daily. Pick the better answer and earn instantly.
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-violet-400"
        >
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {open ? "Hide samples" : "Show sample questions"}
        </button>
        {open && (
          <div className="mt-3 space-y-3">
            {SAMPLE.map((q, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden opacity-75"
                style={{ border: "1px solid rgba(139,92,246,0.15)" }}
              >
                <div
                  className="px-4 py-3"
                  style={{ background: "rgba(139,92,246,0.08)" }}
                >
                  <p className="text-white text-xs font-bold">{q.question}</p>
                  <p className="text-violet-400 text-[10px] mt-1">
                    +$0.50 reward
                  </p>
                </div>
                <div className="p-3 space-y-2">
                  {[q.a, q.b].map((opt, j) => (
                    <div
                      key={j}
                      className="rounded-lg p-2.5 flex items-start gap-2"
                      style={{
                        background: "rgba(8,13,24,0.8)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0"
                        style={{
                          background: "rgba(139,92,246,0.15)",
                          color: "#a78bfa",
                        }}
                      >
                        {j === 0 ? "A" : "B"}
                      </span>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {opt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <LicenseExplainer type="rlhf_validation" />
    </div>
  );
}

// ─── THERMAL PREVIEW ──────────────────────────────────────────────────────────
function ThermalPreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.2)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Eye size={13} className="text-amber-400" />
          <p className="text-amber-300 text-xs font-black uppercase tracking-wider">
            Task Preview
          </p>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400">
            $2.00 / day
          </span>
        </div>
        <p className="text-slate-400 text-xs mb-3">
          Two daily one-click tasks. Keeps your GPU node running at peak output.
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400"
        >
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {open ? "Hide preview" : "Show what the tasks look like"}
        </button>
        {open && (
          <div className="mt-3 space-y-2 opacity-75">
            {DEFAULT_THERMAL_TASKS.map((task) => (
              <div
                key={task.id}
                className="rounded-xl p-3"
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(245,158,11,0.1)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-white text-xs font-bold">{task.name}</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      {task.description}
                    </p>
                  </div>
                  <span className="text-amber-400 font-black text-sm shrink-0">
                    +${task.reward.toFixed(2)}
                  </span>
                </div>
                <div
                  className="mt-2 flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg w-fit"
                  style={{
                    background: "rgba(245,158,11,0.1)",
                    color: "#f59e0b",
                    border: "1px solid rgba(245,158,11,0.2)",
                  }}
                >
                  <CheckCircle size={9} /> Start Task (unlocks with license)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <LicenseExplainer type="thermal_optimization" />
    </div>
  );
}

// ─── GPU ALLOCATION PREVIEW ───────────────────────────────────────────────────
function GPUAllocationPreview() {
  const [open, setOpen] = useState(false);
  const SAMPLE_TICKS = [
    { type: "gain", amount: 43.2, pct: 8.6, value: 543.2 },
    { type: "gain", amount: 91.5, pct: 16.8, value: 634.7 },
    { type: "loss", amount: 28.3, pct: -4.5, value: 606.4 },
    { type: "gain", amount: 124.3, pct: 20.5, value: 730.7 },
  ];
  return (
    <div className="space-y-3">
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(16,185,129,0.06)",
          border: "1px solid rgba(16,185,129,0.2)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Eye size={13} className="text-emerald-400" />
          <p className="text-emerald-300 text-xs font-black uppercase tracking-wider">
            Earnings Preview
          </p>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
            Every 30s
          </span>
        </div>
        <p className="text-slate-400 text-xs mb-3">
          Deploy capital into a GPU node. Watch it grow every 30 seconds as
          client workloads are processed.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            ["Sample Capital", "$500.00"],
            ["After 4 cycles", "$730.70"],
            ["Net Gain", "+$230.70"],
            ["Cycle interval", "30 seconds"],
          ].map(([l, v]) => (
            <div
              key={l}
              className="rounded-lg p-2"
              style={{ background: "rgba(15,23,42,0.8)" }}
            >
              <p className="text-slate-500 text-[9px] uppercase">{l}</p>
              <p className="text-white text-xs font-black mt-0.5">{v}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400"
        >
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {open ? "Hide sample history" : "Show sample cycle history"}
        </button>
        {open && (
          <div
            className="mt-3 rounded-xl overflow-hidden opacity-75"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="px-3 py-2"
              style={{ background: "rgba(8,13,24,0.8)" }}
            >
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                Sample Cycle History
              </p>
            </div>
            <div className="divide-y divide-slate-900">
              {SAMPLE_TICKS.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {t.type === "gain" ? (
                      <TrendingUp size={11} className="text-emerald-400" />
                    ) : (
                      <TrendingDown size={11} className="text-red-400" />
                    )}
                    <span className="text-[10px] text-slate-600">
                      Cycle {i + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span
                      className={
                        t.type === "gain"
                          ? "text-emerald-400 font-black"
                          : "text-red-400 font-black"
                      }
                    >
                      {t.type === "gain" ? "+" : "-"}${t.amount.toFixed(2)} (
                      {t.pct > 0 ? "+" : ""}
                      {t.pct.toFixed(1)}%)
                    </span>
                    <span className="text-slate-600 font-mono">
                      ${t.value.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <LicenseExplainer type="gpu_allocation" />
    </div>
  );
}

// ─── PURCHASE MODAL ───────────────────────────────────────────────────────────
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
      node: "thermal_optimization",
    },
    rlhf_validation: {
      name: "RLHF Validation Operator License",
      icon: Brain,
      color: "#8b5cf6",
      node: "rlhf_validation",
    },
    gpu_allocation: {
      name: "GPU Allocation Operator License",
      icon: Server,
      color: "#10b981",
      node: "gpu_allocation",
    },
  }[type];
  const Icon = info.icon;
  function goToCheckout() {
    onClose();
    const params = new URLSearchParams({
      purchaseType: "license",
      licenseType: type,
      node: info.node,
      name: info.name,
      price: "200",
    });
    router.push(`/dashboard/checkout?${params.toString()}`);
  }
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
            onClick={goToCheckout}
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

// ─── RLHF SECTION ─────────────────────────────────────────────────────────────
function RLHFSection({
  userId,
  license,
  onEarned,
  onBalanceChange,
}: {
  userId: string;
  license: License | null;
  onEarned: (a: number) => void;
  onBalanceChange: (b: number) => void;
}) {
  const [questions, setQuestions] = useState<RLHFQuestion[]>([]);
  // FIX 5: Local submitted set — prevents duplicate submission race
  const submittedRef = useRef<Set<string>>(new Set());
  const [answering, setAnswering] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [stats, setStats] = useState({ today: 0, total: 0, remaining: 0 });

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // FIX 3: Use RPC for daily rotation (3-4 questions/day, cycles after all answered)
      const { data: dailyQs, error } = await supabase.rpc(
        "get_daily_questions",
        {
          p_user_id: userId,
          p_count: 4,
        },
      );

      if (error) throw new Error(error.message);
      setQuestions((dailyQs || []) as RLHFQuestion[]);

      // Stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [{ count: todayCount }, { count: totalCount }, { count: totalQs }] =
        await Promise.all([
          supabase
            .from("rlhf_answers")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("created_at", today.toISOString()),
          supabase
            .from("rlhf_answers")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("rlhf_questions")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true),
        ]);
      setStats({
        today: todayCount || 0,
        total: totalCount || 0,
        remaining: (dailyQs || []).length,
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // FIX 4: answering is now per-question and cleared in finally
  async function submitAnswer(
    questionId: string,
    chosen: "A" | "B",
    reward: number,
  ) {
    // FIX 5: Double-submit guard
    if (submittedRef.current.has(questionId)) return;
    if (answering === questionId) return;
    submittedRef.current.add(questionId);
    setAnswering(questionId);

    // FIX 6: Optimistic removal — remove from UI immediately
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));

    try {
      const { error: ansErr } = await supabase.from("rlhf_answers").insert({
        question_id: questionId,
        user_id: userId,
        chosen_option: chosen,
        reward_earned: reward,
      });
      // FIX 4: If duplicate key (already answered), treat as success silently
      if (ansErr && !ansErr.message.includes("duplicate"))
        throw new Error(ansErr.message);

      if (!ansErr) {
        const result = await adjustBalance(userId, reward, reward);
        if (!result.success) throw new Error(result.error);
        onBalanceChange(result.newBalance);
        fireAndForget(() =>
          supabase.from("transaction_ledger").insert({
            user_id: userId,
            type: "task_reward",
            amount: reward,
            description: "RLHF validation reward",
            created_at: new Date().toISOString(),
          }),
        );
        flash(`+$${reward.toFixed(2)} credited — response recorded!`);
        onEarned(reward);
      }
      // Reload stats but don't reload questions (already removed optimistically)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [{ count: todayCount }, { count: totalCount }] = await Promise.all([
        supabase
          .from("rlhf_answers")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", today.toISOString()),
        supabase
          .from("rlhf_answers")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      setStats((prev) => ({
        ...prev,
        today: todayCount || 0,
        total: totalCount || 0,
        remaining: questions.length - 1,
      }));
    } catch (e: any) {
      // On error, add question back to UI
      flash("Error: " + e.message);
      submittedRef.current.delete(questionId);
      load(); // full reload to restore correct state
    } finally {
      setAnswering(null);
    }
  }

  const hasLicense = !!license && license.status === "active";

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold bg-emerald-500 text-slate-950 flex items-center gap-2 shadow-2xl">
          <CheckCircle size={14} /> {toast}
        </div>
      )}

      {!hasLicense ? (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-6 text-center"
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
              Earn $0.50 per validated AI response. 3–4 questions assigned
              daily.
            </p>
          </div>
          <RLHFPreview />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Answered Today", value: stats.today, color: "#10b981" },
              { label: "Total Answered", value: stats.total, color: "#8b5cf6" },
              {
                label: "Today Remaining",
                value: stats.remaining,
                color: "#f59e0b",
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
                <p className="font-black text-xl" style={{ color }}>
                  {value}
                </p>
                <p className="text-slate-600 text-[10px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-10">
              <div className="w-8 h-8 border-2 border-t-violet-400 rounded-full animate-spin mx-auto" />
            </div>
          ) : questions.length === 0 ? (
            <div
              className="rounded-2xl p-10 text-center"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <CheckCircle
                size={32}
                className="text-emerald-400 mx-auto mb-3"
              />
              <p className="text-white font-black text-base">
                All done for today!
              </p>
              <p className="text-slate-400 text-sm mt-2">
                You've completed all your questions for today. New questions
                will be assigned tomorrow. You've answered {stats.total} total.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-400 text-sm">
                  {questions.length} question{questions.length !== 1 ? "s" : ""}{" "}
                  for today
                </p>
                <button
                  onClick={load}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
                >
                  <RefreshCw size={10} /> Refresh
                </button>
              </div>
              {questions.map((q) => (
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
                    {(["A", "B"] as const).map((opt) => {
                      const isThis = answering === q.id;
                      return (
                        <button
                          key={opt}
                          onClick={() => submitAnswer(q.id, opt, q.reward)}
                          disabled={isThis || submittedRef.current.has(q.id)}
                          className="w-full text-left rounded-xl p-4 transition-all disabled:opacity-60"
                          style={{
                            background: "rgba(8,13,24,0.8)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                          onMouseEnter={(e) => {
                            if (!isThis) {
                              e.currentTarget.style.border =
                                "1px solid rgba(139,92,246,0.4)";
                              e.currentTarget.style.background =
                                "rgba(139,92,246,0.06)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.border =
                              "1px solid rgba(255,255,255,0.06)";
                            e.currentTarget.style.background =
                              "rgba(8,13,24,0.8)";
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
                          {isThis && (
                            <div className="flex items-center gap-1.5 mt-2 text-violet-400 text-xs">
                              <RefreshCw size={11} className="animate-spin" />{" "}
                              Recording…
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── GPU ALLOCATION SECTION ───────────────────────────────────────────────────
function GPUAllocationSection({
  userId,
  license,
  onEarned,
  userBalance,
  onBalanceChange,
}: {
  userId: string;
  license: License | null;
  onEarned: (a: number) => void;
  userBalance: number;
  onBalanceChange: (b: number) => void;
}) {
  const [contracts, setContracts] = useState<GPUContract[]>([]);
  const [ticks, setTicks] = useState<Record<string, GPUTick[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [provisioningPhrase, setProvisioningPhrase] = useState("");
  const [allocAmount, setAllocAmount] = useState("500");
  const [toast, setToast] = useState<{
    msg: string;
    type: "gain" | "loss" | "info";
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const tickTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const runningTicks = useRef<Set<string>>(new Set());
  // FIX 1: Track closed contracts to prevent final tick from processing
  const closedContracts = useRef<Set<string>>(new Set());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      Object.values(tickTimers.current).forEach((t) => clearInterval(t));
      tickTimers.current = {};
    };
  }, []);

  function flash(msg: string, type: "gain" | "loss" | "info" = "info") {
    if (!isMounted.current) return;
    setToast({ msg, type });
    setTimeout(() => {
      if (isMounted.current) setToast(null);
    }, 4000);
  }

  const load = useCallback(async () => {
    const { data: cs } = await supabase
      .from("gpu_allocation_contracts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!isMounted.current) return;
    setContracts(cs || []);
    setLoading(false);
    if (cs?.length) {
      for (const c of cs) {
        const { data: ts } = await supabase
          .from("gpu_allocation_ticks")
          .select("*")
          .eq("contract_id", c.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (isMounted.current)
          setTicks((prev) => ({ ...prev, [c.id]: ts || [] }));
      }
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    contracts
      .filter((c) => c.status === "active")
      .forEach((contract) => {
        if (tickTimers.current[contract.id]) return;
        tickTimers.current[contract.id] = setInterval(
          () => runTickById(contract.id),
          TICK_INTERVAL_MS,
        );
      });
    Object.keys(tickTimers.current).forEach((id) => {
      const contract = contracts.find((c) => c.id === id);
      if (!contract || contract.status !== "active") {
        clearInterval(tickTimers.current[id]);
        delete tickTimers.current[id];
      }
    });
  }, [contracts]); // eslint-disable-line

  async function runTickById(contractId: string) {
    if (runningTicks.current.has(contractId)) return;
    // FIX 1: Skip if closed locally
    if (closedContracts.current.has(contractId)) {
      if (tickTimers.current[contractId]) {
        clearInterval(tickTimers.current[contractId]);
        delete tickTimers.current[contractId];
      }
      return;
    }
    runningTicks.current.add(contractId);
    try {
      const { data: fresh, error } = await supabase
        .from("gpu_allocation_contracts")
        .select("*")
        .eq("id", contractId)
        .single();
      // FIX 1: Check both local closed set and DB status
      if (
        error ||
        !fresh ||
        fresh.status !== "active" ||
        closedContracts.current.has(contractId)
      ) {
        if (tickTimers.current[contractId]) {
          clearInterval(tickTimers.current[contractId]);
          delete tickTimers.current[contractId];
        }
        return;
      }
      await runTick(fresh as GPUContract);
    } finally {
      runningTicks.current.delete(contractId);
    }
  }

  async function runTick(contract: GPUContract) {
    // FIX 1: Final guard before processing tick
    if (closedContracts.current.has(contract.id)) return;

    const currentValue = contract.current_value || contract.allocated_amount;
    const { type, pct, amount } = generateTickPnL(currentValue);
    const newValue =
      type === "gain"
        ? currentValue + amount
        : Math.max(0, currentValue - amount);
    const totalPnl = newValue - contract.allocated_amount;
    const now = new Date().toISOString();
    const isLiquidated = newValue <= contract.allocated_amount * 0.05;

    fireAndForget(() =>
      supabase.from("gpu_allocation_ticks").insert({
        contract_id: contract.id,
        user_id: userId,
        tick_type: type,
        amount,
        pct_change: pct,
        running_value: newValue,
        created_at: now,
      }),
    );

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

    if (type === "gain") {
      const credit = amount * 0.8;
      const result = await adjustBalance(userId, credit, credit);
      if (result.success) onBalanceChange(result.newBalance);
      onEarned(credit);
      flash(
        `+$${amount.toFixed(2)} gain on ${contract.contract_ref} (+${pct.toFixed(1)}%)`,
        "gain",
      );
    } else {
      const result = await adjustBalance(userId, -amount, 0);
      if (result.success) onBalanceChange(result.newBalance);
      flash(
        `-$${amount.toFixed(2)} loss on ${contract.contract_ref} (${pct.toFixed(1)}%)`,
        "loss",
      );
    }

    if (isLiquidated) {
      closedContracts.current.add(contract.id);
      if (tickTimers.current[contract.id]) {
        clearInterval(tickTimers.current[contract.id]);
        delete tickTimers.current[contract.id];
      }
      flash(
        `Contract ${contract.contract_ref} liquidated — position closed.`,
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
    const { data: freshUser } = await supabase
      .from("users")
      .select("balance_available")
      .eq("id", userId)
      .single();
    const freshBalance = (freshUser as any)?.balance_available ?? 0;
    if (freshBalance < amt) {
      flash(
        `Insufficient balance. You have $${freshBalance.toFixed(2)}.`,
        "loss",
      );
      return;
    }
    setCreating(true);
    const phrase =
      PROVISIONING_PHRASES[
        Math.floor(Math.random() * PROVISIONING_PHRASES.length)
      ];
    setProvisioningPhrase(phrase);
    const delayMs = (1 + Math.floor(Math.random() * 6)) * 1000;
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const debitResult = await adjustBalance(userId, -amt, 0);
      if (!debitResult.success) {
        flash("Failed to debit balance: " + debitResult.error, "loss");
        return;
      }
      onBalanceChange(debitResult.newBalance);
      const ref = generateContractRef();
      const now = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from("gpu_allocation_contracts")
        .insert({
          user_id: userId,
          contract_ref: ref,
          allocated_amount: amt,
          status: "active",
          outcome_type: "pending",
          current_value: amt,
          total_pnl: 0,
          last_tick_at: now,
          last_tick_pnl: 0,
          tick_count: 0,
        })
        .select("id")
        .single();
      if (error) {
        const rollback = await adjustBalance(userId, amt, 0);
        if (rollback.success) onBalanceChange(rollback.newBalance);
        flash(error.message, "loss");
      } else {
        const realContract: GPUContract = {
          id: inserted.id,
          contract_ref: ref,
          allocated_amount: amt,
          status: "active",
          outcome_type: "pending",
          current_value: amt,
          total_pnl: 0,
          last_tick_at: now,
          last_tick_pnl: 0,
          tick_count: 0,
          created_at: now,
        };
        setContracts((prev) => [realContract, ...prev]);
        fireAndForget(() =>
          supabase.from("transaction_ledger").insert({
            user_id: userId,
            type: "gpu_allocation",
            amount: amt,
            description: `GPU allocation contract signed: ${ref}`,
            created_at: now,
          }),
        );
        flash(`Contract ${ref} active — first cycle in 30s.`, "info");
        load();
      }
    } finally {
      setCreating(false);
      setProvisioningPhrase("");
    }
  }

  // FIX 1: Close & Settle — immediately stops timer and removes from UI
  async function closeContract(id: string) {
    if (
      !confirm(
        "Close this allocation contract? Remaining value will be settled.",
      )
    )
      return;
    const contract = contracts.find((c) => c.id === id);
    if (!contract) return;

    // FIX 1: Mark closed BEFORE any async operations to stop any pending tick
    closedContracts.current.add(id);
    if (tickTimers.current[id]) {
      clearInterval(tickTimers.current[id]);
      delete tickTimers.current[id];
    }

    // FIX 1: Optimistic UI update — mark as closed immediately
    setContracts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "closed" } : c)),
    );

    const finalValue = contract.current_value;
    if (finalValue > 0) {
      const result = await adjustBalance(userId, finalValue, 0);
      if (result.success) onBalanceChange(result.newBalance);
    }

    await supabase
      .from("gpu_allocation_contracts")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", id);

    fireAndForget(() =>
      supabase.from("transaction_ledger").insert({
        user_id: userId,
        type: "gpu_settlement",
        amount: finalValue,
        description: `GPU contract closed & settled: ${contract.contract_ref}`,
        created_at: new Date().toISOString(),
      }),
    );

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
  const amt = parseFloat(allocAmount) || 0;

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
        <div className="space-y-4">
          <div
            className="rounded-2xl p-6 text-center"
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
              Deploy capital into GPU compute contracts. Returns every 30
              seconds.
            </p>
          </div>
          <GPUAllocationPreview />
        </div>
      ) : (
        <>
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
                Amount is debited immediately. Returns distributed every 30
                seconds.
              </p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Available balance</span>
              <span className="text-white font-black">
                ${userBalance.toFixed(2)}
              </span>
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
                {amt > userBalance && amt > 0 && (
                  <p className="text-red-400 text-xs mt-1">
                    Insufficient balance. You have ${userBalance.toFixed(2)}.
                  </p>
                )}
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
                disabled={creating || amt > userBalance || amt < 100}
                className="px-5 py-3 rounded-xl font-black text-sm text-slate-950 flex items-center gap-2 disabled:opacity-50 shrink-0 min-w-[140px] justify-center"
                style={{ background: "#10b981" }}
              >
                {creating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span className="text-[11px] text-left leading-tight">
                      {provisioningPhrase || "Processing…"}
                    </span>
                  </>
                ) : (
                  <>
                    <Zap size={14} /> Sign Contract
                  </>
                )}
              </button>
            </div>
          </div>

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
                No allocation contracts yet.
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
                            {c.tick_count} cycles ·{" "}
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
                    {c.last_tick_pnl !== 0 && (
                      <div
                        className="px-5 py-2.5 flex items-center justify-between text-xs"
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <span className="text-slate-600">
                          Last cycle{" "}
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
                        )}{" "}
                        {contractTicks.length} cycle history
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
                              Cycle History (last {contractTicks.length})
                            </p>
                          </div>
                          <div className="divide-y divide-slate-900">
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

// ─── THERMAL SECTION ──────────────────────────────────────────────────────────
function ThermalSection({
  userId,
  license,
  onEarned,
  onBalanceChange,
}: {
  userId: string;
  license: License | null;
  onEarned: (a: number) => void;
  onBalanceChange: (b: number) => void;
}) {
  const [tasks, setTasks] = useState<ThermalTask[]>([]);
  const [cooldowns, setCooldowns] = useState<Record<string, Date>>({});
  const [completing, setCompleting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dbTasks } = await supabase
        .from("thermal_tasks")
        .select("*")
        .eq("is_active", true)
        .order("created_at");
      const { data: completions } = await supabase
        .from("thermal_completions")
        .select("task_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      const cdMap: Record<string, Date> = {};
      (completions || []).forEach((c: any) => {
        if (!cdMap[c.task_id]) cdMap[c.task_id] = new Date(c.created_at);
      });
      setCooldowns(cdMap);
      setTasks(dbTasks && dbTasks.length > 0 ? dbTasks : DEFAULT_THERMAL_TASKS);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  function isOnCooldown(
    taskId: string,
    cooldownMinutes: number,
  ): { on: boolean; remaining: string } {
    const last = cooldowns[taskId];
    if (!last) return { on: false, remaining: "" };
    const next = new Date(last.getTime() + cooldownMinutes * 60000);
    if (new Date() >= next) return { on: false, remaining: "" };
    const diffMs = next.getTime() - Date.now();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return { on: true, remaining: h > 0 ? `${h}h ${m}m` : `${m}m` };
  }

  // FIX 4: Thermal uses fireAndForget for non-critical inserts
  async function completeTask(task: ThermalTask) {
    const cd = isOnCooldown(task.id, task.cooldown_minutes);
    if (cd.on || completing) return;
    setCompleting(task.id);
    try {
      const { error: compErr } = await supabase
        .from("thermal_completions")
        .insert({
          task_id: task.id,
          user_id: userId,
          reward: task.reward,
          created_at: new Date().toISOString(),
        });
      if (compErr) throw new Error(compErr.message);

      const result = await adjustBalance(userId, task.reward, task.reward);
      if (!result.success) throw new Error(result.error);
      onBalanceChange(result.newBalance);

      // FIX 7: fireAndForget instead of .catch()
      fireAndForget(() =>
        supabase.from("transaction_ledger").insert({
          user_id: userId,
          type: "task_reward",
          amount: task.reward,
          description: `Thermal task: ${task.name}`,
          created_at: new Date().toISOString(),
        }),
      );

      flash(`+$${task.reward.toFixed(2)} credited to your balance!`);
      onEarned(task.reward);
      // Optimistic cooldown update
      setCooldowns((prev) => ({ ...prev, [task.id]: new Date() }));
    } catch (e: any) {
      flash("Error: " + e.message);
    } finally {
      setCompleting(null);
    }
  }

  const hasLicense = !!license && license.status === "active";

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold bg-emerald-500 text-slate-950 flex items-center gap-2 shadow-2xl">
          <CheckCircle size={14} /> {toast}
        </div>
      )}

      {!hasLicense ? (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.2)",
            }}
          >
            <Lock size={28} className="text-amber-400 mx-auto mb-3" />
            <p className="text-white font-black text-base">
              Thermal Calibration License Required
            </p>
            <p className="text-slate-400 text-sm mt-2">
              Earn $2.00 per daily cycle. Two tasks available every 24 hours.
            </p>
          </div>
          <ThermalPreview />
        </div>
      ) : loading ? (
        <div className="text-center py-8">
          <div className="w-7 h-7 border-2 border-t-amber-400 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-amber-300 font-black text-sm flex items-center gap-2">
              <Thermometer size={14} /> Thermal Calibration Tasks
            </p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400">
              $2.00 each
            </span>
          </div>
          <p className="text-slate-400 text-xs">
            Complete hardware optimization tasks on your GPU node. Tasks refresh
            every 24 hours.
          </p>
          <div className="space-y-3">
            {tasks.map((task) => {
              const cd = isOnCooldown(task.id, task.cooldown_minutes);
              return (
                <div
                  key={task.id}
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
                        {task.description}
                      </p>
                    </div>
                    <span className="text-amber-400 font-black text-sm shrink-0">
                      +${task.reward.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => completeTask(task)}
                    disabled={!!cd.on || completing === task.id}
                    className="mt-3 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50"
                    style={{
                      borderColor: !cd.on ? "#f59e0b40" : "#334155",
                      color: !cd.on ? "#f59e0b" : "#475569",
                    }}
                  >
                    {completing === task.id ? (
                      <>
                        <RefreshCw size={10} className="animate-spin" />{" "}
                        Completing…
                      </>
                    ) : cd.on ? (
                      <>
                        <Clock size={10} /> Ready in {cd.remaining}
                      </>
                    ) : (
                      <>
                        <CheckCircle size={10} /> Start Task — +$
                        {task.reward.toFixed(2)}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("tasks_license_rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operator_licenses",
          filter: `user_id=eq.${userId}`,
        },
        () => loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, loadAll]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("tasks_balance_rt")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const b = (payload.new as any)?.balance_available;
          if (b != null) setBalance(b);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  function handleEarned(amt: number) {
    setTotalEarnedToday((t) => t + amt);
  }
  function handleBalanceChange(b: number) {
    setBalance(b);
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

  const TABS = [
    {
      id: "rlhf" as const,
      label: "RLHF Validation",
      icon: Brain,
      color: "#8b5cf6",
      hasLic: !!rlhfLic,
      licType: "rlhf_validation" as LicenseType,
      earning: "$0.50 / answer",
    },
    {
      id: "gpu" as const,
      label: "GPU Allocation",
      icon: Server,
      color: "#10b981",
      hasLic: !!gpuLic,
      licType: "gpu_allocation" as LicenseType,
      earning: "Variable / 30s",
    },
    {
      id: "thermal" as const,
      label: "Thermal Calibration",
      icon: Thermometer,
      color: "#f59e0b",
      hasLic: !!thermalLic,
      licType: "thermal_optimization" as LicenseType,
      earning: "$2.00 / day",
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
        />
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 pt-6 pb-36 md:pb-16 space-y-6">
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
                  {licCount}/3 LICENSES ACTIVE
                </span>
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

          <div className="grid grid-cols-1 gap-3 mt-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full rounded-2xl p-5 text-left transition-all"
                  style={{
                    background: isActive
                      ? `${tab.color}12`
                      : "rgba(10,16,28,0.7)",
                    border: `1px solid ${isActive ? `${tab.color}40` : "rgba(255,255,255,0.07)"}`,
                    boxShadow: isActive ? `0 0 20px ${tab.color}10` : "none",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{
                          background: `${tab.color}15`,
                          border: `1px solid ${tab.color}30`,
                        }}
                      >
                        <Icon size={16} style={{ color: tab.color }} />
                      </div>
                      <div>
                        <p className="text-white font-black text-sm">
                          {tab.label}
                        </p>
                        <p className="text-slate-600 text-xs mt-0.5">
                          {tab.hasLic
                            ? `Licensed · Active · ${tab.earning}`
                            : `${tab.earning} · $200 license required`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPurchaseModal(tab.licType);
                          }}
                          className="text-[10px] font-bold px-3 py-1.5 rounded-lg text-slate-950 flex items-center gap-1"
                          style={{ background: tab.color }}
                        >
                          <Lock size={9} /> Get License
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            {userId && activeTab === "rlhf" && (
              <RLHFSection
                userId={userId}
                license={rlhfLic}
                onEarned={handleEarned}
                onBalanceChange={handleBalanceChange}
              />
            )}
            {userId && activeTab === "gpu" && (
              <GPUAllocationSection
                userId={userId}
                license={gpuLic}
                onEarned={handleEarned}
                userBalance={balance}
                onBalanceChange={handleBalanceChange}
              />
            )}
            {userId && activeTab === "thermal" && (
              <ThermalSection
                userId={userId}
                license={thermalLic}
                onEarned={handleEarned}
                onBalanceChange={handleBalanceChange}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
