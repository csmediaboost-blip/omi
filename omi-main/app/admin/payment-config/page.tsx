"use client";
// app/admin/payment-config/page.tsx
// Rebuilt to match actual payment_config schema:
// columns: id, korapay_secret_key, usd_to_ngn_rate, crypto_wallet_address, created_at

import { useEffect, useState, useCallback } from "react";
import {
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Zap,
  DollarSign,
  Wallet,
  CircleDot,
} from "lucide-react";

interface ConfigData {
  id?: string;
  korapay_secret_key?: string;
  usd_to_ngn_rate?: number | string;
  crypto_wallet_address?: string;
  created_at?: string;
}

// Each field definition maps directly to a DB column
const FIELDS: {
  key: keyof Omit<ConfigData, "id" | "created_at">;
  label: string;
  description: string;
  placeholder: string;
  sensitive?: boolean;
  type?: string;
  icon: any;
  accent: string;
  bg: string;
}[] = [
  {
    key: "korapay_secret_key",
    label: "KoraPay Secret Key",
    description:
      "Your KoraPay live secret key — used to initiate bank transfer payments",
    placeholder: "sk_live_...",
    sensitive: true,
    icon: Zap,
    accent: "#f97316",
    bg: "#fff7ed",
  },
  {
    key: "usd_to_ngn_rate",
    label: "USD → NGN Rate",
    description:
      "Exchange rate used to convert USD prices to Naira for bank transfer",
    placeholder: "e.g. 1600",
    type: "number",
    icon: DollarSign,
    accent: "#6366f1",
    bg: "#eef2ff",
  },
  {
    key: "crypto_wallet_address",
    label: "Crypto Wallet Address",
    description: "USDT TRC-20 wallet address where users send crypto payments",
    placeholder: "T...",
    sensitive: true,
    icon: Wallet,
    accent: "#10b981",
    bg: "#ecfdf5",
  },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
      title="Copy"
    >
      {copied ? (
        <Check size={14} className="text-emerald-500" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
}

function ConfigField({
  fieldDef,
  currentValue,
  onSaved,
}: {
  fieldDef: (typeof FIELDS)[0];
  currentValue?: string | number;
  onSaved: () => void;
}) {
  const [val, setVal] = useState(currentValue?.toString() ?? "");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<"saved" | "error" | null>(null);
  const Icon = fieldDef.icon;

  // Sync if parent refreshes
  useEffect(() => {
    setVal(currentValue?.toString() ?? "");
  }, [currentValue]);

  const configured = !!(currentValue && currentValue !== "");
  const dirty = val !== (currentValue?.toString() ?? "");

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/payment-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          field: fieldDef.key,
          value: fieldDef.type === "number" ? Number(val) : val.trim(),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setFlash("error");
      } else {
        setFlash("saved");
        onSaved();
        setTimeout(() => setFlash(null), 3000);
      }
    } catch {
      setFlash("error");
    }
    setSaving(false);
  };

  const maskedVal = () => {
    if (!currentValue) return null;
    const s = currentValue.toString();
    if (!fieldDef.sensitive || revealed) return s;
    if (s.length <= 10) return "•".repeat(s.length);
    return s.slice(0, 6) + "••••••••••••" + s.slice(-4);
  };

  const display = maskedVal();

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
      {/* Field header */}
      <div className="flex items-start gap-4 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: fieldDef.bg,
            border: `1px solid ${fieldDef.accent}30`,
          }}
        >
          <Icon size={18} style={{ color: fieldDef.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">
              {fieldDef.label}
            </span>
            {configured ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CircleDot
                  size={8}
                  className="fill-emerald-500 text-emerald-500"
                />{" "}
                Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                Not set
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            {fieldDef.description}
          </p>
        </div>
      </div>

      {/* Current value display */}
      {configured && display && (
        <div className="flex items-center justify-between mb-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
          <span className="font-mono text-xs text-gray-600 select-all flex-1 min-w-0 break-all">
            {display}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
            <CopyBtn text={currentValue!.toString()} />
            {fieldDef.sensitive && (
              <button
                onClick={() => setRevealed((v) => !v)}
                className="p-2 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit input */}
      <div className="flex gap-2">
        <input
          type={
            fieldDef.sensitive && !revealed
              ? "password"
              : fieldDef.type || "text"
          }
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={
            configured ? "Type new value to update…" : fieldDef.placeholder
          }
          className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-xl font-mono
            placeholder:font-sans placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:border-transparent transition-all"
          style={{ "--tw-ring-color": `${fieldDef.accent}40` } as any}
        />
        <button
          onClick={save}
          disabled={
            !dirty || saving || (!val.trim() && fieldDef.type !== "number")
          }
          className="h-10 px-5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all flex-shrink-0"
          style={{
            background: dirty && val ? "#111827" : "#f3f4f6",
            color: dirty && val ? "#fff" : "#9ca3af",
            cursor: dirty && val ? "pointer" : "not-allowed",
          }}
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : flash === "saved" ? (
            <CheckCircle2 size={14} className="text-emerald-400" />
          ) : flash === "error" ? (
            <XCircle size={14} className="text-red-400" />
          ) : (
            <Save size={14} />
          )}
          {saving
            ? "Saving"
            : flash === "saved"
              ? "Saved!"
              : flash === "error"
                ? "Error"
                : "Save"}
        </button>
      </div>

      {flash === "error" && (
        <p className="text-red-500 text-xs mt-2">
          Save failed — check the browser console for details.
        </p>
      )}
    </div>
  );
}

export default function PaymentConfigPage() {
  const [config, setConfig] = useState<ConfigData>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch("/api/admin/payment-config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data ?? {});
        setLastSync(new Date());
      }
    } catch {}
    silent ? setRefreshing(false) : setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const configuredCount = FIELDS.filter((f) => {
    const v = config[f.key];
    return v !== undefined && v !== null && v !== "";
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-orange-500 animate-spin" />
          <p className="text-sm text-gray-400">Loading configuration…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="max-w-xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
              Payment Configuration
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gateway credentials and wallet settings
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 h-9 px-3 text-sm text-gray-600 bg-white
              border border-gray-200 rounded-xl hover:border-gray-300 shadow-sm transition-all"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Status bar */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Configuration Status
            </span>
            <span className="text-xs text-gray-400">
              {lastSync && `Synced ${lastSync.toLocaleTimeString()}`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(configuredCount / FIELDS.length) * 100}%`,
                  background:
                    configuredCount === FIELDS.length ? "#10b981" : "#f97316",
                }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-600 flex-shrink-0">
              {configuredCount}/{FIELDS.length} configured
            </span>
            {configuredCount === FIELDS.length && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
                ✓ All set
              </span>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <ConfigField
              key={f.key}
              fieldDef={f}
              currentValue={config[f.key] as string | number | undefined}
              onSaved={() => load(true)}
            />
          ))}
        </div>

        {/* Schema info */}
        <div className="mt-6 px-4 py-3 bg-blue-50 border border-blue-200/80 rounded-xl">
          <p className="text-blue-700 text-xs leading-relaxed font-medium mb-1">
            Your payment_config columns:
          </p>
          <p className="text-blue-600 text-xs font-mono">
            id · korapay_secret_key · usd_to_ngn_rate · crypto_wallet_address ·
            created_at
          </p>
        </div>

        {/* Warning */}
        <div className="mt-3 flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200/80 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs leading-relaxed">
            All reads and writes use the service role key — changes take effect
            immediately with no redeploy needed.
          </p>
        </div>
      </div>
    </div>
  );
}
