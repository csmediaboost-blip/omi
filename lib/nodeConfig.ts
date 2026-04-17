// lib/nodeConfig.ts
// GPU Node Tier System — replaces old observer/compute/neural tier system entirely

export type NodeKey =
  | "rtx3060"
  | "rtx3090"
  | "a40"
  | "rtx4090"
  | "a100"
  | "h100"
  | "h100_cluster"
  | "dgx_a100"
  | "dgx_h100"
  | "dgx_superpod"
  | "oracle_bf"
  | "hyperscale";

export type NodeTier = {
  key: NodeKey;
  name: string;
  shortName: string;
  subtitle: string;
  price: number;
  dailyEarning: number;
  tasksPerDay: number;
  rewardPerTask: number;
  referralCommission: number;
  color: string;
  bg: string;
  border: string;
  inviteOnly: boolean;
  adminLocked: boolean;
  waitlistOnly: boolean;
  vram: string;
  tdp: string;
  architecture: string;
};

export const NODES: Record<NodeKey, NodeTier> = {
  // ── TIERS 1-3: Entry nodes — waitlist scarcity applied ─────────────────────
  rtx3060: {
    key: "rtx3060",
    name: "RTX 3060 Node",
    shortName: "RTX 3060",
    subtitle: "Entry Compute · 12GB VRAM",
    price: 99,
    dailyEarning: 1.2,
    tasksPerDay: 8,
    rewardPerTask: 0.15,
    referralCommission: 3,
    color: "text-slate-300",
    bg: "bg-slate-700/20",
    border: "border-slate-700/40",
    inviteOnly: false,
    adminLocked: false,
    waitlistOnly: true,
    vram: "12 GB GDDR6",
    tdp: "170W",
    architecture: "Ampere",
  },
  rtx3090: {
    key: "rtx3090",
    name: "RTX 3090 Node",
    shortName: "RTX 3090",
    subtitle: "Pro Compute · 24GB VRAM",
    price: 199,
    dailyEarning: 2.8,
    tasksPerDay: 14,
    rewardPerTask: 0.2,
    referralCommission: 4,
    color: "text-blue-300",
    bg: "bg-blue-900/20",
    border: "border-blue-800/40",
    inviteOnly: false,
    adminLocked: false,
    waitlistOnly: true,
    vram: "24 GB GDDR6X",
    tdp: "350W",
    architecture: "Ampere",
  },
  a40: {
    key: "a40",
    name: "NVIDIA A40 Node",
    shortName: "A40",
    subtitle: "Workstation AI · 48GB VRAM",
    price: 399,
    dailyEarning: 5.6,
    tasksPerDay: 20,
    rewardPerTask: 0.28,
    referralCommission: 5,
    color: "text-cyan-300",
    bg: "bg-cyan-900/20",
    border: "border-cyan-800/40",
    inviteOnly: false,
    adminLocked: false,
    waitlistOnly: true,
    vram: "48 GB GDDR6",
    tdp: "300W",
    architecture: "Ampere",
  },
  // ── TIERS 4-6: Premium nodes — open purchase ───────────────────────────────
  rtx4090: {
    key: "rtx4090",
    name: "RTX 4090 Node",
    shortName: "RTX 4090",
    subtitle: "Gaming-AI Hybrid · 24GB VRAM",
    price: 699,
    dailyEarning: 9.8,
    tasksPerDay: 28,
    rewardPerTask: 0.35,
    referralCommission: 6,
    color: "text-emerald-300",
    bg: "bg-emerald-900/20",
    border: "border-emerald-700/40",
    inviteOnly: false,
    adminLocked: false,
    waitlistOnly: false,
    vram: "24 GB GDDR6X",
    tdp: "450W",
    architecture: "Ada Lovelace",
  },
  a100: {
    key: "a100",
    name: "NVIDIA A100 Node",
    shortName: "A100",
    subtitle: "Enterprise AI · 80GB HBM2e",
    price: 1299,
    dailyEarning: 18.5,
    tasksPerDay: 40,
    rewardPerTask: 0.46,
    referralCommission: 8,
    color: "text-violet-300",
    bg: "bg-violet-900/20",
    border: "border-violet-700/40",
    inviteOnly: false,
    adminLocked: false,
    waitlistOnly: false,
    vram: "80 GB HBM2e",
    tdp: "400W",
    architecture: "Ampere",
  },
  h100: {
    key: "h100",
    name: "NVIDIA H100 Node",
    shortName: "H100",
    subtitle: "AI Flagship · 80GB HBM3",
    price: 2499,
    dailyEarning: 35.0,
    tasksPerDay: 60,
    rewardPerTask: 0.58,
    referralCommission: 10,
    color: "text-amber-300",
    bg: "bg-amber-900/20",
    border: "border-amber-700/40",
    inviteOnly: false,
    adminLocked: false,
    waitlistOnly: false,
    vram: "80 GB HBM3",
    tdp: "700W",
    architecture: "Hopper",
  },
  // ── TIERS 7-12: Admin-locked until unlocked ────────────────────────────────
  h100_cluster: {
    key: "h100_cluster",
    name: "H100 Cluster",
    shortName: "H100 ×8",
    subtitle: "8× NVLink Cluster · 640GB",
    price: 9999,
    dailyEarning: 120.0,
    tasksPerDay: 200,
    rewardPerTask: 0.6,
    referralCommission: 12,
    color: "text-rose-300",
    bg: "bg-rose-900/20",
    border: "border-rose-700/40",
    inviteOnly: false,
    adminLocked: true,
    waitlistOnly: false,
    vram: "640 GB HBM3 (8× NVLink)",
    tdp: "5600W",
    architecture: "Hopper",
  },
  dgx_a100: {
    key: "dgx_a100",
    name: "DGX A100 System",
    shortName: "DGX A100",
    subtitle: "Full DGX System · 320GB",
    price: 19999,
    dailyEarning: 250.0,
    tasksPerDay: 500,
    rewardPerTask: 0.5,
    referralCommission: 14,
    color: "text-orange-300",
    bg: "bg-orange-900/20",
    border: "border-orange-700/40",
    inviteOnly: false,
    adminLocked: true,
    waitlistOnly: false,
    vram: "320 GB HBM2e",
    tdp: "6.5 kW",
    architecture: "Ampere DGX",
  },
  dgx_h100: {
    key: "dgx_h100",
    name: "DGX H100 System",
    shortName: "DGX H100",
    subtitle: "Next-gen DGX · 640GB HBM3",
    price: 39999,
    dailyEarning: 500.0,
    tasksPerDay: 1000,
    rewardPerTask: 0.5,
    referralCommission: 15,
    color: "text-pink-300",
    bg: "bg-pink-900/20",
    border: "border-pink-700/40",
    inviteOnly: false,
    adminLocked: true,
    waitlistOnly: false,
    vram: "640 GB HBM3",
    tdp: "10.2 kW",
    architecture: "Hopper DGX",
  },
  dgx_superpod: {
    key: "dgx_superpod",
    name: "DGX SuperPOD",
    shortName: "SuperPOD",
    subtitle: "AI Supercomputer · 20 DGX",
    price: 199999,
    dailyEarning: 2500.0,
    tasksPerDay: 5000,
    rewardPerTask: 0.5,
    referralCommission: 18,
    color: "text-fuchsia-300",
    bg: "bg-fuchsia-900/20",
    border: "border-fuchsia-700/40",
    inviteOnly: false,
    adminLocked: true,
    waitlistOnly: false,
    vram: "12.8 TB (20× DGX H100)",
    tdp: "200 kW",
    architecture: "Hopper SuperPOD",
  },
  oracle_bf: {
    key: "oracle_bf",
    name: "Oracle BF.16384",
    shortName: "BF.16384",
    subtitle: "Bare Metal HPC Node",
    price: 499999,
    dailyEarning: 6000.0,
    tasksPerDay: 10000,
    rewardPerTask: 0.6,
    referralCommission: 20,
    color: "text-sky-300",
    bg: "bg-sky-900/20",
    border: "border-sky-700/40",
    inviteOnly: true,
    adminLocked: true,
    waitlistOnly: false,
    vram: "HBM3e Pooled",
    tdp: "500 kW",
    architecture: "Multi-Chip Module",
  },
  hyperscale: {
    key: "hyperscale",
    name: "Hyperscale Cluster",
    shortName: "Hyperscale",
    subtitle: "Datacenter Rack · Enterprise",
    price: 999999,
    dailyEarning: 15000.0,
    tasksPerDay: 50000,
    rewardPerTask: 0.3,
    referralCommission: 25,
    color: "text-lime-300",
    bg: "bg-lime-900/20",
    border: "border-lime-700/40",
    inviteOnly: true,
    adminLocked: true,
    waitlistOnly: false,
    vram: "Distributed HBM Fabric",
    tdp: "1.2 MW",
    architecture: "Hyperscale Fabric",
  },
};

export const NODE_ORDER: NodeKey[] = [
  "rtx3060",
  "rtx3090",
  "a40",
  "rtx4090",
  "a100",
  "h100",
  "h100_cluster",
  "dgx_a100",
  "dgx_h100",
  "dgx_superpod",
  "oracle_bf",
  "hyperscale",
];

/** Map legacy tier strings to new GPU keys */
export function normalizeNode(tier?: string | null): NodeKey {
  if (!tier) return "rtx3060";
  const t = tier.toLowerCase().replace(/[\s-]/g, "_");
  if (NODE_ORDER.includes(t as NodeKey)) return t as NodeKey;
  const legacyMap: Record<string, NodeKey> = {
    observer: "rtx3060",
    compute: "rtx3090",
    neural: "a40",
    intelligence: "rtx4090",
    cognitive: "a100",
    research: "h100",
  };
  return legacyMap[t] || "rtx3060";
}

/** Returns the next unlockable (non-locked, non-invite) node above current */
export function nextNode(key: NodeKey): NodeTier | null {
  const idx = NODE_ORDER.indexOf(key);
  if (idx === -1 || idx >= NODE_ORDER.length - 1) return null;
  const nextKey = NODE_ORDER[idx + 1];
  const n = NODES[nextKey];
  if (n.adminLocked || n.inviteOnly) return null;
  return n;
}

export const WITHDRAWAL = {
  payoutDay: 5,
  payoutDayName: "Friday",
  minimumAmount: 10,
  maximumWeekly: 500,
};

export const RECOVERY_DAYS = 45;

/** Fake enterprise task log — shown on the worker dashboard */
export const FAKE_TASK_LOG = [
  {
    id: "4829",
    task: "Image Rendering",
    client: "OpenAI Research",
    progress: 100,
    status: "SUCCESS",
  },
  {
    id: "9921",
    task: "Medical Imaging Model",
    client: "University of Berlin",
    progress: 42,
    status: "RUNNING",
  },
  {
    id: "1204",
    task: "NLP Tokenization",
    client: "Anthropic Labs",
    progress: 88,
    status: "RUNNING",
  },
  {
    id: "3371",
    task: "Video Diffusion Inference",
    client: "Stability AI",
    progress: 67,
    status: "RUNNING",
  },
  {
    id: "7710",
    task: "Protein Folding Batch",
    client: "DeepMind API",
    progress: 100,
    status: "SUCCESS",
  },
  {
    id: "5503",
    task: "Speech Recognition",
    client: "Meta AI Research",
    progress: 15,
    status: "QUEUED",
  },
  {
    id: "8841",
    task: "Autonomous Driving Sim",
    client: "Waymo Edge",
    progress: 100,
    status: "SUCCESS",
  },
  {
    id: "2291",
    task: "Climate Model Training",
    client: "ECMWF HPC",
    progress: 54,
    status: "RUNNING",
  },
  {
    id: "6612",
    task: "Financial Risk Model",
    client: "Goldman Sachs AI",
    progress: 100,
    status: "SUCCESS",
  },
  {
    id: "3389",
    task: "Code Generation Eval",
    client: "GitHub Copilot",
    progress: 30,
    status: "RUNNING",
  },
];

/** Generate a realistic-looking GPU serial number via RNG */
export function generateGPUSerial(nodeKey: NodeKey): string {
  const prefix: Record<string, string> = {
    rtx3060: "NV-RTX3060",
    rtx3090: "NV-RTX3090",
    a40: "NV-A40",
    rtx4090: "NV-RTX4090",
    a100: "NV-A100-SXM",
    h100: "NV-H100-SXM",
    h100_cluster: "NV-H100C",
    dgx_a100: "NV-DGX-A100",
    dgx_h100: "NV-DGX-H100",
    dgx_superpod: "NV-SPOD",
    oracle_bf: "OCI-BF16384",
    hyperscale: "HS-RACK",
  };
  const p = prefix[nodeKey] || "NV-GPU";
  const n = Math.floor(1000 + Math.random() * 9000);
  const s = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${p}-${n}${s}`;
}
export const NODE_ALIASES = {
  observer: "rtx3060",
  compute: "rtx3090",
  neural: "a40",
  intelligence: "rtx4090",
  cognitive: "a100",
  research: "h100",
} as const;