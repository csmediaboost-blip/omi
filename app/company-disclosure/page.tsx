"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Lock,
  CheckCircle,
  PlayCircle,
  Cpu,
  Zap,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Shield,
  BarChart3,
  Network,
  AlertCircle,
  X,
} from "lucide-react";

type Module = {
  id: number;
  title: string;
  description: string;
  content: string;
  tier_required: string;
  order: number;
  video_url: string | null;
};

type Completion = {
  module_id: number;
  completed_at: string;
};

const TIER_ORDER = [
  "observer",
  "compute",
  "neural",
  "intelligence",
  "cognitive",
];

const TIER_COLORS = {
  observer: "from-slate-500 to-slate-700",
  compute: "from-blue-500 to-blue-700",
  neural: "from-blue-600 to-indigo-700",
  intelligence: "from-indigo-500 to-blue-800",
  cognitive: "from-blue-400 to-blue-900",
};

const FALLBACK_MODULES: Module[] = [
  {
    id: 1,
    title: "GPU Rental Fundamentals",
    description: "Understand GPU node economics and earning mechanics",
    content:
      "Learn the basics of GPU rental, node tiers, and revenue generation.",
    tier_required: "observer",
    order: 1,
    video_url: null,
  },
  {
    id: 2,
    title: "Task Routing & Allocation",
    description: "Master intelligent task distribution across your nodes",
    content:
      "Deep dive into task routing algorithms and optimization strategies.",
    tier_required: "compute",
    order: 2,
    video_url: null,
  },
  {
    id: 3,
    title: "Advanced GPU Optimization",
    description: "Maximize throughput and efficiency on neural workloads",
    content: "Advanced techniques for AI and ML task optimization.",
    tier_required: "neural",
    order: 3,
    video_url: null,
  },
  {
    id: 4,
    title: "Enterprise-Scale Infrastructure",
    description:
      "Scale to distributed networks and multi-datacenter operations",
    content: "Build production-grade GPU networks with high availability.",
    tier_required: "intelligence",
    order: 4,
    video_url: null,
  },
  {
    id: 5,
    title: "Strategic Network Economics",
    description: "Advanced commission strategies and network optimization",
    content: "Build sustainable revenue streams through network leverage.",
    tier_required: "cognitive",
    order: 5,
    video_url: null,
  },
];

export default function CompanyDisclosurePage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [userTier, setUserTier] = useState("observer");
  const [userId, setUserId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [activeTab, setActiveTab] = useState<"modules" | "gpu" | "tasks">(
    "modules",
  );
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setModules(FALLBACK_MODULES);
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("users")
        .select("tier")
        .eq("id", user.id)
        .single();
      setUserTier(profile?.tier || "observer");
      const { data: moduleData } = await supabase
        .from("company-disclosure")
        .select("*")
        .order("order", { ascending: true });
      setModules(
        moduleData && moduleData.length > 0 ? moduleData : FALLBACK_MODULES,
      );
      if (user.id) {
        const { data: completionData } = await supabase
          .from("company-disclosure_completions")
          .select("module_id, completed_at")
          .eq("user_id", user.id);
        setCompletions(completionData || []);
      }
    } catch (err) {
      console.error("[company-disclosure] load error:", err);
      setModules(FALLBACK_MODULES);
    } finally {
      setLoading(false);
    }
  }

  function isTierLocked(moduleTier: string) {
    return TIER_ORDER.indexOf(moduleTier) > TIER_ORDER.indexOf(userTier);
  }

  function isCompleted(moduleId: number) {
    return completions.some((c) => c.module_id === moduleId);
  }

  async function markComplete(moduleId: number) {
    if (!userId) return;
    setMarking(true);
    try {
      await supabase.from("company-disclosure_completions").upsert({
        user_id: userId,
        module_id: moduleId,
        completed_at: new Date().toISOString(),
      });
      setCompletions((prev) => [
        ...prev.filter((c) => c.module_id !== moduleId),
        { module_id: moduleId, completed_at: new Date().toISOString() },
      ]);
    } catch (err) {
      console.error("[company-disclosure] mark complete error:", err);
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const completedCount = completions.length;
  const totalModules = modules.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-3 md:p-6 space-y-4 md:space-y-6">
      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 border border-blue-900/40 p-5 md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(59,130,246,0.1),transparent_60%)]" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-start justify-between gap-4 md:gap-8">
            <div className="flex-1">
              <h1 className="text-3xl md:text-5xl font-black text-white mb-2 md:mb-3">
                OmniTask 
              </h1>
              <p className="text-slate-400 text-sm md:text-lg max-w-2xl leading-relaxed">
                Master GPU rental economics, advanced task optimization, and
                build enterprise-scale networks. Professional training for the
                next generation of compute operators and network architects.
              </p>
            </div>
            <div className="shrink-0 w-full md:w-auto">
              <div className="bg-blue-950/60 border border-blue-900/50 rounded-xl md:rounded-2xl p-4 md:p-6 text-center">
                <div className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-1 md:mb-2">
                  Your Progress
                </div>
                <div className="text-3xl md:text-4xl font-black text-white mb-1">
                  {completedCount}/{totalModules}
                </div>
                <div className="text-xs text-slate-500">Modules Completed</div>
              </div>
            </div>
          </div>
          <div className="mt-3 md:mt-6 w-full bg-slate-800/60 rounded-full h-2.5 overflow-hidden border border-blue-900/20">
            <div
              className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full transition-all duration-700"
              style={{
                width:
                  totalModules > 0
                    ? `${(completedCount / totalModules) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex flex-wrap gap-1.5 md:gap-2 bg-slate-900/60 border border-slate-800/60 p-1.5 rounded-lg md:rounded-xl">
        {[
          { id: "modules", label: "Training Modules", icon: BookOpen },
          { id: "gpu", label: "GPU Rental Mechanics", icon: Cpu },
          { id: "tasks", label: "Task System Guide", icon: BarChart3 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as "modules" | "gpu" | "tasks")}
            className={`flex items-center gap-1 md:gap-2 px-2.5 md:px-4 py-2 md:py-2.5 rounded-lg transition-all text-xs md:text-sm font-semibold whitespace-nowrap ${
              activeTab === id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Icon size={14} className="md:block" /> <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* ── MODULES TAB ── */}
      {activeTab === "modules" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
          {modules.map((mod) => {
            const locked = isTierLocked(mod.tier_required);
            const completed = isCompleted(mod.id);
            return (
              <Card
                key={mod.id}
                onClick={() => !locked && setActiveModule(mod)}
                className={`relative overflow-hidden rounded-2xl border transition-all cursor-pointer group bg-gradient-to-br
                  ${
                    locked
                      ? "from-slate-900/40 to-slate-900/20 border-slate-800/30 opacity-50"
                      : completed
                        ? "from-blue-950/60 to-slate-900/60 border-blue-800/40 hover:border-blue-700/60"
                        : "from-slate-900/60 to-blue-950/40 border-slate-800/50 hover:border-blue-700/40"
                  }`}
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${TIER_COLORS[mod.tier_required as keyof typeof TIER_COLORS] || "from-slate-700 to-slate-600"}`}
                />
                <div className="p-4 md:p-6 space-y-2 md:space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-white text-sm md:text-base leading-snug mb-1">
                        {mod.title}
                      </h3>
                      <p className="text-slate-500 text-xs leading-relaxed">
                        {mod.description}
                      </p>
                    </div>
                    <div className="shrink-0 ml-2">
                      {locked ? (
                        <Lock size={16} className="text-slate-700" />
                      ) : completed ? (
                        <CheckCircle size={16} className="text-blue-400" />
                      ) : (
                        <PlayCircle
                          size={16}
                          className="text-blue-400 group-hover:animate-pulse"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider border
                      ${
                        locked
                          ? "bg-slate-900/40 text-slate-600 border-slate-700/30"
                          : "bg-blue-900/30 text-blue-300 border-blue-800/40"
                      }`}
                    >
                      {mod.tier_required}
                    </span>
                    {completed && (
                      <span className="text-xs text-blue-400 font-semibold">
                        ✓ Complete
                      </span>
                    )}
                  </div>
                  <Button
                    disabled={locked}
                    onClick={() => !locked && setActiveModule(mod)}
                    className={`w-full text-sm font-semibold transition-all ${
                      locked
                        ? "bg-slate-800/40 text-slate-600 cursor-not-allowed border-0"
                        : completed
                          ? "bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 border border-blue-800/30"
                          : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20"
                    }`}
                  >
                    {locked
                      ? `Unlock at ${mod.tier_required}`
                      : completed
                        ? "Review"
                        : "Start Learning"}
                    {!locked && (
                      <ArrowRight size={14} className="ml-2 inline" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── GPU TAB ── */}
      {activeTab === "gpu" && (
        <div className="space-y-3 md:space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-5">
            <Card className="bg-gradient-to-br from-blue-950/50 to-slate-900/60 border border-blue-900/40 rounded-2xl p-4 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center">
                  <Cpu size={22} className="text-blue-400" />
                </div>
                <h2 className="text-lg md:text-2xl font-bold text-white">
                  GPU Rental Economics
                </h2>
              <div className="space-y-3 md:space-y-5">
                <div>
                  <h3 className="font-semibold text-blue-300 mb-2">
                    What is GPU Rental?
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    GPU rental allows you to monetize your GPU computing power
                    by renting it to AI/ML companies, researchers, and
                    developers. Your GPUs become part of the OmniTask
                    distributed computing network, processing tasks and
                    generating passive income.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-blue-300 mb-3">
                    Node Tiers & Daily Earnings
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-400">
                    {[
                      ["Observer", "Entry level, learn without investment"],
                      ["Compute", "Single GPU node, $10–50/day average"],
                      ["Neural", "Multi-GPU setup, $150–500/day average"],
                      [
                        "Intelligence",
                        "Enterprise cluster, $2K–10K/day average",
                      ],
                      ["Cognitive", "Datacenter-grade, $50K+/day potential"],
                    ].map(([tier, desc]) => (
                      <li key={tier} className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">•</span>
                        <span>
                          <strong className="text-slate-300">{tier}:</strong>{" "}
                          {desc}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-3.5">
                  <p className="text-xs text-blue-200 leading-relaxed">
                    <strong>⚡ Pro Tip:</strong> Earnings are determined by GPU
                    model, uptime, task demand, and market conditions. Higher
                    uptime = higher rewards.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-slate-900/60 to-blue-950/50 border border-blue-900/40 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp size={22} className="text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">
                  Revenue Optimization
                </h2>
              </div>
              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold text-blue-300 mb-3">
                    Key Factors for Maximum Earnings
                  </h3>
                  <ul className="space-y-3 text-sm text-slate-400">
                    {[
                      [
                        "①",
                        "Uptime: 99%+ uptime earns priority task allocation (15–25% bonus)",
                      ],
                      [
                        "②",
                        "GPU Model: Latest models (RTX 4090, H100) command 3–5x premium pricing",
                      ],
                      [
                        "③",
                        "Network Latency: Lower latency gets higher-value tasks (20–40% higher rates)",
                      ],
                      [
                        "④",
                        "Task Diversity: Support multiple task types for 5–10x more opportunities",
                      ],
                    ].map(([n, desc]) => (
                      <li key={n} className="flex items-start gap-2">
                        <span className="font-bold text-blue-400 mt-0.5">
                          {n}
                        </span>
                        <span>{desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-amber-950/30 border border-amber-900/30 rounded-xl p-3.5">
                  <p className="text-xs text-amber-300 leading-relaxed">
                    <strong>🎯 Strategy:</strong> Cluster multiple GPUs and
                    maintain institutional-grade infrastructure for exponential
                    earning potential.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="bg-gradient-to-r from-blue-950/50 to-slate-900/60 border border-blue-900/40 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Shield size={22} className="text-blue-400" /> Fair Pricing Model
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
              {[
                ["Your Cut", "70%", "of task revenue goes directly to you"],
                ["Platform Fee", "20%", "covers infrastructure & matching"],
                ["Network Growth", "10%", "reinvested into ecosystem"],
              ].map(([label, pct, desc]) => (
                <div key={label}>
                  <h3 className="font-semibold text-blue-300 mb-2">{label}</h3>
                  <div className="text-4xl font-black text-white mb-1">
                    {pct}
                  </div>
                  <p className="text-slate-500 text-sm">{desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-blue-950/40 border border-blue-900/30 rounded-xl">
              <p className="text-slate-300 text-sm">
                <strong className="text-white">Example:</strong> A $1,000/day
                GPU generates $700 to you, $200 platform fee, $100 reinvested.
                Scale to multiple nodes and earn $20K–50K/month with minimal
                effort.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ── TASKS TAB ── */}
      {activeTab === "tasks" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-5">
            <Card className="bg-gradient-to-br from-slate-900/60 to-blue-950/50 border border-slate-800/60 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center">
                  <BarChart3 size={22} className="text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Task Types</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-blue-300 mb-2">
                    What Are Tasks?
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Tasks are compute jobs submitted by clients to your GPU
                    node. Each task has a specific requirement and a
                    corresponding reward rate.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-blue-300 mb-3">
                    Primary Task Categories
                  </h3>
                  <ul className="space-y-2.5 text-sm">
                    {[
                      [
                        "LLM Inference",
                        "Running large language models. $0.10–0.50/token depending on model size.",
                      ],
                      [
                        "Image Generation",
                        "Stable Diffusion, DALL-E backends. $0.50–2.00 per image.",
                      ],
                      [
                        "Model Training",
                        "Fine-tuning and training jobs. $100–5,000+ per training run.",
                      ],
                      [
                        "Data Processing",
                        "ETL, validation, preprocessing. $0.01–0.10 per data unit.",
                      ],
                    ].map(([title, desc]) => (
                      <li
                        key={title}
                        className="bg-blue-950/30 border border-blue-900/30 rounded-xl p-3"
                      >
                        <p className="font-semibold text-blue-300 mb-0.5">
                          {title}
                        </p>
                        <p className="text-slate-400">{desc}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-blue-950/50 to-slate-900/60 border border-slate-800/60 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center">
                  <Network size={22} className="text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">
                  Task Routing & Allocation
                </h2>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-blue-300 mb-3">
                    How Tasks Find Your Node
                  </h3>
                  <ol className="space-y-2.5 text-sm text-slate-400">
                    {[
                      "Client submits task with specific requirements (GPU type, VRAM, speed)",
                      "OmniTask routing algorithm finds 3–5 matching nodes",
                      "Node with highest uptime + lowest latency wins auction",
                      "Your node executes task and receives payment automatically",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-bold text-blue-400 shrink-0">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="bg-blue-950/40 border border-blue-900/30 rounded-xl p-3.5">
                  <p className="text-xs text-blue-300 leading-relaxed">
                    <strong>💡 Smart Tip:</strong> The routing algorithm favors
                    nodes with 99.5%+ uptime and sub-50ms latency. Premium
                    placement = premium tasks.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-blue-300 mb-2">
                    Competitive Advantage
                  </h3>
                  <ul className="space-y-1 text-sm text-slate-400">
                    <li>✓ Multiple GPUs = get more tasks simultaneously</li>
                    <li>✓ Enterprise-grade cooling = higher uptime scores</li>
                    <li>
                      ✓ Dedicated internet = lower latency = better placement
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>

          <Card className="bg-gradient-to-r from-slate-900/60 to-blue-950/50 border border-slate-800/60 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              Task Lifecycle & Earning Flow
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
              {[
                {
                  num: "1",
                  label: "Task Arrives",
                  desc: "Client submits compute job",
                },
                {
                  num: "2",
                  label: "Node Accepts",
                  desc: "Your GPU wins routing auction",
                },
                {
                  num: "3",
                  label: "Execution",
                  desc: "Task runs on your hardware",
                },
                {
                  num: "4",
                  label: "Validation",
                  desc: "Results verified automatically",
                },
                {
                  num: "5",
                  label: "Payment",
                  desc: "Funds settled in real-time",
                },
              ].map((step, idx) => (
                <div key={idx} className="relative">
                  <div className="bg-gradient-to-br from-blue-950/50 to-slate-900/60 border border-blue-900/40 rounded-xl p-4 text-center">
                    <div className="w-10 h-10 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center mx-auto mb-2">
                      {step.num}
                    </div>
                    <p className="font-semibold text-white text-sm">
                      {step.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{step.desc}</p>
                  </div>
                  {idx < 4 && (
                    <div className="hidden md:flex absolute top-1/2 -right-2 transform -translate-y-1/2">
                      <ArrowRight size={18} className="text-blue-700" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-blue-950/30 border border-blue-900/30 rounded-xl">
              <p className="text-slate-300 text-sm">
                <strong className="text-white">Real Example:</strong> Your H100
                GPU receives LLM inference task (200 requests/day, $2 per
                request). You complete all 200 = $400 daily earnings. Scale
                across 4 GPUs = $1,600/day passive income.
              </p>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-blue-950/50 to-slate-900/60 border border-slate-800/60 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
              <AlertCircle size={22} className="text-blue-400" />
              Pro Strategies for Maximum Task Volume
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
              <div>
                <h3 className="font-semibold text-blue-300 mb-3">
                  Infrastructure Setup
                </h3>
                <ul className="space-y-2 text-sm text-slate-400">
                  {[
                    "Use datacenter-grade GPUs (RTX 6000, H100 preferred) for 10x task volume",
                    "Deploy in multiple regions to catch global task waves",
                    "Use load balancers for optimal network performance",
                    "Monitor temps — cooling = uptime = more tasks",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-500 font-bold mt-0.5">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-blue-300 mb-3">
                  Task Optimization
                </h3>
                <ul className="space-y-2 text-sm text-slate-400">
                  {[
                    "Enable all task types — diversification = steady income",
                    "Batch process tasks when possible for efficiency bonuses",
                    "Join high-tier network (Intelligence/Cognitive) for premium tasks",
                    "Maintain 99.9%+ uptime for tier 1 task priority",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-500 font-bold mt-0.5">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── MODULE MODAL ── */}
      {activeModule && activeTab === "modules" && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="bg-gradient-to-br from-slate-900 to-blue-950 border border-blue-800/50 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-blue-900/30 bg-slate-900/80 backdrop-blur">
              <h2 className="text-2xl font-bold text-white">
                {activeModule.title}
              </h2>
              <button
                onClick={() => setActiveModule(null)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-blue-300 mb-2">
                  Module Content
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  {activeModule.content}
                </p>
              </div>
              <div className="bg-blue-950/40 border border-blue-900/30 rounded-xl p-4">
                <p className="text-sm text-slate-300 leading-relaxed">
                  This is a comprehensive guide covering the essentials of{" "}
                  {activeModule.title.toLowerCase()}. Complete this module to
                  unlock advanced training and higher-tier strategies.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setActiveModule(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white border-0"
                >
                  Close
                </Button>
                {!isCompleted(activeModule.id) && (
                  <Button
                    onClick={() => markComplete(activeModule.id)}
                    disabled={marking}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                  >
                    {marking ? "Marking..." : "Mark Complete"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
