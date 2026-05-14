"use client";
// app/dashboard/tasks/page.tsx

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
  already_answered?: boolean;
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
// INTERNAL: 70% profit, 30% loss — NOT exposed to UI
const LOSS_PROBABILITY = 0.3;

function generateContractRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (len: number) =>
    Array.from(
      { length: len },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `GPUA-${seg(4)}-${new Date().getFullYear()}`;
}

// INTERNAL ONLY — never surfaced in UI
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

// ─── HELPER: read + update user balance atomically ────────────────────────────
async function adjustBalance(
  userId: string,
  delta: number,
  earnedDelta: number = 0,
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { data: u, error: readErr } = await supabase
    .from("users")
    .select("balance_available, total_earned")
    .eq("id", userId)
    .single();

  if (readErr || !u) {
    return { success: false, newBalance: 0, error: readErr?.message };
  }

  const currentBal = (u as any).balance_available ?? 0;
  const currentEarned = (u as any).total_earned ?? 0;
  const newBalance = Math.max(0, currentBal + delta);

  const updatePayload: Record<string, any> = {
    balance_available: newBalance,
  };
  if (earnedDelta !== 0) {
    updatePayload.total_earned = currentEarned + earnedDelta;
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update(updatePayload)
    .eq("id", userId);

  if (updateErr) {
    return { success: false, newBalance: currentBal, error: updateErr.message };
  }

  return { success: true, newBalance };
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
    const { data: qs } = await supabase
      .from("rlhf_questions")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    const { data: ans } = await supabase
      .from("rlhf_answers")
      .select("question_id")
      .eq("user_id", userId);
    const answered = new Set((ans || []).map((a: any) => a.question_id));
    setAnsweredIds(answered);
    setQuestions(
      (qs || []).map((q: any) => ({
        ...q,
        already_answered: answered.has(q.id),
      })),
    );
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

  useEffect(() => {
    const ch = supabase
      .channel("rlhf_q_live")
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
      supabase.removeChannel(ch);
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

      const result = await adjustBalance(userId, reward, reward);
      if (!result.success) throw new Error(result.error);

      await supabase
        .from("transaction_ledger")
        .insert({
          user_id: userId,
          type: "task_reward",
          amount: reward,
          description: "RLHF validation reward",
          created_at: new Date().toISOString(),
        })
        .catch(() => {});

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
            tasks.
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
            You've completed all {questions.length} available questions. Check
            back when admin adds new ones.
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

// ─── GPU ALLOCATION SECTION ───────────────────────────────────────────────────
function GPUAllocationSection({
  userId,
  license,
  onEarned,
  userBalance,
}: {
  userId: string;
  license: License | null;
  onEarned: (amt: number) => void;
  userBalance: number;
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
    if (cs?.length) {
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
    return () => {
      Object.values(tickTimers.current).forEach((t) => clearInterval(t));
      tickTimers.current = {};
    };
  }, [contracts]); // eslint-disable-line

  // FIX: Fetch fresh contract from DB before each tick to avoid stale closure bug
  async function runTickById(contractId: string) {
    const { data: fresh, error } = await supabase
      .from("gpu_allocation_contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (error || !fresh) return;
    // Skip if already closed/liquidated
    if (fresh.status !== "active") {
      if (tickTimers.current[contractId]) {
        clearInterval(tickTimers.current[contractId]);
        delete tickTimers.current[contractId];
      }
      return;
    }

    await runTick(fresh as GPUContract);
  }

  async function runTick(contract: GPUContract) {
    const currentValue = contract.current_value || contract.allocated_amount;

    // INTERNAL calculation — never exposed to UI
    const { type, pct, amount } = generateTickPnL(currentValue);

    const newValue =
      type === "gain"
        ? currentValue + amount
        : Math.max(0, currentValue - amount);
    const totalPnl = newValue - contract.allocated_amount;
    const now = new Date().toISOString();

    await supabase.from("gpu_allocation_ticks").insert({
      contract_id: contract.id,
      user_id: userId,
      tick_type: type,
      amount,
      pct_change: pct,
      running_value: newValue,
      created_at: now,
    });

    const isLiquidated = newValue <= contract.allocated_amount * 0.05;
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
      await adjustBalance(userId, credit, credit);
      onEarned(credit);
      flash(
        `+$${amount.toFixed(2)} gain on ${contract.contract_ref} (+${pct.toFixed(1)}%)`,
        "gain",
      );
    } else {
      await adjustBalance(userId, -amount, 0);
      flash(
        `-$${amount.toFixed(2)} loss on ${contract.contract_ref} (${pct.toFixed(1)}%)`,
        "loss",
      );
    }

    if (isLiquidated) {
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

    if (userBalance < amt) {
      flash(
        `Insufficient balance. You have $${userBalance.toFixed(2)}, need $${amt.toFixed(2)}.`,
        "loss",
      );
      return;
    }

    setCreating(true);

    const debitResult = await adjustBalance(userId, -amt, 0);
    if (!debitResult.success) {
      flash("Failed to debit balance: " + debitResult.error, "loss");
      setCreating(false);
      return;
    }

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

    if (error) {
      await adjustBalance(userId, amt, 0);
      flash(error.message, "loss");
    } else {
      await supabase
        .from("transaction_ledger")
        .insert({
          user_id: userId,
          type: "gpu_allocation",
          amount: amt,
          description: `GPU allocation contract signed: ${ref}`,
          created_at: new Date().toISOString(),
        })
        .catch(() => {});
      flash(
        `Contract ${ref} created! $${amt.toFixed(2)} allocated. First cycle in 30s.`,
        "info",
      );
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
      await adjustBalance(userId, finalValue, 0);
    }

    await supabase
      .from("gpu_allocation_contracts")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", id);

    if (tickTimers.current[id]) {
      clearInterval(tickTimers.current[id]);
      delete tickTimers.current[id];
    }

    await supabase
      .from("transaction_ledger")
      .insert({
        user_id: userId,
        type: "gpu_settlement",
        amount: finalValue,
        description: `GPU contract closed & settled: ${contract.contract_ref}`,
        created_at: new Date().toISOString(),
      })
      .catch(() => {});

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
            allocation contracts.
          </p>
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
                Amount is debited from your balance immediately. Returns are
                distributed every 30 seconds.
              </p>
            </div>

            {/* Balance indicator — neutral, no probability hints */}
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
                className="px-5 py-3 rounded-xl font-black text-sm text-slate-950 flex items-center gap-2 disabled:opacity-50 shrink-0"
                style={{ background: "#10b981" }}
              >
                {creating ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} />
                )}{" "}
                Sign Contract
              </button>
            </div>
            {/* NOTE: Gain/loss scenario preview intentionally removed — internal logic only */}
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
}: {
  userId: string;
  license: License | null;
  onEarned: (amt: number) => void;
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

    setTasks(
      dbTasks && dbTasks.length > 0
        ? dbTasks
        : [
            {
              id: "thermal-1",
              name: "Thermal Cooling Calibration",
              description:
                "Perform daily thermal management on your GPU node to sustain peak efficiency.",
              reward: 0.5,
              cooldown_minutes: 1440,
              is_active: true,
            },
            {
              id: "thermal-2",
              name: "Neural Weight Re-alignment",
              description:
                "Re-align your node's neural inference weights to reduce latency drift.",
              reward: 0.5,
              cooldown_minutes: 1440,
              is_active: true,
            },
          ],
    );
    setLoading(false);
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

  async function completeTask(task: ThermalTask) {
    const cd = isOnCooldown(task.id, task.cooldown_minutes);
    if (cd.on) return;
    setCompleting(task.id);
    try {
      await supabase.from("thermal_completions").insert({
        task_id: task.id,
        user_id: userId,
        reward: task.reward,
        created_at: new Date().toISOString(),
      });

      const result = await adjustBalance(userId, task.reward, task.reward);
      if (!result.success) throw new Error(result.error);

      await supabase
        .from("transaction_ledger")
        .insert({
          user_id: userId,
          type: "task_reward",
          amount: task.reward,
          description: `Thermal task: ${task.name}`,
          created_at: new Date().toISOString(),
        })
        .catch(() => {});

      flash(`+$${task.reward.toFixed(2)} — ${task.name} complete!`);
      onEarned(task.reward);
      load();
    } catch (e: any) {
      flash("Error: " + e.message);
    }
    setCompleting(null);
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
          <p className="text-slate-400 text-sm mt-2">
            Purchase the Thermal & Neural Operator License ($200) to access
            hardware optimization tasks.
          </p>
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
          <p className="text-amber-300 font-black text-sm flex items-center gap-2">
            <Thermometer size={14} /> Thermal Calibration Tasks
          </p>
          <p className="text-slate-400 text-xs">
            Complete hardware optimization tasks on your GPU node. Tasks refresh
            daily.
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
                        Completing...
                      </>
                    ) : cd.on ? (
                      <>
                        <Clock size={10} /> Ready in {cd.remaining}
                      </>
                    ) : (
                      <>
                        <CheckCircle size={10} /> Start Task
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

  // Realtime: license activation
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

  // Realtime: balance updates
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
          const newBal = (payload.new as any)?.balance_available;
          if (newBal != null) setBalance(newBal);
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
    },
    {
      id: "gpu" as const,
      label: "GPU Allocation",
      icon: Server,
      color: "#10b981",
      hasLic: !!gpuLic,
      licType: "gpu_allocation" as LicenseType,
    },
    {
      id: "thermal" as const,
      label: "Thermal Calibration",
      icon: Thermometer,
      color: "#f59e0b",
      hasLic: !!thermalLic,
      licType: "thermal_optimization" as LicenseType,
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

          {/* Tabs */}
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
                            ? "Licensed · Active"
                            : "$200 license required"}
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

          {/* Tab content */}
          <div className="mt-6">
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
                userBalance={balance}
              />
            )}
            {userId && activeTab === "thermal" && (
              <ThermalSection
                userId={userId}
                license={thermalLic}
                onEarned={handleEarned}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
