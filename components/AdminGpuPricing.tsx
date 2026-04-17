"use client";
// components/AdminGpuPricing.tsx
// Add to admin panel as a new "GPU Pricing" tab.
// Admin sets price, daily earning, and locked status per tier.
// Saves to Supabase gpu_tiers table.

import { useEffect, useState } from "react";
import { GPU_TIERS, type GpuTier } from "@/lib/gpuTiers";
import {
  Lock,
  Unlock,
  CheckCircle,
  RefreshCw,
  DollarSign,
  TrendingUp,
  Save,
} from "lucide-react";

type TierRow = {
  key: string;
  price: number;
  daily_earn: number;
  locked: boolean;
};

async function adminPost(action: string, payload = {}) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function adminGet(resource: string) {
  const r = await fetch(`/api/admin?resource=${resource}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default function AdminGpuPricing() {
  const [rows, setRows] = useState<Record<string, TierRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    try {
      const data: TierRow[] = await adminGet("gpu_tiers");
      const map: Record<string, TierRow> = {};
      data.forEach((r) => {
        map[r.key] = r;
      });
      // Fill in defaults for any missing
      GPU_TIERS.forEach((t) => {
        if (!map[t.key])
          map[t.key] = {
            key: t.key,
            price: t.defaultPrice,
            daily_earn: t.defaultDaily,
            locked: t.locked,
          };
      });
      setRows(map);
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function update(key: string, field: keyof TierRow, value: any) {
    setRows((p) => ({ ...p, [key]: { ...p[key], [field]: value } }));
  }

  async function saveTier(key: string) {
    setSaving(key);
    try {
      await adminPost("save_gpu_tier", rows[key]);
      setSaved(key);
      setTimeout(() => setSaved(null), 2500);
      showToast(`${GPU_TIERS.find((t) => t.key === key)?.name} updated`);
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setSaving(null);
    }
  }

  async function saveAll() {
    setSaving("all");
    try {
      await Promise.all(
        Object.values(rows).map((r) => adminPost("save_gpu_tier", r)),
      );
      showToast("All GPU tiers saved");
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setSaving(null);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
      </div>
    );

  const groups = [
    { label: "Starter Infrastructure", levels: [1, 2, 3] },
    { label: "Enterprise Compute", levels: [4, 5, 6] },
    { label: "Institutional Cluster", levels: [7, 8, 9] },
    { label: "Sovereign Compute", levels: [10, 11, 12] },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-black text-xl">GPU Node Pricing</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Set investment price, daily yield, and access control for each tier.
            Changes reflect immediately on the user dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-3 py-2 border border-slate-800 rounded-lg transition-all"
          >
            <RefreshCw size={12} /> Reload
          </button>
          <button
            onClick={saveAll}
            disabled={saving === "all"}
            className="flex items-center gap-2 text-sm font-black px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-all"
          >
            <Save size={13} />{" "}
            {saving === "all" ? "Saving all…" : "Save All Tiers"}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex items-start gap-3">
        <DollarSign size={14} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-slate-300 font-semibold mb-1">How pricing works</p>
          <p>
            Each GPU tier has an{" "}
            <strong className="text-white">Investment Price</strong> (one-time
            rental fee) and a{" "}
            <strong className="text-white">Daily Yield</strong> (earnings
            credited to user daily). The ROI is calculated automatically. Toggle{" "}
            <strong className="text-white">Locked</strong> to hide/restrict a
            tier from users — useful for gradually unlocking higher tiers.
          </p>
        </div>
      </div>

      {groups.map((group) => {
        const tiers = GPU_TIERS.filter((t) => group.levels.includes(t.level));
        return (
          <div key={group.label}>
            <h3 className="text-slate-300 font-bold text-sm mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              {group.label}
              <span className="text-slate-700 font-normal">
                — {tiers.length} tiers
              </span>
            </h3>
            <div className="space-y-2">
              {tiers.map((tier) => {
                const row = rows[tier.key];
                if (!row) return null;
                const roiDays =
                  row.daily_earn > 0
                    ? Math.ceil(row.price / row.daily_earn)
                    : 0;
                const annualYield = (row.daily_earn * 365).toFixed(0);
                const isSaving = saving === tier.key;
                const isSaved = saved === tier.key;

                return (
                  <div
                    key={tier.key}
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4"
                  >
                    <div className="flex items-start gap-4">
                      {/* Tier identity */}
                      <div
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          color: "#4a6a8a",
                        }}
                      >
                        {tier.level}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="text-white font-bold text-sm">
                            {tier.name}
                          </p>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border text-slate-500 bg-slate-800 border-slate-700">
                            {tier.chip}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[10px]">
                          {tier.vram} · {tier.architecture} · {tier.tdp}
                        </p>
                      </div>

                      {/* Auto-calculated metrics */}
                      <div className="hidden md:flex items-center gap-4 shrink-0 text-center">
                        <div>
                          <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">
                            ROI
                          </p>
                          <p className="text-sm font-black text-slate-400 tabular-nums">
                            ~{roiDays}d
                          </p>
                        </div>
                        <div>
                          <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">
                            Annual
                          </p>
                          <p className="text-sm font-black text-emerald-500 tabular-nums">
                            ${parseInt(annualYield).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Editable fields */}
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                      {/* Price */}
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                          Investment Price (USD)
                        </label>
                        <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
                          <span className="text-slate-500 text-sm font-bold">
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.price}
                            onChange={(e) =>
                              update(
                                tier.key,
                                "price",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="flex-1 bg-transparent text-white text-sm font-bold outline-none tabular-nums min-w-0"
                          />
                        </div>
                      </div>

                      {/* Daily yield */}
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                          Daily Yield (USD)
                        </label>
                        <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
                          <TrendingUp
                            size={12}
                            className="text-emerald-500 shrink-0"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.daily_earn}
                            onChange={(e) =>
                              update(
                                tier.key,
                                "daily_earn",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="flex-1 bg-transparent text-emerald-400 text-sm font-bold outline-none tabular-nums min-w-0"
                          />
                          <span className="text-slate-600 text-[10px]">
                            /day
                          </span>
                        </div>
                      </div>

                      {/* Lock toggle */}
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                          User Access
                        </label>
                        <button
                          onClick={() =>
                            update(tier.key, "locked", !row.locked)
                          }
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-sm font-bold ${
                            row.locked
                              ? "bg-red-900/20 border-red-900/40 text-red-400 hover:bg-red-900/30"
                              : "bg-emerald-900/20 border-emerald-900/40 text-emerald-400 hover:bg-emerald-900/30"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {row.locked ? (
                              <Lock size={12} />
                            ) : (
                              <Unlock size={12} />
                            )}
                            <span>{row.locked ? "Locked" : "Unlocked"}</span>
                          </div>
                          <div
                            className={`w-8 h-4 rounded-full transition-all relative ${row.locked ? "bg-red-900" : "bg-emerald-700"}`}
                          >
                            <div
                              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${row.locked ? "left-0.5" : "left-4"}`}
                            />
                          </div>
                        </button>
                      </div>

                      {/* Save button */}
                      <div>
                        <label className="text-[9px] font-bold text-transparent uppercase tracking-widest block mb-1.5">
                          Save
                        </label>
                        <button
                          onClick={() => saveTier(tier.key)}
                          disabled={isSaving}
                          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                            isSaved
                              ? "bg-emerald-500 text-slate-950"
                              : "bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40"
                          }`}
                        >
                          {isSaving ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              Saving…
                            </>
                          ) : isSaved ? (
                            <>
                              <CheckCircle size={12} />
                              Saved
                            </>
                          ) : (
                            <>
                              <Save size={12} />
                              Save Tier
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* API route note */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-[10px] text-slate-600 space-y-1 font-mono">
        <p className="text-slate-400 font-bold text-xs mb-2">
          Add to app/api/admin/route.ts:
        </p>
        <p>
          GET resource <span className="text-slate-300">"gpu_tiers"</span> →{" "}
          <span className="text-slate-400">
            SELECT * FROM gpu_tiers ORDER BY key
          </span>
        </p>
        <p>
          POST action <span className="text-slate-300">"save_gpu_tier"</span> →{" "}
          <span className="text-slate-400">
            UPSERT into gpu_tiers (key, price, daily_earn, locked) ON CONFLICT
            (key) DO UPDATE
          </span>
        </p>
      </div>
    </div>
  );
}
