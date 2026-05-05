"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cacheService } from "@/lib/cache-service";
import {
  Copy,
  Check,
  Share2,
  ChevronRight,
  X,
  MapPin,
  ChevronDown,
  Phone,
  User,
  Mail,
  Trophy,
  Gift,
  Globe,
  Pencil,
  Truck,
  CheckCircle,
} from "lucide-react";

const REFERRER_PCT = 20;
const REFERRED_PCT = 10;
const MONTHLY_GOAL = 150;

const DELIVERY_KEY = "omnitask_delivery_address";

interface DeliveryAddress {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
}

function loadLocalDelivery(): DeliveryAddress | null {
  try {
    const raw = localStorage.getItem(DELIVERY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalDelivery(data: DeliveryAddress) {
  localStorage.setItem(DELIVERY_KEY, JSON.stringify(data));
}

const LIVE = [
  "Alex K. joined via referral · earned $12.40",
  "Maria T. activated Node · referrer got $24.80",
  "James O. completed 47 tasks today",
  "Sarah M. just joined · GPU plan active",
  "Chen W. upgraded plan · $31.50 bonus paid",
  "Aisha B. referred 3 users this week",
];

function getShareMsg(code: string, origin: string) {
  return `🚀 Earn passive income with OmniTask GPU Network!\n\n💰 Join using my link and get a ${REFERRED_PCT}% welcome bonus on your first payment.\n⚡ Rent GPU power, earn daily.\n🔗 ${origin}/auth/signup?ref=${code}\n\nCode: ${code}`;
}

/* ─── Icons ─── */
function WAIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
        fill="#25D366"
      />
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.78 12.78 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.57-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
        fill="white"
      />
    </svg>
  );
}
function TGIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#2CA5E0" />
      <path
        d="M17.707 7.28l-1.96 9.243c-.147.658-.53.818-1.075.508l-2.977-2.194-1.437 1.383c-.159.159-.292.292-.6.292l.214-3.032 5.53-4.997c.24-.214-.052-.333-.373-.119l-6.835 4.302-2.944-.92c-.64-.2-.652-.64.134-.948l11.49-4.429c.533-.193 1 .13.833.91z"
        fill="white"
      />
    </svg>
  );
}
function XIc() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="5" fill="#000" />
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="white"
      />
    </svg>
  );
}

/* ─── Live Ticker ─── */
function LiveTicker() {
  const [idx, setIdx] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setVis(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % LIVE.length);
        setVis(true);
      }, 300);
    }, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 overflow-hidden max-w-full">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
      <span
        className={`text-xs text-blue-300/70 truncate transition-opacity duration-300 ${vis ? "opacity-100" : "opacity-0"}`}
      >
        {LIVE[idx]}
      </span>
    </div>
  );
}

/* ─── Share Modal ─── */
function ShareModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/auth/signup?ref=${code}`;
  const msg = getShareMsg(code, origin);

  function share(p: string) {
    const em = encodeURIComponent(msg);
    const el = encodeURIComponent(link);
    const urls: Record<string, string> = {
      wa: `https://wa.me/?text=${em}`,
      tg: `https://t.me/share/url?url=${el}&text=${encodeURIComponent(msg.slice(0, 200))}`,
      x: `https://twitter.com/intent/tweet?text=${em}`,
    };
    window.open(urls[p], "_blank", "noopener,width=600,height=600");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(2,8,23,0.85)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "#0c1a35",
          border: "1px solid rgba(59,130,246,0.2)",
        }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{
            borderBottom: "1px solid rgba(59,130,246,0.12)",
            background: "rgba(59,130,246,0.05)",
          }}
        >
          <div>
            <p className="text-white font-black text-sm">
              Share Your Referral Link
            </p>
            <p className="text-blue-300/60 text-xs mt-0.5">
              They get {REFERRED_PCT}% bonus · You get {REFERRER_PCT}% of their
              payments
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-blue-400/40 hover:text-white p-1 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "wa", label: "WhatsApp", Icon: WAIcon },
              { id: "tg", label: "Telegram", Icon: TGIcon },
              { id: "x", label: "X (Twitter)", Icon: XIc },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => share(id)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(59,130,246,0.15)",
                }}
              >
                <Icon />
                <span className="text-[10px] font-bold text-blue-300/60">
                  {label}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div
              className="flex-1 rounded-xl px-3 py-2.5 text-blue-300/50 text-xs font-mono truncate"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(59,130,246,0.12)",
              }}
            >
              {link}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="text-white text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1 transition-all shrink-0"
              style={{
                background: "linear-gradient(135deg, #059669, #10b981)",
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Delivery Form (inline modal) ─── */
function DeliveryModal({
  initialData,
  onClose,
  onSaved,
  allowClose,
}: {
  initialData?: DeliveryAddress | null;
  onClose: () => void;
  onSaved: (data: DeliveryAddress) => void;
  allowClose: boolean;
}) {
  const [form, setForm] = useState<DeliveryAddress>(
    initialData ?? {
      fullName: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      country: "",
    },
  );
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!form.fullName || !form.phone || !form.address || !form.country) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("users")
          .update({
            full_name: form.fullName,
            phone: form.phone,
            delivery_address: form.address,
            city: form.city,
            country: form.country,
            delivery_details_submitted: true,
          })
          .eq("id", user.id);
      }
    } catch (_) {}
    saveLocalDelivery(form);
    setSaving(false);
    setDone(true);
    setTimeout(() => {
      onSaved(form);
      onClose();
    }, 1400);
  }

  const fields: {
    key: keyof DeliveryAddress;
    label: string;
    placeholder: string;
    icon: any;
    required?: boolean;
    type?: string;
  }[] = [
    {
      key: "fullName",
      label: "Full Name",
      placeholder: "John Doe",
      icon: User,
      required: true,
    },
    {
      key: "phone",
      label: "Phone Number",
      placeholder: "+234 800 000 0000",
      icon: Phone,
      required: true,
      type: "tel",
    },
    {
      key: "email",
      label: "Email Address",
      placeholder: "you@email.com",
      icon: Mail,
      type: "email",
    },
    {
      key: "address",
      label: "Delivery Address",
      placeholder: "12 Main Street, Flat 3",
      icon: MapPin,
      required: true,
    },
    { key: "city", label: "City", placeholder: "Lagos", icon: MapPin },
    {
      key: "country",
      label: "Country",
      placeholder: "Nigeria",
      icon: Globe,
      required: true,
    },
  ];

  const canSubmit = !!(
    form.fullName &&
    form.phone &&
    form.address &&
    form.country
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(2,8,23,0.9)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl my-4 overflow-hidden"
        style={{
          background: "#0c1a35",
          border: "1px solid rgba(245,158,11,0.25)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5"
          style={{
            borderBottom: "1px solid rgba(59,130,246,0.12)",
            background:
              "linear-gradient(135deg, rgba(245,158,11,0.08), transparent)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <Truck size={15} className="text-amber-400" />
            </div>
            <div>
              <p className="text-white font-black text-base">
                Delivery Details
              </p>
              <p className="text-blue-300/50 text-xs">
                Fill in your details to qualify for prize delivery
              </p>
            </div>
          </div>
          {allowClose && (
            <button
              onClick={onClose}
              className="text-blue-400/40 hover:text-white p-1 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {done ? (
            <div className="text-center py-8 space-y-3">
              <div
                className="w-14 h-14 rounded-full mx-auto flex items-center justify-center"
                style={{
                  background: "rgba(16,185,129,0.12)",
                  border: "2px solid rgba(16,185,129,0.3)",
                }}
              >
                <CheckCircle size={26} className="text-emerald-400" />
              </div>
              <p className="text-white font-black text-lg">Details Saved!</p>
              <p className="text-blue-300/50 text-sm">
                You're now registered for prize delivery.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3">
                {fields.map(
                  ({ key, label, placeholder, icon: Icon, required, type }) => (
                    <div key={key}>
                      <label
                        className="flex items-center gap-1.5 mb-1.5 text-xs font-bold uppercase tracking-wider"
                        style={{ color: "rgba(147,197,253,0.6)" }}
                      >
                        <Icon size={10} className="text-amber-400" />
                        {label}
                        {required && <span className="text-amber-500">*</span>}
                      </label>
                      <input
                        type={type ?? "text"}
                        value={form[key]}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value }))
                        }
                        placeholder={placeholder}
                        className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-blue-300/20 focus:outline-none transition-all"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(59,130,246,0.15)",
                        }}
                        onFocus={(e) =>
                          (e.currentTarget.style.borderColor =
                            "rgba(245,158,11,0.4)")
                        }
                        onBlur={(e) =>
                          (e.currentTarget.style.borderColor =
                            "rgba(59,130,246,0.15)")
                        }
                      />
                    </div>
                  ),
                )}
              </div>

              <button
                onClick={submit}
                disabled={!canSubmit || saving}
                className="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all mt-2"
                style={{
                  background: canSubmit
                    ? "linear-gradient(135deg, #f59e0b, #d97706)"
                    : "rgba(255,255,255,0.05)",
                  color: canSubmit ? "#0c1a35" : "rgba(147,197,253,0.3)",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                <CheckCircle size={15} />
                {saving ? "Saving..." : "Save & Start Tracking Progress"}
              </button>
              <p
                className="text-center text-xs"
                style={{ color: "rgba(147,197,253,0.25)" }}
              >
                Your details are securely stored and only used for prize
                delivery
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Saved Address Card ─── */
function SavedAddressCard({
  saved,
  onEdit,
}: {
  saved: DeliveryAddress;
  onEdit: () => void;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(16,185,129,0.06)",
        border: "1px solid rgba(16,185,129,0.2)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(16,185,129,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <Truck size={14} className="text-emerald-400" />
          <span className="text-white font-black text-sm">
            Delivery Details
          </span>
          <span
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{
              color: "#34d399",
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)",
            }}
          >
            <CheckCircle size={8} /> Saved
          </span>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
          style={{
            color: "rgba(147,197,253,0.7)",
            border: "1px solid rgba(59,130,246,0.2)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "rgba(245,158,11,0.4)";
            (e.currentTarget as HTMLButtonElement).style.color = "#f59e0b";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "rgba(59,130,246,0.2)";
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(147,197,253,0.7)";
          }}
        >
          <Pencil size={11} /> Change address
        </button>
      </div>
      <div className="px-4 py-3 flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <MapPin size={13} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm">{saved.fullName}</p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "rgba(147,197,253,0.5)" }}
          >
            {saved.address}
            {saved.city ? `, ${saved.city}` : ""}, {saved.country}
          </p>
          <div className="flex flex-wrap gap-3 mt-1.5">
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "rgba(147,197,253,0.5)" }}
            >
              <Phone size={10} />
              {saved.phone}
            </span>
            {saved.email && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: "rgba(147,197,253,0.5)" }}
              >
                <Mail size={10} />
                {saved.email}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */

export default function NetworkPage() {
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showMyReferrals, setShowMyReferrals] = useState(false);

  const [referralCode, setReferralCode] = useState("");
  const [totalEarned, setTotalEarned] = useState(0);
  const [weeklyEarned, setWeeklyEarned] = useState(0);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [deliverySubmitted, setDeliverySubmitted] = useState(false);
  const [savedAddress, setSavedAddress] = useState<DeliveryAddress | null>(
    null,
  );
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    // Load saved address from localStorage first (instant)
    const localAddr = loadLocalDelivery();
    if (localAddr) {
      setSavedAddress(localAddr);
      setDeliverySubmitted(true);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("users")
      .select(
        "referral_code, referral_earnings, delivery_details_submitted, country, full_name, phone, delivery_address, city",
      )
      .eq("id", user.id)
      .single();

    let code = profile?.referral_code;
    if (!code) {
      code = `REF-${user.id.slice(0, 8).toUpperCase()}`;
      await supabase
        .from("users")
        .update({ referral_code: code })
        .eq("id", user.id);
    }
    setReferralCode(code);
    setTotalEarned(profile?.referral_earnings || 0);

    // Sync delivery status from DB
    const dbSubmitted = profile?.delivery_details_submitted || false;
    setDeliverySubmitted(dbSubmitted || !!localAddr);

    // If DB has address but local doesn't, sync to local
    if (dbSubmitted && profile?.delivery_address && !localAddr) {
      const dbAddr: DeliveryAddress = {
        fullName: profile.full_name || "",
        phone: profile.phone || "",
        email: "",
        address: profile.delivery_address || "",
        city: profile.city || "",
        country: profile.country || "",
      };
      saveLocalDelivery(dbAddr);
      setSavedAddress(dbAddr);
    }

    const { data: refs } = await supabase
      .from("users")
      .select("id, full_name, tier, node_expiry_date, created_at")
      .eq("referred_by", user.id)
      .order("created_at", { ascending: false });
    setReferrals(refs || []);

    const now = new Date();
    const active = (refs || []).filter(
      (r) => r.node_expiry_date && new Date(r.node_expiry_date) > now,
    );
    setActiveCount(active.length);

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const { count: mCount } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", user.id)
      .gte("created_at", monthStart);
    setMonthlyCount(mCount || 0);

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: weekComm } = await supabase
      .from("referral_commissions")
      .select("commission_amount")
      .eq("referrer_id", user.id)
      .gte("created_at", weekAgo);
    setWeeklyEarned(
      (weekComm || []).reduce(
        (s: number, c: any) => s + (c.commission_amount || 0),
        0,
      ),
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function copyLink() {
    navigator.clipboard.writeText(`${origin}/auth/signup?ref=${referralCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const monthlyPct = Math.min(
    Math.round((monthlyCount / MONTHLY_GOAL) * 100),
    100,
  );
  const daysLeft = (() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.ceil((end.getTime() - now.getTime()) / 86400000);
  })();

  /* ── Styles ── */
  const bg = "#060d1f";
  const cardBg = "#0a1628";
  const cardBorder = "rgba(59,130,246,0.12)";
  const textMuted = "rgba(147,197,253,0.5)";

  const card = {
    background: cardBg,
    border: `1px solid ${cardBorder}`,
    borderRadius: "1rem",
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: bg }}
      >
        <div className="w-8 h-8 rounded-full border-2 border-t-blue-400 animate-spin" />
      </div>
    );
  }

  /* ── Delivery gate ── */
  if (!deliverySubmitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: bg }}
      >
        <DeliveryModal
          allowClose={false}
          onClose={() => {}}
          onSaved={(data) => {
            setSavedAddress(data);
            setDeliverySubmitted(true);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-28"
      style={{ background: bg, color: "#cbd5e1" }}
    >
      {showShare && (
        <ShareModal code={referralCode} onClose={() => setShowShare(false)} />
      )}
      {showDelivery && (
        <DeliveryModal
          initialData={savedAddress}
          allowClose
          onClose={() => setShowDelivery(false)}
          onSaved={(data) => {
            setSavedAddress(data);
            setDeliverySubmitted(true);
            setShowDelivery(false);
          }}
        />
      )}

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-white">Referral Network</h1>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>
              Earn {REFERRER_PCT}% · They get {REFERRED_PCT}% · Win luxury
              prizes
            </p>
          </div>
          <div
            className="rounded-full px-3 py-1.5 max-w-[160px] overflow-hidden"
            style={{ background: "rgba(59,130,246,0.06)", border: cardBorder }}
          >
            <LiveTicker />
          </div>
        </div>

        {/* ── SAVED ADDRESS CARD ── */}
        {savedAddress && (
          <SavedAddressCard
            saved={savedAddress}
            onEdit={() => setShowDelivery(true)}
          />
        )}

        {/* ── PRIZES HERO ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #0a1628 0%, #060d1f 100%)",
            border: "1px solid rgba(255,215,0,0.15)",
          }}
        >
          {/* Gold bar */}
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{
              background:
                "linear-gradient(90deg, rgba(245,158,11,0.1), rgba(234,179,8,0.04))",
              borderBottom: "1px solid rgba(255,215,0,0.1)",
            }}
          >
            <Trophy size={14} className="text-yellow-400" />
            <p className="text-yellow-300 font-black text-sm">
              OmniTask Pro Luxury Prize Programme
            </p>
            <span
              className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full"
              style={{
                color: "#fbbf24",
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              EXCLUSIVE
            </span>
          </div>

          <div className="p-4 space-y-4">
            <p
              className="text-sm leading-relaxed"
              style={{ color: "rgba(147,197,253,0.7)" }}
            >
              Refer <strong className="text-yellow-400">150 people</strong> this
              month and stand a chance to win luxury prizes — delivered directly
              to your door. Prizes reset monthly.
            </p>

            {/* Prize rows */}
            {[
              {
                img: "/prizes/car.jpg",
                title: "Luxury Car",
                sub: "Premium sedan, fully loaded — with red ribbon 🎀",
                target: 120,
                color: "#f59e0b",
                gradient: "linear-gradient(90deg,#f59e0b,#fbbf24)",
              },
              {
                img: "/prizes/phones.jpg",
                title: "iPhone 16 Pro + Samsung S25 Ultra",
                sub: "Dual flagship bundle — both phones, both boxes",
                target: 50,
                color: "#a78bfa",
                gradient: "linear-gradient(90deg,#8b5cf6,#a78bfa)",
              },
              {
                img: "/prizes/fridge.jpg",
                title: "Samsung Bespoke Fridge",
                sub: "Premium French Door refrigerator, custom panel",
                target: 30,
                color: "#60a5fa",
                gradient: "linear-gradient(90deg,#3b82f6,#60a5fa)",
              },
            ].map(({ img, title, sub, target, color, gradient }) => (
              <div
                key={title}
                className="relative rounded-xl overflow-hidden"
                style={{
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="flex items-center gap-3 p-3">
                  <div
                    className="w-20 h-16 rounded-lg overflow-hidden shrink-0"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <img
                      src={img}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-white font-black text-sm">{title}</p>
                      <span
                        className="font-black text-xs shrink-0"
                        style={{ color }}
                      >
                        {target} refs
                      </span>
                    </div>
                    <p
                      className="text-[11px] mb-2"
                      style={{ color: textMuted }}
                    >
                      {sub}
                    </p>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${Math.min((monthlyCount / target) * 100, 100)}%`,
                          background: gradient,
                        }}
                      />
                    </div>
                    <p
                      className="text-[9px] mt-0.5"
                      style={{ color: "rgba(147,197,253,0.3)" }}
                    >
                      {monthlyCount}/{target} referrals
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Monthly progress */}
            <div
              className="rounded-xl p-3 space-y-2"
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,215,0,0.08)",
              }}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold" style={{ color: textMuted }}>
                  Monthly Progress
                </span>
                <span className="text-yellow-400 font-black">
                  {monthlyCount} / {MONTHLY_GOAL}
                </span>
              </div>
              <div
                className="relative h-4 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-1000 relative overflow-hidden"
                  style={{
                    width: `${Math.max(monthlyPct, 1)}%`,
                    background:
                      "linear-gradient(90deg,#f59e0b,#fbbf24,#facc15)",
                  }}
                >
                  <div
                    className="absolute inset-0 animate-pulse opacity-20"
                    style={{
                      background:
                        "linear-gradient(90deg,transparent,white,transparent)",
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span style={{ color: "rgba(147,197,253,0.3)" }}>
                  Resets in{" "}
                  <strong className="text-amber-400">{daysLeft} days</strong>
                </span>
                <span style={{ color: textMuted }}>{monthlyPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── EARNINGS ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Total Earned",
              value: `$${totalEarned.toFixed(2)}`,
              color: "#10b981",
            },
            {
              label: "This Week",
              value: `$${weeklyEarned.toFixed(2)}`,
              color: "#f59e0b",
            },
            { label: "Referrals", value: referrals.length, color: "#60a5fa" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-2xl p-3.5 text-center"
              style={card}
            >
              <p className="font-black text-lg" style={{ color }}>
                {value}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* ── YOUR LINK ── */}
        <div className="rounded-2xl p-4 space-y-3" style={card}>
          <div className="flex items-center justify-between">
            <p className="text-white font-bold text-sm">Your Referral Link</p>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded"
              style={{
                color: "#34d399",
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              {referralCode}
            </span>
          </div>
          <div className="flex gap-2">
            <div
              className="flex-1 rounded-xl px-3 py-2.5 text-xs font-mono truncate"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: cardBorder,
                color: textMuted,
              }}
            >
              {origin}/auth/signup?ref={referralCode}
            </div>
            <button
              onClick={copyLink}
              className="flex items-center gap-1 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-all shrink-0"
              style={{
                background: "rgba(59,130,246,0.15)",
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              {copied ? (
                <Check size={11} className="text-emerald-400" />
              ) : (
                <Copy size={11} />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-xl p-3 text-center"
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <p className="font-black text-xl text-emerald-400">
                {REFERRER_PCT}%
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>
                You earn of their payments
              </p>
            </div>
            <div
              className="rounded-xl p-3 text-center"
              style={{
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.15)",
              }}
            >
              <p className="font-black text-xl text-blue-400">
                {REFERRED_PCT}%
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>
                They get on first payment
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all text-white"
            style={{
              background: "linear-gradient(135deg,#059669,#10b981)",
              boxShadow: "0 4px 15px rgba(16,185,129,0.2)",
            }}
          >
            <Share2 size={14} /> Share Now <ChevronRight size={13} />
          </button>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className="rounded-2xl overflow-hidden" style={card}>
          <button
            onClick={() => setShowHowItWorks((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 transition-colors"
            style={{ color: "white" }}
          >
            <span className="font-bold text-sm">How It Works</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${showHowItWorks ? "rotate-180" : ""}`}
              style={{ color: textMuted }}
            />
          </button>
          {showHowItWorks && (
            <div
              className="px-4 pb-4 space-y-3 pt-3"
              style={{ borderTop: cardBorder }}
            >
              {[
                {
                  n: "1",
                  t: "Fill your delivery details",
                  d: "Submit your name, phone, address and country once — it's saved for all future visits",
                },
                {
                  n: "2",
                  t: "Share your link",
                  d: "Copy and share via WhatsApp, Telegram, or anywhere",
                },
                {
                  n: "3",
                  t: "They sign up & pay",
                  d: `They get ${REFERRED_PCT}% bonus on first payment`,
                },
                {
                  n: "4",
                  t: "You earn forever",
                  d: `${REFERRER_PCT}% of every payment they ever make — no limit`,
                },
                {
                  n: "5",
                  t: "Hit 150 referrals this month",
                  d: "Win a luxury prize delivered to your door",
                },
              ].map(({ n, t, d }) => (
                <div key={n} className="flex gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.25)",
                    }}
                  >
                    <span className="text-blue-400 text-[9px] font-black">
                      {n}
                    </span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold">{t}</p>
                    <p
                      className="text-[11px] leading-relaxed"
                      style={{ color: textMuted }}
                    >
                      {d}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MY REFERRALS ── */}
        <div className="rounded-2xl overflow-hidden" style={card}>
          <button
            onClick={() => setShowMyReferrals((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm">
                My Referrals ({referrals.length})
              </span>
              {activeCount > 0 && (
                <span
                  className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full"
                  style={{
                    color: "#34d399",
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />{" "}
                  {activeCount} active
                </span>
              )}
            </div>
            <ChevronDown
              size={14}
              className={`transition-transform ${showMyReferrals ? "rotate-180" : ""}`}
              style={{ color: textMuted }}
            />
          </button>
          {showMyReferrals && (
            <div style={{ borderTop: `1px solid ${cardBorder}` }}>
              {referrals.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <Gift
                    size={24}
                    className="mx-auto"
                    style={{ color: "rgba(59,130,246,0.2)" }}
                  />
                  <p className="text-sm" style={{ color: textMuted }}>
                    No referrals yet
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "rgba(147,197,253,0.25)" }}
                  >
                    Share your link to start earning
                  </p>
                </div>
              ) : (
                <div
                  className="divide-y max-h-60 overflow-y-auto"
                  style={{ borderColor: cardBorder }}
                >
                  {referrals.map((r, i) => {
                    const isActive =
                      r.node_expiry_date &&
                      new Date(r.node_expiry_date) > new Date();
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                          style={{
                            background: "rgba(59,130,246,0.08)",
                            color: textMuted,
                          }}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-semibold truncate"
                            style={{ color: "rgba(219,234,254,0.9)" }}
                          >
                            {r.full_name ||
                              `User ${r.id.slice(0, 6).toUpperCase()}`}
                          </p>
                          <p
                            className="text-[10px]"
                            style={{ color: "rgba(147,197,253,0.3)" }}
                          >
                            {r.tier || "free"} ·{" "}
                            {new Date(r.created_at).toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <span
                          className={`text-[9px] font-black px-2 py-1 rounded-full`}
                          style={
                            isActive
                              ? {
                                  color: "#34d399",
                                  background: "rgba(16,185,129,0.1)",
                                  border: "1px solid rgba(16,185,129,0.2)",
                                }
                              : {
                                  color: textMuted,
                                  background: "rgba(255,255,255,0.04)",
                                }
                          }
                        >
                          {isActive ? "ACTIVE" : "PENDING"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── STICKY BOTTOM CTA ── */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4"
        style={{ background: `linear-gradient(0deg, ${bg} 60%, transparent)` }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => setShowShare(true)}
            className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 text-white transition-all"
            style={{
              background: "linear-gradient(135deg,#059669,#10b981)",
              boxShadow: "0 8px 25px rgba(16,185,129,0.3)",
            }}
          >
            <Share2 size={15} /> Share Link — Earn {REFERRER_PCT}% of Their
            Payments <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
