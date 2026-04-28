"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  Code2,
  Key,
  Copy,
  CheckCircle,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Terminal,
  BookOpen,
  Zap,
  Shield,
  AlertTriangle,
  ChevronDown,
  ArrowLeft,
  Globe,
  Clock,
  Activity,
  AlertCircle,
  Package,
  Cpu,
  TrendingUp,
  Hash,
  Layers,
  Webhook,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type APIKey = {
  id: string;
  key_prefix: string;
  key_masked: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
  requests_used: number;
  requests_limit: number;
};

type AccessStatus =
  | "none"
  | "pending_payment"
  | "pending_approval"
  | "approved";

type UserData = {
  id: string;
  has_api_access: boolean;
  api_access_purchased_at: string | null;
  api_access_status: AccessStatus | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const API_PRICE = 249;
const BASE_URL = "https://api.omnitaskpro.com/v1";

// ─── Code Examples ────────────────────────────────────────────────────────────
const PY_EXAMPLE = `import requests

API_KEY = "omni_sk_your_key_here"
BASE_URL = "https://api.omnitaskpro.com/v1"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def get_node_status():
    res = requests.get(f"{BASE_URL}/nodes/status", headers=headers)
    res.raise_for_status()
    return res.json()

def get_earnings():
    res = requests.get(f"{BASE_URL}/earnings/summary", headers=headers)
    res.raise_for_status()
    return res.json()

def submit_rlhf(task_id: str, choice: str, confidence: int):
    payload = {
        "task_id": task_id,
        "choice": choice,
        "confidence": confidence
    }
    res = requests.post(
        f"{BASE_URL}/tasks/rlhf/submit",
        json=payload, headers=headers
    )
    res.raise_for_status()
    return res.json()

def assign_gpu(client_id: str):
    res = requests.post(
        f"{BASE_URL}/allocations/assign",
        json={"client_id": client_id},
        headers=headers
    )
    res.raise_for_status()
    return res.json()

if __name__ == "__main__":
    status = get_node_status()
    print(f"Tier: {status['tier']} | Allocated: {status['is_allocated']}")
    earnings = get_earnings()
    print(f"Balance: \${earnings['balance_available']:.2f}")`;

const TS_EXAMPLE = `import axios from "axios";

const API_KEY = "omni_sk_your_key_here";
const BASE_URL = "https://api.omnitaskpro.com/v1";

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json",
  },
});

interface NodeStatus {
  node_key: string; tier: string;
  is_allocated: boolean; uptime_hours: number; earnings_today: number;
}
interface EarningsSummary {
  balance_available: number; balance_pending: number;
  total_earned: number; streak_count: number;
}

export async function getNodeStatus(): Promise<NodeStatus> {
  const { data } = await client.get<NodeStatus>("/nodes/status");
  return data;
}
export async function getEarnings(): Promise<EarningsSummary> {
  const { data } = await client.get<EarningsSummary>("/earnings/summary");
  return data;
}
export async function submitRLHF(
  taskId: string, choice: "A" | "B", confidence: 1|2|3|4|5
): Promise<{ reward: number; task_id: string }> {
  const { data } = await client.post("/tasks/rlhf/submit",
    { task_id: taskId, choice, confidence });
  return data;
}
export async function assignGPU(clientId: string) {
  const { data } = await client.post("/allocations/assign",
    { client_id: clientId });
  return data;
}

async function main() {
  const status = await getNodeStatus();
  console.log(\`Tier: \${status.tier} | Allocated: \${status.is_allocated}\`);
  const earnings = await getEarnings();
  console.log(\`Balance: $\${earnings.balance_available.toFixed(2)}\`);
}
main().catch(console.error);`;

const CURL_EXAMPLE = `# Get node status
curl -X GET https://api.omnitaskpro.com/v1/nodes/status \\
  -H "Authorization: Bearer omni_sk_your_key_here" \\
  -H "Content-Type: application/json"

# Submit RLHF response
curl -X POST https://api.omnitaskpro.com/v1/tasks/rlhf/submit \\
  -H "Authorization: Bearer omni_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"task_id": "task_abc123", "choice": "A", "confidence": 4}'

# Assign GPU to a client
curl -X POST https://api.omnitaskpro.com/v1/allocations/assign \\
  -H "Authorization: Bearer omni_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"client_id": "client_xyz789"}'`;

// ─── Endpoint Groups ──────────────────────────────────────────────────────────
const ENDPOINT_GROUPS = [
  {
    group: "Nodes",
    icon: Cpu,
    endpoints: [
      {
        method: "GET",
        path: "/v1/nodes/status",
        desc: "GPU node status, tier, allocation state and uptime",
        params: [],
      },
      {
        method: "GET",
        path: "/v1/nodes/metrics",
        desc: "Real-time metrics: temperature, utilisation, VRAM",
        params: [],
      },
      {
        method: "POST",
        path: "/v1/nodes/restart",
        desc: "Gracefully restart your node daemon",
        params: ["reason?: string"],
      },
    ],
  },
  {
    group: "Earnings",
    icon: TrendingUp,
    endpoints: [
      {
        method: "GET",
        path: "/v1/earnings/summary",
        desc: "Balance, pending, total earned, and current streak",
        params: [],
      },
      {
        method: "GET",
        path: "/v1/earnings/history",
        desc: "Paginated earnings history with type breakdowns",
        params: ["page?: number", "limit?: number"],
      },
      {
        method: "POST",
        path: "/v1/earnings/withdraw",
        desc: "Request a payout to your connected wallet",
        params: ["amount: number", "wallet: string"],
      },
    ],
  },
  {
    group: "RLHF Tasks",
    icon: Layers,
    endpoints: [
      {
        method: "GET",
        path: "/v1/tasks/rlhf/current",
        desc: "Fetch the next available RLHF task for review",
        params: [],
      },
      {
        method: "POST",
        path: "/v1/tasks/rlhf/submit",
        desc: "Submit a ranked response and claim reward",
        params: ["task_id: string", "choice: A|B", "confidence: 1-5"],
      },
      {
        method: "GET",
        path: "/v1/tasks/rlhf/history",
        desc: "Your RLHF submission history and reward totals",
        params: ["page?: number"],
      },
    ],
  },
  {
    group: "GPU Allocations",
    icon: Activity,
    endpoints: [
      {
        method: "GET",
        path: "/v1/allocations/clients",
        desc: "Available GPU clients you can assign your node to",
        params: [],
      },
      {
        method: "POST",
        path: "/v1/allocations/assign",
        desc: "Assign your GPU node to a specific client",
        params: ["client_id: string"],
      },
      {
        method: "POST",
        path: "/v1/allocations/collect",
        desc: "Collect accumulated earnings from active allocation",
        params: ["allocation_id: string"],
      },
      {
        method: "DELETE",
        path: "/v1/allocations/release",
        desc: "Release node from current client assignment",
        params: ["allocation_id: string"],
      },
    ],
  },
  {
    group: "Transactions",
    icon: Hash,
    endpoints: [
      {
        method: "GET",
        path: "/v1/transactions",
        desc: "Full transaction log with filters and pagination",
        params: ["type?: string", "from?: date", "to?: date"],
      },
      {
        method: "GET",
        path: "/v1/transactions/:id",
        desc: "Single transaction details by ID",
        params: [],
      },
    ],
  },
];

const ERROR_CODES = [
  {
    code: 400,
    label: "Bad Request",
    example: '{ "error": "missing_field", "message": "task_id is required" }',
  },
  {
    code: 401,
    label: "Unauthorized",
    example:
      '{ "error": "invalid_api_key", "message": "API key is invalid or revoked" }',
  },
  {
    code: 403,
    label: "Forbidden",
    example:
      '{ "error": "insufficient_access", "message": "API access not approved" }',
  },
  {
    code: 429,
    label: "Rate Limited",
    example:
      '{ "error": "rate_limited", "message": "60 req/min exceeded", "retry_after": 12 }',
  },
  {
    code: 500,
    label: "Server Error",
    example:
      '{ "error": "server_error", "message": "An unexpected error occurred" }',
  },
];

const WEBHOOK_EVENTS = [
  { event: "node.allocated", desc: "GPU assigned to a client" },
  { event: "node.released", desc: "GPU released from client" },
  { event: "earnings.credited", desc: "Earnings added to balance" },
  { event: "task.completed", desc: "RLHF task submitted and rewarded" },
  { event: "balance.low", desc: "Balance drops below $5 threshold" },
  { event: "key.revoked", desc: "An API key was revoked" },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-900/40 text-blue-300 border border-blue-800/40",
  POST: "bg-emerald-900/40 text-emerald-300 border border-emerald-800/40",
  DELETE: "bg-red-900/40 text-red-300 border border-red-800/40",
  PATCH: "bg-amber-900/40 text-amber-300 border border-amber-800/40",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative bg-[#080d18] border border-slate-800/80 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <span className="text-slate-500 text-xs font-mono ml-1">{lang}</span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs transition-colors px-2 py-1 rounded-lg hover:bg-slate-800"
        >
          {copied ? (
            <>
              <CheckCircle size={11} className="text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs text-emerald-300 font-mono overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function AccordionSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="border border-slate-800/80 rounded-2xl overflow-hidden transition-all"
      style={{ background: open ? "rgba(15,23,42,0.7)" : "rgba(10,16,28,0.5)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center">
            <Icon size={14} className="text-slate-400" />
          </div>
          <span className="text-white font-bold text-sm">{title}</span>
          {badge && (
            <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${open ? "bg-slate-700 rotate-180" : "bg-slate-800/60"}`}
        >
          <ChevronDown size={13} className="text-slate-400" />
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-800/60 px-5 py-5 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function APIAccessPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [newKeyFull, setNewKeyFull] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [tab, setTab] = useState<"guide" | "docs" | "keys">("guide");
  const [docLang, setDocLang] = useState<"python" | "typescript" | "curl">(
    "python",
  );

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth/signin");
      return;
    }

    const { data: ud } = await supabase
      .from("users")
      .select("id,has_api_access,api_access_purchased_at,api_access_status")
      .eq("id", user.id)
      .single();
    setUserData(ud);

    if (ud?.has_api_access) {
      const { data: keys } = await supabase
        .from("api_keys")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setApiKeys(keys || []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Determine status from DB
  const accessStatus: AccessStatus = userData?.has_api_access
    ? "approved"
    : (userData?.api_access_status as AccessStatus) || "none";

  function goToCheckout() {
    router.push(
      `/dashboard/checkout?node=api_access&price=${API_PRICE}&name=API+Developer+Access&daily=0&redirect=/dashboard/api-access`,
    );
  }

  async function generateKey() {
    setGenerating(true);
    try {
      const res = await fetch("/api/api-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_key" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setNewKeyFull(j.full_key);
      showToast("Key generated — copy it now, it won't be shown again.");
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to generate key", false);
    } finally {
      setGenerating(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (
      !confirm(
        "Revoke this key? Any integrations using it will break immediately.",
      )
    )
      return;
    try {
      await supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("id", keyId);
      showToast("Key revoked.");
      loadData();
    } catch {
      showToast("Failed to revoke key", false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060c18] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const TABS = [
    { id: "guide" as const, label: "Developer Guide", icon: BookOpen },
    { id: "docs" as const, label: "API Reference", icon: Terminal },
    ...(accessStatus === "approved"
      ? [{ id: "keys" as const, label: "API Keys", icon: Key }]
      : []),
  ];

  return (
    <div
      className="flex min-h-screen text-slate-200"
      style={{ background: "#060c18" }}
    >
      <DashboardNavigation />

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl max-w-sm flex items-center gap-2.5 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}{" "}
          {toast.msg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6 pb-36 md:pb-16 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <ArrowLeft size={15} className="text-slate-400" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-white font-black text-2xl tracking-tight">
                  API Access
                </h1>
                {accessStatus === "approved" && (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                    Active
                  </span>
                )}
                {accessStatus === "pending_approval" && (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />{" "}
                    Pending Approval
                  </span>
                )}
                {accessStatus === "none" && (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 text-slate-500 border border-slate-700 px-2.5 py-1 rounded-full">
                    Not Activated
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-0.5">
                Programmatic access to OmniTask Pro GPU compute, earnings &
                tasks
              </p>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              STATUS: NONE — purchase CTA
          ══════════════════════════════════════════════════════ */}
          {accessStatus === "none" && (
            <div
              className="relative rounded-3xl overflow-hidden p-6 md:p-10"
              style={{
                background:
                  "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(6,12,24,0.95) 50%, rgba(16,185,129,0.08) 100%)",
                border: "1px solid rgba(124,58,237,0.25)",
              }}
            >
              <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/6 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative space-y-6">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      background: "rgba(124,58,237,0.15)",
                      border: "1.5px solid rgba(124,58,237,0.35)",
                    }}
                  >
                    <Code2 size={28} className="text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 mb-1">
                      Developer Platform
                    </p>
                    <h2 className="text-white font-black text-3xl leading-tight">
                      OmniTask Pro API
                    </h2>
                    <p className="text-slate-400 text-sm mt-2 max-w-xl leading-relaxed">
                      Full programmatic access to GPU allocations, RLHF tasks,
                      earnings, real-time metrics, and webhooks. One-time
                      activation — no monthly fees, no rate-limit surprises.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {[
                        "REST + JSON",
                        "10K req/day",
                        "5 API keys",
                        "Webhook events",
                        "Python & TS SDKs",
                      ].map((f) => (
                        <span
                          key={f}
                          className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/60 border border-slate-700/60 px-2.5 py-1 rounded-lg"
                        >
                          <CheckCircle
                            size={10}
                            className="text-emerald-400 shrink-0"
                          />{" "}
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-left md:text-right">
                    <p className="text-slate-500 text-sm">One-time fee</p>
                    <p className="text-5xl font-black text-white">
                      ${API_PRICE}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                    </p>
                  </div>
                </div>

                {/* What you get */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      icon: Key,
                      title: "API Key Management",
                      desc: "Generate up to 5 keys. Per-key usage tracking and one-click revocation.",
                    },
                    {
                      icon: Zap,
                      title: "All Endpoints",
                      desc: "Full access to nodes, earnings, RLHF, GPU allocation, and transaction history.",
                    },
                    {
                      icon: Shield,
                      title: "Lifetime Access",
                      desc: "Pay once. Access the API for the lifetime of your account. No renewals.",
                    },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div
                      key={title}
                      className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 flex gap-3"
                    >
                      <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                        <Icon size={14} className="text-violet-400" />
                      </div>
                      <div>
                        <p className="text-white font-bold text-xs">{title}</p>
                        <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                          {desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Process steps */}
                <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">
                    How it works
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      {
                        step: "01",
                        title: "Pay via secure checkout",
                        desc: "Card payment via our PCI-compliant checkout. Not deducted from your task earnings.",
                      },
                      {
                        step: "02",
                        title: "Admin reviews application",
                        desc: "Our team reviews your account within 24 hours and approves API access.",
                      },
                      {
                        step: "03",
                        title: "Generate your API keys",
                        desc: "Once approved, return here to generate up to 5 API keys and start building.",
                      },
                    ].map(({ step, title, desc }) => (
                      <div key={step} className="flex gap-3">
                        <span className="text-2xl font-black text-slate-800 shrink-0">
                          {step}
                        </span>
                        <div>
                          <p className="text-white font-bold text-sm">
                            {title}
                          </p>
                          <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                            {desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <button
                    onClick={goToCheckout}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-black px-8 py-4 rounded-2xl text-base transition-all"
                  >
                    <Lock size={16} /> Genrate API key
                  </button>
                  <p className="text-slate-600 text-xs text-center md:text-left">
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              STATUS: PENDING APPROVAL — waiting state
          ══════════════════════════════════════════════════════ */}
          {accessStatus === "pending_approval" && (
            <div className="space-y-5">
              {/* Success confirmation card */}
              <div
                className="relative rounded-3xl overflow-hidden p-8"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(6,12,24,0.98) 100%)",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="relative flex flex-col md:flex-row md:items-center gap-6">
                  {/* Animated pending icon */}
                  <div
                    className="w-20 h-20 rounded-3xl flex items-center justify-center shrink-0 mx-auto md:mx-0"
                    style={{
                      background: "rgba(16,185,129,0.12)",
                      border: "2px solid rgba(16,185,129,0.3)",
                    }}
                  >
                    <div className="relative">
                      <CheckCircle size={32} className="text-emerald-400" />
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-[#060c18] animate-pulse" />
                    </div>
                  </div>

                  <div className="flex-1 text-center md:text-left">
                    <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-1">
                      Payment Confirmed
                    </p>
                    <h2 className="text-white font-black text-2xl">
                      Application Submitted!
                    </h2>
                    <p className="text-slate-400 text-sm mt-2 leading-relaxed max-w-lg">
                      Your payment of{" "}
                      <strong className="text-white">${API_PRICE}</strong> was
                      received successfully. Our team is reviewing your
                      application and will approve API access within{" "}
                      <strong className="text-amber-400">72 hours</strong>.
                      You'll be notified on your registered email.
                    </p>
                  </div>

                  <div className="shrink-0 text-center">
                    <div className="inline-flex flex-col items-center gap-2 bg-amber-900/20 border border-amber-700/30 rounded-2xl px-6 py-4">
                      <div className="w-8 h-8 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
                      <p className="text-amber-400 font-black text-sm">
                        Under Review
                      </p>
                      <p className="text-amber-400/60 text-xs">≤ 24 hours</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-white font-bold text-sm mb-5">
                  Approval Timeline
                </h3>
                <div className="space-y-4">
                  {[
                    {
                      label: "Payment received",
                      status: "done",
                      note:
                        "Your card was charged $" +
                        API_PRICE +
                        " successfully.",
                    },
                    {
                      label: "Application submitted",
                      status: "done",
                      note: "Your developer account is queued for review.",
                    },
                    {
                      label: "Admin review",
                      status: "active",
                      note: "Our team verifies account activity and approves access.",
                    },
                    {
                      label: "Keys unlocked",
                      status: "pending",
                      note: "Return here to generate up to 5 API keys.",
                    },
                  ].map(({ label, status, note }, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                            status === "done"
                              ? "bg-emerald-500/20 border border-emerald-500/40"
                              : status === "active"
                                ? "bg-amber-500/20 border border-amber-500/40"
                                : "bg-slate-800 border border-slate-700"
                          }`}
                        >
                          {status === "done" ? (
                            <CheckCircle
                              size={13}
                              className="text-emerald-400"
                            />
                          ) : status === "active" ? (
                            <RefreshCw
                              size={13}
                              className="text-amber-400 animate-spin"
                            />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-600" />
                          )}
                        </div>
                        {i < 3 && (
                          <div
                            className={`w-px flex-1 mt-1 min-h-[20px] ${status === "done" ? "bg-emerald-500/30" : "bg-slate-800"}`}
                          />
                        )}
                      </div>
                      <div className="pb-4">
                        <p
                          className={`font-bold text-sm ${status === "done" ? "text-emerald-400" : status === "active" ? "text-amber-400" : "text-slate-600"}`}
                        >
                          {label}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">{note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* What to do while waiting */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <p className="text-white font-bold text-sm mb-3">
                  While you wait, explore the docs below
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Browse the Developer Guide and API Reference tabs to get
                  familiar with the endpoints. Once approved you'll be able to
                  generate keys and start integrating immediately.
                </p>
                <button
                  onClick={() => setTab("guide")}
                  className="mt-3 flex items-center gap-2 text-violet-400 hover:text-violet-300 text-xs font-bold transition-colors"
                >
                  <BookOpen size={13} /> Read the developer guide →
                </button>
              </div>

              {/* Check again */}
              <div className="flex items-center justify-center">
                <button
                  onClick={loadData}
                  className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm transition-colors border border-slate-800 hover:border-slate-600 px-4 py-2 rounded-xl"
                >
                  <RefreshCw size={13} /> Check approval status
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              STATUS: APPROVED — active access banner
          ══════════════════════════════════════════════════════ */}
          {accessStatus === "approved" && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <CheckCircle size={14} className="text-emerald-400 shrink-0" />
              <p className="text-emerald-300 text-sm font-semibold">
                API Access approved — purchased{" "}
                {userData?.api_access_purchased_at
                  ? new Date(
                      userData.api_access_purchased_at,
                    ).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : ""}
              </p>
            </div>
          )}

          {/* ── Tabs ── */}
          <div
            className="flex gap-1 p-1 rounded-2xl w-fit"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === id ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════
              TAB: DEVELOPER GUIDE
          ══════════════════════════════════════════════════════ */}
          {tab === "guide" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Base URL",
                    value: "api.omnitaskpro.com",
                    icon: Globe,
                    color: "text-blue-400",
                  },
                  {
                    label: "Rate Limit",
                    value: "60 / min",
                    icon: Clock,
                    color: "text-violet-400",
                  },
                  {
                    label: "Daily Quota",
                    value: "10,000 req",
                    icon: Activity,
                    color: "text-emerald-400",
                  },
                  {
                    label: "Latency SLA",
                    value: "< 200ms",
                    icon: Zap,
                    color: "text-amber-400",
                  },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div
                    key={label}
                    className="rounded-2xl p-4 flex flex-col gap-2"
                    style={{
                      background: "rgba(15,23,42,0.7)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <Icon size={16} className={color} />
                    <p className="text-white font-black text-sm">{value}</p>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider">
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              <AccordionSection
                title="Authentication"
                icon={Shield}
                defaultOpen
                badge="Start here"
              >
                <p className="text-slate-400 text-sm leading-relaxed">
                  Every request must include your API key as a{" "}
                  <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                    Bearer
                  </code>{" "}
                  token in the{" "}
                  <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                    Authorization
                  </code>{" "}
                  header. Keys start with{" "}
                  <code className="text-violet-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                    omni_sk_
                  </code>{" "}
                  and should never be exposed in client-side or public code.
                </p>
                <CodeBlock
                  lang="http"
                  code={`Authorization: Bearer omni_sk_your_key_here\nContent-Type: application/json\nAccept: application/json`}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  {[
                    {
                      icon: Shield,
                      title: "Never expose keys",
                      desc: "Use environment variables or secrets managers, never hard-code in source.",
                    },
                    {
                      icon: RefreshCw,
                      title: "Rotate regularly",
                      desc: "Generate a new key every 90 days and revoke the old one.",
                    },
                    {
                      icon: AlertTriangle,
                      title: "Monitor usage",
                      desc: "Track request counts per key to detect unexpected spikes.",
                    },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div
                      key={title}
                      className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 flex gap-2.5"
                    >
                      <Icon
                        size={13}
                        className="text-slate-400 mt-0.5 shrink-0"
                      />
                      <div>
                        <p className="text-white text-xs font-bold">{title}</p>
                        <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                          {desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionSection>

              <AccordionSection title="Quick Start" icon={Zap} defaultOpen>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {(["python", "typescript", "curl"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setDocLang(lang)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all capitalize ${docLang === lang ? "bg-violet-600 border-violet-500 text-white" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                    >
                      {lang === "python"
                        ? "🐍 Python"
                        : lang === "typescript"
                          ? "📘 TypeScript"
                          : "🖥 cURL"}
                    </button>
                  ))}
                </div>
                <CodeBlock
                  lang={docLang === "curl" ? "bash" : docLang}
                  code={
                    docLang === "python"
                      ? PY_EXAMPLE
                      : docLang === "typescript"
                        ? TS_EXAMPLE
                        : CURL_EXAMPLE
                  }
                />
              </AccordionSection>

              <AccordionSection title="Error Handling" icon={AlertCircle}>
                <p className="text-slate-400 text-sm mb-4 leading-relaxed">
                  All errors return a consistent JSON structure with an{" "}
                  <code className="text-rose-400 bg-slate-800 px-1 rounded text-xs">
                    error
                  </code>{" "}
                  code and human-readable{" "}
                  <code className="text-rose-400 bg-slate-800 px-1 rounded text-xs">
                    message
                  </code>
                  .
                </p>
                <div className="space-y-2">
                  {ERROR_CODES.map(({ code, label, example }) => (
                    <div
                      key={code}
                      className="rounded-xl overflow-hidden border border-slate-800/60"
                    >
                      <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/40">
                        <span
                          className={`text-xs font-black px-2 py-0.5 rounded ${code < 500 ? "bg-amber-900/40 text-amber-300" : "bg-red-900/40 text-red-300"}`}
                        >
                          {code}
                        </span>
                        <span className="text-slate-300 text-xs font-bold">
                          {label}
                        </span>
                      </div>
                      <pre className="px-4 py-2.5 text-[11px] text-slate-400 font-mono bg-[#080d18] overflow-x-auto">
                        {example}
                      </pre>
                    </div>
                  ))}
                </div>
              </AccordionSection>

              <AccordionSection title="Webhooks" icon={Webhook}>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Configure a HTTPS webhook in Settings → Webhooks. Verify the{" "}
                  <code className="text-emerald-400 bg-slate-800 px-1 rounded text-xs">
                    X-OmniTask-Signature
                  </code>{" "}
                  header using HMAC-SHA256.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                  {WEBHOOK_EVENTS.map(({ event, desc }) => (
                    <div
                      key={event}
                      className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2.5"
                    >
                      <code className="text-violet-400 text-[11px] font-mono font-bold shrink-0">
                        {event}
                      </code>
                      <span className="text-slate-500 text-[11px]">{desc}</span>
                    </div>
                  ))}
                </div>
                <CodeBlock
                  lang="json"
                  code={`// POST to your webhook URL\n{\n  "event": "earnings.credited",\n  "timestamp": "2026-03-23T10:00:00Z",\n  "data": {\n    "amount": 0.50,\n    "type": "rlhf_reward",\n    "balance_after": 47.30\n  }\n}`}
                />
              </AccordionSection>

              <AccordionSection title="SDK Installation" icon={Package}>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {(["python", "typescript"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setDocLang(lang)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${docLang === lang ? "bg-violet-600 border-violet-500 text-white" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                    >
                      {lang === "python" ? "🐍 Python" : "📘 TypeScript"}
                    </button>
                  ))}
                </div>
                <CodeBlock
                  lang="bash"
                  code={
                    docLang === "python"
                      ? `pip install omnitask-sdk\n\n# Then in your code:\nfrom omnitask import OmniTaskClient\nclient = OmniTaskClient(api_key="omni_sk_...")\nstatus = client.nodes.status()\nprint(status.tier, status.is_allocated)`
                      : `npm install omnitask-sdk\n\n// Then in your code:\nimport { OmniTaskClient } from "omnitask-sdk";\nconst client = new OmniTaskClient({ apiKey: "omni_sk_..." });\nconst status = await client.nodes.status();\nconsole.log(status.tier, status.isAllocated);`
                  }
                />
              </AccordionSection>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: API REFERENCE
          ══════════════════════════════════════════════════════ */}
          {tab === "docs" && (
            <div className="space-y-4">
              <div
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs text-slate-400"
                style={{
                  background: "rgba(15,23,42,0.7)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Globe size={13} className="text-slate-500" />
                <span className="font-mono text-emerald-400">{BASE_URL}</span>
                <span className="text-slate-600">—</span>
                <span>All endpoints require Bearer auth</span>
              </div>

              {ENDPOINT_GROUPS.map(({ group, icon: GroupIcon, endpoints }) => (
                <AccordionSection
                  key={group}
                  title={group}
                  icon={GroupIcon}
                  defaultOpen={group === "Nodes"}
                >
                  <div className="space-y-3">
                    {endpoints.map(({ method, path, desc, params }) => (
                      <div
                        key={path}
                        className="rounded-xl overflow-hidden"
                        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/60">
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ${METHOD_COLORS[method] || ""}`}
                          >
                            {method}
                          </span>
                          <code className="text-slate-200 text-xs font-mono flex-1">
                            {path}
                          </code>
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(
                                `${BASE_URL}${path.replace("/v1", "")}`,
                              )
                            }
                            className="text-slate-600 hover:text-slate-400 transition-colors"
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                        <div className="px-4 py-3 bg-[#080d18] space-y-2">
                          <p className="text-slate-400 text-xs">{desc}</p>
                          {params.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {params.map((p) => (
                                <code
                                  key={p}
                                  className="text-[10px] bg-slate-800/80 border border-slate-700/60 text-slate-400 px-2 py-0.5 rounded-md font-mono"
                                >
                                  {p}
                                </code>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionSection>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: API KEYS (approved only)
          ══════════════════════════════════════════════════════ */}
          {tab === "keys" && accessStatus === "approved" && (
            <div className="space-y-5">
              {newKeyFull && (
                <div
                  className="rounded-2xl p-5 space-y-3"
                  style={{
                    background: "rgba(217,119,6,0.1)",
                    border: "1px solid rgba(217,119,6,0.3)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      size={14}
                      className="text-amber-400 shrink-0"
                    />
                    <p className="text-amber-300 font-bold text-sm">
                      Copy your key now — it won't be shown again
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-black/60 rounded-xl p-3 border border-slate-800">
                    <span className="text-emerald-400 font-mono text-sm flex-1 break-all">
                      {newKeyFull}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(newKeyFull);
                        showToast("Copied!");
                      }}
                      className="text-slate-400 hover:text-white transition-colors shrink-0 bg-slate-800 hover:bg-slate-700 p-2 rounded-lg"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => setNewKeyFull(null)}
                    className="text-slate-500 text-xs hover:text-slate-300 transition-colors"
                  >
                    I've saved my key — dismiss ✕
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-black text-lg">
                    Your API Keys
                  </h2>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {apiKeys.filter((k) => k.is_active).length} / 5 active keys
                  </p>
                </div>
                <button
                  onClick={generateKey}
                  disabled={
                    generating || apiKeys.filter((k) => k.is_active).length >= 5
                  }
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all"
                >
                  {generating ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />{" "}
                      Generating…
                    </>
                  ) : (
                    <>
                      <Key size={13} /> Generate Key
                    </>
                  )}
                </button>
              </div>

              {apiKeys.length === 0 ? (
                <div
                  className="text-center py-16 rounded-2xl"
                  style={{ border: "1.5px dashed rgba(255,255,255,0.07)" }}
                >
                  <div className="w-12 h-12 bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Key size={20} className="text-slate-600" />
                  </div>
                  <p className="text-slate-500 font-bold">No keys yet</p>
                  <p className="text-slate-600 text-xs mt-1">
                    Generate your first API key to start building
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((k) => (
                    <div
                      key={k.id}
                      className={`rounded-xl p-4 transition-all ${k.is_active ? "opacity-100" : "opacity-50"}`}
                      style={{
                        background: "rgba(15,23,42,0.7)",
                        border: k.is_active
                          ? "1px solid rgba(255,255,255,0.08)"
                          : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${k.is_active ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800/40" : "bg-slate-800/60 text-slate-500 border border-slate-700/40"}`}
                            >
                              {k.is_active ? "● Active" : "Revoked"}
                            </span>
                            <span className="text-slate-600 text-xs">
                              Created{" "}
                              {new Date(k.created_at).toLocaleDateString()}
                            </span>
                            {k.last_used_at && (
                              <span className="text-slate-700 text-xs">
                                · Last used{" "}
                                {new Date(k.last_used_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="text-emerald-400 font-mono text-sm">
                              {revealedKey === k.id
                                ? k.key_masked
                                : `${k.key_prefix}${"•".repeat(28)}`}
                            </code>
                            <button
                              onClick={() =>
                                setRevealedKey(
                                  revealedKey === k.id ? null : k.id,
                                )
                              }
                              className="text-slate-600 hover:text-slate-400 transition-colors"
                            >
                              {revealedKey === k.id ? (
                                <EyeOff size={12} />
                              ) : (
                                <Eye size={12} />
                              )}
                            </button>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-slate-500 text-[11px]">
                                {k.requests_used.toLocaleString()} /{" "}
                                {k.requests_limit.toLocaleString()} requests
                              </span>
                              <span className="text-slate-600 text-[11px]">
                                {Math.round(
                                  (k.requests_used / k.requests_limit) * 100,
                                )}
                                %
                              </span>
                            </div>
                            <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{
                                  width: `${Math.min((k.requests_used / k.requests_limit) * 100, 100)}%`,
                                  background:
                                    k.requests_used / k.requests_limit > 0.8
                                      ? "rgb(239,68,68)"
                                      : "rgb(124,58,237)",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        {k.is_active && (
                          <button
                            onClick={() => revokeKey(k.id)}
                            className="text-slate-600 hover:text-red-400 text-xs transition-colors shrink-0 border border-slate-700/60 hover:border-red-800/50 px-2.5 py-1.5 rounded-lg"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Keys allowed", value: "5", icon: Key },
                  { label: "Req / minute", value: "60", icon: Clock },
                  { label: "Req / day", value: "10,000", icon: Activity },
                  { label: "Response SLA", value: "<200ms", icon: Zap },
                ].map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-xl p-3 text-center"
                    style={{
                      background: "rgba(15,23,42,0.6)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <Icon size={14} className="text-slate-500 mx-auto mb-1" />
                    <p className="text-white font-black text-base">{value}</p>
                    <p className="text-slate-600 text-[10px] mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
