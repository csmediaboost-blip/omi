// lib/gpuTiers.ts
// 12 GPU rental tiers. Levels 1-6 visible to all. 7-12 locked by admin.
// Admin sets price + daily_earning in Supabase app_config or gpu_tiers table.
// All amounts here are DEFAULTS — admin overrides take priority.

export type GpuTier = {
  key: string;
  level: number;
  name: string; // marketing name
  chip: string; // displayed chip model
  vram: string;
  architecture: string;
  tdp: string;
  clockSpeed: string; // shown as RNG base
  coreTempBase: number; // RNG base °C
  defaultPrice: number; // USD, admin can override
  defaultDaily: number; // USD/day, admin can override
  color: string; // tailwind text color
  accent: string; // hex for charts
  locked: boolean; // levels 7-12 locked by default
  scarce: boolean; // show waitlist (levels 1-3 only)
  maxWaitDays: number; // max days for waitlist (1-3 for scarce tiers)
};

export const GPU_TIERS: GpuTier[] = [
  // ── LEVELS 1-3: Starter / Scarce ────────────────────────────────
  {
    key: "edge_node",
    level: 1,
    name: "Edge Inference Node",
    chip: "NVIDIA GTX 1660 Ti",
    vram: "6 GB GDDR6",
    architecture: "Turing",
    tdp: "120W",
    clockSpeed: "1770 MHz",
    coreTempBase: 62,
    defaultPrice: 50,
    defaultDaily: 0.8,
    color: "text-slate-300",
    accent: "#94a3b8",
    locked: false,
    scarce: true,
    maxWaitDays: 3,
  },
  {
    key: "tensor_node",
    level: 2,
    name: "Tensor Processing Node",
    chip: "NVIDIA RTX 2080 Super",
    vram: "8 GB GDDR6",
    architecture: "Turing",
    tdp: "250W",
    clockSpeed: "1815 MHz",
    coreTempBase: 65,
    defaultPrice: 120,
    defaultDaily: 2.1,
    color: "text-blue-300",
    accent: "#93c5fd",
    locked: false,
    scarce: true,
    maxWaitDays: 2,
  },
  {
    key: "neural_edge",
    level: 3,
    name: "Neural Edge Accelerator",
    chip: "NVIDIA RTX 3070",
    vram: "8 GB GDDR6X",
    architecture: "Ampere",
    tdp: "220W",
    clockSpeed: "1730 MHz",
    coreTempBase: 67,
    defaultPrice: 200,
    defaultDaily: 3.8,
    color: "text-cyan-300",
    accent: "#67e8f9",
    locked: false,
    scarce: true,
    maxWaitDays: 1,
  },
  // ── LEVELS 4-6: Mid-Tier ─────────────────────────────────────────
  {
    key: "rtx3060_node",
    level: 4,
    name: "NVIDIA RTX 3060 Node",
    chip: "NVIDIA RTX 3060",
    vram: "12 GB GDDR6",
    architecture: "Ampere",
    tdp: "170W",
    clockSpeed: "1777 MHz",
    coreTempBase: 68,
    defaultPrice: 350,
    defaultDaily: 6.5,
    color: "text-emerald-300",
    accent: "#6ee7b7",
    locked: false,
    scarce: false,
    maxWaitDays: 0,
  },
  {
    key: "a100_enterprise",
    level: 5,
    name: "NVIDIA A100 Enterprise",
    chip: "NVIDIA A100 SXM4",
    vram: "80 GB HBM2e",
    architecture: "Ampere",
    tdp: "400W",
    clockSpeed: "1410 MHz",
    coreTempBase: 72,
    defaultPrice: 1200,
    defaultDaily: 24.0,
    color: "text-violet-300",
    accent: "#c4b5fd",
    locked: false,
    scarce: false,
    maxWaitDays: 0,
  },
  {
    key: "h100_cluster",
    level: 6,
    name: "H100 Cluster Node",
    chip: "NVIDIA H100 NVLink",
    vram: "80 GB HBM3",
    architecture: "Hopper",
    tdp: "700W",
    clockSpeed: "1755 MHz",
    coreTempBase: 75,
    defaultPrice: 3500,
    defaultDaily: 72.0,
    color: "text-amber-300",
    accent: "#fcd34d",
    locked: false,
    scarce: false,
    maxWaitDays: 0,
  },
  // ── LEVELS 7-12: Locked by Admin ─────────────────────────────────
  {
    key: "gh200_node",
    level: 7,
    name: "GH200 Grace Hopper Node",
    chip: "NVIDIA GH200",
    vram: "96 GB HBM3e",
    architecture: "Hopper+Grace",
    tdp: "900W",
    clockSpeed: "1980 MHz",
    coreTempBase: 78,
    defaultPrice: 6000,
    defaultDaily: 140.0,
    color: "text-rose-300",
    accent: "#fda4af",
    locked: true,
    scarce: false,
    maxWaitDays: 0,
  },
  {
    key: "b200_node",
    level: 8,
    name: "Blackwell B200 Node",
    chip: "NVIDIA B200",
    vram: "192 GB HBM3e",
    architecture: "Blackwell",
    tdp: "1000W",
    clockSpeed: "2200 MHz",
    coreTempBase: 80,
    defaultPrice: 10000,
    defaultDaily: 250.0,
    color: "text-pink-300",
    accent: "#f9a8d4",
    locked: true,
    scarce: false,
    maxWaitDays: 0,
  },
  {
    key: "dgx_h100",
    level: 9,
    name: "DGX H100 System",
    chip: "8× NVIDIA H100",
    vram: "640 GB HBM3 (8×80)",
    architecture: "Hopper × 8",
    tdp: "6.5kW",
    clockSpeed: "1755 MHz",
    coreTempBase: 82,
    defaultPrice: 25000,
    defaultDaily: 600.0,
    color: "text-orange-300",
    accent: "#fdba74",
    locked: true,
    scarce: false,
    maxWaitDays: 0,
  },
  {
    key: "dgx_b200",
    level: 10,
    name: "DGX B200 SuperPod",
    chip: "8× NVIDIA B200",
    vram: "1.5 TB HBM3e",
    architecture: "Blackwell × 8",
    tdp: "8.0kW",
    clockSpeed: "2200 MHz",
    coreTempBase: 84,
    defaultPrice: 50000,
    defaultDaily: 1200.0,
    color: "text-red-300",
    accent: "#fca5a5",
    locked: true,
    scarce: false,
    maxWaitDays: 0,
  },
  {
    key: "nvl72_rack",
    level: 11,
    name: "NVLink72 Rack System",
    chip: "72× GB200",
    vram: "13.5 TB HBM3e",
    architecture: "Blackwell NVL72",
    tdp: "120kW",
    clockSpeed: "2400 MHz",
    coreTempBase: 86,
    defaultPrice: 200000,
    defaultDaily: 5000.0,
    color: "text-purple-300",
    accent: "#d8b4fe",
    locked: true,
    scarce: false,
    maxWaitDays: 0,
  },
  {
    key: "colossus",
    level: 12,
    name: "Colossus AI Supercluster",
    chip: "100,000× H100",
    vram: "Exabyte-scale HBM3",
    architecture: "Custom Mesh",
    tdp: "150MW",
    clockSpeed: "1755 MHz",
    coreTempBase: 88,
    defaultPrice: 999999,
    defaultDaily: 25000.0,
    color: "text-yellow-300",
    accent: "#fde68a",
    locked: true,
    scarce: false,
    maxWaitDays: 0,
  },
];

// ── Helpers ────────────────────────────────────────────────────────
export function getTierByKey(key: string): GpuTier | undefined {
  return GPU_TIERS.find((t) => t.key === key);
}

export function getTierByLevel(level: number): GpuTier | undefined {
  return GPU_TIERS.find((t) => t.level === level);
}

// RNG for realistic GPU metrics
export function genSerial(tierKey: string): string {
  const prefix: Record<string, string> = {
    edge_node: "NV-GTX-",
    tensor_node: "NV-RTX20-",
    neural_edge: "NV-RTX30-",
    rtx3060_node: "NV-3060-",
    a100_enterprise: "NV-A100-",
    h100_cluster: "NV-H100-",
    gh200_node: "NV-GH200-",
    b200_node: "NV-B200-",
    dgx_h100: "NV-DGX1-",
    dgx_b200: "NV-DGX2-",
    nvl72_rack: "NVL-72-",
    colossus: "SC-AI-",
  };
  const p = prefix[tierKey] || "NV-GPU-";
  const n = Math.floor(1000 + Math.random() * 8999);
  const s = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${p}${n}${s}`;
}

// Workload log companies & task types
export const WORKLOAD_COMPANIES = [
  "OpenAI",
  "Anthropic",
  "Google DeepMind",
  "Meta AI Research",
  "University of Berlin",
  "MIT CSAIL",
  "Stanford HAI",
  "Waymo",
  "Hugging Face",
  "Stability AI",
  "Scale AI",
  "AWS Bedrock",
  "Goldman Sachs AI",
  "ECMWF Climate",
  "Pfizer R&D",
  "NASA JPL",
  "Tesla Autopilot",
  "GitHub Copilot",
  "Cohere",
  "Mistral AI",
];
export const WORKLOAD_TASKS = [
  "Image Rendering",
  "NLP Tokenization",
  "Video Diffusion",
  "Protein Folding",
  "Climate Model Training",
  "RLHF Annotation",
  "LoRA Fine-tune",
  "Speech Recognition",
  "Autonomous Driving Sim",
  "Medical Imaging Analysis",
  "3D Scene Reconstruction",
  "RAG Retrieval",
  "Embedding Batch Processing",
  "Code Generation",
  "OCR Pipeline",
];
