"use client";
// app/admin/korapay-accounts/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Key,
  Plus,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Save,
  Shield,
  Landmark,
  X,
} from "lucide-react";

type KorapayAccount = {
  id: string;
  slot: number;
  label: string;
  secret_key: string;
  secret_key_full: string;
  is_active: boolean;
  daily_limit_ngn: number;
  created_at: string;
};

type SlotUsage = {
  slot: number;
  total_ngn: number;
  tx_count: number;
};

type EditState = {
  label: string;
  secret_key: string;
  daily_limit_ngn: number;
};

const MAX_SLOTS = 10;
const DEFAULT_DAILY_LIMIT = 498000;

export default function KorapayAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<KorapayAccount[]>([]);
  const [usage, setUsage] = useState<SlotUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({
    label: "",
    secret_key: "",
    daily_limit_ngn: DEFAULT_DAILY_LIMIT,
  });

  function flash(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Get auth token for API calls ─────────────────────────────────────────
  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        router.push("/auth/signin");
        return;
      }

      const res = await fetch("/api/admin/korapay-accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        flash("Access denied — admin privileges required", false);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load accounts");

      const data = await res.json();
      setAccounts(data.accounts || []);
      setUsage(data.usage || []);
    } catch (e: any) {
      flash(e.message || "Failed to load", false);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function getUsageForSlot(slot: number): SlotUsage {
    return usage.find((u) => u.slot === slot) ?? { slot, total_ngn: 0, tx_count: 0 };
  }

  function startEdit(slot: number, existing?: KorapayAccount) {
    setEditingSlot(slot);
    setEditState({
      label: existing?.label || `Account ${slot}`,
      // Use full key if available for editing
      secret_key: existing?.secret_key_full || "",
      daily_limit_ngn: existing?.daily_limit_ngn || DEFAULT_DAILY_LIMIT,
    });
  }

  async function saveSlot(slot: number) {
    if (!editState.secret_key.trim()) {
      flash("Secret key is required", false);
      return;
    }
    if (!editState.secret_key.startsWith("sk_")) {
      flash("KoraPay keys start with sk_live_ or sk_test_", false);
      return;
    }
    setSaving(slot);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/korapay-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "upsert",
          slot,
          label: editState.label || `Account ${slot}`,
          secret_key: editState.secret_key.trim(),
          daily_limit_ngn: Number(editState.daily_limit_ngn) || DEFAULT_DAILY_LIMIT,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      flash(`Slot ${slot} saved successfully`);
      setEditingSlot(null);
      loadAll();
    } catch (e: any) {
      flash(e.message || "Save failed", false);
    } finally {
      setSaving(null);
    }
  }

  async function toggleActive(slot: number, currentlyActive: boolean) {
    setSaving(slot);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/korapay-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "toggle",
          slot,
          is_active: !currentlyActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toggle failed");
      flash(`Slot ${slot} ${!currentlyActive ? "enabled" : "disabled"}`);
      loadAll();
    } catch (e: any) {
      flash(e.message || "Toggle failed", false);
    } finally {
      setSaving(null);
    }
  }

  async function deleteSlot(slot: number) {
    if (slot === 1) { flash("Cannot delete slot 1 (primary account)", false); return; }
    if (!confirm(`Delete slot ${slot}? This cannot be undone.`)) return;
    setSaving(slot);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/korapay-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "delete", slot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      flash(`Slot ${slot} deleted`);
      loadAll();
    } catch (e: any) {
      flash(e.message || "Delete failed", false);
    } finally {
      setSaving(null);
    }
  }

  const totalUsedToday = usage.reduce((s, u) => s + Number(u.total_ngn), 0);
  const totalCapacity = accounts
    .filter((a) => a.is_active)
    .reduce((s, a) => s + Number(a.daily_limit_ngn), 0);
  const filledSlots = accounts.map((a) => a.slot);
  const emptySlots = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1).filter(
    (s) => !filledSlots.includes(s),
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060c18]">
        <div className="w-10 h-10 border-2 border-t-emerald-400 border-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060c18] text-slate-200 p-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}>
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />} {toast.msg}
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3">
              <Landmark size={22} className="text-amber-400" />
              KoraPay Accounts
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage up to {MAX_SLOTS} KoraPay API keys. Payments auto-rotate to the next available slot.
            </p>
          </div>
          <button
            onClick={loadAll}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-all"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active Slots", value: accounts.filter((a) => a.is_active).length, color: "text-emerald-400" },
            { label: "Total Slots Used", value: `${accounts.length} / ${MAX_SLOTS}`, color: "text-white" },
            { label: "Today's NGN Used", value: `₦${totalUsedToday.toLocaleString()}`, color: "text-amber-400" },
            { label: "Total Daily Capacity", value: `₦${totalCapacity.toLocaleString()}`, color: "text-blue-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">{label}</p>
              <p className={`font-black text-xl ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Rotation logic explanation */}
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <Shield size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-300 text-xs font-black">Auto-rotation logic</p>
            <p className="text-amber-400/70 text-xs mt-0.5 leading-relaxed">
              At each checkout, the system picks the lowest-numbered active slot that has enough remaining daily capacity for the payment.
              If slot 1 is full, slot 2 is used automatically. Split payment installments can use different slots.
              If all slots are full, bank transfer is blocked for the day and users see crypto/card options.
            </p>
          </div>
        </div>

        {/* Account slots */}
        <div className="space-y-3">
          {accounts.map((account) => {
            const u = getUsageForSlot(account.slot);
            const usedPct = account.daily_limit_ngn > 0
              ? Math.min(100, (Number(u.total_ngn) / Number(account.daily_limit_ngn)) * 100)
              : 0;
            const isFull = usedPct >= 99;
            const isEditing = editingSlot === account.slot;
            const isKeyRevealed = revealed.has(account.slot);
            const isSavingThis = saving === account.slot;

            return (
              <div key={account.id} className="rounded-2xl overflow-hidden" style={{
                background: "rgba(10,16,28,0.9)",
                border: `1px solid ${isFull ? "rgba(239,68,68,0.3)" : account.is_active ? "rgba(16,185,129,0.2)" : "rgba(100,116,139,0.2)"}`,
              }}>
                {/* Slot header */}
                <div className="flex items-center justify-between px-5 py-4" style={{
                  background: isFull ? "rgba(239,68,68,0.06)" : account.is_active ? "rgba(16,185,129,0.06)" : "rgba(100,116,139,0.06)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm" style={{
                      background: account.is_active ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.15)",
                      color: account.is_active ? "#10b981" : "#64748b",
                      border: `1px solid ${account.is_active ? "rgba(16,185,129,0.3)" : "rgba(100,116,139,0.3)"}`,
                    }}>
                      {account.slot}
                    </div>
                    <div>
                      <p className="text-white font-black text-sm">{account.label}</p>
                      <p className="text-slate-500 text-[10px]">
                        Slot {account.slot} · {u.tx_count} transactions today
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isFull && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-900/20 border border-red-700/40 text-red-400">
                        FULL TODAY
                      </span>
                    )}
                    {!account.is_active && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500">
                        DISABLED
                      </span>
                    )}
                    {account.is_active && !isFull && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-900/20 border border-emerald-700/40 text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> ACTIVE
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Usage bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                      <span>₦{Number(u.total_ngn).toLocaleString()} used today</span>
                      <span>{usedPct.toFixed(1)}% of ₦{Number(account.daily_limit_ngn).toLocaleString()}</span>
                      <span>₦{Math.max(0, Number(account.daily_limit_ngn) - Number(u.total_ngn)).toLocaleString()} remaining</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-2 rounded-full transition-all duration-500" style={{
                        width: `${usedPct}%`,
                        background: usedPct >= 90 ? "#ef4444" : usedPct >= 70 ? "#f59e0b" : "#10b981",
                      }} />
                    </div>
                  </div>

                  {/* Key display / edit */}
                  {!isEditing ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-xs text-slate-400 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 truncate">
                        {isKeyRevealed
                          ? account.secret_key_full || account.secret_key
                          : (account.secret_key_full || account.secret_key).slice(0, 12) + "•".repeat(20)}
                      </div>
                      <button
                        onClick={() => setRevealed((prev) => {
                          const next = new Set(prev);
                          next.has(account.slot) ? next.delete(account.slot) : next.add(account.slot);
                          return next;
                        })}
                        className="p-2 rounded-lg border border-slate-700 text-slate-500 hover:text-white transition-all"
                      >
                        {isKeyRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-slate-400 text-xs font-bold block mb-1">Label</label>
                        <input
                          type="text"
                          value={editState.label}
                          onChange={(e) => setEditState((p) => ({ ...p, label: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                          placeholder={`Account ${account.slot}`}
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-bold block mb-1">KoraPay Secret Key</label>
                        <input
                          type="text"
                          value={editState.secret_key}
                          onChange={(e) => setEditState((p) => ({ ...p, secret_key: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                          placeholder="sk_live_..."
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-bold block mb-1">Daily Limit (NGN)</label>
                        <input
                          type="number"
                          value={editState.daily_limit_ngn}
                          onChange={(e) => setEditState((p) => ({ ...p, daily_limit_ngn: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                        />
                        <p className="text-slate-600 text-[10px] mt-1">Default ₦498,000 — KoraPay's ₦500k limit with ₦2k safety buffer</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {!isEditing ? (
                      <>
                        <button
                          onClick={() => startEdit(account.slot, account)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all"
                        >
                          <Key size={11} /> Edit Key
                        </button>
                        <button
                          onClick={() => toggleActive(account.slot, account.is_active)}
                          disabled={isSavingThis}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all disabled:opacity-50"
                          style={{
                            borderColor: account.is_active ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.4)",
                            color: account.is_active ? "#f87171" : "#34d399",
                          }}
                        >
                          {account.is_active ? <ToggleRight size={11} /> : <ToggleLeft size={11} />}
                          {account.is_active ? "Disable" : "Enable"}
                        </button>
                        {account.slot !== 1 && (
                          <button
                            onClick={() => deleteSlot(account.slot)}
                            disabled={isSavingThis}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-red-800/40 text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-50"
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => saveSlot(account.slot)}
                          disabled={isSavingThis}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50"
                        >
                          {isSavingThis ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSlot(null)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:text-white transition-all"
                        >
                          <X size={11} /> Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty slots — add new */}
          {emptySlots.map((slot) => (
            <div key={slot} className="rounded-2xl overflow-hidden" style={{
              background: "rgba(10,16,28,0.5)",
              border: "1.5px dashed rgba(255,255,255,0.08)",
            }}>
              {editingSlot === slot ? (
                <div className="p-5 space-y-3">
                  <p className="text-white font-black text-sm flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-xs font-black">{slot}</span>
                    Add Slot {slot}
                  </p>
                  <div>
                    <label className="text-slate-400 text-xs font-bold block mb-1">Label</label>
                    <input
                      type="text"
                      value={editState.label}
                      onChange={(e) => setEditState((p) => ({ ...p, label: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500"
                      placeholder={`Account ${slot}`}
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs font-bold block mb-1">KoraPay Secret Key</label>
                    <input
                      type="text"
                      value={editState.secret_key}
                      onChange={(e) => setEditState((p) => ({ ...p, secret_key: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-violet-500"
                      placeholder="sk_live_..."
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs font-bold block mb-1">Daily Limit (NGN)</label>
                    <input
                      type="number"
                      value={editState.daily_limit_ngn}
                      onChange={(e) => setEditState((p) => ({ ...p, daily_limit_ngn: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500"
                    />
                    <p className="text-slate-600 text-[10px] mt-1">Default ₦498,000 — KoraPay's ₦500k limit with ₦2k safety buffer</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveSlot(slot)}
                      disabled={saving === slot}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50"
                    >
                      {saving === slot ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                      Save Slot {slot}
                    </button>
                    <button
                      onClick={() => setEditingSlot(null)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:text-white transition-all"
                    >
                      <X size={11} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(slot)}
                  className="w-full flex items-center justify-center gap-2 py-5 text-slate-600 hover:text-slate-400 transition-colors text-sm font-bold"
                >
                  <Plus size={16} />
                  Add Slot {slot}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="rounded-xl p-4 text-center" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-slate-600 text-xs leading-relaxed">
            Keys are stored encrypted in the database and never exposed to users.
            Slot 1 is seeded from your original payment_config key and cannot be deleted.
            Daily limits reset at midnight UTC.
          </p>
        </div>
      </div>
    </div>
  );
}