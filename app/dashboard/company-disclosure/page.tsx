"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE
// ─────────────────────────────────────────────────────────────────────────────
function Signature({
  width = 200,
  height = 68,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 240 75"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M 20 58 C 18 44, 16 28, 24 16 C 30 8, 42 6, 50 14 C 58 22, 56 38, 50 48 C 45 56, 36 60, 28 58 C 22 57, 20 58, 20 58"
        stroke="#111111"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 50 48 C 56 44, 62 46, 66 52 C 70 58, 68 64, 64 62"
        stroke="#111111"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 64 62 C 68 54, 74 42, 80 36 C 84 30, 88 34, 88 40"
        stroke="#111111"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 88 40 C 90 50, 92 58, 96 56 C 100 54, 102 44, 104 38 C 106 32, 110 36, 112 44 C 114 52, 114 60, 118 58 C 122 56, 124 46, 126 40 C 128 34, 132 36, 134 44"
        stroke="#111111"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 134 44 C 136 52, 136 60, 140 58 C 144 56, 148 46, 152 40 C 156 35, 162 36, 165 44 C 167 50, 165 60, 162 62 C 159 64, 156 60, 157 56 C 158 52, 164 50, 170 54 C 176 58, 178 66, 176 70"
        stroke="#111111"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="84" cy="28" r="2" fill="#111111" />
      <path
        d="M 8 66 C 60 62, 120 61, 188 64"
        stroke="#111111"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 15 55 C 70 51, 130 50, 175 53"
        stroke="#111111"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const CO = {
  name: "OmniTask Pro Ltd.",
  reg: "Reg. No. OT-2024-GB-7741902",
  address: "Level 14, One Canada Square, Canary Wharf, London E14 5AB",
  email: "compliance@omnitaskpro.io",
  web: "www.omnitaskpro.io",
  signatory: "Dmitriy Ardalio",
  sigTitle: "Chairperson, Board of Directors",
  version: "v2.1.0 — April 2026",
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function DocPage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-white min-h-screen w-full max-w-4xl mx-auto px-16 py-14 text-slate-900"
      style={{
        fontFamily: "'Georgia','Times New Roman',serif",
        fontSize: "15px",
        lineHeight: "1.88",
      }}
    >
      {children}
    </div>
  );
}

function PageHeader({
  sec,
  title,
  sub,
}: {
  sec: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-10 pb-6 border-b-2 border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold tracking-[0.25em] uppercase text-slate-500 border border-slate-300 px-3 py-1">
          {sec}
        </span>
        <span className="text-xs text-slate-400 tracking-widest">
          {CO.version}
        </span>
      </div>
      <h1
        className="text-4xl font-bold text-slate-900 mt-4 mb-2"
        style={{ letterSpacing: "-0.5px" }}
      >
        {title}
      </h1>
      {sub && <p className="text-base text-slate-500 italic mt-1">{sub}</p>}
    </div>
  );
}

function PageFooter({ pg, total }: { pg: number; total: number }) {
  return (
    <div className="mt-14 pt-5 border-t border-slate-300">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-bold text-slate-600">{CO.name}</p>
          <p className="text-xs text-slate-400">{CO.reg}</p>
          <p className="text-xs text-slate-400">
            Official company-disclosure · April 2026
          </p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Signature width={116} height={38} />
          <div className="w-28 border-b border-slate-400" />
          <p className="text-xs font-semibold text-slate-700">{CO.signatory}</p>
          <p className="text-[10px] text-slate-500">{CO.sigTitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="w-14 h-14 border-2 border-double border-slate-700 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[6px] font-black text-slate-700 tracking-wider">
                OMNITASK
              </p>
              <p className="text-[6px] font-black text-slate-700 tracking-wider">
                PRO LTD.
              </p>
              <div className="border-t border-slate-500 my-0.5 mx-1" />
              <p className="text-[5px] text-slate-500">OFFICIAL</p>
              <p className="text-[5px] text-slate-500">APR 2026</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Page {pg} of {total}
          </p>
        </div>
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold text-slate-800 mt-10 mb-3 pb-2 border-b border-slate-200">
      {children}
    </h2>
  );
}
function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-bold text-slate-800 mt-6 mb-2">{children}</h3>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-slate-700 mb-4 text-[14.5px] leading-[1.9]">
      {children}
    </p>
  );
}
function Alert({
  type,
  children,
}: {
  type: "warn" | "info" | "danger";
  children: React.ReactNode;
}) {
  const c = {
    warn: "bg-amber-50 border-l-4 border-amber-600 text-amber-900",
    info: "bg-blue-50 border-l-4 border-blue-600 text-blue-900",
    danger: "bg-red-50 border-l-4 border-red-700 text-red-900",
  };
  return (
    <div className={`${c[type]} px-5 py-4 my-5 text-sm leading-relaxed`}>
      {children}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-b border-slate-200 py-2.5">
      <span className="w-64 text-sm font-semibold text-slate-600 shrink-0">
        {label}
      </span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  );
}
function InfoBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 p-6 my-6">
      <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-4">
        {title}
      </p>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function CompanyDisclosurePage() {
  const [cur, setCur] = useState(1);

  const pages = [
    // ══════════════════════════════════════════════════════════════ PAGE 1 ═══
    {
      title: "Cover Page",
      content: (
        <div
          className="min-h-screen bg-slate-950 flex flex-col"
          style={{ fontFamily: "'Georgia',serif" }}
        >
          <div className="border-b border-slate-700 px-16 py-4 flex justify-between">
            <span className="text-slate-400 text-xs tracking-[0.2em] uppercase">
              Confidential · Public Distribution Authorised
            </span>
            <span className="text-slate-400 text-xs">{CO.version}</span>
          </div>

          <div className="flex-1 flex flex-col justify-between px-16 py-14">
            <div>
              <div className="flex items-center gap-4 mb-12">
                <div className="w-16 h-16 border-2 border-emerald-500 flex items-center justify-center">
                  <span className="text-emerald-400 font-black text-xl">
                    OT
                  </span>
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-lg tracking-wider">
                    OmniTask Pro Ltd.
                  </p>
                  <p className="text-slate-500 text-xs tracking-widest uppercase">
                    Distributed GPU Computing Infrastructure
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-10 mb-10">
                <p className="text-slate-400 text-sm tracking-[0.3em] uppercase mb-4">
                  Official company-disclosure & Transparency Documentation
                </p>
                <h1
                  className="text-6xl font-bold text-white leading-tight mb-4"
                  style={{ letterSpacing: "-1px" }}
                >
                  Platform Overview,
                  <br />
                  Operations &<br />
                  <span className="text-emerald-400">Investment Framework</span>
                </h1>
                <p className="text-slate-400 text-lg mt-6 max-w-xl leading-relaxed">
                  A comprehensive disclosure of OmniTask Pro's GPU computing
                  infrastructure, revenue architecture, participant economics,
                  compliance obligations, and governance structure for the 2026
                  fiscal year.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-8 border-t border-slate-700 pt-10">
                {[
                  ["Document Type", "Public company-disclosure"],
                  ["Issue Date", "April 2026"],
                  ["Version", "2.1.0 — Final"],
                  ["Classification", "Public Disclosure"],
                  ["Jurisdiction", "England & Wales"],
                  ["Reg. Number", "OT-2024-GB-7741902"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-slate-500 text-xs tracking-widest uppercase mb-1">
                      {l}
                    </p>
                    <p className="text-white text-sm font-semibold">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-600 pt-8 mt-14">
              <div className="grid grid-cols-2 gap-12">
                <div>
                  <p className="text-slate-500 text-xs mb-5">
                    Issued and authorised by:
                  </p>
                  <div style={{ filter: "invert(1) brightness(0.85)" }}>
                    <Signature width={170} height={56} />
                  </div>
                  <div className="border-b border-slate-500 w-64 mt-3 mb-2" />
                  <p className="text-slate-200 text-sm font-bold">
                    {CO.signatory}
                  </p>
                  <p className="text-slate-400 text-xs">{CO.sigTitle}</p>
                  <p className="text-slate-500 text-xs mt-1">
                    {CO.name} · {CO.reg}
                  </p>
                  <p className="text-slate-600 text-xs mt-0.5">{CO.address}</p>
                </div>
                <div className="flex items-end justify-end">
                  <div className="border-2 border-slate-600 w-32 h-32 flex items-center justify-center">
                    <div className="text-center px-2">
                      <p className="text-slate-400 text-[9px] font-black tracking-widest leading-tight">
                        OMNITASK
                      </p>
                      <p className="text-slate-400 text-[9px] font-black tracking-widest leading-tight">
                        PRO LTD.
                      </p>
                      <div className="border-t border-slate-500 my-1 mx-2" />
                      <p className="text-slate-500 text-[8px] tracking-wider">
                        OFFICIAL SEAL
                      </p>
                      <p className="text-slate-500 text-[8px]">APR 2026</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-slate-600 text-xs mt-6 leading-relaxed max-w-2xl">
                This document constitutes the official transparency disclosure
                of OmniTask Pro Ltd. All figures, projections, and operational
                data herein are subject to market conditions and do not
                represent guaranteed returns. Participation in any OmniTask Pro
                programme implies full acceptance of all disclosed risk factors
                contained in Section 7.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 2 ═══
    {
      title: "Company Information",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 1 — Corporate Profile"
            title="Company Information & Governance"
            sub="Legal registration, operational structure, and board authority"
          />

          <H2>1.1 Corporate Identity</H2>
          <P>
            OmniTask Pro Ltd. is a distributed GPU computing infrastructure
            company incorporated under the laws of England and Wales. The
            company operates a global network of GPU nodes that provide
            computational services to artificial intelligence companies,
            research institutions, data processing enterprises, and machine
            learning laboratories across six continents. OmniTask Pro serves as
            the bridge between individuals who invest in high-performance
            computing hardware allocations and the organisations that require
            that computational capacity at scale, managing all operational,
            compliance, and technical complexities on behalf of node operators.
          </P>
          <P>
            The company's operational headquarters is situated in London, United
            Kingdom, with regional offices and data centre facilities located in
            New York, San Francisco, Frankfurt, Singapore, Dubai, Toronto, and
            Zurich. All financial operations, compliance oversight, and
            participant relations are coordinated from the London headquarters
            under the supervision of the Board of Directors, chaired by Dmitriy
            Ardalio.
          </P>

          <InfoBox title="Official Company Registration Details">
            <Row label="Company Name" value="OmniTask Pro Ltd." />
            <Row label="Registration Number" value="OT-2024-GB-7741902" />
            <Row label="Jurisdiction" value="England & Wales, United Kingdom" />
            <Row label="Year of Incorporation" value="2024" />
            <Row
              label="Registered Address"
              value="Level 14, One Canada Square, Canary Wharf, London E14 5AB"
            />
            <Row
              label="Operational Status"
              value="Active — Full Global Operations"
            />
            <Row
              label="Business Classification"
              value="SIC 62020 — Information Technology Consultancy"
            />
            <Row
              label="Compliance Framework"
              value="UK FCA Registered · GDPR Compliant · AML/KYC Certified"
            />
          </InfoBox>

          <H2>1.2 Board of Directors & Governance Structure</H2>
          <P>
            OmniTask Pro Ltd. is governed by a Board of Directors comprising
            seven members with expertise spanning financial technology,
            distributed computing, artificial intelligence, regulatory
            compliance, and international operations. The company operates under
            a collective governance model chaired by Dmitriy Ardalio, rather
            than a single Chief Executive Officer structure. Executive authority
            is distributed across a Management Committee consisting of the Chief
            Technology Officer, Chief Financial Officer, Chief Compliance
            Officer, and Director of Global Operations.
          </P>
          <P>
            This collective governance model ensures that no single individual
            holds unilateral authority over company operations, financial
            decisions, or participant payouts. All significant decisions require
            board-level approval and are recorded in official meeting minutes
            available to regulatory authorities upon request. Participant-facing
            decisions, including withdrawal processing, account reviews, and
            fraud investigations, are handled by dedicated operational teams
            reporting directly to the Compliance Officer.
          </P>

          <H2>1.3 Operational Scale — Q1 2026</H2>
          <div className="grid grid-cols-3 gap-4 my-5">
            {[
              ["12,400+", "Active GPU Nodes Globally"],
              ["180+", "Enterprise Computing Clients"],
              ["9,800+", "Registered Node Operators"],
              ["$47.2M", "Processing Value — Q1 2026"],
              ["99.81%", "Network Uptime (12-month)"],
              ["6", "Continental Operational Regions"],
            ].map(([m, d]) => (
              <div key={d} className="border border-slate-200 p-4">
                <p
                  className="text-3xl font-bold text-slate-800"
                  style={{ fontFamily: "Georgia" }}
                >
                  {m}
                </p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider leading-snug">
                  {d}
                </p>
              </div>
            ))}
          </div>

          <PageFooter pg={2} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 3 ═══  ← UPDATED
    {
      title: "GPU Revenue Architecture",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 2 — Revenue Architecture"
            title="How GPU Computing Generates Real Revenue"
            sub="A complete, plain-English explanation of what a GPU is, why the world's biggest companies pay billions to use them, and exactly how that creates your earnings"
          />

          <H2>2.1 What Is a GPU — And Why Does It Matter to You?</H2>
          <P>
            Before we explain how you earn, let us explain what a GPU actually
            is — because this is the foundation of everything on this platform.
          </P>
          <P>
            GPU stands for <strong>Graphics Processing Unit</strong>.
            Originally, GPUs were microchips inside computers designed to render
            images and videos — the hardware that makes your screen display
            sharp graphics in video games and movies. But engineers discovered
            something remarkable: the way a GPU processes graphics — by running
            thousands of tiny mathematical calculations simultaneously in
            parallel — is exactly the kind of computation that artificial
            intelligence requires.
          </P>
          <P>
            Think of it this way. A traditional computer processor (CPU) is like
            a highly intelligent single person who can solve any problem but can
            only work on one calculation at a time. A GPU is like an enormous
            room of 10,000 people, each doing a simple calculation
            simultaneously. When you need to train an AI model — which requires
            performing trillions of identical mathematical operations across
            billions of data points — the room of 10,000 wins every time. That
            is why NVIDIA, the company that makes the GPUs powering the world's
            AI revolution, became a $3 trillion company. GPUs are the physical
            engine of the artificial intelligence era.
          </P>

          <Alert type="info">
            <strong>The Simple Version:</strong> A GPU is a specialised computer
            chip. Companies that build AI — OpenAI, Google, Meta, Anthropic —
            need thousands of these chips running continuously to train and
            operate their AI systems. They cannot always own enough chips
            themselves. So they rent them. That rental revenue is what creates
            your earnings on OmniTask Pro.
          </Alert>

          <H2>2.2 Why AI Companies Pay to Rent GPU Power</H2>
          <P>
            Training a single large AI model — the kind that powers ChatGPT or
            Google Gemini — can require running thousands of high-performance
            GPUs continuously for weeks or months. A single NVIDIA H100 GPU, the
            most advanced chip currently available, costs approximately $30,000
            to $40,000 to purchase outright. To train a frontier AI model, a
            company might need 10,000 to 50,000 of these chips simultaneously,
            representing a hardware cost of $300 million to $2 billion before
            accounting for electricity, cooling, facilities, and maintenance.
          </P>
          <P>
            This is why even the world's wealthiest technology companies —
            companies with billions in annual revenue — routinely rent GPU
            computing power rather than own it all outright. Renting provides
            flexibility: they can scale up for a large training run and scale
            back down when it is complete, paying only for what they use rather
            than owning expensive equipment that sits idle between projects.
          </P>
          <P>
            OmniTask Pro operates within this market as a distributed GPU
            infrastructure provider. We aggregate computing capacity from our
            network of professionally managed data centres and sell that
            capacity to enterprises at competitive rates — below the pricing of
            major cloud providers like Amazon Web Services, Microsoft Azure, and
            Google Cloud, which carry premium charges for their brand name and
            consumer-facing services. Our enterprise clients receive
            enterprise-grade GPU performance at more efficient pricing. Their
            payments flow through OmniTask Pro to the node operators who have
            funded the infrastructure — which is you.
          </P>

          <H2>2.3 The OmniTask Pro Revenue Chain — Step by Step</H2>
          <P>
            Here is the exact sequence of how your investment translates into
            earnings, explained with complete transparency:
          </P>
          <div className="space-y-4 my-6">
            {(
              [
                [
                  "Step 1 — You invest in a GPU node plan",
                  "When you select a GPU node plan on OmniTask Pro and fund it, your capital is allocated to verified, professional-grade GPU hardware within our Tier III and Tier IV data centre facilities globally. You do not need to own, manage, or even see the hardware. OmniTask Pro handles all operational responsibilities — including power, cooling, network connectivity, hardware maintenance, and 24/7 monitoring.",
                ],
                [
                  "Step 2 — Enterprise clients submit computing requests",
                  "OmniTask Pro's commercial team maintains contracts with 180+ enterprise clients — AI laboratories, research institutions, financial services companies, and Fortune 500 technology firms. These clients submit GPU computing requests through our platform: AI model training runs, fine-tuning operations, inference serving at scale, and data processing workloads.",
                ],
                [
                  "Step 3 — Your node processes their workloads",
                  "The OmniTask Pro platform allocates incoming enterprise workloads across the GPU network, including the hardware capacity you have funded. Your node processes these workloads continuously, generating billable compute hours. Enterprise clients are billed at rates ranging from $2.10 to $18.40 per GPU hour depending on hardware tier and contract terms.",
                ],
                [
                  "Step 4 — Revenue is distributed to your account",
                  "OmniTask Pro retains a platform fee covering infrastructure, compliance, commercial operations, and ongoing development. The remaining revenue — representing 73% of gross compute revenue attributable to your allocation — is credited to your account. This manifests as the estimated 0.13% daily earnings rate visible on your dashboard, accruing every second and synchronised to the platform database every 60 seconds.",
                ],
                [
                  "Step 5 — You withdraw to your registered account",
                  "Once your earnings exceed the $10 minimum withdrawal threshold and your KYC identity verification is complete, you can request withdrawal at any time through the Financials section of your dashboard. Funds are transferred to your registered bank account or cryptocurrency wallet following multi-layer security verification.",
                ],
              ] as [string, string][]
            ).map(([title, body], i) => (
              <div key={i} className="border border-slate-200 p-5">
                <p className="font-bold text-slate-800 text-sm mb-2">{title}</p>
                <p className="text-slate-600 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <H2>2.4 What Tasks Do Investors Participate In?</H2>
          <P>
            Beyond passive node earnings, OmniTask Pro offers participants the
            opportunity to directly participate in enterprise AI workloads
            through the Tasks section of the platform dashboard. These tasks
            represent real work requested by enterprise clients:
          </P>

          <H3>RLHF Validation Tasks — What They Are and Why They Pay</H3>
          <P>
            RLHF stands for{" "}
            <strong>Reinforcement Learning from Human Feedback</strong>. This is
            the process by which AI companies improve their AI models after
            initial training. Here is why your participation has genuine
            commercial value:
          </P>
          <P>
            When an AI model generates two different responses to the same
            question, an AI laboratory needs thousands of human evaluators to
            assess which response is better — more accurate, more helpful, more
            safe. This human feedback is fed back into the AI training process
            to make the model smarter and safer. OpenAI, Anthropic, and every
            major AI lab in the world pays for this service. On OmniTask Pro,
            your RLHF task completions are directly fulfilling these enterprise
            client requirements. Each completed validation earns $0.10 to $0.50,
            with experienced participants completing 80 to 400 tasks per day.
          </P>

          <H3>Thermal Calibration Tasks</H3>
          <P>
            Enterprise clients whose AI workloads require consistent, stable GPU
            performance pay a premium for nodes that have recently completed
            diagnostic calibration protocols. These tasks verify that the
            hardware is operating within optimal thermal parameters and memory
            bandwidth specifications. Available approximately once per 24-hour
            cycle for licensed operators, compensating $0.30 to $0.55 per
            completed cycle.
          </P>

          <H2>2.5 The Scale of the Market Behind Your Earnings</H2>
          <P>
            To understand why this opportunity is real and durable, consider the
            scale of the industry behind it. The global AI infrastructure market
            spent over $91 billion on GPU computing in 2025. Industry analysts
            project this figure to exceed $200 billion annually by 2028. Demand
            is not theoretical — it is driven by the ongoing commercial
            deployment of AI systems across every industry on earth: healthcare
            diagnostics, financial risk modelling, autonomous vehicles,
            pharmaceutical research, legal document analysis, customer service
            automation, and scientific computing.
          </P>
          <P>
            The companies building these systems — the same names you see as
            OmniTask Pro enterprise clients — have made GPU computing capacity
            one of the most strategically important resources in the global
            economy. NVIDIA's CEO described GPUs as "the new oil." Microsoft
            committed $80 billion to AI infrastructure investment in 2025 alone.
            This is the market that your node allocation serves, and this is the
            demand that generates your estimated daily earnings.
          </P>

          <InfoBox title="Earnings Estimate Framework — Based on Current GPU Demand">
            <Row
              label="Estimated Daily Accrual Rate"
              value="0.13% of invested capital (based on current market conditions)"
            />
            <Row
              label="$1,000 Invested — Est. Daily"
              value="Approximately $1.30 per day"
            />
            <Row
              label="$1,000 Invested — Est. Monthly"
              value="Approximately $39.00 per month"
            />
            <Row
              label="$5,000 Invested — Est. Monthly"
              value="Approximately $195.00 per month"
            />
            <Row
              label="Revenue Distribution"
              value="73% of attributable gross compute revenue to node operators"
            />
            <Row
              label="Platform Fee"
              value="27% retained for infrastructure, compliance, and operations"
            />
            <Row
              label="Important Disclosure"
              value="All figures are estimates based on current GPU demand. Not guaranteed. Subject to market conditions."
            />
          </InfoBox>

          <Alert type="warn">
            <strong>Transparency Disclosure — Section 2:</strong> The earnings
            rates and return projections referenced throughout this document are
            estimates derived from current enterprise GPU demand and historical
            platform performance. They are not guarantees of future earnings.
            OmniTask Pro does not promise fixed returns. Your actual earnings
            depend on real enterprise workload allocation. Participants should
            invest only capital they can afford to commit for their selected
            term.
          </Alert>

          <PageFooter pg={3} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 4 ═══
    {
      title: "Node Plans & Investment Tiers",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 3 — Investment Tiers"
            title="GPU Node Plans, Minimum Capital & Hardware Tiers"
            sub="Detailed specification of all participation tiers available on the OmniTask Pro platform"
          />

          <H2>3.1 Overview of Participation Tiers</H2>
          <P>
            OmniTask Pro offers GPU node participation across multiple hardware
            tiers, each corresponding to a class of professional-grade NVIDIA
            GPU infrastructure deployed within the platform's Tier III and Tier
            IV data centre facilities globally. Participants select a node tier
            based on their capital allocation and preferred risk/return profile.
            All node plans are accessible through the GPU Plans section of the
            OmniTask Pro dashboard following successful KYC identity
            verification and account approval.
          </P>
          <P>
            Minimum capital allocations begin at $5.00 for entry-level
            Foundation Node participation and extend to institutional-tier
            allocations for H100 SXM5 cluster nodes. Payment for GPU node
            allocation may be made via international bank transfer, credit or
            debit card, or cryptocurrency (USDT via TRC-20 or ERC-20 networks).
            Cryptocurrency participants receive a 5% discount on the declared
            allocation amount in recognition of reduced processing costs
            incurred by the platform.
          </P>

          <H2>3.2 GPU Node Tier Specifications</H2>
          <div className="border border-slate-300 my-5">
            <div className="bg-slate-800 text-white px-5 py-3 grid grid-cols-5 gap-3 text-xs font-bold uppercase tracking-wider">
              <span>Node Tier</span>
              <span>GPU Model</span>
              <span>Min. Alloc.</span>
              <span>Daily Rate</span>
              <span>Profile</span>
            </div>
            {[
              [
                "Foundation Node",
                "NVIDIA T4 / L4 Shared",
                "$5",
                "0.13%/day",
                "Entry participants",
              ],
              [
                "Standard Node",
                "NVIDIA RTX 4090",
                "$100",
                "0.13%/day",
                "Individual operators",
              ],
              [
                "Professional Node",
                "NVIDIA A100 PCIe 40GB",
                "$500",
                "0.13%/day",
                "Serious operators",
              ],
              [
                "Enterprise Node",
                "NVIDIA A100 SXM4 80GB",
                "$2,000",
                "0.13%/day",
                "High-volume",
              ],
              [
                "H100 PCIe Node",
                "NVIDIA H100 PCIe 80GB",
                "$5,000",
                "0.13%/day",
                "Professional investors",
              ],
              [
                "H100 SXM5 Cluster",
                "NVIDIA H100 SXM5 Cluster",
                "$25,000+",
                "0.13%/day",
                "Institutional",
              ],
            ].map(([a, b, c, d, e]) => (
              <div
                key={a}
                className="px-5 py-3 grid grid-cols-5 gap-3 border-t border-slate-200 text-xs"
              >
                <span className="font-semibold text-slate-800">{a}</span>
                <span className="text-slate-600">{b}</span>
                <span className="font-bold text-slate-800">{c}</span>
                <span className="font-semibold text-emerald-700">{d}</span>
                <span className="text-slate-500">{e}</span>
              </div>
            ))}
          </div>

          <H2>3.3 Payment & Confirmation Process</H2>
          <P>
            All capital allocations submitted through the OmniTask Pro platform
            are subject to administrative review and confirmation prior to node
            activation. For cryptocurrency payments submitted via direct USDT
            transfer, node activation occurs upon administrator verification of
            the transaction on the relevant blockchain network. For card-based
            and bank transfer payments processed through the platform's global
            payment gateway, node activation occurs automatically upon payment
            confirmation from the gateway.
          </P>
          <P>
            Participants can monitor payment status in real time through the
            Financials section of their dashboard. Pending payment notifications
            appear until the transaction has been confirmed. In the event that a
            payment has been confirmed but the node has not been activated
            within 48 hours, participants should contact the compliance support
            team via the in-platform ticket system, providing the transaction
            reference for investigation.
          </P>

          <H2>3.4 Earnings Accrual & Dashboard Visibility</H2>
          <P>
            Upon node activation, earnings begin accruing immediately and are
            visible in real time on the GPU Plans dashboard. The platform
            displays Total Accrued Earnings (live), Available Balance for
            Withdrawal, and a per-second / per-hour / per-day earnings rate
            calculated from the participant's confirmed capital allocation.
            Earnings figures are synchronised to the platform's enterprise cloud
            database every 60 seconds to ensure accurate withdrawal calculations
            at all times.
          </P>

          <Alert type="info">
            <strong>Participant Note:</strong> Node allocation does not
            constitute ownership of physical GPU hardware. Participants are
            purchasing access to computational capacity within OmniTask Pro's
            managed global infrastructure. The platform assumes full
            responsibility for hardware maintenance, power, cooling,
            connectivity, and operational management. Participants bear no
            operational responsibility and are not liable for hardware failures
            or infrastructure costs.
          </Alert>

          <PageFooter pg={4} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 5 ═══
    {
      title: "Enterprise Clients & Demand",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 4 — Market Demand"
            title="Enterprise Client Base & Computing Demand"
            sub="Overview of the organisations driving revenue through the OmniTask Pro network"
          />

          <H2>4.1 The Enterprise Demand Landscape</H2>
          <P>
            The commercial demand for GPU computing services is driven by a
            concentration of technology companies, research institutions,
            financial services firms, and government agencies requiring
            large-scale computation that exceeds their in-house infrastructure
            capacity. OmniTask Pro currently serves 180+ active enterprise
            clients through rolling and fixed-term computing contracts, spanning
            artificial intelligence development, scientific research, financial
            modelling, and large-scale data analytics across North America,
            Europe, Asia-Pacific, the Middle East, and Africa.
          </P>
          <P>
            Enterprise contracts are the primary revenue driver behind
            participant earnings. OmniTask Pro's commercial team maintains
            active relationships across all client categories, continuously
            securing new contracts and renewing existing engagements. The Q2
            2026 forward contract book currently stands at $58.4M in confirmed
            computing engagements.
          </P>

          <H2>4.2 Client Categories & Computing Use Cases</H2>
          <H3>
            4.2.1 Artificial Intelligence Laboratories & Research Companies
          </H3>
          <P>
            AI companies represent the single largest category of OmniTask Pro
            enterprise clients. They use the platform's distributed network for
            large language model training, multimodal model development,
            reinforcement learning from human feedback pipelines, and inference
            serving at scale. Contracts in this category typically run six to
            eighteen months and are structured around guaranteed compute-hour
            allocations at fixed rates.
          </P>

          <H3>4.2.2 Academic & Scientific Research Institutions</H3>
          <P>
            Universities, national research councils, and independent research
            laboratories engage OmniTask Pro for computationally intensive
            research including protein folding simulations, climate modelling,
            particle physics data analysis, genomic sequencing, and materials
            science modelling. These engagements are often sponsored by
            government research grants, providing high revenue visibility.
          </P>

          <H3>4.2.3 Financial Services & Quantitative Analytics</H3>
          <P>
            Investment banks, hedge funds, and quantitative research firms
            utilise OmniTask Pro's GPU infrastructure for risk model training,
            Monte Carlo simulations, high-frequency trading algorithm
            optimisation, and credit scoring model development. These clients
            require burst computing capacity during regulatory reporting periods
            and represent high-value, time-sensitive engagements.
          </P>

          <H3>4.2.4 Enterprise Data Analytics & Business Intelligence</H3>
          <P>
            Technology companies and large enterprises running business
            intelligence platforms, customer analytics pipelines, supply chain
            optimisation systems, and recommendation engines engage OmniTask Pro
            as a supplementary computing resource during periods of peak demand,
            valuing the ability to rapidly scale without long-term
            infrastructure commitments.
          </P>

          <H2>4.3 Demand Surge Events</H2>
          <P>
            When enterprise clients place high-priority computing requests
            exceeding baseline contracted capacity, the platform activates Surge
            Events — periods during which node operators receive enhanced
            earnings multipliers (typically 1.5x to 3.0x base rates). These are
            visible as highlighted events within GPU Plan cards and announced
            via the platform notification system.
          </P>

          <InfoBox title="Q1 2026 Platform Demand Summary">
            <Row
              label="Total Compute Hours Processed"
              value="14,700,000 GPU-hours"
            />
            <Row label="Average Platform Utilisation Rate" value="87.4%" />
            <Row
              label="Active Enterprise Contracts"
              value="180+ concurrent engagements"
            />
            <Row
              label="Demand Surge Events Activated"
              value="23 events (Q1 2026)"
            />
            <Row
              label="Peak Daily Revenue Generated"
              value="$892,400 (March 14, 2026)"
            />
            <Row
              label="Projected Q2 2026 Contract Value"
              value="$58.4M (confirmed engagements)"
            />
          </InfoBox>

          <PageFooter pg={5} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 6 ═══
    {
      title: "Security & Compliance",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 5 — Compliance & Security"
            title="Security Framework, KYC Obligations & Compliance"
            sub="Full disclosure of participant verification requirements, data protection, and security architecture"
          />

          <H2>5.1 Identity Verification (KYC) Requirements</H2>
          <P>
            OmniTask Pro operates under a strict Know Your Customer (KYC) and
            Anti-Money Laundering (AML) compliance framework in accordance with
            UK Financial Conduct Authority guidelines and international AML
            standards. All participants are required to complete a full identity
            verification process before withdrawal privileges are granted —
            without exception, regardless of account age, accumulated earnings,
            or referral status.
          </P>
          <P>
            The KYC process requires: a government-issued identity document
            (national ID, passport, or driver's licence), proof of residential
            address, a selfie with document photograph, and a date of birth
            declaration. Documents are reviewed by the compliance team within 24
            to 48 business hours. Following verification, participants must
            register a payout account whose name exactly matches the verified
            identity document. Discrepancies trigger withdrawal suspension
            pending compliance review.
          </P>

          <H2>5.2 Withdrawal Security Architecture</H2>
          <P>
            All withdrawal requests are processed through a multi-layer security
            validation system that automatically verifies: (i) KYC status is
            confirmed and approved; (ii) payout account name matches verified
            identity; (iii) the requested amount does not exceed the
            participant's verified available balance in the platform database;
            (iv) no fraud indicators are present on the account; and (v) the
            withdrawal does not exceed the $50,000 24-hour processing limit
            applicable to all accounts.
          </P>
          <P>
            The platform provides a real-time Settlement Timeline tracker in the
            withdrawal modal, showing progression through Queued → Processing →
            In Transit → Paid. Estimated settlement: under $500 within 24 hours;
            $500–$5,000 within 48 hours; larger amounts within 3–7 business
            days.
          </P>

          <H2>5.3 Platform Security Infrastructure</H2>
          <div className="space-y-4 my-4">
            {(
              [
                [
                  "AES-256 Database Encryption",
                  "All participant personal data, financial records, and identity documents are encrypted at rest using AES-256 industry-standard encryption across the platform's globally distributed enterprise cloud infrastructure. Decryption keys are stored in isolated key management systems with no direct database access.",
                ],
                [
                  "Multi-Layer Cloud Security with RLS",
                  "The platform's backend infrastructure enforces row-level security policies at the database infrastructure layer, ensuring each participant can only access their own account data. Administrative access requires isolated service-role credentials that are never exposed to client-side application code.",
                ],
                [
                  "PIN-Based Session Security",
                  "All users set and verify a 4-to-6-digit security PIN on every new session. The PIN is hashed using SHA-256 with a unique user salt and stored independently of primary account credentials. Five consecutive incorrect PIN entries trigger automatic account lock for 30 minutes.",
                ],
                [
                  "Atomic Financial Operations",
                  "All balance modifications — earnings accrual, withdrawals, and investment allocations — are processed through atomic database transactions with row-level locking that prevent race conditions, double-spend vulnerabilities, and concurrent modification errors regardless of simultaneous request volume.",
                ],
                [
                  "Real-Time Automated Fraud Detection",
                  "An automated fraud layer monitors all withdrawal requests for: excess volume, identity mismatches, account freeze flags, payout account irregularities, and daily limit breaches. Flagged accounts are automatically suspended and referred to the compliance team for immediate review.",
                ],
              ] as [string, string][]
            ).map(([t, d]) => (
              <div key={t} className="border-l-4 border-slate-300 pl-4 py-1">
                <p className="font-bold text-slate-800 text-sm">{t}</p>
                <p className="text-slate-600 text-sm leading-relaxed">{d}</p>
              </div>
            ))}
          </div>

          <Alert type="info">
            <strong>Data Protection:</strong> OmniTask Pro processes personal
            data in accordance with the UK General Data Protection Regulation
            (UK GDPR) and the Data Protection Act 2018. Participant data is
            never sold to third parties. Identity documents are retained for a
            minimum of five years in compliance with AML record-keeping
            obligations and then securely destroyed. Participants may request
            access to their personal data by contacting
            compliance@omnitaskpro.io.
          </Alert>

          <PageFooter pg={6} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 7 ═══
    {
      title: "Tasks, Earnings & Operations",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 6 — Platform Operations"
            title="Available Tasks, Earnings Mechanics & Operational Procedures"
            sub="Full detail of task types, compensation structures, and operational requirements"
          />

          <H2>6.1 Overview of Earnings Mechanisms</H2>
          <P>
            Earnings on the OmniTask Pro platform are generated through two
            primary mechanisms: (1) passive GPU node allocation earnings, which
            accrue automatically in real time based on the participant's
            confirmed capital allocation and the base daily rate; and (2) active
            task completion, whereby participants interact with the Tasks
            section of the dashboard to complete validation, annotation, and
            calibration tasks assigned by the platform's enterprise client
            queue.
          </P>

          <H2>6.2 GPU Node Allocation Earnings (Passive)</H2>
          <P>
            Passive earnings commence immediately upon node activation. The base
            accrual rate of 0.13% per day is applied continuously. A participant
            who has allocated $1,000 will accrue approximately $1.30 per day,
            $9.10 per week, and $39.00 per month under standard market
            conditions — visible in real time on the portfolio card, updated
            every second via the platform's live data subscription system.
          </P>
          <P>
            Participants on contract-based allocations see earnings accrue
            throughout the contract term but those funds are locked until
            maturity. Upon contract maturity, the full accumulated earnings plus
            original capital are released to available balance, immediately
            eligible for withdrawal subject to KYC completion.
          </P>

          <H2>6.3 Active Task Categories</H2>
          <H3>6.3.1 RLHF Validation Tasks</H3>
          <P>
            Reinforcement Learning from Human Feedback (RLHF) validation tasks
            are the most frequently available task type. Participants evaluate
            pairs of AI-generated responses and identify which is more accurate
            or appropriate. Compensation ranges from $0.10 to $0.50 per
            completed validation, available continuously throughout the day from
            AI laboratory clients whose models are undergoing alignment
            training.
          </P>

          <H3>6.3.2 Neural Operator Thermal Calibration</H3>
          <P>
            Thermal calibration tasks are assigned to participants holding
            active Operator Licenses, involving structured computational
            diagnostics on GPU allocation nodes to measure thermal performance
            and memory bandwidth consistency. Assigned approximately once per
            24-hour cycle, compensating at $0.30 to $0.55 per completed cycle.
            Access requires purchase of the Thermal & Neural Operator License
            through the platform.
          </P>

          <H3>6.3.3 GPU Allocation Operator Tasks</H3>
          <P>
            Available exclusively to participants holding the GPU Allocation
            Operator License, these tasks involve configuration management and
            performance reporting related to the participant's allocated GPU
            capacity. Compensation is variable and proportional to the value of
            capacity being managed.
          </P>

          <H2>6.4 Quality Scoring & Earnings Integrity</H2>
          <P>
            The platform maintains a Quality Score for each participant visible
            in dashboard analytics. Participants with scores below 0.70 (70%)
            are subject to task allocation restrictions and reduced compensation
            rates. Participants with scores above 0.90 (90%) receive priority
            task allocation and access to higher-value categories. Scores are
            calculated as a rolling average over the last 200 completed tasks.
            Fraudulent or automated submissions result in earnings reversal and
            potential account suspension.
          </P>

          <H2>6.5 Minimum Withdrawal & Processing</H2>
          <P>
            The minimum withdrawal threshold is $10.00 USD. All withdrawals
            require: completed KYC verification, registered payout account with
            name matching verified identity, and available balance exceeding the
            withdrawal amount as confirmed in the platform database. Withdrawal
            requests are processed in the order received, with priority
            processing available to Premium tier accounts.
          </P>

          <PageFooter pg={7} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 8 ═══
    {
      title: "Risk Factors",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 7 — Risk Disclosure"
            title="Material Risk Factors & Participant Disclosures"
            sub="Mandatory reading — all participants must acknowledge these risks prior to capital allocation"
          />

          <Alert type="danger">
            <strong>MANDATORY DISCLOSURE:</strong> This section describes
            material risks associated with participation in the OmniTask Pro
            platform. Participation involves financial risk. The projected
            returns, earnings rates, and contract return ranges referenced
            throughout this document are estimates and are not guaranteed.
            Participants may receive less than their allocated capital in
            adverse circumstances. Do not allocate capital that you cannot
            afford to lose.
          </Alert>

          <H2>7.1 Market Demand Risk</H2>
          <P>
            OmniTask Pro's revenue — and by extension participant earnings — is
            directly dependent on sustained enterprise demand for GPU computing
            services. This demand is subject to cyclical fluctuations,
            competitive pressure from hyperscale cloud providers (Amazon Web
            Services, Microsoft Azure, Google Cloud), and shifts in the
            artificial intelligence industry's computing requirements. A
            sustained decrease in enterprise GPU demand would reduce platform
            utilisation rates and directly reduce participant earnings.
            Historical utilisation rates of 87% do not guarantee future
            performance at equivalent levels.
          </P>

          <H2>7.2 Contract & Capital Lock-up Risk</H2>
          <P>
            Participants selecting contract-based GPU node allocation plans
            commit their capital for the full contract term (6, 12, or 24
            months). Capital allocated to contract plans cannot be withdrawn
            prior to the maturity date under any circumstances, including
            financial emergency or personal hardship. Participants must not
            allocate funds to contract tiers unless they can fully sustain the
            lock-up period without requiring access to those funds.
          </P>

          <H2>7.3 Platform Operational Risk</H2>
          <P>
            While OmniTask Pro maintains 99.81% historical network uptime, no
            technology platform can guarantee zero downtime. Planned
            maintenance, emergency security responses, or infrastructure
            incidents may result in temporary platform unavailability, during
            which passive earnings accrual is suspended. The platform does not
            compensate participants for earnings foregone during legitimate
            maintenance events.
          </P>

          <H2>7.4 Regulatory & Compliance Risk</H2>
          <P>
            The distributed GPU computing and financial technology regulatory
            landscape is evolving rapidly. Changes to UK FCA regulations,
            international AML requirements, data protection laws, or financial
            services legislation may require OmniTask Pro to modify operations,
            restrict participant eligibility by jurisdiction, or implement
            additional compliance procedures affecting platform access or
            withdrawal timelines.
          </P>

          <H2>7.5 Cybersecurity & Fraud Risk</H2>
          <P>
            Despite comprehensive security measures detailed in Section 5, no
            technology platform is entirely immune to cybersecurity threats.
            Sophisticated phishing attacks, SIM-swapping attacks, and credential
            theft via malware present ongoing risks to individual accounts.
            OmniTask Pro cannot be held responsible for account compromises
            resulting from participant negligence, including disclosure of login
            credentials or PINs to third parties claiming to represent the
            platform.
          </P>

          <H2>7.6 No Earnings Guarantee</H2>
          <P>
            OmniTask Pro explicitly and unequivocally does not guarantee any
            level of earnings, daily return rate, monthly income, or annual
            return to any participant. All figures represent estimates based on
            historical data and current market conditions. Actual earnings may
            be zero. Participants accept full personal responsibility for their
            decision to allocate capital to OmniTask Pro node plans.
          </P>

          <PageFooter pg={8} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 9 ═══
    {
      title: "Technical Infrastructure",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 8 — Technical Architecture"
            title="Platform Infrastructure & Technical Specification"
            sub="Overview of the technology underpinning the OmniTask Pro distributed computing network"
          />

          <H2>8.1 Infrastructure Overview</H2>
          <P>
            The OmniTask Pro platform is built on a distributed computing
            architecture hosted across Tier III and Tier IV data centre
            facilities in the United Kingdom, United States, Singapore, Germany,
            and Nigeria. The platform's core infrastructure comprises a
            real-time task distribution engine, a cryptographically secured
            payment processing layer, an independent verification network, and a
            participant-facing web application with 99.81% availability
            guarantees delivered through multi-region active replication.
          </P>

          <H2>8.2 Data & Security Architecture</H2>
          <P>
            All participant-facing operations — dashboard access, task
            submission, earnings tracking, KYC verification, and withdrawal
            requests — are processed through a globally distributed,
            enterprise-grade cloud infrastructure employing end-to-end
            encryption and multi-region data replication. The platform's
            database architecture enforces row-level security at the
            infrastructure layer, ensuring participant data is isolated and
            inaccessible to other users or unauthorised personnel under any
            circumstances.
          </P>
          <P>
            Authentication employs a dual-layer model: primary access is secured
            through industry-standard identity management protocols, while
            secondary session verification requires PIN-based authentication
            using a SHA-256 hashed credential stored independently of primary
            account credentials. All data at rest is encrypted with AES-256. All
            data in transit is secured via TLS 1.3 with forward secrecy.
          </P>

          <H2>8.3 Earnings Calculation & Synchronisation</H2>
          <P>
            Participant earnings are calculated using a continuous accrual
            model. Upon node activation, the platform records the activation
            timestamp and allocated capital. Earnings accrue using the formula:
            Accrued Earnings = Capital × (0.0013 ÷ 86,400) × Elapsed Seconds
            Since Activation. Every 60 seconds, accrued earnings are
            synchronised to the platform's primary database. Withdrawal
            calculations are performed against this database-synchronised
            balance, ensuring accuracy to within one synchronisation interval at
            all times.
          </P>

          <H2>8.4 Payment Processing Architecture</H2>
          <P>
            OmniTask Pro integrates two primary payment processing channels: a
            global card and bank transfer gateway covering international markets
            across all supported jurisdictions, and direct cryptocurrency
            acceptance via TRC-20 and ERC-20 USDT networks for digital asset
            participants. Each channel operates through dedicated API
            integrations with cryptographically signed webhook-based
            confirmation systems. Payment confirmation automatically triggers
            node allocation without requiring manual administrator intervention,
            with full audit trail logging to the platform's security event
            database.
          </P>

          <H2>8.5 Real-Time Data Architecture</H2>
          <P>
            The OmniTask Pro dashboard employs real-time WebSocket data
            subscription technology to push live updates to participants'
            browser sessions without page refresh. Administrator actions —
            payment confirmation, node activation, withdrawal status updates, or
            demand surge broadcasts — are immediately reflected in the
            participant's dashboard through persistent live data channels. This
            ensures participants always have access to the most current view of
            their financial position, node status, and withdrawal progress.
          </P>

          <InfoBox title="Technical Specifications Summary">
            <Row
              label="Web Application Framework"
              value="Next.js 15 — React Server Components"
            />
            <Row
              label="Database Architecture"
              value="Enterprise distributed cloud database with RLS enforcement"
            />
            <Row
              label="Real-time Protocol"
              value="WebSocket subscription layer for live participant data"
            />
            <Row
              label="Authentication Model"
              value="Dual-layer: session tokens + SHA-256 PIN verification"
            />
            <Row
              label="Payment Processing"
              value="Global card & bank gateway · USDT TRC-20 / ERC-20"
            />
            <Row
              label="CDN & DDoS Protection"
              value="Cloudflare Enterprise (global edge network, 200+ PoPs)"
            />
            <Row
              label="Data Encryption"
              value="AES-256 at rest · TLS 1.3 in transit with forward secrecy"
            />
            <Row
              label="Backup & Recovery"
              value="Automated daily snapshots + Point-in-Time Recovery (multi-region)"
            />
          </InfoBox>

          <PageFooter pg={9} total={10} />
        </DocPage>
      ),
    },

    // ══════════════════════════════════════════════════════════════ PAGE 10 ══
    {
      title: "Closing & Signatures",
      content: (
        <DocPage>
          <PageHeader
            sec="Section 9 — Final Disclosure"
            title="Commitments, Governing Law & Authorised Signatures"
            sub="Official closing statements, legal framework, and board-authorised signatures"
          />

          <H2>9.1 OmniTask Pro's Commitment to Participants</H2>
          <P>
            OmniTask Pro Ltd. is committed to operating the platform with the
            highest standards of transparency, integrity, and participant
            protection. This commitment is not aspirational — it is encoded into
            the operational architecture of the platform itself. Withdrawal
            security is enforced at the database infrastructure level. KYC
            verification is mandatory and non-negotiable. Earnings calculations
            are performed transparently and synchronised to the database at
            regular intervals. Fraud detection operates automatically and
            without bias. The company's collective governance structure ensures
            that no individual can unilaterally compromise participant
            interests.
          </P>
          <P>
            OmniTask Pro does not and will never operate under a guaranteed
            returns model. Every participant enters the platform with full
            knowledge that earnings are variable, market-dependent, and not
            contractually guaranteed. This transparency distinguishes OmniTask
            Pro from fraudulent investment schemes. If any participant has been
            told by any party that returns on OmniTask Pro are guaranteed,
            fixed, or risk-free, they have been misled. Such representations are
            not authorised by OmniTask Pro Ltd. and should be reported to
            compliance@omnitaskpro.io immediately.
          </P>

          <H2>9.2 Governing Law & Dispute Resolution</H2>
          <P>
            This company-disclosure and all participant agreements entered into
            through the OmniTask Pro platform are governed by the laws of
            England and Wales. Any disputes that cannot be resolved through
            internal compliance processes shall be subject to the exclusive
            jurisdiction of the courts of England and Wales. OmniTask Pro
            commits to responding to formal dispute submissions within 10
            business days and providing written resolutions within 30 business
            days.
          </P>

          <H2>9.3 Document Validity</H2>
          <P>
            This company-disclosure (Version 2.1.0, April 2026) supersedes all
            previous versions. OmniTask Pro reserves the right to update this
            document to reflect material changes to platform operations,
            pricing, compliance obligations, or risk factors. Continued
            participation following notification of updates constitutes
            acceptance of the revised terms. The most current version of this
            document is always available at {CO.web}.
          </P>

          <div className="mt-10 border-t-2 border-slate-800 pt-8">
            <p className="text-xs font-bold tracking-[0.3em] uppercase text-slate-500 mb-5">
              Official Authorisation & Board Signatures
            </p>
            <p className="text-sm text-slate-700 mb-8 leading-relaxed max-w-2xl">
              This document has been reviewed, approved, and authorised for
              public distribution by the Board of Directors of OmniTask Pro Ltd.
              in a duly convened board meeting held on 1 April 2026. All
              statements contained herein are accurate to the best of the
              board's knowledge and belief as of the date of publication.
            </p>

            <div className="border-2 border-slate-300 p-8 mb-8 bg-slate-50">
              <div className="flex items-end justify-between flex-wrap gap-8">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-5">
                    Primary Authorised Signatory — Chairperson
                  </p>
                  <Signature width={210} height={70} />
                  <div className="border-b-2 border-slate-900 w-80 mt-3 mb-2" />
                  <p
                    className="text-xl font-bold text-slate-900"
                    style={{ fontFamily: "Georgia" }}
                  >
                    {CO.signatory}
                  </p>
                  <p className="text-sm text-slate-600 mt-0.5">{CO.sigTitle}</p>
                  <p className="text-xs text-slate-500 mt-1">{CO.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{CO.reg}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{CO.address}</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-36 h-36 border-4 border-double border-slate-800 flex items-center justify-center">
                    <div className="text-center px-2">
                      <p className="text-[10px] font-black text-slate-800 tracking-widest leading-tight">
                        OMNITASK
                      </p>
                      <p className="text-[10px] font-black text-slate-800 tracking-widest leading-tight">
                        PRO LTD.
                      </p>
                      <div className="border-t border-slate-600 my-1.5 mx-1" />
                      <p className="text-[8px] text-slate-600 tracking-wider leading-tight">
                        OFFICIAL SEAL
                      </p>
                      <p className="text-[8px] text-slate-600 leading-tight">
                        REG. OT-2024-GB
                      </p>
                      <div className="border-t border-slate-400 my-1 mx-1" />
                      <p className="text-[8px] text-slate-600 leading-tight">
                        APRIL 2026
                      </p>
                      <p className="text-[8px] text-slate-600 leading-tight">
                        AUTHORISED
                      </p>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-1">
                    Company Official Stamp
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-8 mb-10">
              {[
                ["Chief Financial Officer", "Financial Operations"],
                ["Chief Compliance Officer", "Regulatory & Compliance"],
                ["Chief Technology Officer", "Platform Infrastructure"],
              ].map(([r, d]) => (
                <div key={r} className="border-b-2 border-slate-400 pb-5 pt-2">
                  <div className="h-10 mb-2" />
                  <p className="text-sm font-bold text-slate-800">{r}</p>
                  <p className="text-xs text-slate-500">{d}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {CO.name} · April 2026
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-5 grid grid-cols-2 gap-8">
              <div>
                <p className="text-sm font-bold text-slate-800">{CO.name}</p>
                <p className="text-xs text-slate-500 mt-1">{CO.reg}</p>
                <p className="text-xs text-slate-500 mt-0.5">{CO.address}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {CO.email} · {CO.web}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400 leading-relaxed">
                <p>Incorporated in England &amp; Wales</p>
                <p>Regulated under UK FCA guidelines</p>
                <p>GDPR Compliant · AML/KYC Certified</p>
                <p>Version 2.1.0 · April 2026</p>
              </div>
            </div>

            <div className="mt-5 bg-slate-50 border border-slate-200 p-5 text-xs text-slate-500 leading-relaxed">
              <strong className="text-slate-700">Legal Notice:</strong> This
              company-disclosure is provided for informational purposes only and
              does not constitute financial advice, investment advice, or a
              solicitation to invest. OmniTask Pro Ltd. is registered in England
              and Wales. GPU node allocation programmes are not regulated
              investment products under the Financial Services and Markets Act
              2000. Participation is at the sole discretion and risk of the
              participant. Past performance is not indicative of future results.
            </div>
          </div>

          <PageFooter pg={10} total={10} />
        </DocPage>
      ),
    },
  ];

  const total = pages.length;

  return (
    <div className="min-h-screen bg-slate-300">
      <div className="w-full pb-24">{pages[cur - 1].content}</div>

      {/* Navigation bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 px-6 py-4 flex items-center justify-between z-50">
        <button
          onClick={() => setCur(Math.max(1, cur - 1))}
          disabled={cur === 1}
          className="flex items-center gap-2 px-5 py-2.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          <ChevronLeft size={16} /> Previous
        </button>

        <div className="text-center">
          <p className="text-white text-sm font-bold">{pages[cur - 1].title}</p>
          <div className="flex gap-1.5 justify-center mt-1.5">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => setCur(i + 1)}
                className={`h-2 rounded-full transition-all duration-200 ${i + 1 === cur ? "bg-emerald-400 w-6" : "bg-slate-600 hover:bg-slate-400 w-2"}`}
              />
            ))}
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Page {cur} of {total}
          </p>
        </div>

        <button
          onClick={() => setCur(Math.min(total, cur + 1))}
          disabled={cur === total}
          className="flex items-center gap-2 px-5 py-2.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      <div className="fixed top-4 right-4 bg-slate-900 border border-slate-700 text-white px-3 py-1.5 rounded text-xs font-bold z-50">
        {cur} / {total}
      </div>
    </div>
  );
}
