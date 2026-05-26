"use client";
// app/admin/payment-config/page.tsx
// Modern white admin UI — all reads/writes via /api/admin/payment-config (service role)

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  Shield,
  Wallet,
  Settings2,
  KeyRound,
  CircleDot,
} from "lucide-react";

interface ConfigRow {
  id: number;
  key: string;
  value: string;
  created_at?: string;
}

const GATEWAYS = [
  {
    id: "korapay",
    label: "KoraPay",
    description: "African payment gateway",
    icon: Zap,
    accent: "#f97316",
    bg: "#fff7ed",
    border: "#fed7aa",
    keys: [
      {
        key: "korapay_secret_key",
        label: "Secret Key",
        placeholder: "sk_live_...",
        sensitive: true,
      },
      {
        key: "korapay_public_key",
        label: "Public Key",
        placeholder: "pk_live_...",
      },
      {
        key: "korapay_payment_link",
        label: "Payment Link",
        placeholder: "https://pay.korapay.com/...",
      },
    ],
  },
  {
    id: "stripe",
    label: "Stripe",
    description: "Global card payments",
    icon: Shield,
    accent: "#6366f1",
    bg: "#eef2ff",
    border: "#c7d2fe",
    keys: [
      {
        key: "stripe_secret_key",
        label: "Secret Key",
        placeholder: "sk_live_...",
        sensitive: true,
      },
      {
        key: "stripe_public_key",
        label: "Public Key",
        placeholder: "pk_live_...",
      },
    ],
  },
  {
    id: "crypto",
    label: "Crypto Wallets",
    description: "USDT, BTC addresses",
    icon: Wallet,
    accent: "#10b981",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    keys: [
      {
        key: "crypto_wallet_usdt_trc20",
        label: "USDT TRC-20",
        placeholder: "T...",
        sensitive: true,
      },
      {
        key: "crypto_wallet_usdt_erc20",
        label: "USDT ERC-20",
        placeholder: "0x...",
        sensitive: true,
      },
      {
        key: "crypto_wallet_btc",
        label: "Bitcoin",
        placeholder: "bc1...",
        sensitive: true,
      },
      {
        key: "crypto_network_label",
        label: "Network Label",
        placeholder: "TRC-20 (TRON)",
      },
      {
        key: "crypto_qr_image_url",
        label: "QR Image URL",
        placeholder: "https://...",
      },
      { key: "crypto_discount_percent", label: "Discount %", placeholder: "5" },
    ],
  },
  {
    id: "general",
    label: "General",
    description: "Platform settings",
    icon: Settings2,
    accent: "#64748b",
    bg: "#f8fafc",
    border: "#e2e8f0",
    keys: [
      {
        key: "payments_enabled",
        label: "Payments Enabled",
        placeholder: "true",
      },
      {
        key: "maintenance_mode",
        label: "Maintenance Mode",
        placeholder: "false",
      },
    ],
  },
];

async function adminApi(body: object) {
  const res = await fetch("/api/admin/payment-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
    >
      {copied ? (
        <Check size={12} className="text-emerald-500" />
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}

function KeyField({
  keyName,
  label,
  placeholder,
  sensitive = false,
  row,
  onSaved,
  onDeleted,
}: {
  keyName: string;
  label: string;
  placeholder: string;
  sensitive?: boolean;
  row?: ConfigRow;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [val, setVal] = useState(row?.value ?? "");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<"saved" | "error" | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const configured = !!(
    row?.value &&
    row.value !== "EMPTY" &&
    row.value !== ""
  );
  const dirty = val !== (row?.value ?? "");

  const save = async () => {
    if (!dirty || !val.trim()) return;
    setSaving(true);
    const res = await adminApi(
      row
        ? { action: "update", id: row.id, value: val.trim() }
        : { action: "insert", key: keyName, value: val.trim() },
    );
    setSaving(false);
    if (res.error) {
      setFlash("error");
      toast.error("Save failed: " + res.error);
    } else {
      setFlash("saved");
      onSaved();
      setTimeout(() => setFlash(null), 3000);
    }
  };

  const del = async () => {
    if (!row) return;
    setDeleting(true);
    await adminApi({ action: "delete", id: row.id });
    setDeleting(false);
    setConfirmDel(false);
    setVal("");
    onDeleted();
  };

  const maskedDisplay = () => {
    if (!row?.value || !configured) return null;
    if (!sensitive || revealed) return row.value;
    return row.value.slice(0, 6) + "••••••••••••" + row.value.slice(-4);
  };

  const display = maskedDisplay();

  return (
    <div className="py-4 border-b border-gray-100 last:border-0 group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{label}</span>
          {configured && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
              <CircleDot
                size={8}
                className="fill-emerald-500 text-emerald-500"
              />{" "}
              SET
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {configured && <CopyBtn text={row!.value} />}
          {configured && sensitive && (
            <button
              onClick={() => setRevealed((v) => !v)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
          {configured && !confirmDel && (
            <button
              onClick={() => setConfirmDel(true)}
              className="p-1.5 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          )}
          {confirmDel && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={del}
                disabled={deleting}
                className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded transition-colors"
              >
                {deleting ? "..." : "Delete"}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {display && (
        <div className="mb-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 font-mono text-xs text-gray-500 select-all">
          {display}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type={sensitive && !revealed ? "password" : "text"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={configured ? "Type new value to update…" : placeholder}
          className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-lg font-mono placeholder:font-sans placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 transition-all"
        />
        <button
          onClick={save}
          disabled={!dirty || !val.trim() || saving}
          className={`h-9 px-4 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all
            ${
              dirty && val.trim()
                ? "bg-gray-900 hover:bg-gray-800 text-white shadow-sm"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : flash === "saved" ? (
            <CheckCircle2 size={13} className="text-emerald-400" />
          ) : flash === "error" ? (
            <XCircle size={13} className="text-red-400" />
          ) : (
            <Save size={13} />
          )}
          {saving ? "Saving" : flash === "saved" ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}

function GatewaySection({
  gateway,
  configs,
  onRefresh,
}: {
  gateway: (typeof GATEWAYS)[0];
  configs: ConfigRow[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(gateway.id === "korapay");
  const Icon = gateway.icon;

  const configured = gateway.keys.filter((k) => {
    const r = configs.find((c) => c.key === k.key);
    return r?.value && r.value !== "EMPTY" && r.value !== "";
  }).length;
  const total = gateway.keys.length;
  const pct = Math.round((configured / total) * 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden transition-all">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-6 py-5 hover:bg-gray-50/80 transition-colors text-left"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
          style={{
            background: gateway.bg,
            border: `1px solid ${gateway.border}`,
          }}
        >
          <Icon size={18} style={{ color: gateway.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-gray-900 text-sm">
              {gateway.label}
            </span>
            <span className="text-xs text-gray-400">{gateway.description}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background:
                    pct === 100
                      ? "#10b981"
                      : pct > 0
                        ? gateway.accent
                        : "#e5e7eb",
                }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {configured}/{total} keys
            </span>
            {pct === 100 && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                ✓ Ready
              </span>
            )}
          </div>
        </div>
        <div className="text-gray-400 flex-shrink-0">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="px-6 pb-2 border-t border-gray-100">
          {gateway.keys.map((k) => (
            <KeyField
              key={k.key}
              keyName={k.key}
              label={k.label}
              placeholder={k.placeholder}
              sensitive={k.sensitive}
              row={configs.find((c) => c.key === k.key)}
              onSaved={onRefresh}
              onDeleted={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomKeysSection({
  configs,
  onRefresh,
}: {
  configs: ConfigRow[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const knownKeys = GATEWAYS.flatMap((g) => g.keys.map((k) => k.key));
  const customRows = configs.filter((c) => !knownKeys.includes(c.key));

  const add = async () => {
    if (!newKey.trim()) {
      setErr("Key name required.");
      return;
    }
    if (configs.find((c) => c.key === newKey.trim())) {
      setErr("Key already exists.");
      return;
    }
    setAdding(true);
    setErr("");
    const res = await adminApi({
      action: "insert",
      key: newKey.trim(),
      value: newVal.trim(),
    });
    setAdding(false);
    if (res.error) {
      setErr(res.error);
    } else {
      setNewKey("");
      setNewVal("");
      onRefresh();
      toast.success("Key added");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-6 py-5 hover:bg-gray-50/80 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 border border-gray-200">
          <KeyRound size={16} className="text-gray-500" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-gray-900 text-sm">
            Custom Keys
          </span>
          <span className="text-xs text-gray-400 ml-2">
            {customRows.length} custom
          </span>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-6 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {customRows.length > 0 && (
            <div className="space-y-2">
              {customRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 group"
                >
                  <div>
                    <p className="font-mono text-xs text-gray-700 font-medium">
                      {row.key}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {row.value ? row.value.slice(0, 8) + "••••" : "empty"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyBtn text={row.value} />
                    <button
                      onClick={async () => {
                        await adminApi({ action: "delete", id: row.id });
                        onRefresh();
                      }}
                      className="p-1.5 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Add New Key
            </p>
            <div className="flex gap-2 mb-2">
              <input
                value={newKey}
                onChange={(e) => {
                  setNewKey(e.target.value);
                  setErr("");
                }}
                placeholder="key_name"
                className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-lg
                  font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
              />
              <input
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="value"
                className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
              />
              <button
                onClick={add}
                disabled={adding || !newKey.trim()}
                className="h-9 px-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400
                  text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-all"
              >
                {adding ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                Add
              </button>
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentConfigPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch("/api/admin/payment-config");
      if (res.ok) {
        const data = await res.json();
        setConfigs(Array.isArray(data) ? data : []);
        setLastSync(new Date());
      } else {
        toast.error("Failed to load config");
      }
    } catch {
      toast.error("Network error");
    }
    silent ? setRefreshing(false) : setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalKeys = configs.filter(
    (c) => c.value && c.value !== "EMPTY" && c.value !== "",
  ).length;

  const overallStatus = GATEWAYS.map((g) => ({
    label: g.label,
    accent: g.accent,
    ok: g.keys.every((k) => {
      const r = configs.find((c) => c.key === k.key);
      return r?.value && r.value !== "EMPTY";
    }),
    partial: g.keys.some((k) => {
      const r = configs.find((c) => c.key === k.key);
      return r?.value && r.value !== "EMPTY";
    }),
  }));

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
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* ── Header ── */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
              Payment Configuration
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gateway credentials and wallet addresses
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 h-9 px-3 text-sm text-gray-600 bg-white border border-gray-200
              rounded-xl hover:border-gray-300 hover:text-gray-900 shadow-sm transition-all"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── Status strip ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Gateway Status
            </span>
            <span className="text-xs text-gray-400">
              {totalKeys} {totalKeys === 1 ? "key" : "keys"} stored
              {lastSync && ` · synced ${lastSync.toLocaleTimeString()}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {overallStatus.map((s) => (
              <div
                key={s.label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  s.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : s.partial
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-gray-50 border-gray-200 text-gray-500"
                }`}
              >
                {s.ok ? (
                  <CheckCircle2 size={11} />
                ) : s.partial ? (
                  <AlertTriangle size={11} />
                ) : (
                  <XCircle size={11} />
                )}
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Gateway sections ── */}
        <div className="space-y-3">
          {GATEWAYS.map((g) => (
            <GatewaySection
              key={g.id}
              gateway={g}
              configs={configs}
              onRefresh={() => load(true)}
            />
          ))}
          <CustomKeysSection configs={configs} onRefresh={() => load(true)} />
        </div>

        {/* ── Footer ── */}
        <div className="mt-6 flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200/80 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs leading-relaxed">
            Keys are read server-side via the service role and never exposed to
            the browser. Changes take effect immediately — no redeploy needed.
          </p>
        </div>
      </div>
    </div>
  );
}
