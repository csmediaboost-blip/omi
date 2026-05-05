"use client";

import Link from "next/link";
import { useState, useEffect, useRef, Suspense } from "react";
import {
  ArrowRight,
  Shield,
  CheckCircle,
  Zap,
  Clock,
  Database,
  Eye,
  Lock,
  Activity,
  TrendingUp,
  Globe,
  ChevronDown,
  Users,
  BarChart3,
  Server,
  Award,
  Star,
  Building2,
  HelpCircle,
  Code2,
} from "lucide-react";

// ── COUNTER ANIMATION HOOK ─────────────────────────────────────────────────
function useCounter(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

// ── INTERSECTION OBSERVER HOOK ────────────────────────────────────────────
function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setInView(true);
      },
      { threshold },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ── ANIMATED COUNTER STAT ─────────────────────────────────────────────────
function StatCounter({
  value,
  suffix = "",
  prefix = "",
  label,
  color = "text-emerald-400",
  inView,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  color?: string;
  inView: boolean;
}) {
  const count = useCounter(value, 2200, inView);
  return (
    <div className="text-center">
      <p className={`text-2xl sm:text-4xl md:text-5xl font-black ${color} mb-0.5 sm:mb-1 font-serif`}>
        {prefix}
        {count.toLocaleString()}
        {suffix}
      </p>
      <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold">
        {label}
      </p>
    </div>
  );
}

// ── FAQ ITEM ──────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen(!open)}
      className={`border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${open ? "border-emerald-500/30 bg-slate-900" : "border-slate-800 bg-slate-900/30 hover:border-slate-700"}`}
    >
      <div className="flex justify-between items-center p-4 sm:p-5 md:p-6 gap-3 sm:gap-4">
        <span className="text-white font-semibold text-xs sm:text-sm md:text-base">
          {q}
        </span>
        <ChevronDown
          size={16}
          className={`text-emerald-400 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <div className="px-4 sm:px-5 md:px-6 pb-4 sm:pb-5 text-slate-400 text-xs sm:text-sm leading-relaxed border-t border-slate-800 pt-3 sm:pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

// ── STATIC DATA ───────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "What is OmniTask Pro?",
    a: "OmniTask Pro is an institutional-grade GPU infrastructure platform backed by Fortune 500 AI companies and research institutions. When you invest in a GPU node plan, your capital powers real AI workloads—training, fine-tuning, and inference for OpenAI, Anthropic, Google DeepMind, and other leading AI labs. Your returns come directly from this computational demand. Daily earnings credited to your dashboard in real time.",
  },
  {
    q: "How do I start mining on OmniTask Pro?",
    a: "Create your account, complete KYC identity verification, select a GPU node plan from the Mining section of your dashboard, and start mining via bank transfer, card, or cryptocurrency (USDT TRC-20/ERC-20). Your mining session activates immediately and begins earning within minutes. Complete KYC before withdrawing your profits.",
  },
  {
    q: "What is the minimum investment and how are earnings calculated?",
    a: "The minimum investment is $5 for the Foundation Node tier. Each mining session generates earnings between $0.29-$0.40 per day based on real enterprise GPU demand. Hourly earnings are reduced by 20%, weekly earnings receive a 10% bonus, and monthly earnings receive a 25% bonus. Your actual earnings depend on real computational demand at the time of mining.",
  },
  {
    q: "Is KYC verification required before I can withdraw?",
    a: "Yes. All participants must complete full identity verification (KYC) before withdrawal privileges are granted. This includes submitting a government-issued ID, proof of address, and selfie verification. Your registered payout account name must exactly match your verified identity. This requirement protects all participants and ensures compliance with international AML standards.",
  },
  {
    q: "How does the withdrawal process work?",
    a: "Withdrawals are processed through the Financials section of your dashboard. The minimum withdrawal is $10. Withdrawal requests pass through a multi-layer security validation including KYC check, balance verification, and fraud detection before processing. You can track the status of your withdrawal in real time: Queued → Processing → In Transit → Paid. Processing times range from 24 hours to 7 business days depending on amount.",
  },
  {
    q: "How are mining earnings calculated?",
    a: "Mining earnings are based on actual enterprise GPU demand from our 180+ enterprise clients. Each mining session generates earnings that reflect real computational workload at that moment. Different GPU tiers have different earning potential. All participants should review our terms and only invest capital they can afford to risk.",
  },
  {
    q: "What GPU hardware tiers are available?",
    a: "OmniTask Pro offers multiple hardware tiers: Foundation Node (NVIDIA T4/L4 Shared, from $5), RTX 4090 Node (from $50), A100 Node (from $250), and H100 PCIe Node (from $1,000). Higher-tier GPUs have greater computational power and earn higher returns based on real enterprise demand.",
  },
  {
    q: "What are the withdrawal requirements?",
    a: "You can withdraw your mining profits anytime after completing KYC verification and receiving admin approval. The minimum withdrawal is $10. Withdrawal requests are processed through your Financials dashboard. Processing times range from 24 hours to 7 business days depending on amount. All withdrawals require KYC approval before funds are released.",
  },
];

const STATS = [
  { value: 12400, suffix: "+", label: "Active GPU Nodes" },
  { value: 180, suffix: "+", label: "Enterprise Clients" },
  { value: 9800, suffix: "+", label: "Verified Miners" },
  { value: 180, suffix: "+", label: "Enterprise Clients" },
];

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Real-Time Earnings",
    desc: "Mine GPU nodes and earn real-time profits from enterprise AI workloads. Each mining session generates earnings from real computational demand. Start mining and watch your profits accumulate in real-time.",
  },
  {
    icon: Clock,
    title: "Flexible or Fixed Terms",
    desc: "Rolling flexible plans or 6, 12, and 24-month locked terms for higher projected returns. All plans start from $5 minimum investment.",
  },
  {
    icon: CheckCircle,
    title: "Contract & Flexible Investment Plans",
    desc: "Choose flexible rolling plans or commit to 6, 12, or 24-month contract terms for enhanced projected returns. All plans start from $5. Earnings accrual begins the moment your node activates.",
  },
  {
    icon: Globe,
    title: "Global Enterprise Client Network",
    desc: "180+ enterprise clients including AI laboratories, research institutions, financial services firms, and Fortune 500 technology companies submit workloads to our GPU network 24 hours a day.",
  },
];

const SECURITY_ITEMS = [
  {
    icon: Shield,
    title: "KYC & AML Verification",
    desc: "All investors complete government-issued identity verification and anti-money laundering checks before node activation. Payout account name must match verified identity. UK GDPR and Data Protection Act 2018 compliant.",
  },
  {
    icon: Lock,
    title: "Atomic Financial Security",
    desc: "All balance operations are processed through atomic database transactions with row-level locking. Race conditions, double-spend vulnerabilities, and concurrent modification errors are architecturally impossible.",
  },
  {
    icon: Eye,
    title: "Real-Time Fraud Detection",
    desc: "Automated fraud detection monitors all withdrawal requests for account flags, KYC mismatches, balance discrepancies, and suspicious patterns. Flagged accounts are automatically suspended and reviewed.",
  },
  {
    icon: Database,
    title: "Audited Server Calculations",
    desc: "All earnings, commissions, and withdrawal calculations are performed exclusively on secure, audited backend infrastructure. Client dashboards display only server-verified balances — never client-calculated figures.",
  },
  {
    icon: Building2,
    title: "UK Regulatory Compliance",
    desc: "OmniTask Pro Ltd. operates under UK FCA guidelines, registered in England and Wales (OT-2024-GB-7741902). Full compliance with AML regulations, KYC obligations, and data protection law.",
  },
  {
    icon: Star,
    title: "Multi-Layer PIN Authentication",
    desc: "Every new session requires PIN verification — SHA-256 hashed with unique user salt, stored independently of account credentials. Five consecutive failures trigger automatic 30-minute account lock.",
  },
];

// ── HOME PAGE ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const statsRef = useInView(0.3);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden">
      {/* ── SEO hidden block ── */}
      <div className="sr-only" aria-hidden="true">
        OmniTask Pro is an institutional-grade distributed GPU computing
        platform for enterprise AI workloads. Earn daily returns by providing
        GPU infrastructure to Fortune 500 companies and AI research
        institutions. GPU infrastructure investment platform. AI compute
        infrastructure. Enterprise-backed returns from real GPU workloads.
        NVIDIA H100, A100, RTX 4090 GPU infrastructure. Daily earnings from AI
        training and inference. 12,400+ active GPU nodes globally. 180+
        enterprise clients including OpenAI, Anthropic, Google DeepMind. 9,800+
        verified miners worldwide. UK FCA regulated. AML/KYC compliant. Fully
        transparent. Start mining from $5. Daily profits $0.29-$0.40. Withdraw after KYC approval.
        Secure blockchain payments. omnitaskpro.online - GPU computing mining platform
      </div>

      {/* ── NAV ── */}
      <nav
        className={`sticky top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "bg-slate-950/98 border-b border-slate-800 backdrop-blur-xl shadow-lg" : "bg-slate-950/20 backdrop-blur-sm"}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-[6px] overflow-hidden">
              <img
                src="/logo-main.png"
                alt="OmniTask Pro"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-base sm:text-xl font-black text-white tracking-tight">
              Omni<span className="text-emerald-400">Task</span>
              <span className="text-slate-500 font-light ml-1 text-xs sm:text-sm">
                PRO
              </span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm">
            {[
              ["Platform", "#platform"],
              ["How It Works", "#how"],
              ["Security", "#security"],
              ["FAQ", "#faq"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="hover:text-emerald-400 transition-colors text-slate-400"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/auth/signin"
              className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors px-2 sm:px-3 py-1.5"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        id="platform"
        className="relative pt-12 sm:pt-20 md:pt-32 pb-16 sm:pb-24 overflow-hidden"
      >
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto w-full text-center px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 rounded-full mb-4 sm:mb-6 md:mb-10">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            Institutional GPU Computing
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-black text-white mb-4 sm:mb-6 md:mb-8 leading-tight text-balance">
            Earn{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-300">
              Daily Returns
            </span>{" "}
            from Enterprise AI
          </h1>

          <p className="text-sm sm:text-lg md:text-xl text-slate-400 mb-6 sm:mb-10 md:mb-14 max-w-3xl mx-auto leading-relaxed text-balance">
            Mine GPU node plans and earn real profits from enterprise AI workloads.
            Start a mining session and watch your earnings grow in real-time.
            Supported by Fortune 500 companies and leading AI research institutions. Start from $5.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4 justify-center mb-8 sm:mb-12 md:mb-20">
            <Link
              href="/auth/signup"
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm sm:text-base md:text-lg px-6 sm:px-8 py-3 sm:py-4 rounded-xl transition-all hover:shadow-lg hover:shadow-emerald-500/30"
            >
              Start Mining Now
            </Link>
            <a
              href="#how"
              className="border border-slate-700 hover:border-slate-600 text-white font-bold text-sm sm:text-base md:text-lg px-6 sm:px-8 py-3 sm:py-4 rounded-xl transition-all hover:bg-slate-900/50 flex items-center justify-center gap-2"
            >
              How It Works <ArrowRight size={18} />
            </a>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
            {[
              { label: "Active Nodes", value: "12,400+" },
              { label: "Enterprise Clients", value: "180+" },
              { label: "Miners Verified", value: "9,800+" },
              { label: "Daily Uptime", value: "99.9%" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 md:p-4 hover:border-slate-700 transition-all"
              >
                <p className="text-emerald-400 font-black text-xl md:text-2xl">
                  {value}
                </p>
                <p className="text-slate-500 text-xs md:text-sm mt-1">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST BADGES ── */}
      <section className="border-t border-slate-800 py-8 sm:py-12 md:py-16 bg-slate-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 sm:gap-6">
            {[
              { name: "OpenAI", icon: "🔬" },
              { name: "Anthropic", icon: "🤖" },
              { name: "Google", icon: "🔍" },
              { name: "Meta", icon: "📱" },
              { name: "Microsoft", icon: "💼" },
              { name: "DeepMind", icon: "🧠" },
            ].map(({ name, icon }) => (
              <div
                key={name}
                className="flex flex-col items-center gap-1.5 sm:gap-2 group hover:scale-110 transition-transform"
              >
                <div className="w-10 sm:w-12 h-10 sm:h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center group-hover:border-emerald-500/40 transition-all">
                  <span className="text-lg sm:text-2xl">{icon}</span>
                </div>
                <span className="text-xs sm:text-sm font-semibold text-slate-400">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI MODELS ── */}
      <section id="how" className="py-12 sm:py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <Zap size={14} />
              AI Models Powered
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 text-balance">
              Your GPU Powers Next-Gen AI
            </h2>
            <p className="text-slate-400 text-sm sm:text-lg max-w-3xl mx-auto">
              Your invested GPU capacity is allocated to train and run the most
              cutting-edge AI models in the world.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              {
                model: "GPT-5",
                company: "OpenAI",
                status: "Training",
                gpu: "H100 SXM5",
              },
              {
                model: "Claude Opus 4.6",
                company: "Anthropic",
                status: "Fine-tuning",
                gpu: "A100 PCIe",
              },
              {
                model: "Gemini Ultra",
                company: "Google",
                status: "Inference",
                gpu: "TPU v5",
              },
              {
                model: "LLaMA 3.5",
                company: "Meta",
                status: "Training",
                gpu: "H100 PCIe",
              },
            ].map(({ model, company, status, gpu }) => (
              <div
                key={model}
                className="border border-slate-800 bg-slate-900/40 rounded-2xl p-4 sm:p-6 hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all group relative"
              >
                <div
                  className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-hidden="true"
                />
                <div className="relative z-10">
                  <div className="mb-2.5 sm:mb-3">
                    <h3 className="font-black text-white text-base sm:text-lg mb-0.5 sm:mb-1">
                      {model}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 font-semibold">
                      {company}
                    </p>
                  </div>
                  <div className="space-y-2 border-t border-slate-800 pt-3 sm:pt-4 mt-3 sm:mt-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-slate-500 uppercase tracking-widest">
                        Status
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        {status}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-slate-500 uppercase tracking-widest">
                        GPU Type
                      </span>
                      <span className="text-xs font-bold text-slate-300">
                        {gpu}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 sm:mt-12">
            <p className="text-slate-500 text-xs sm:text-sm">
              Your GPU allocation updates in real-time as enterprise workloads
              are distributed across our global network.
            </p>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="py-12 sm:py-16 md:py-24 bg-slate-900/30 border-t border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6" ref={statsRef.ref}>
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <TrendingUp size={14} />
              Platform Metrics
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white text-balance">
              Trusted by 9,800+ Verified Investors
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 md:gap-12">
            {STATS.map((stat) => (
              <StatCounter
                key={stat.label}
                value={stat.value}
                suffix={stat.suffix}
                label={stat.label}
                inView={statsRef.inView}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-12 sm:py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <Activity size={14} />
              Four Simple Steps
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 text-balance">
              Start Earning in Minutes
            </h2>
            <p className="text-slate-400 text-sm sm:text-lg max-w-3xl mx-auto">
              Complete KYC, choose your GPU tier, fund your account, and your
              node goes live within 24–48 hours.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {[
              {
                step: 1,
                title: "Create & Verify",
                desc: "Sign up and complete KYC identity verification in under 5 minutes.",
                icon: CheckCircle,
              },
              {
                step: 2,
                title: "Choose GPU Tier",
                desc: "Select from 6 hardware tiers ranging from $5 (Foundation) to $25,000+ (H100 Cluster).",
                icon: Server,
              },
              {
                step: 3,
                title: "Fund Your Node",
                desc: "Deposit via bank transfer, card, or USDT (TRC-20/ERC-20). Processing within 24–48 hours.",
                icon: Zap,
              },
              {
                step: 4,
                title: "Start Mining",
                desc: "Your mining session activates immediately and generates daily profits ($0.29-$0.40). Once target reached, withdraw or start another session.",
                icon: TrendingUp,
              },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div
                key={step}
                className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 sm:p-8 hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all group relative"
              >
                <div className="absolute -top-3 -left-3 sm:-top-4 sm:-left-4 w-7 h-7 sm:w-8 sm:h-8 bg-emerald-500 text-slate-950 font-black rounded-full flex items-center justify-center text-xs sm:text-sm">
                  {step}
                </div>
                <div className="w-10 sm:w-12 h-10 sm:h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-3.5 sm:mb-5">
                  <Icon className="text-emerald-400" size={20} />
                </div>
                <h3 className="font-black text-white mb-2 sm:mb-3 text-sm sm:text-base">{title}</h3>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-12 sm:py-16 md:py-24 bg-slate-900/30 border-t border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <Award size={14} />
              Why OmniTask Pro
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 text-balance">
              Enterprise-Grade Infrastructure
            </h2>
            <p className="text-slate-400 text-sm sm:text-lg max-w-3xl mx-auto">
              Purpose-built for institutional investors with transparent
              reporting and zero hidden fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 sm:p-8 hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all group"
              >
                <div className="w-10 sm:w-12 h-10 sm:h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-3.5 sm:mb-5 group-hover:border-emerald-500/40 transition-all">
                  <Icon className="text-emerald-400" size={20} />
                </div>
                <h3 className="font-black text-white mb-2 sm:mb-3 text-sm sm:text-base">{title}</h3>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RETURNS / PLANS ── */}
      <section className="py-12 sm:py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 md:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
                <BarChart3 size={14} />
                Mining Options
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 leading-tight">
                Start Mining in Minutes
              </h2>
              <p className="text-slate-400 text-sm sm:text-lg mb-6 sm:mb-8 leading-relaxed">
                Mine GPU nodes with pay-as-you-go pricing. Each mining session generates earnings 
                based on real enterprise demand. Complete KYC verification before withdrawing profits.
              </p>
              <div className="space-y-3 sm:space-y-4">
                {[
                  "Foundation Node: $5 minimum",
                  "Pay-as-you-go mining only",
                  "Daily profits:",
                  "Real-time earnings dashboard",
                  "Withdraw after KYC approval",
                ].map((text) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <CheckCircle className="text-emerald-400" size={18} />
                    </div>
                    <span className="text-slate-300">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700">
                <h3 className="font-black text-white text-lg">
                  Mining Tiers
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  Choose your GPU hardware tier
                </p>
              </div>
              <div className="p-6 space-y-0">
                {[
                  { name: "Foundation Node", specs: "T4/L4 Shared" },
                  { name: "RTX 4090", specs: "High-Performance" },
                  { name: "A100 PCIe", specs: "Enterprise AI" },
                  { name: "H100 PCIe", specs: "Flagship Tier" },
                ].map(({ name, specs }, i) => (
                  <div
                    key={name}
                    className={`flex justify-between items-center py-4 ${i !== 3 ? "border-b border-slate-700" : ""}`}
                  >
                    <span className="font-semibold text-white text-sm">
                      {name}
                    </span>
                    <span className="text-emerald-400 font-black text-sm">
                      {specs}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section
        id="security"
        className="py-12 sm:py-16 md:py-24 bg-slate-900/30 border-t border-b border-slate-800"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <Shield size={14} />
              Bank-Grade Security
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 text-balance">
              Your Capital is Protected
            </h2>
            <p className="text-slate-400 text-sm sm:text-lg max-w-3xl mx-auto">
              Enterprise-grade financial security with atomic transactions,
              real-time fraud detection, and full regulatory compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-8 sm:mb-12">
            {SECURITY_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 sm:p-6 hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all"
              >
                <div className="w-10 sm:w-12 h-10 sm:h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-3 sm:mb-4">
                  <Icon className="text-emerald-400" size={20} />
                </div>
                <h3 className="font-black text-white mb-2 sm:mb-3 text-sm sm:text-base">{title}</h3>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="border border-slate-700 rounded-2xl p-5 sm:p-8 bg-slate-900/60">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center">
              <div>
                <p className="text-xs sm:text-sm text-slate-500 uppercase tracking-widest font-bold mb-1.5 sm:mb-2">
                  Registration
                </p>
                <p className="text-base sm:text-lg font-black text-white">
                  OT-2024-GB-7741902
                </p>
                <p className="text-xs text-slate-600 mt-0.5 sm:mt-1">
                  Registered in England &amp; Wales
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500 uppercase tracking-widest font-bold mb-1.5 sm:mb-2">
                  Compliance
                </p>
                <p className="text-base sm:text-lg font-black text-white">
                  UK FCA Regulated
                </p>
                <p className="text-xs text-slate-600 mt-0.5 sm:mt-1">
                  Full AML/KYC &amp; GDPR Compliant
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500 uppercase tracking-widest font-bold mb-1.5 sm:mb-2">
                  Certifications
                </p>
                <div className="flex flex-col gap-1">
                  {[
                    "ISO 27001 Ready",
                    "SOC 2 Audit",
                    "Enterprise-Grade Encryption",
                  ].map((c) => (
                    <div key={c} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      <span className="text-xs sm:text-sm text-slate-300">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-12 sm:py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <Users size={14} />
              Investor Testimonials
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white text-balance">
              Trusted by Thousands
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
            {[
              {
                name: "Dr. Sarah Chen",
                role: "AI Researcher",
                text: "I invest through OmniTask Pro to support real AI research while earning returns. Transparent, secure, and genuinely supporting innovation.",
                rating: 5,
              },
              {
                name: "James Mitchell",
                role: "Institutional Investor",
                text: "Enterprise-grade infrastructure with real earnings from actual workloads. This is the future of infrastructure-as-investment.",
                rating: 5,
              },
              {
                name: "Priya Patel",
                role: "Tech Entrepreneur",
                text: "Daily withdrawals, real-time dashboard, genuine enterprise clients. Finally an investment platform I actually trust.",
                rating: 5,
              },
            ].map(({ name, role, text, rating }) => (
              <div
                key={name}
                className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 sm:p-6 hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all"
              >
                <div className="flex gap-1 mb-3 sm:mb-4">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className="text-emerald-400 fill-emerald-400"
                    />
                  ))}
                </div>
                <p className="text-slate-300 mb-3 sm:mb-4 leading-relaxed text-xs sm:text-sm">
                  {`"${text}"`}
                </p>
                <div className="border-t border-slate-800 pt-3 sm:pt-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-600 mb-1">
                  &copy; 2026 OmniTask Pro Ltd. All rights reserved. Registered
                  in England &amp; Wales.
                </p>
                <p className="text-xs text-slate-700 leading-relaxed max-w-3xl">
                  <strong className="text-slate-600">Risk Disclosure:</strong>{" "}
                  Investing in GPU node plans involves risk. Returns are not
                  guaranteed. Capital at risk. Past performance is not
                  indicative of future results. This platform does not
                  constitute regulated investment advice under the Financial
                  Services and Markets Act 2000. Please read the full company
                  disclosure and risk disclosures before investing.
                </p>
              </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEVELOPERS / API ── */}
      <section className="py-12 sm:py-16 md:py-24 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <Code2 size={14} />
              For Developers
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 text-balance">
              Build on OmniTask Pro
            </h2>
            <p className="text-slate-400 text-sm sm:text-lg max-w-3xl mx-auto">
              Integrate GPU allocation, real-time earnings, payments, and task processing directly into your application using our REST API.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-10">
            <div className="border border-slate-800 rounded-2xl p-6 sm:p-8 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <Code2 size={20} className="text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold text-white">REST API</h3>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                Complete API documentation with endpoints for authentication, GPU tasks, payments, financials, and user management. All endpoints fully documented with examples.
              </p>
              <Link
                href="/api-docs"
                className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-semibold text-sm transition-colors"
              >
                View API Docs <ArrowRight size={16} />
              </Link>
            </div>

            <div className="border border-slate-800 rounded-2xl p-6 sm:p-8 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <Server size={20} className="text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Integration Support</h3>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                Get technical support for API integration from our developer team. SDKs available for JavaScript, Python, and Go. Webhooks for real-time events.
              </p>
              <a
                href="https://omnitaskprosupport.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-semibold text-sm transition-colors"
              >
                Developer Portal <ArrowRight size={16} />
              </a>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center">
            <p className="text-slate-300 mb-3">Ready to integrate?</p>
            <p className="text-sm text-slate-400 mb-4">
              Get started with our comprehensive API documentation and developer-friendly SDKs.
            </p>
            <Link
              href="/api-docs"
              className="inline-block bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              Read Full Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        id="faq"
        className="py-12 sm:py-16 md:py-24 bg-slate-900/30 border-t border-b border-slate-800"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6">
              <HelpCircle size={14} />
              FAQ
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white text-balance">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {FAQS.map(({ q, a }) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-12 sm:py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4 sm:mb-6 text-balance">
            Ready to Start Earning?
          </h2>
          <p className="text-sm sm:text-lg text-slate-400 mb-8 sm:mb-10 leading-relaxed">
            Join 9,800+ verified investors earning daily returns from enterprise
            GPU workloads. Start from just $5.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm sm:text-lg px-6 sm:px-10 py-3 sm:py-4 rounded-xl transition-all hover:shadow-lg hover:shadow-emerald-500/30"
            >
              Create Account Now
            </Link>
            <Link
              href="/dashboard"
              className="border border-slate-700 hover:border-slate-600 text-white font-bold text-sm sm:text-lg px-6 sm:px-10 py-3 sm:py-4 rounded-xl transition-all hover:bg-slate-900/50"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="border-t border-slate-800 bg-slate-950"
        aria-label="OmniTask Pro footer"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 sm:gap-10 mb-10 sm:mb-14">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <div className="w-7 sm:w-8 h-7 sm:h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <span className="text-slate-950 font-black text-xs sm:text-sm">OT</span>
                </div>
                <span className="text-base sm:text-xl font-black text-white">
                  Omni<span className="text-emerald-400">Task</span>
                  <span className="text-slate-600 font-light ml-1 text-xs sm:text-sm">
                    PRO
                  </span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-4 sm:mb-5 max-w-xs">
                Distributed GPU computing investment platform. Earn daily
                returns from enterprise AI workloads processed across our global
                data centre network.
              </p>
              <div className="space-y-1">
                <p className="text-xs text-slate-600">
                  OmniTask Pro Ltd. · Reg. OT-2024-GB-7741902
                </p>
                <p className="text-xs text-slate-600">
                  Level 14, One Canada Square, London E14 5AB
                </p>
                <p className="text-xs text-slate-600">
                  compliance@omnitaskpro.io
                </p>
                <p className="text-xs text-slate-600">
                  Tel: +44 20 7946 0958
                </p>
                <p className="text-xs text-slate-600">
                  omnitaskpro.online
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-3 sm:mb-4 text-xs sm:text-sm tracking-wider uppercase">
                Investors
              </h4>
              <ul className="space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-slate-500">
                {[
                  ["Create Account", "/auth/signup"],
                  ["Sign In", "/auth/signin"],
                  ["Dashboard", "/dashboard"],
                  ["GPU Plans", "/dashboard/gpu-plans"],
                  ["Financials", "/dashboard/financials"],
                ].map(([l, h]) => (
                  <li key={l}>
                    <Link
                      href={h}
                      className="hover:text-emerald-400 transition-colors"
                    >
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-3 sm:mb-4 text-xs sm:text-sm tracking-wider uppercase">
                Platform
              </h4>
              <ul className="space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-slate-500">
                {[
                  ["How It Works", "/#how"],
                  ["Security", "/#security"],
                  ["Company Disclosure", "/dashboard/company-disclosure"],
                  ["API Documentation", "/api-docs"],
                  ["FAQ", "/#faq"],
                ].map(([l, h]) => (
                  <li key={l}>
                    <a
                      href={h}
                      className="hover:text-emerald-400 transition-colors"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-3 sm:mb-4 text-xs sm:text-sm tracking-wider uppercase">
                Support
              </h4>
              <ul className="space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-slate-500">
                {[
                  ["Professional Support", "https://omnitaskprosupport.com"],
                  ["Developer Docs", "/api-docs"],
                  ["Status Page", "https://omnitaskprosupport.com/status"],
                  ["Contact Support", "https://omnitaskprosupport.com/contact"],
                ].map(([l, h]) => (
                  <li key={l}>
                    {h.startsWith("http") ? (
                      <a
                        href={h}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-emerald-400 transition-colors"
                      >
                        {l}
                      </a>
                    ) : (
                      <Link
                        href={h}
                        className="hover:text-emerald-400 transition-colors"
                      >
                        {l}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-3 sm:mb-4 text-xs sm:text-sm tracking-wider uppercase">
                Legal
              </h4>
              <ul className="space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-slate-500">
                {[
                  ["Terms of Service", "/terms"],
                  ["Privacy Policy", "/privacy"],
                  ["License Agreement", "/contributor-agreement"],
                  ["Contact", "/contact"],
                  ["About Us", "/about"],
                ].map(([l, h]) => (
                  <li key={l}>
                    <Link
                      href={h}
                      className="hover:text-emerald-400 transition-colors"
                    >
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="text-xs text-slate-600 mb-1">
                  &copy; 2026 OmniTask Pro Ltd. All rights reserved. Registered
                  in England &amp; Wales.
                </p>
                <p className="text-xs text-slate-700 leading-relaxed max-w-3xl">
                  <strong className="text-slate-600">Risk Disclosure:</strong>{" "}
                  Investing in GPU node plans involves risk. Returns are not
                  guaranteed. Capital at risk. Past performance is not
                  indicative of future results. This platform does not
                  constitute regulated investment advice under the Financial
                  Services and Markets Act 2000. Please read the full company
                  disclosure and risk disclosures before investing.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">
                  All Systems Operational
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
