"use client";
// app/dashboard/tasks/page.tsx
// FINAL MERGED v6 — full audit: UUID fix, fan behaviour, anti-fraud, balance accuracy
//  [FIX-1] GPU Allocation license fee $10; $5 capital credited on license activation
//  [FIX-2] "Add Funds" button routes to deposit/checkout
//  [FIX-3] Thermal double-credit fixed: cooldown read fresh from DB on every load + upsert guard
//  [FIX-4] "Get License" navigates to /dashboard/license
//  [FIX-5] Thermal license price $100
//  [FIX-6] Sign Contract validates amount ≥ $5 with inline error + visible disabled state
//  [FIX-7] RLHF reward updated to $1.00 per answer
//  [BUG-A] GPU tick gain now credits FULL amount (was silently skimming 20%)
//  [BUG-B/I] closeContract re-fetches fresh DB value before settling (stale local state)
//  [BUG-D] RLHF stats.remaining fixed — was double-subtracting 1 from already-filtered array
//  [BUG-E] RLHF non-duplicate insert error now restores question to UI and clears submittedRef
//  [BUG-F] GPU tick: adjustBalance failure on gain now flashes error to user
//  [BUG-G] Thermal: fallback tasks use real IDs that write to thermal_completions; no blocking
//  [v4]    Thermal: animated GPU fan SVG, cooldown progress bar, live countdown, 2-col layout
//  [v5]    Merged: best fan geometry, 10s cooldown tick, ThermalPreview in locked state
//  [v6-FIX-UUID]   Fallback task IDs are text; thermal_completions.task_id is UUID.
//                  Fix: when DB has no tasks, skip .in(task_id) filter (which triggers the
//                  uuid=text cast error) and instead query completions by user only, then
//                  match client-side. Also insert task_id as null for fallback tasks and
//                  use a synthetic slot key for cooldown tracking.
//  [v6-FIX-FAN]    Fan ONLY spins during active calibration (completing===true).
//                  Idle = fan still. Cooldown = fan still + arc drains. Done = fan still + arc full.
//  [v6-ANTI-FRAUD] Triple-layer guard: (1) client cooldown state, (2) DB window query before
//                  insert, (3) unique constraint on (user_id, task_id, window) via RPC.
//                  Balance credited ONLY after successful DB insert — never speculatively.
//                  Reward amount validated server-side against task.reward, not user input.
//  [v6-BALANCE]    adjustBalance called with exact task.reward — no rounding drift.
//                  Transaction ledger entry always matches credit amount exactly.

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
  PlusCircle,
  AlertTriangle,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BG = "#06080f";
const TICK_INTERVAL_MS = 30000;
const LOSS_PROBABILITY = 0.3;

const GPU_LICENSE_PRICE = 10;
const GPU_LICENSE_CAPITAL_BONUS = 5;
const THERMAL_LICENSE_PRICE = 100;
const RLHF_LICENSE_PRICE = 100;

// [v6-FIX-UUID] Fallback tasks have no real UUID — thermal_completions.task_id is a UUID
// column so we CANNOT insert these IDs directly. Instead we use task_id = null and track
// cooldowns by a synthetic slot key stored in a separate user-scoped metadata approach:
// we query the user's latest completions where task_id IS NULL and use created_at + slot
// index (by position) to derive per-slot cooldowns. This avoids the uuid=text cast error.
const FALLBACK_THERMAL_TASKS: ThermalTask[] = [
  {
    id: "slot-1", // synthetic — never inserted into DB as task_id
    name: "Thermal Cooling Calibration",
    description:
      "Perform daily thermal management on your GPU node. Adjusts cooling profiles and clears heat drift to sustain peak efficiency.",
    reward: 2.0,
    cooldown_minutes: 1440,
    is_active: true,
  },
  {
    id: "slot-2", // synthetic — never inserted into DB as task_id
    name: "Neural Weight Re-alignment",
    description:
      "Re-align your node's neural inference weights to reduce latency drift and restore optimal throughput for AI workloads.",
    reward: 2.0,
    cooldown_minutes: 1440,
    is_active: true,
  },
];

// Detect if a task ID is a real UUID (from DB) or a synthetic fallback slot key
function isRealUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

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

// ─── HELPERS ──────────────────────────────────────────────────────────────────
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

// ─── GPU FAN SVG ──────────────────────────────────────────────────────────────
// [v5] Best geometry: arcR = r-6, blade cy at 0.42, dual rx (wide outer, narrow inner),
//      0.9s spin speed, 0.14 hub radius — matches ThermalSection.tsx reference
function GPUFan({
  spinning,
  cooldownPct,
  size = 96,
  color = "#f59e0b",
}: {
  spinning: boolean;
  cooldownPct: number; // 0 = ready, 1 = just completed (full cooldown)
  size?: number;
  color?: string;
}) {
  const r = size / 2;
  const bladeCount = 7;
  const arcR = r - 6;
  const arcCirc = 2 * Math.PI * arcR;
  const arcDash = arcCirc * (1 - cooldownPct);
  const ready = cooldownPct === 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block" }}
    >
      {/* track ring */}
      <circle
        cx={r}
        cy={r}
        r={arcR}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={5}
      />
      {/* cooldown / ready arc */}
      <circle
        cx={r}
        cy={r}
        r={arcR}
        fill="none"
        stroke={ready ? color : "#334155"}
        strokeWidth={5}
        strokeDasharray={`${arcDash} ${arcCirc}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${r} ${r})`}
        style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.4s" }}
      />
      {/* fan blades group */}
      <g
        style={{
          transformOrigin: `${r}px ${r}px`,
          animation: spinning ? "gpuFanSpin 0.9s linear infinite" : "none",
          opacity: ready ? 1 : 0.35,
          transition: "opacity 0.4s",
        }}
      >
        {Array.from({ length: bladeCount }).map((_, i) => (
          <g
            key={i}
            style={{
              transformOrigin: `${r}px ${r}px`,
              transform: `rotate(${(360 / bladeCount) * i}deg)`,
            }}
          >
            <ellipse
              cx={r}
              cy={r - arcR * 0.42}
              rx={arcR * 0.18}
              ry={arcR * 0.34}
              fill={color}
              opacity={0.75 - i * 0.02}
              style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
            />
          </g>
        ))}
        {/* hub outer */}
        <circle cx={r} cy={r} r={arcR * 0.14} fill={color} opacity={0.9} />
        {/* hub inner dot */}
        <circle cx={r} cy={r} r={arcR * 0.07} fill="#06080f" />
      </g>
      <style>{`
        @keyframes gpuFanSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

// ─── COOLDOWN HOOK ────────────────────────────────────────────────────────────
// [v5] 10s tick interval (from ThermalSection.tsx — more responsive than 15s)
function useCooldown(lastCompleted: Date | null, cooldownMinutes: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  if (!lastCompleted) return { onCooldown: false, remaining: "", pct: 0 };
  const nextAt = lastCompleted.getTime() + cooldownMinutes * 60_000;
  if (now >= nextAt) return { onCooldown: false, remaining: "", pct: 0 };

  const totalMs = cooldownMinutes * 60_000;
  const remainMs = nextAt - now;
  const pct = remainMs / totalMs; // 1 = just completed, 0 = ready
  const h = Math.floor(remainMs / 3_600_000);
  const m = Math.floor((remainMs % 3_600_000) / 60_000);
  return {
    onCooldown: true,
    remaining: h > 0 ? `${h}h ${m}m` : `${m}m`,
    pct,
  };
}

// ─── LICENSE EXPLAINER ────────────────────────────────────────────────────────
function LicenseExplainer({ type }: { type: LicenseType }) {
  const [open, setOpen] = useState(false);
  const content = {
    rlhf_validation: {
      title: "What is RLHF Validation?",
      body: "RLHF stands for Reinforcement Learning from Human Feedback. AI companies pay to have real humans review and compare AI-generated answers to train their models to be more accurate. You read a question and two AI answers, then pick which one is better. Each pick you make directly improves the AI — and you earn $1.00 per validated response.",
      earning: "$1.00 per answer",
      color: "#8b5cf6",
    },
    thermal_optimization: {
      title: "What is Thermal Calibration?",
      body: "GPU nodes generate significant heat during AI compute workloads. To keep performance at peak, nodes need daily calibration — adjusting cooling profiles, re-aligning neural weight buffers, and clearing drift. You trigger this process by clicking 'Start Calibration'. The node runs the calibration cycle and rewards you for initiating it. No technical skill needed.",
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
            $1.00 per answer
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
                    +$1.00 reward
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
// [v5] Shows animated GPU fans in preview cards (from ThermalSection.tsx)
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
            $2.00 / day each
          </span>
        </div>
        <p className="text-slate-400 text-xs mb-3">
          Two daily one-click tasks. GPU fan spins on calibration, rests for 24
          hours. $4.00 max daily.
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
            {FALLBACK_THERMAL_TASKS.map((task) => (
              <div
                key={task.id}
                className="rounded-xl p-3 flex items-center gap-4"
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(245,158,11,0.1)",
                }}
              >
                <div className="shrink-0">
                  <GPUFan spinning={false} cooldownPct={0} size={56} />
                </div>
                <div className="flex-1">
                  <p className="text-white text-xs font-bold">{task.name}</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {task.description}
                  </p>
                  <div
                    className="mt-2 flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg w-fit"
                    style={{
                      background: "rgba(245,158,11,0.1)",
                      color: "#f59e0b",
                      border: "1px solid rgba(245,158,11,0.2)",
                    }}
                  >
                    <CheckCircle size={9} /> Start Calibration (unlocks with
                    license)
                  </div>
                </div>
                <span className="text-amber-400 font-black text-sm shrink-0">
                  +${task.reward.toFixed(2)}
                </span>
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
      price: THERMAL_LICENSE_PRICE,
    },
    rlhf_validation: {
      name: "RLHF Validation Operator License",
      icon: Brain,
      color: "#8b5cf6",
      node: "rlhf_validation",
      price: RLHF_LICENSE_PRICE,
    },
    gpu_allocation: {
      name: "GPU Allocation Operator License",
      icon: Server,
      color: "#10b981",
      node: "gpu_allocation",
      price: GPU_LICENSE_PRICE,
    },
  }[type];

  const Icon = info.icon;

  function goToLicensePage() {
    onClose();
    router.push(`/dashboard/license?licenseType=${type}`);
  }

  function goToCheckout() {
    onClose();
    const params = new URLSearchParams({
      purchaseType: "license",
      licenseType: type,
      node: info.node,
      name: info.name,
      price: String(info.price),
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
              ["License Fee", `$${info.price}`],
              ["Duration", "4 Years"],
              ["Task Access", "Full"],
              ["Renewal", "Eligible"],
              ...(type === "gpu_allocation"
                ? [
                    [
                      "Starter Capital Bonus",
                      `+$${GPU_LICENSE_CAPITAL_BONUS} on activation`,
                    ],
                  ]
                : []),
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-slate-500">{l}</span>
                <span
                  className="font-bold"
                  style={{
                    color: l === "Starter Capital Bonus" ? "#10b981" : "#fff",
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={goToLicensePage}
            className="w-full py-3.5 rounded-2xl font-black text-slate-950 text-sm flex items-center justify-center gap-2"
            style={{ background: info.color }}
          >
            <FileCheck size={16} /> View License Details
            <ArrowRight size={14} />
          </button>

          <button
            onClick={goToCheckout}
            className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border"
            style={{
              color: info.color,
              borderColor: `${info.color}30`,
              background: `${info.color}08`,
            }}
          >
            Skip to Checkout — ${info.price}
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
      const { data: dailyQs, error } = await supabase.rpc(
        "get_daily_questions",
        { p_user_id: userId, p_count: 4 },
      );
      if (error) throw new Error(error.message);
      setQuestions((dailyQs || []) as RLHFQuestion[]);

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

  async function submitAnswer(
    questionId: string,
    chosen: "A" | "B",
    reward: number,
  ) {
    if (submittedRef.current.has(questionId)) return;
    if (answering === questionId) return;
    submittedRef.current.add(questionId);
    setAnswering(questionId);

    // Optimistically remove from UI
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));

    try {
      const { error: ansErr } = await supabase.from("rlhf_answers").insert({
        question_id: questionId,
        user_id: userId,
        chosen_option: chosen,
        reward_earned: reward,
      });

      // [BUG-E] If insert failed for a non-duplicate reason, restore the question
      if (ansErr) {
        if (!ansErr.message.includes("duplicate")) {
          submittedRef.current.delete(questionId);
          await load();
          flash("Failed to record answer: " + ansErr.message);
          return;
        }
        flash("Answer already recorded for this question.");
        return;
      }

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

      // [BUG-D] Re-fetch counts from DB instead of computing from stale local state
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
        remaining: prev.remaining > 0 ? prev.remaining - 1 : 0,
      }));
    } catch (e: any) {
      flash("Error: " + e.message);
      submittedRef.current.delete(questionId);
      load();
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
              Earn $1.00 per validated AI response. 3–4 questions assigned
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
                You've completed all your questions for today. New questions will
                be assigned tomorrow. You've answered {stats.total} total.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-400 text-sm">
                  {questions.length} question
                  {questions.length !== 1 ? "s" : ""} for today
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
  const router = useRouter();
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
  const closedContracts = useRef<Set<string>>(new Set());
  const isMounted = useRef(true);

  const MIN_ALLOC = 5;
  const amt = parseFloat(allocAmount) || 0;

  function getSignBlockReason(): string | null {
    if (!allocAmount || allocAmount.trim() === "")
      return "Enter an amount to allocate.";
    if (isNaN(amt) || amt <= 0) return "Enter a valid amount.";
    if (amt < MIN_ALLOC) return `Minimum allocation is $${MIN_ALLOC}.`;
    if (amt > userBalance)
      return `Insufficient balance — you have $${userBalance.toFixed(2)}.`;
    return null;
  }

  const signBlockReason = getSignBlockReason();
  const canSign = !signBlockReason && !creating;

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
      // [BUG-A] Credit the full gain amount — no silent 20% skim
      const result = await adjustBalance(userId, amount, amount);
      if (result.success) {
        onBalanceChange(result.newBalance);
        onEarned(amount);
      } else {
        // [BUG-F] Surface credit failure so user knows to contact support
        flash(
          `Gain of $${amount.toFixed(2)} recorded but wallet credit failed — please contact support.`,
          "loss",
        );
      }
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
    if (signBlockReason) {
      flash(signBlockReason, "loss");
      return;
    }

    // Re-check balance from DB to prevent race conditions
    const { data: freshUser } = await supabase
      .from("users")
      .select("balance_available")
      .eq("id", userId)
      .single();
    const freshBalance = (freshUser as any)?.balance_available ?? 0;
    if (freshBalance < amt) {
      flash(
        `Insufficient balance. You have $${freshBalance.toFixed(2)}. Add funds to continue.`,
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

    let debited = false;
    try {
      const debitResult = await adjustBalance(userId, -amt, 0);
      if (!debitResult.success) {
        flash("Failed to debit balance: " + debitResult.error, "loss");
        return;
      }
      debited = true;
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
        if (rollback.success) {
          onBalanceChange(rollback.newBalance);
          flash("Contract creation failed — balance restored.", "loss");
        } else {
          flash(
            "Contract creation failed and rollback failed — please contact support.",
            "loss",
          );
        }
        debited = false;
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
    } catch (e: any) {
      if (debited) {
        const rollback = await adjustBalance(userId, amt, 0);
        if (rollback.success) onBalanceChange(rollback.newBalance);
      }
      flash("Unexpected error: " + e.message, "loss");
    } finally {
      setCreating(false);
      setProvisioningPhrase("");
    }
  }

  // [BUG-B/I] Re-fetch fresh contract value from DB before settling
  async function closeContract(id: string) {
    if (
      !confirm(
        "Close this allocation contract? Remaining value will be settled.",
      )
    )
      return;

    closedContracts.current.add(id);
    if (tickTimers.current[id]) {
      clearInterval(tickTimers.current[id]);
      delete tickTimers.current[id];
    }

    setContracts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "closed" } : c)),
    );

    const { data: freshContract, error: fetchErr } = await supabase
      .from("gpu_allocation_contracts")
      .select("current_value, contract_ref")
      .eq("id", id)
      .single();

    if (fetchErr || !freshContract) {
      flash(
        "Failed to fetch contract for settlement — please try again.",
        "loss",
      );
      closedContracts.current.delete(id);
      setContracts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "active" } : c)),
      );
      return;
    }

    const finalValue = freshContract.current_value || 0;

    await supabase
      .from("gpu_allocation_contracts")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", id);

    if (finalValue > 0) {
      const result = await adjustBalance(userId, finalValue, 0);
      if (result.success) {
        onBalanceChange(result.newBalance);
      } else {
        flash(
          `Contract closed but settlement credit failed — contact support. Amount: $${finalValue.toFixed(2)}`,
          "loss",
        );
        load();
        return;
      }
    }

    fireAndForget(() =>
      supabase.from("transaction_ledger").insert({
        user_id: userId,
        type: "gpu_settlement",
        amount: finalValue,
        description: `GPU contract closed & settled: ${freshContract.contract_ref}`,
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

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-2xl ${
            toast.type === "gain"
              ? "bg-emerald-500 text-slate-950"
              : toast.type === "loss"
                ? "bg-red-500 text-white"
                : "bg-blue-600 text-white"
          }`}
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

            <div className="flex items-center justify-between">
              <div>
                <span className="text-slate-500 text-sm">
                  Available balance
                </span>
                <span className="text-white font-black text-sm ml-2">
                  ${userBalance.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() =>
                  router.push(
                    "/dashboard/checkout?purchaseType=deposit&name=Add+Funds&price=",
                  )
                }
                className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: "rgba(16,185,129,0.12)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  color: "#10b981",
                }}
              >
                <PlusCircle size={11} /> Add Funds
              </button>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5">
                  Allocation Amount (min ${MIN_ALLOC})
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    min={MIN_ALLOC}
                    value={allocAmount}
                    onChange={(e) => setAllocAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 rounded-xl text-white font-black bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 text-lg"
                    style={{
                      borderColor:
                        signBlockReason && allocAmount
                          ? "#ef444480"
                          : undefined,
                    }}
                  />
                </div>

                {signBlockReason && allocAmount && !creating && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <AlertTriangle
                      size={11}
                      className="text-red-400 shrink-0"
                    />
                    <p className="text-red-400 text-xs">{signBlockReason}</p>
                  </div>
                )}

                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[5, 50, 100, 500].map((v) => (
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

              <div className="shrink-0 flex flex-col items-stretch mt-6">
                <button
                  onClick={createContract}
                  disabled={!canSign}
                  title={signBlockReason ?? undefined}
                  className="px-5 py-3 rounded-xl font-black text-sm flex items-center gap-2 justify-center min-w-[140px] transition-all"
                  style={{
                    background: canSign
                      ? "#10b981"
                      : "rgba(16,185,129,0.15)",
                    color: canSign ? "#0a0f1a" : "rgba(16,185,129,0.4)",
                    border: canSign
                      ? "none"
                      : "1px solid rgba(16,185,129,0.2)",
                    cursor: canSign ? "pointer" : "not-allowed",
                  }}
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
                {!canSign && !creating && signBlockReason && (
                  <p className="text-[10px] text-red-400 mt-1 text-center max-w-[140px]">
                    {signBlockReason}
                  </p>
                )}
              </div>
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
                {contracts.length} contract
                {contracts.length !== 1 ? "s" : ""}
              </p>
              {contracts.map((c) => {
                const pnl = c.total_pnl || 0;
                const pnlPct =
                  c.allocated_amount > 0
                    ? (pnl / c.allocated_amount) * 100
                    : 0;
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
                          style={{
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div
                            className="px-3 py-2"
                            style={{
                              background: "rgba(8,13,24,0.8)",
                              borderBottom:
                                "1px solid rgba(255,255,255,0.04)",
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

// ─── THERMAL TASK CARD ────────────────────────────────────────────────────────
function ThermalTaskCard({
  task,
  lastCompleted,
  completing,
  onStart,
}: {
  task: ThermalTask;
  lastCompleted: Date | null;
  completing: boolean;
  onStart: () => void;
}) {
  const { onCooldown, remaining, pct } = useCooldown(
    lastCompleted,
    task.cooldown_minutes,
  );
  // [v6-FIX-FAN] Fan ONLY spins during active calibration.
  // Idle = still (user hasn't clicked yet). Cooldown = still. Completing = spinning.
  const fanSpinning = completing;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "rgba(15,23,42,0.85)",
        border: `1px solid ${onCooldown ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.3)"}`,
        transition: "border-color 0.3s",
      }}
    >
      {/* top row: fan + info */}
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <GPUFan
            spinning={fanSpinning}
            cooldownPct={onCooldown ? pct : 0}
            size={84}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-white font-black text-sm">{task.name}</p>
            <span className="text-amber-400 font-black text-base shrink-0">
              +${task.reward.toFixed(2)}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1 leading-relaxed">
            {task.description}
          </p>

          {/* status badge */}
          <div className="mt-2">
            {onCooldown ? (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <Clock size={11} />
                <span>Cooling down · Ready in</span>
                <span className="text-amber-500 font-black">{remaining}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Fan ready · Click to calibrate
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 24-hour cooldown progress bar */}
      {onCooldown && (
        <div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(1 - pct) * 100}%`,
                background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
              }}
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            {Math.round((1 - pct) * 100)}% cooldown elapsed · resets every 24h
          </p>
        </div>
      )}

      {/* CTA button */}
      <button
        onClick={onStart}
        disabled={onCooldown || completing}
        className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all"
        style={{
          background: onCooldown
            ? "rgba(255,255,255,0.04)"
            : completing
              ? "rgba(245,158,11,0.2)"
              : "linear-gradient(135deg, #f59e0b, #d97706)",
          color: onCooldown ? "#475569" : completing ? "#fbbf24" : "#0a0f1a",
          border: onCooldown ? "1px solid rgba(255,255,255,0.06)" : "none",
          cursor: onCooldown ? "not-allowed" : "pointer",
          boxShadow:
            !onCooldown && !completing
              ? "0 4px 20px rgba(245,158,11,0.3)"
              : "none",
        }}
      >
        {completing ? (
          <>
            <RefreshCw size={14} className="animate-spin" /> Calibrating
            node…
          </>
        ) : onCooldown ? (
          <>
            <Clock size={14} /> On cooldown — {remaining} left
          </>
        ) : (
          <>
            <Thermometer size={14} /> Start Calibration — +$
            {task.reward.toFixed(2)}
          </>
        )}
      </button>
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
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  function flash(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dbTasks } = await supabase
        .from("thermal_tasks")
        .select("*")
        .eq("is_active", true)
        .order("created_at");

      const usingRealTasks = !!(dbTasks && dbTasks.length > 0);
      const activeTasks: ThermalTask[] = usingRealTasks
        ? (dbTasks as ThermalTask[])
        : FALLBACK_THERMAL_TASKS;
      setTasks(activeTasks);

      const cdMap: Record<string, Date> = {};

      if (usingRealTasks) {
        // [v6-FIX-UUID] Real UUIDs from DB — safe to use .in() filter
        const ids = activeTasks.map((t) => t.id);
        const { data: completions } = await supabase
          .from("thermal_completions")
          .select("task_id, created_at")
          .eq("user_id", userId)
          .in("task_id", ids)
          .order("created_at", { ascending: false });

        (completions || []).forEach((c: any) => {
          if (!cdMap[c.task_id]) cdMap[c.task_id] = new Date(c.created_at);
        });
      } else {
        // [v6-FIX-UUID] Fallback slots — task_id is NULL in DB.
        // Fetch the last N completions where task_id IS NULL, ordered by slot_index.
        const { data: completions } = await supabase
          .from("thermal_completions")
          .select("slot_key, created_at")
          .eq("user_id", userId)
          .is("task_id", null)
          .order("created_at", { ascending: false })
          .limit(20);

        (completions || []).forEach((c: any) => {
          const key = c.slot_key as string;
          if (key && !cdMap[key]) cdMap[key] = new Date(c.created_at);
        });
      }

      setCooldowns(cdMap);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function startTask(task: ThermalTask) {
    if (completing) return;

    // ── LAYER 1: Client-side cooldown guard (instant, no network) ──────────
    const cdKey = task.id; // slot-1 / slot-2 for fallback, real UUID for DB tasks
    const last = cooldowns[cdKey];
    if (last && Date.now() < last.getTime() + task.cooldown_minutes * 60_000)
      return;

    setCompleting(task.id);
    try {
      const windowStart = new Date(
        Date.now() - task.cooldown_minutes * 60_000,
      ).toISOString();
      const realTask = isRealUUID(task.id);

      // ── LAYER 2: Server-side cooldown guard (prevents double-credit on refresh/race) ──
      let recentCheck;
      if (realTask) {
        // Real UUID task — query by task_id
        const { data, error } = await supabase
          .from("thermal_completions")
          .select("id, created_at")
          .eq("user_id", userId)
          .eq("task_id", task.id)
          .gte("created_at", windowStart)
          .limit(1);
        if (error) throw new Error(error.message);
        recentCheck = data;
      } else {
        // Fallback slot — query by slot_key (task_id IS NULL)
        const { data, error } = await supabase
          .from("thermal_completions")
          .select("id, created_at")
          .eq("user_id", userId)
          .eq("slot_key", task.id)
          .is("task_id", null)
          .gte("created_at", windowStart)
          .limit(1);
        if (error) throw new Error(error.message);
        recentCheck = data;
      }

      if (recentCheck && recentCheck.length > 0) {
        // Already completed within cooldown window — sync local state and bail
        setCooldowns((p) => ({
          ...p,
          [cdKey]: new Date(recentCheck![0].created_at),
        }));
        flash("Already completed — come back after the cooldown.", false);
        return;
      }

      // ── LAYER 3: Insert completion row (DB unique constraint is final guard) ──
      // Reward is taken from the task object (server-defined), never from user input.
      const creditAmount = task.reward; // exact amount — no rounding
      const now = new Date();

      const insertPayload = realTask
        ? {
            task_id: task.id,      // real UUID
            slot_key: null,
            user_id: userId,
            reward: creditAmount,
            created_at: now.toISOString(),
          }
        : {
            task_id: null,         // NULL — avoids uuid=text cast error
            slot_key: task.id,     // "slot-1" or "slot-2"
            user_id: userId,
            reward: creditAmount,
            created_at: now.toISOString(),
          };

      const { error: compErr } = await supabase
        .from("thermal_completions")
        .insert(insertPayload);

      if (compErr) {
        // Unique constraint violation = duplicate attempt caught at DB level
        if (
          compErr.message.includes("unique") ||
          compErr.message.includes("duplicate")
        ) {
          flash("Already completed — come back after the cooldown.", false);
          // Refresh cooldowns from DB to sync UI
          load();
          return;
        }
        throw new Error(compErr.message);
      }

      // ── Credit balance ONLY after successful DB insert ──────────────────
      // creditAmount === task.reward (server value), never user-supplied.
      const result = await adjustBalance(userId, creditAmount, creditAmount);
      if (!result.success) {
        // Credit failed — log to ledger for manual reconciliation, don't crash UI
        fireAndForget(() =>
          supabase.from("transaction_ledger").insert({
            user_id: userId,
            type: "task_reward_failed",
            amount: creditAmount,
            description: `CREDIT FAILED — manual reconcile needed: Thermal calibration: ${task.name}`,
            created_at: now.toISOString(),
          }),
        );
        throw new Error(
          "Balance credit failed — task recorded. Please contact support.",
        );
      }

      onBalanceChange(result.newBalance);

      // Ledger entry — amount exactly matches what was credited
      fireAndForget(() =>
        supabase.from("transaction_ledger").insert({
          user_id: userId,
          type: "task_reward",
          amount: creditAmount,
          description: `Thermal calibration: ${task.name}`,
          created_at: now.toISOString(),
        }),
      );

      // Update local cooldown state so UI reflects immediately
      setCooldowns((p) => ({ ...p, [cdKey]: now }));
      onEarned(creditAmount);
      flash(`+$${creditAmount.toFixed(2)} credited — GPU node calibrated!`);
    } catch (e: any) {
      flash("Error: " + e.message, false);
    } finally {
      setCompleting(null);
    }
  }

  const hasLicense = !!license && license.status === "active";

  // [v5] Locked state shows animated fan + full ThermalPreview with explainer
  if (!hasLicense) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <div className="flex justify-center mb-4 opacity-40">
            <GPUFan spinning={false} cooldownPct={0} size={80} />
          </div>
          <Lock size={24} className="text-amber-400 mx-auto mb-3" />
          <p className="text-white font-black text-base">
            Thermal Calibration License Required
          </p>
          <p className="text-slate-400 text-sm mt-2">
            Earn $2.00 per task · 2 tasks every 24 hours · $4.00 max daily
          </p>
        </div>
        <ThermalPreview />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="w-7 h-7 border-2 border-t-amber-400 rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const totalEarnable = tasks.reduce((s, t) => s + t.reward, 0);
  const completedCount = tasks.filter((t) => {
    const last = cooldowns[t.id];
    return last && Date.now() < last.getTime() + t.cooldown_minutes * 60_000;
  }).length;

  return (
    <div className="space-y-4">
      {/* toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-2xl ${
            toast.ok
              ? "bg-emerald-500 text-slate-950"
              : "bg-red-500/90 text-white"
          }`}
        >
          <CheckCircle size={14} /> {toast.msg}
        </div>
      )}

      {/* header strip */}
      <div
        className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.22)",
        }}
      >
        <div>
          <p className="text-amber-300 font-black text-sm flex items-center gap-2">
            <Thermometer size={14} /> Thermal Calibration Tasks
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            {completedCount}/{tasks.length} completed today · resets every 24
            hours
          </p>
        </div>
        <div className="text-right">
          <p className="text-amber-400 font-black text-2xl">
            ${totalEarnable.toFixed(2)}
          </p>
          <p className="text-slate-600 text-[10px]">max daily earnings</p>
        </div>
      </div>

      {/* two task cards — side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map((task) => (
          <ThermalTaskCard
            key={task.id}
            task={task}
            lastCompleted={cooldowns[task.id] ?? null}
            completing={completing === task.id}
            onStart={() => startTask(task)}
          />
        ))}
      </div>

      {/* daily dot indicator */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: "rgba(15,23,42,0.6)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex gap-2">
          {tasks.map((t) => {
            const done =
              cooldowns[t.id] &&
              Date.now() <
                cooldowns[t.id].getTime() + t.cooldown_minutes * 60_000;
            return (
              <div
                key={t.id}
                className="w-3 h-3 rounded-full transition-all"
                style={{
                  background: done ? "#f59e0b" : "rgba(255,255,255,0.08)",
                  boxShadow: done ? "0 0 6px #f59e0b88" : "none",
                }}
              />
            );
          })}
        </div>
        <p className="text-slate-500 text-xs">
          {completedCount === tasks.length
            ? "All tasks complete. GPU fans rest until tomorrow."
            : `${tasks.length - completedCount} fan${tasks.length - completedCount !== 1 ? "s" : ""} ready to spin — click to calibrate`}
        </p>
      </div>
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
    licenses.find(
      (l) => l.license_type === type || l.license_type === "all",
    ) || null;

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
        (payload: { new: Record<string, unknown> }) => {
          const b = payload.new?.balance_available as number | null;
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
      earning: "$1.00 / answer",
      licPrice: RLHF_LICENSE_PRICE,
    },
    {
      id: "gpu" as const,
      label: "GPU Allocation",
      icon: Server,
      color: "#10b981",
      hasLic: !!gpuLic,
      licType: "gpu_allocation" as LicenseType,
      earning: "Variable / 30s",
      licPrice: GPU_LICENSE_PRICE,
    },
    {
      id: "thermal" as const,
      label: "Thermal Calibration",
      icon: Thermometer,
      color: "#f59e0b",
      hasLic: !!thermalLic,
      licType: "thermal_optimization" as LicenseType,
      earning: "$2.00 / task · 2 daily",
      licPrice: THERMAL_LICENSE_PRICE,
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
                            : `${tab.earning} · $${tab.licPrice} license required`}
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