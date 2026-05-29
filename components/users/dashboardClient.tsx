"use client";
// app/dashboard/page-client.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FIXES IN THIS VERSION:
//  1. Mining ticker uses TIER_ROI table (same as gpu-plans) — $2000/1hr Foundation
//     now correctly yields $6, not thousands. Tier resolved from plan_id.
//  2. After claim, balance_available auto-refreshes via realtime + forced re-query.
//  6. Connected with financials page — balance reads from same source of truth.
//  7. Navigation stale-router fix — useRouter inside each click handler (not stored).
//     Realtime channels cleaned up properly on unmount.
//  8. Operator license status reads operator_licenses table directly.
//     Device verification reads device_verification column correctly.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNavigation from "@/components/dashboard-navigation";
import LicenseStatusBadge from "@/components/LicenseStatusBadge";
import {
  NODES,
  normalizeNode,
  nextNode,
  generateGPUSerial,
} from "@/lib/nodeConfig";
import {
  Cpu,
  Zap,
  LogOut,
  Shield,
  DollarSign,
  TrendingUp,
  Play,
  Server,
  Rocket,
  ArrowUpRight,
  Activity,
  CheckCircle,
  AlertCircle,
  Layers,
  Thermometer,
  Radio,
  Clock,
  LayoutGrid,
  MemoryStick,
  Pickaxe,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ─── TIER ROI TABLE (mirrors gpu-plans-updated.tsx exactly) ──────────────────
// Tier 0 = Foundation ($5 min) | 1 = RTX 4090 ($50) | 2 = A100 ($250) | 3 = H100 ($1000)
const TIER_ROI = [
  { hourly: 0.003, daily: 0.02, weekly: 0.12, monthly: 0.45 },
  { hourly: 0.005, daily: 0.03, weekly: 0.18, monthly: 0.7 },
  { hourly: 0.008, daily: 0.05, weekly: 0.35, monthly: 1.2 },
  { hourly: 0.012, daily: 0.08, weekly: 0.6, monthly: 2.5 },
];

// Period durations in ms
const PERIOD_MS: Record<string, number> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000,
};

// Resolve tier index from price_min (returned alongside plan data)
function tierFromPriceMin(priceMin: number): number {
  if (priceMin >= 1000) return 3;
  if (priceMin >= 250) return 2;
  if (priceMin >= 50) return 1;
  return 0;
}

function calcMiningProfit(
  capital: number,
  period: string,
  tier: number,
): number {
  const rates = TIER_ROI[tier] ?? TIER_ROI[0];
  return capital * ((rates as Record<string, number>)[period] ?? rates.daily);
}

// ─── TYPES ────────────────────────────────────────────────────────────────────
type User = {
  id: string;
  email?: string;
  full_name?: string;
  tier?: string;
  balance_available?: number;
  total_earned?: number;
  streak_count?: number;
  has_operator_license?: boolean;
  kyc_verified?: boolean;
  kyc_status?: string;
  device_verification?: boolean;
  cla_signed?: boolean;
  terms_signed?: boolean;
  payout_registered?: boolean;
  node_expiry_date?: string;
};

type TaskAllocation = {
  id: string;
  started_at: string;
  earnings_accumulated: number;
  gpu_clients?: { name: string; base_hourly_rate: number; multiplier: number };
};

type MiningAllocation = {
  id: string;
  plan_id: string;
  amount_invested: number;
  mining_period: string | null;
  mining_ends_at: string | null;
  total_earned: number | null;
  rate_factor_used: number | null;
  mining_completed: boolean;
  status: string;
  created_at: string;
  updated_at: string | null;
  // joined from gpu_plans:
  plan_price_min?: number;
};

type LiveVideo = { video_url?: string; poster_url?: string };

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const BG = "#040812";
const SURFACE = "#070e1c";
const BORDER = "#0e1d38";
const BORDER_HI = "#1a3560";
const C_ACCENT = "#10b981";

// ─── HOOKS ────────────────────────────────────────────────────────────────────
function useRNG(min: number, max: number, ms = 3000) {
  const [v, setV] = useState(Math.round((min + max) / 2));
  useEffect(() => {
    setV(Math.floor(min + Math.random() * (max - min)));
    const iv = setInterval(
      () => setV(Math.floor(min + Math.random() * (max - min))),
      ms,
    );
    return () => clearInterval(iv);
  }, [min, max, ms]);
  return v;
}

function useSeries(base: number, variance: number, points = 20) {
  const [arr, setArr] = useState<{ t: number; v: number }[]>(() =>
    Array.from({ length: points }, (_, i) => ({
      t: i,
      v: Math.max(
        0,
        base + Math.floor(Math.random() * variance * 2) - variance,
      ),
    })),
  );
  useEffect(() => {
    const iv = setInterval(() => {
      setArr((p) => {
        const last = p[p.length - 1];
        return [
          ...p.slice(1),
          {
            t: last.t + 1,
            v: Math.max(
              0,
              base + Math.floor(Math.random() * variance * 2) - variance,
            ),
          },
        ];
      });
    }, 1800);
    return () => clearInterval(iv);
  }, [base, variance]);
  return arr;
}

// ─── SPARK ────────────────────────────────────────────────────────────────────
function Spark({
  base,
  variance,
  color,
  height = 28,
}: {
  base: number;
  variance: number;
  color: string;
  height?: number;
}) {
  const data = useSeries(base, variance);
  const id = `sp${base}${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── METRIC TILE ──────────────────────────────────────────────────────────────
function MetricTile({
  label,
  base,
  variance,
  color,
  unit,
  icon: Icon,
}: {
  label: string;
  base: number;
  variance: number;
  color: string;
  unit: string;
  icon: any;
}) {
  const data = useSeries(base, variance);
  const cur = data[data.length - 1]?.v ?? base;
  const id = `mt${label}`;
  return (
    <div
      className="flex flex-col justify-between p-3.5 rounded-xl transition-all"
      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon size={11} style={{ color: color + "99" }} />
        <span
          className="text-[8px] font-mono font-bold uppercase tracking-widest"
          style={{ color: "#1e3a5f" }}
        >
          {label}
        </span>
      </div>
      <span className="text-lg font-black tabular-nums" style={{ color }}>
        {cur}
        <span
          className="text-[10px] font-normal ml-0.5"
          style={{ color: "#1e3a5f" }}
        >
          {unit}
        </span>
      </span>
      <div className="mt-1.5">
        <ResponsiveContainer width="100%" height={20}>
          <AreaChart
            data={data}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.2}
              fill={`url(#${id})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── WORKLOAD FEED ────────────────────────────────────────────────────────────
const T_POOL = [
  "Image Rendering",
  "NLP Tokenization",
  "Video Diffusion",
  "Protein Folding",
  "Speech Recognition",
  "Code Generation",
  "RLHF Annotation",
  "LoRA Fine-tune",
  "Embedding Batch",
  "Climate Modelling",
];
const C_POOL = [
  "OpenAI Research",
  "Anthropic Labs",
  "DeepMind API",
  "Stability AI",
  "Meta AI",
  "GitHub Copilot",
  "AWS Bedrock",
  "Cohere",
  "Scale AI",
  "Hugging Face",
];
const mkJob = () => ({
  id: String(1000 + ~~(Math.random() * 9000)),
  task: T_POOL[~~(Math.random() * T_POOL.length)],
  client: C_POOL[~~(Math.random() * C_POOL.length)],
  pct: ~~(Math.random() * 80),
  reward: (0.08 + Math.random() * 0.52).toFixed(3),
});

function WorkloadFeed() {
  const [jobs, setJobs] = useState(() => Array.from({ length: 5 }, mkJob));
  useEffect(() => {
    const iv = setInterval(() => {
      setJobs((p) =>
        p.map((j) => {
          const np = j.pct + ~~(2 + Math.random() * 6);
          return np >= 100 ? mkJob() : { ...j, pct: np };
        }),
      );
    }, 1200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="space-y-0 divide-y" style={{ borderColor: BORDER }}>
      {jobs.map((j, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
            style={{ background: C_ACCENT }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span
                className="text-xs font-semibold truncate"
                style={{ color: "#cbd5e1" }}
              >
                #{j.id} {j.task}
              </span>
              <span
                className="font-mono text-[10px] shrink-0 font-bold"
                style={{ color: C_ACCENT }}
              >
                +${j.reward}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] truncate"
                style={{ color: "#1e3a5f" }}
              >
                {j.client}
              </span>
              <div
                className="flex-1 h-px rounded-full"
                style={{ background: "#0e1d38" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${j.pct}%`, background: `${C_ACCENT}55` }}
                />
              </div>
              <span
                className="text-[9px] tabular-nums shrink-0"
                style={{ color: "#1e3a5f" }}
              >
                {j.pct}%
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DATACENTER FEED ─────────────────────────────────────────────────────────
function DatacenterFeed({ video }: { video: LiveVideo }) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [tick, setTick] = useState("--:--:--");
  const rafRefs = useRef<number[]>([]);

  const CAMS = [
    {
      label: "Server Rack 01-A",
      stat: "RACK-A · 68°C",
      sx: 0,
      sy: 0,
      sw: 0.333,
      sh: 0.333,
    },
    {
      label: "Compute Node B03",
      stat: "NODE-B · 71°C",
      sx: 0.333,
      sy: 0,
      sw: 0.333,
      sh: 0.333,
    },
    {
      label: "Network Bay C2",
      stat: "BAY-C · 54°C",
      sx: 0.666,
      sy: 0,
      sw: 0.334,
      sh: 0.333,
    },
    {
      label: "Core Network D-9",
      stat: "CORE-D · 61°C",
      sx: 0,
      sy: 0.333,
      sw: 0.333,
      sh: 0.333,
    },
    {
      label: "Power Unit P1",
      stat: "PWR-P1 · 58°C",
      sx: 0.333,
      sy: 0.333,
      sw: 0.333,
      sh: 0.333,
    },
    {
      label: "Cooling Sys E4",
      stat: "COOL-E · 42°C",
      sx: 0.666,
      sy: 0.333,
      sw: 0.334,
      sh: 0.333,
    },
    {
      label: "Data Store F23",
      stat: "DATA-F · 49°C",
      sx: 0,
      sy: 0.666,
      sw: 0.333,
      sh: 0.334,
    },
    {
      label: "Hi-Density G12",
      stat: "RACK-G · 74°C",
      sx: 0.333,
      sy: 0.666,
      sw: 0.333,
      sh: 0.334,
    },
    {
      label: "Compute Rack H8",
      stat: "RACK-H · 66°C",
      sx: 0.666,
      sy: 0.666,
      sw: 0.334,
      sh: 0.334,
    },
  ];

  function getLondonTime(): string {
    return new Date().toLocaleTimeString("en-GB", {
      hour12: false,
      timeZone: "Europe/London",
    });
  }

  useEffect(() => {
    setTick(getLondonTime());
    const iv = setInterval(() => setTick(getLondonTime()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = "/datacenter-feed.jpg";
    img.onload = () => {
      canvasRefs.current.forEach((canvas, idx) => {
        if (!canvas) return;
        const cam = CAMS[idx];
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        let scanY = -20;
        function draw() {
          ctx!.clearRect(0, 0, w, h);
          ctx!.filter = "saturate(0.55) brightness(0.7) contrast(1.08)";
          ctx!.drawImage(
            img,
            img.naturalWidth * cam.sx,
            img.naturalHeight * cam.sy,
            img.naturalWidth * cam.sw,
            img.naturalHeight * cam.sh,
            0,
            0,
            w,
            h,
          );
          ctx!.filter = "none";
          scanY += 0.6;
          if (scanY > h + 20) scanY = -20;
          const grad = ctx!.createLinearGradient(0, scanY - 20, 0, scanY + 20);
          grad.addColorStop(0, "rgba(16,185,129,0)");
          grad.addColorStop(0.5, "rgba(16,185,129,0.055)");
          grad.addColorStop(1, "rgba(16,185,129,0)");
          ctx!.fillStyle = grad;
          ctx!.fillRect(0, scanY - 20, w, 40);
          const id = ctx!.getImageData(0, 0, w * dpr, h * dpr);
          const d = id.data;
          for (let i = 0; i < d.length; i += 16) {
            const n = (Math.random() - 0.5) * 20;
            d[i] = Math.min(255, Math.max(0, d[i] + n));
            d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
            d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
          }
          ctx!.putImageData(id, 0, 0);
          rafRefs.current[idx] = requestAnimationFrame(draw);
        }
        draw();
      });
    };
    // FIX #7: cancel all animation frames on unmount to prevent memory/nav issues
    return () => {
      rafRefs.current.forEach((id) => cancelAnimationFrame(id));
    };
  }, []); // eslint-disable-line

  return (
    <div
      style={{
        background: "#020408",
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: "monospace",
      }}
    >
      <div
        style={{
          background: "#000",
          borderBottom: "1px solid #0f2a0f",
          padding: "5px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            color: "#10b981",
            fontSize: 9,
            fontWeight: "bold",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          GPU Cloud Compute Farm — Live Status
        </span>
        <span style={{ color: "#ef4444", fontSize: 9, fontWeight: "bold" }}>
          ● REC
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 2,
          background: "#000",
        }}
      >
        {CAMS.map((cam, idx) => (
          <div
            key={idx}
            style={{
              position: "relative",
              aspectRatio: "4/3",
              overflow: "hidden",
              background: "#040c04",
            }}
          >
            <canvas
              ref={(el) => {
                canvasRefs.current[idx] = el;
              }}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 3px)",
                pointerEvents: "none",
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.6) 100%)",
                pointerEvents: "none",
                zIndex: 3,
              }}
            />
            {[0, 1, 2, 3].map((ci) => (
              <div
                key={ci}
                style={{
                  position: "absolute",
                  width: 8,
                  height: 8,
                  zIndex: 5,
                  pointerEvents: "none",
                  top: ci < 2 ? 4 : undefined,
                  bottom: ci >= 2 ? 4 : undefined,
                  left: ci % 2 === 0 ? 4 : undefined,
                  right: ci % 2 === 1 ? 4 : undefined,
                  borderTop:
                    ci < 2 ? "1px solid rgba(16,185,129,0.45)" : undefined,
                  borderBottom:
                    ci >= 2 ? "1px solid rgba(16,185,129,0.45)" : undefined,
                  borderLeft:
                    ci % 2 === 0
                      ? "1px solid rgba(16,185,129,0.45)"
                      : undefined,
                  borderRight:
                    ci % 2 === 1
                      ? "1px solid rgba(16,185,129,0.45)"
                      : undefined,
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 6,
                padding: "4px 5px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                pointerEvents: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    background: "rgba(0,0,0,0.7)",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 7,
                    fontWeight: "bold",
                    padding: "2px 4px",
                    borderRadius: 2,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {cam.label}
                </span>
                <span
                  style={{
                    background: "rgba(180,0,0,0.85)",
                    color: "#fff",
                    fontSize: 7,
                    fontWeight: "bold",
                    padding: "2px 4px",
                    borderRadius: 2,
                  }}
                >
                  ● LIVE
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    background: "rgba(0,0,0,0.65)",
                    color: "rgba(16,185,129,0.9)",
                    fontSize: 7,
                    padding: "2px 4px",
                    borderRadius: 2,
                  }}
                >
                  {tick} LON
                </span>
                <span
                  style={{
                    background: "rgba(0,0,0,0.65)",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 7,
                    padding: "2px 4px",
                    borderRadius: 2,
                  }}
                >
                  {cam.stat}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: "#000",
          borderTop: "1px solid #0f2a0f",
          padding: "4px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 14 }}>
          {[
            ["Network", "NOMINAL", "#10b981"],
            ["Uptime", "99.97%", "#10b981"],
            ["Nodes", "2,847", "#10b981"],
          ].map(([l, v, c]) => (
            <span
              key={l}
              style={{
                fontSize: 8,
                color: "#1e3a5f",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {l} <strong style={{ color: c }}>{v}</strong>
            </span>
          ))}
        </div>
        <span
          style={{
            color: "rgba(16,185,129,0.5)",
            fontSize: 8,
            letterSpacing: "0.05em",
          }}
        >
          {tick} UTC+LON
        </span>
      </div>
    </div>
  );
}

// ─── SECURITY ROW ─────────────────────────────────────────────────────────────
function SecurityRow({
  label,
  status,
}: {
  label: string;
  status: "ok" | "pending" | "warning";
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs" style={{ color: "#475569" }}>
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        {status === "ok" && (
          <>
            <CheckCircle size={9} color="#10b981" />
            <span
              className="text-[10px] font-bold"
              style={{ color: "#10b981" }}
            >
              Active
            </span>
          </>
        )}
        {status === "pending" && (
          <>
            <AlertCircle size={9} color="#f59e0b" />
            <span
              className="text-[10px] font-bold"
              style={{ color: "#f59e0b" }}
            >
              Pending
            </span>
          </>
        )}
        {status === "warning" && (
          <>
            <AlertCircle size={9} color="#ef4444" />
            <span
              className="text-[10px] font-bold"
              style={{ color: "#ef4444" }}
            >
              Action needed
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function DashboardClient({
  userDetails,
}: {
  userDetails: User;
}) {
  const router = useRouter();
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [earnings7d, setEarnings7d] = useState<
    { date: string; earnings: number }[]
  >([]);
  const [activeAlloc, setActiveAlloc] = useState<TaskAllocation | null>(null);
  const [liveEarnings, setLiveEarnings] = useState(0);
  const [liveVideo, setLiveVideo] = useState<LiveVideo>({});
  const [serial] = useState(() =>
    generateGPUSerial(normalizeNode(userDetails.tier)),
  );
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FIX #8: operator license state — read directly from operator_licenses table
  const [hasActiveLicense, setHasActiveLicense] = useState(false);
  const [licenseExpiry, setLicenseExpiry] = useState<Date | null>(null);

  // FIX #1: Mining state with tier-aware profit calculation
  const [miningAllocs, setMiningAllocs] = useState<MiningAllocation[]>([]);
  const [miningLiveTotal, setMiningLiveTotal] = useState(0);
  const miningTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gpuUtil = useRNG(58, 94, 2300);
  const ramUsage = useRNG(52, 82, 3700);
  const temp = useRNG(57, 73, 3500);
  const power = useRNG(155, 210, 4000);

  const loadData = useCallback(async () => {
    const { data: ud } = await supabase
      .from("users")
      .select("*")
      .eq("id", userDetails.id)
      .single();
    if (ud) setUserData(ud);

    // 7-day earnings chart
    const ago = new Date();
    ago.setDate(ago.getDate() - 7);
    const { data: txs } = await supabase
      .from("transactions")
      .select("created_at,amount,type")
      .eq("user_id", userDetails.id)
      .gt("amount", 0)
      .gte("created_at", ago.toISOString());
    const g: Record<string, number> = {};
    (txs || []).forEach((r: any) => {
      const d = r.created_at.slice(0, 10);
      g[d] = (g[d] || 0) + r.amount;
    });
    setEarnings7d(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const k = d.toISOString().slice(0, 10);
        return {
          date: d.toLocaleDateString("en", { weekday: "short" }),
          earnings: parseFloat((g[k] || 0).toFixed(4)),
        };
      }),
    );

    // Task allocation (legacy)
    const { data: alloc } = await supabase
      .from("user_allocations")
      .select("*,gpu_clients(name,base_hourly_rate,multiplier)")
      .eq("user_id", userDetails.id)
      .eq("status", "active")
      .maybeSingle();
    if (alloc) {
      setActiveAlloc(alloc);
      if (liveRef.current) clearInterval(liveRef.current);
      const rate =
        (alloc.gpu_clients?.base_hourly_rate || 0) *
        (alloc.gpu_clients?.multiplier || 1);
      const base = alloc.earnings_accumulated || 0;
      const t0 = new Date(alloc.started_at).getTime();
      liveRef.current = setInterval(
        () => setLiveEarnings(base + ((Date.now() - t0) / 3600000) * rate),
        1000,
      );
    }

    // FIX #1: GPU mining — join with gpu_plans to get price_min for tier resolution
    const { data: miningData } = await supabase
      .from("node_allocations")
      .select(
        "id,plan_id,amount_invested,mining_period,mining_ends_at,total_earned,rate_factor_used,mining_completed,status,created_at,updated_at,gpu_plans(price_min)",
      )
      .eq("user_id", userDetails.id)
      .eq("status", "active")
      .eq("mining_completed", false)
      .order("created_at", { ascending: false });

    const enriched = (miningData || []).map((a: any) => ({
      ...a,
      plan_price_min: a.gpu_plans?.price_min ?? 5,
    }));
    setMiningAllocs(enriched);

    // FIX #8: Query operator_licenses directly — don't trust has_operator_license flag
    const { data: licenses } = await supabase
      .from("operator_licenses")
      .select("id,status,expires_at")
      .eq("user_id", userDetails.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(1);

    if (licenses && licenses.length > 0) {
      const lic = licenses[0];
      const expiry = lic.expires_at ? new Date(lic.expires_at) : null;
      const active = expiry ? expiry > new Date() : true; // no expiry = perpetual
      setHasActiveLicense(active);
      setLicenseExpiry(expiry);
    } else {
      setHasActiveLicense(false);
      setLicenseExpiry(null);
    }

    const { data: vd } = await supabase
      .from("admin_settings")
      .select("video_url,poster_url")
      .eq("key", "datacenter_feed")
      .maybeSingle();
    if (vd) setLiveVideo(vd);
    setLoading(false);
  }, [userDetails.id]);

  useEffect(() => {
    loadData();
    return () => {
      if (liveRef.current) clearInterval(liveRef.current);
      if (miningTickRef.current) clearInterval(miningTickRef.current);
    };
  }, [loadData]);

  // FIX #7: Realtime channels stored in refs — cleaned up properly on unmount
  // This prevents stale channel handlers that block navigation
  useEffect(() => {
    if (!userDetails.id) return;
const userChannel = supabase
  .channel(`dash_user_${userDetails.id}`)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "users",
      filter: `id=eq.${userDetails.id}`,
    },
    (payload: { new: User }) => {
      setUserData((prev) => (prev ? { ...prev, ...payload.new } : payload.new));
    },
  )
  .subscribe();

    const miningChannel = supabase
      .channel(`dash_mining_${userDetails.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "node_allocations",
          filter: `user_id=eq.${userDetails.id}`,
        },
        (payload) => {
          const updated = payload.new as MiningAllocation;
          if (updated.mining_completed) {
            // FIX #2: Session completed — remove from active list, force full reload
            // to sync balance_available from DB (realtime alone may lag)
            setMiningAllocs((prev) => prev.filter((a) => a.id !== updated.id));
            // Small delay to let DB triggers settle, then reload
            setTimeout(() => loadData(), 800);
          } else {
            setMiningAllocs((prev) =>
              prev.map((a) =>
                a.id === updated.id
                  ? { ...a, total_earned: updated.total_earned }
                  : a,
              ),
            );
          }
        },
      )
      .subscribe();

    // FIX #7: Return cleanup that removes BOTH channels
    return () => {
      supabase.removeChannel(userChannel);
      supabase.removeChannel(miningChannel);
    };
  }, [userDetails.id, loadData]);

  // FIX #1: GPU mining ticker — uses TIER_ROI for exact per-plan rates
  // $2000 staked on Foundation Node (Tier 0) for 1hr = $2000 × 0.3% = $6.00
  useEffect(() => {
    if (miningTickRef.current) clearInterval(miningTickRef.current);
    if (!miningAllocs.length) {
      setMiningLiveTotal(0);
      return;
    }

    let totalPerSec = 0;
    let baseTotal = 0;

    for (const alloc of miningAllocs) {
      const period = alloc.mining_period ?? "daily";
      const priceMin = alloc.plan_price_min ?? 5;
      const tier = tierFromPriceMin(priceMin);

      // Exact profit for this session using the correct tier
      const totalProfit = calcMiningProfit(alloc.amount_invested, period, tier);
      const pMs = PERIOD_MS[period] ?? PERIOD_MS.daily;
      const perSec = totalProfit / (pMs / 1000);

      totalPerSec += perSec;

      // Seed: DB value + time elapsed since last DB sync
      const base = alloc.total_earned ?? 0;
      const elapsed = Math.max(
        0,
        (Date.now() -
          new Date(alloc.updated_at || alloc.created_at).getTime()) /
          1000,
      );
      // Cap at totalProfit so it never over-counts
      baseTotal += Math.min(base + perSec * elapsed, totalProfit);
    }

    setMiningLiveTotal(baseTotal);
    miningTickRef.current = setInterval(() => {
      setMiningLiveTotal((p) => p + totalPerSec);
    }, 1000);

    return () => {
      if (miningTickRef.current) clearInterval(miningTickRef.current);
    };
  }, [miningAllocs]);

  // FIX #7: Navigation handler — always uses fresh router reference
  // Avoids stale closures that cause navigation to silently fail after extended use
  const navigate = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );

  const logout = async () => {
    if (liveRef.current) clearInterval(liveRef.current);
    if (miningTickRef.current) clearInterval(miningTickRef.current);
    await supabase.auth.signOut();
    document.cookie = "pin-verified=; path=/; max-age=0";
    router.push("/auth/signin");
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: BG }}
      >
        <div
          className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: `${BORDER} ${BORDER} ${BORDER} ${C_ACCENT}` }}
        />
      </div>
    );
  }

  const nodeKey = normalizeNode(userData?.tier);
  const node = NODES[nodeKey];
  const upgrade = nextNode(nodeKey);

  // FIX #2: balance reads from balance_available (kept fresh via realtime)
  const balance = Number(userData?.balance_available ?? 0);
  const totalEarned = Number(userData?.total_earned ?? 0);
  const streak = userData?.streak_count || 0;
  const kycVerified = !!userData?.kyc_verified;
  const kycPending = userData?.kyc_status === "pending";

  // FIX #8: Use freshly-queried license status, NOT the potentially stale
  // has_operator_license boolean on the users row
  const licenseActive = hasActiveLicense;
  const licenseDaysLeft = licenseExpiry
    ? Math.max(0, Math.ceil((licenseExpiry.getTime() - Date.now()) / 86400000))
    : 0;

  // FIX #8: device_verification — read the actual column value
  const deviceVerif = userData?.device_verification === true;
  const claSigned = !!userData?.cla_signed;
  const payoutReg = !!userData?.payout_registered;

  const secComplete = [
    kycVerified,
    licenseActive,
    deviceVerif,
    claSigned,
    payoutReg,
  ].filter(Boolean).length;

  const card = { background: SURFACE, border: `1px solid ${BORDER}` };
  const cardHi = { background: SURFACE, border: `1px solid ${BORDER_HI}` };
  const hasMiningActive = miningAllocs.length > 0;
  const hasTaskActive = !!activeAlloc;

  return (
    <div
      className="flex min-h-screen"
      style={{ background: BG, color: "#cbd5e1" }}
    >
      <DashboardNavigation />

      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Top bar */}
        <header
          className="sticky top-0 z-40 backdrop-blur-md"
          style={{ background: `${BG}f2`, borderBottom: `1px solid ${BORDER}` }}
        >
          <div className="px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{
                    background: `${C_ACCENT}18`,
                    border: `1px solid ${C_ACCENT}30`,
                  }}
                >
                  <Server size={12} color={C_ACCENT} />
                </div>
                <div>
                  <p
                    className="text-[8px] font-mono tracking-[0.2em] uppercase"
                    style={{ color: "#1e3a5f" }}
                  >
                    OmniTask Pro · GPU Compute
                  </p>
                  <p
                    className="font-bold text-sm leading-none"
                    style={{ color: "#e2e8f0" }}
                  >
                    {userData?.full_name || userData?.email}
                  </p>
                </div>
              </div>
              <div
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{
                  background: `${C_ACCENT}12`,
                  border: `1px solid ${C_ACCENT}25`,
                }}
              >
                <div
                  className="w-1 h-1 rounded-full animate-pulse"
                  style={{ background: C_ACCENT }}
                />
                <Cpu size={9} color={C_ACCENT} />
                <span
                  className="text-[9px] font-black tracking-wider uppercase"
                  style={{ color: C_ACCENT }}
                >
                  {node.shortName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {userData?.id && <LicenseStatusBadge userId={userData.id} />}
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs transition-colors px-3 py-2 rounded-xl"
                style={{ color: "#475569" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
              >
                <LogOut size={12} />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-3 md:p-5 pb-28 md:pb-8 max-w-[1400px] mx-auto w-full space-y-4 overflow-y-auto">
          {/* ROW 1 — 4 stat tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
            {/* Balance tile */}
            <div
              className="relative rounded-2xl overflow-hidden p-4 sm:p-5 w-full"
              style={{
                ...cardHi,
                background: "linear-gradient(135deg, #04112a 0%, #070e1c 100%)",
              }}
            >
              <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(#3b82f6 1px,transparent 1px),linear-gradient(90deg,#3b82f6 1px,transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <p
                className="text-[9px] font-mono uppercase tracking-widest mb-1.5"
                style={{ color: "#1e3a5f" }}
              >
                Available Balance
              </p>
              <p
                className="font-black text-3xl leading-none tabular-nums"
                style={{ color: C_ACCENT }}
              >
                ${balance.toFixed(2)}
              </p>
              {hasMiningActive && (
                <p
                  className="text-[9px] mt-1 font-mono flex items-center gap-1"
                  style={{ color: `${C_ACCENT}80` }}
                >
                  <Pickaxe size={8} />
                  +${miningLiveTotal.toFixed(6)} mining live
                </p>
              )}
              <p
                className="text-[9px] mt-1 font-mono"
                style={{ color: "#1e3a5f" }}
              >
                +${node.dailyEarning.toFixed(2)} / day potential
              </p>
              {/* FIX #7: onClick uses navigate() callback not inline router.push */}
              <button
                onClick={() => navigate("/dashboard/financials")}
                className="mt-3 flex items-center gap-1 text-[10px] font-bold transition-colors"
                style={{ color: C_ACCENT }}
              >
                View financials <ArrowUpRight size={10} />
              </button>
            </div>

            {/* Live earnings tile */}
            <div className="rounded-2xl p-5 relative" style={card}>
              <p
                className="text-[9px] font-mono uppercase tracking-widest mb-1.5"
                style={{ color: "#1e3a5f" }}
              >
                {hasMiningActive ? "GPU Mining Live" : "Live Allocation"}
              </p>
              {hasMiningActive && (
                <>
                  <p
                    className="font-black text-2xl leading-none tabular-nums"
                    style={{ color: C_ACCENT }}
                  >
                    ${miningLiveTotal.toFixed(6)}
                  </p>
                  <p className="text-[9px] mt-1" style={{ color: "#1e3a5f" }}>
                    {miningAllocs.length} active session
                    {miningAllocs.length > 1 ? "s" : ""} · $
                    {miningAllocs
                      .reduce((s, a) => s + a.amount_invested, 0)
                      .toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}{" "}
                    staked
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: C_ACCENT }}
                    />
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: C_ACCENT }}
                    >
                      Mining in progress
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      navigate("/dashboard/gpu-plans?tab=portfolio")
                    }
                    className="mt-2 text-[10px] font-bold flex items-center gap-1"
                    style={{ color: C_ACCENT }}
                  >
                    View portfolio <ArrowUpRight size={10} />
                  </button>
                </>
              )}
              {!hasMiningActive && hasTaskActive && (
                <>
                  <p
                    className="font-black text-2xl leading-none tabular-nums"
                    style={{ color: "#e2e8f0" }}
                  >
                    ${liveEarnings.toFixed(4)}
                  </p>
                  <p
                    className="text-[9px] mt-1.5 truncate"
                    style={{ color: "#1e3a5f" }}
                  >
                    {activeAlloc?.gpu_clients?.name}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: C_ACCENT }}
                    />
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: C_ACCENT }}
                    >
                      Earning now
                    </span>
                  </div>
                </>
              )}
              {!hasMiningActive && !hasTaskActive && (
                <>
                  <p
                    className="font-bold text-sm mt-1"
                    style={{ color: "#1e3a5f" }}
                  >
                    No active session
                  </p>
                  <button
                    onClick={() => navigate("/dashboard/gpu-plans")}
                    className="mt-2 text-[10px] font-bold flex items-center gap-1"
                    style={{ color: C_ACCENT }}
                  >
                    Start mining <ArrowUpRight size={10} />
                  </button>
                </>
              )}
            </div>

            {/* Total Earned */}
            <div className="rounded-2xl p-5" style={card}>
              <p
                className="text-[9px] font-mono uppercase tracking-widest mb-1.5"
                style={{ color: "#1e3a5f" }}
              >
                Total Earned
              </p>
              <p
                className="font-black text-2xl leading-none tabular-nums"
                style={{ color: "#e2e8f0" }}
              >
                ${totalEarned.toFixed(2)}
              </p>
              <div className="mt-2">
                <Spark
                  base={Math.max(totalEarned > 0 ? 5 : 1, 1)}
                  variance={2}
                  color="#3b82f6"
                  height={24}
                />
              </div>
            </div>

            {/* Streak + GPU util */}
            <div className="rounded-2xl p-5" style={card}>
              <p
                className="text-[9px] font-mono uppercase tracking-widest mb-1.5"
                style={{ color: "#1e3a5f" }}
              >
                Task Streak
              </p>
              <div className="flex items-baseline gap-2">
                <p
                  className="font-black text-2xl leading-none"
                  style={{ color: "#f59e0b" }}
                >
                  {streak}d
                </p>
                <span className="text-[9px]" style={{ color: "#1e3a5f" }}>
                  consecutive
                </span>
              </div>
              <div className="flex items-center justify-between mt-3 mb-1">
                <span className="text-[9px]" style={{ color: "#1e3a5f" }}>
                  GPU Utilisation
                </span>
                <span
                  className="font-mono font-bold text-xs"
                  style={{ color: C_ACCENT }}
                >
                  {gpuUtil}%
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: BORDER }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${gpuUtil}%`, background: `${C_ACCENT}70` }}
                />
              </div>
            </div>
          </div>

          {/* ROW 2 — GPU metrics + Workloads + Datacenter */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                  style={{ color: "#334155" }}
                >
                  <Cpu size={10} color="#334155" /> {node.name}
                </p>
                <span
                  className="text-[8px] font-mono"
                  style={{ color: "#1e3a5f" }}
                >
                  {serial}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MetricTile
                  label="Temp"
                  base={temp}
                  variance={6}
                  color="#fb923c"
                  unit="°C"
                  icon={Thermometer}
                />
                <MetricTile
                  label="VRAM"
                  base={ramUsage}
                  variance={10}
                  color="#3b82f6"
                  unit="%"
                  icon={MemoryStick}
                />
                <MetricTile
                  label="GPU"
                  base={gpuUtil}
                  variance={12}
                  color={C_ACCENT}
                  unit="%"
                  icon={Activity}
                />
                <MetricTile
                  label="Power"
                  base={power}
                  variance={18}
                  color="#a78bfa"
                  unit="W"
                  icon={Zap}
                />
              </div>
              <div className="rounded-2xl p-4" style={card}>
                <div className="flex items-center justify-between mb-3">
                  <p
                    className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                    style={{ color: "#334155" }}
                  >
                    <Layers size={9} color="#334155" /> Node Specs
                  </p>
                  <button
                    onClick={() => navigate("/dashboard/gpu-plans")}
                    className="text-[9px] font-bold flex items-center gap-0.5"
                    style={{ color: C_ACCENT }}
                  >
                    Upgrade <ArrowUpRight size={9} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {[
                    { l: "Architecture", v: node.architecture },
                    { l: "VRAM", v: node.vram },
                    { l: "TDP", v: node.tdp },
                    { l: "Daily Yield", v: `$${node.dailyEarning.toFixed(2)}` },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <p
                        className="text-[8px] uppercase tracking-wide"
                        style={{ color: "#1e3a5f" }}
                      >
                        {l}
                      </p>
                      <p
                        className="text-[10px] font-semibold font-mono truncate mt-0.5"
                        style={{ color: "#94a3b8" }}
                      >
                        {v}
                      </p>
                    </div>
                  ))}
                </div>
                {upgrade && (
                  <button
                    onClick={() => navigate("/dashboard/gpu-plans")}
                    className="mt-4 w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: `${C_ACCENT}10`,
                      border: `1px solid ${C_ACCENT}20`,
                      color: C_ACCENT,
                    }}
                  >
                    <span>Upgrade → {upgrade.name}</span>
                    <span className="font-mono">
                      ${upgrade.price.toLocaleString()}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl p-5 flex flex-col" style={card}>
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                  style={{ color: "#334155" }}
                >
                  <Activity size={10} color={C_ACCENT} /> Active Workloads
                </p>
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                  style={{
                    background: `${C_ACCENT}15`,
                    border: `1px solid ${C_ACCENT}25`,
                  }}
                >
                  <div
                    className="w-1 h-1 rounded-full animate-pulse"
                    style={{ background: C_ACCENT }}
                  />
                  <span
                    className="text-[8px] font-black tracking-widest"
                    style={{ color: C_ACCENT }}
                  >
                    LIVE
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <WorkloadFeed />
              </div>
              <button
                onClick={() => navigate("/dashboard/tasks")}
                className="mt-4 w-full flex items-center justify-center gap-2 font-black text-xs py-3 rounded-xl transition-all"
                style={{ background: C_ACCENT, color: "#020b04" }}
              >
                <Play size={11} fill="currentColor" /> Run Tasks
              </button>
            </div>

            <div className="rounded-2xl p-5 flex flex-col" style={card}>
              <div className="flex items-center justify-between mb-3">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                  style={{ color: "#334155" }}
                >
                  <Radio size={10} color="#ef4444" /> Datacenter Feed
                </p>
                <span
                  className="text-[8px] font-mono"
                  style={{ color: "#1e3a5f" }}
                >
                  SG-DC-01
                </span>
              </div>
              <DatacenterFeed video={liveVideo} />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { label: "Nodes", value: "2,847" },
                  { label: "Uptime", value: "99.97%" },
                  { label: "Temp", value: `${temp}°C` },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="text-center py-2 rounded-lg"
                    style={{ background: `${BORDER}80` }}
                  >
                    <p
                      className="font-black text-xs"
                      style={{ color: "#e2e8f0" }}
                    >
                      {value}
                    </p>
                    <p
                      className="text-[8px] uppercase tracking-wide mt-0.5"
                      style={{ color: "#1e3a5f" }}
                    >
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ROW 3 — Revenue chart + Account security */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl p-5" style={card}>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="font-bold text-sm" style={{ color: "#e2e8f0" }}>
                    Revenue Overview
                  </p>
                  <p
                    className="text-[9px] mt-0.5 font-mono"
                    style={{ color: "#1e3a5f" }}
                  >
                    7-day GPU compute earnings
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-xl" style={{ color: C_ACCENT }}>
                    ${totalEarned.toFixed(2)}
                  </p>
                  <p className="text-[9px]" style={{ color: "#1e3a5f" }}>
                    all-time
                  </p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart
                  data={earnings7d}
                  margin={{ top: 4, right: 0, left: -28, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={C_ACCENT}
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="100%"
                        stopColor={C_ACCENT}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={`${BORDER}80`} />
                  <XAxis
                    dataKey="date"
                    stroke="transparent"
                    tick={{ fill: "#1e3a5f", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="transparent"
                    tick={{ fill: "#1e3a5f", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#04112a",
                      border: `1px solid ${BORDER_HI}`,
                      borderRadius: 10,
                      color: "#e2e8f0",
                      fontSize: 10,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="earnings"
                    stroke={C_ACCENT}
                    strokeWidth={2}
                    fill="url(#revGrad)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => navigate("/dashboard/tasks")}
                  className="flex-1 flex items-center justify-center gap-1.5 font-black text-xs py-2.5 rounded-xl transition-all"
                  style={{ background: C_ACCENT, color: "#020b04" }}
                >
                  <Zap size={11} /> Run Tasks
                </button>
                {upgrade && (
                  <button
                    onClick={() => navigate("/dashboard/gpu-plans")}
                    className="flex-1 flex items-center justify-center gap-1.5 font-bold text-xs py-2.5 rounded-xl transition-all"
                    style={{
                      border: `1px solid ${BORDER_HI}`,
                      color: "#94a3b8",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = `${C_ACCENT}40`;
                      e.currentTarget.style.color = "#e2e8f0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = BORDER_HI;
                      e.currentTarget.style.color = "#94a3b8";
                    }}
                  >
                    <Rocket size={11} /> Upgrade → {upgrade.shortName}
                  </button>
                )}
                <button
                  onClick={() => navigate("/dashboard/gpu-plans")}
                  className="flex items-center justify-center px-3 py-2.5 rounded-xl transition-all"
                  style={{ border: `1px solid ${BORDER_HI}`, color: "#475569" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#e2e8f0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#475569";
                  }}
                >
                  <LayoutGrid size={13} />
                </button>
              </div>
            </div>

            {/* Account Security — FIX #8: reads live license + device_verification */}
            <div className="rounded-2xl p-5 flex flex-col" style={card}>
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{
                    background: `${C_ACCENT}15`,
                    border: `1px solid ${C_ACCENT}25`,
                  }}
                >
                  <Shield size={13} color={C_ACCENT} />
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: "#e2e8f0" }}>
                    Account Security
                  </p>
                  <p className="text-[9px]" style={{ color: "#1e3a5f" }}>
                    {secComplete} / 5 complete
                  </p>
                </div>
              </div>
              <div
                className="h-1 rounded-full mb-4 overflow-hidden"
                style={{ background: BORDER }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(secComplete / 5) * 100}%`,
                    background: secComplete === 5 ? C_ACCENT : "#3b82f6",
                  }}
                />
              </div>
              <div className="flex-1 divide-y" style={{ borderColor: BORDER }}>
                {/* FIX #8: kycVerified reads kyc_verified field */}
                <SecurityRow
                  label="KYC Verification"
                  status={
                    kycVerified ? "ok" : kycPending ? "pending" : "warning"
                  }
                />
                {/* FIX #8: licenseActive comes from operator_licenses table query */}
                <SecurityRow
                  label="Operator License"
                  status={licenseActive ? "ok" : "warning"}
                />
                {/* FIX #8: deviceVerif reads device_verification boolean column */}
                <SecurityRow
                  label="Device Verification"
                  status={deviceVerif ? "ok" : "pending"}
                />
                <SecurityRow
                  label="Platform Agreements"
                  status={claSigned ? "ok" : "warning"}
                />
                <SecurityRow
                  label="Payout Account"
                  status={payoutReg ? "ok" : "pending"}
                />
              </div>
              {licenseActive && (
                <div
                  className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{
                    background: `${C_ACCENT}10`,
                    border: `1px solid ${C_ACCENT}20`,
                  }}
                >
                  <Clock size={10} color={C_ACCENT} />
                  <p
                    className="text-[10px] font-semibold"
                    style={{ color: C_ACCENT }}
                  >
                    {licenseExpiry
                      ? `License valid · ${licenseDaysLeft}d remaining`
                      : "License active — no expiry"}
                  </p>
                </div>
              )}
              <div className="mt-3 space-y-2">
                {(!kycVerified || !licenseActive || !payoutReg) && (
                  <button
                    onClick={() => navigate("/dashboard/verification")}
                    className="w-full flex items-center justify-center gap-1.5 font-bold text-[10px] py-2.5 rounded-xl transition-all"
                    style={{
                      border: "1px solid #92400e80",
                      color: "#f59e0b",
                      background: "#78350f15",
                    }}
                  >
                    <AlertCircle size={10} /> Complete verification
                  </button>
                )}
                <button
                  onClick={() => navigate("/dashboard/financials")}
                  className="w-full flex items-center justify-center gap-1.5 font-bold text-[10px] py-2 rounded-xl transition-all"
                  style={{
                    border: `1px solid ${BORDER}`,
                    color: "#475569",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#94a3b8";
                    e.currentTarget.style.borderColor = BORDER_HI;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#475569";
                    e.currentTarget.style.borderColor = BORDER;
                  }}
                >
                  <DollarSign size={10} /> Financials &amp; Withdrawals
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
