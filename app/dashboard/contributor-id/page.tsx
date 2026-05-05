"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cacheService } from "@/lib/cache-service";
import {
  Download,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Printer,
  ArrowLeft,
} from "lucide-react";

type IDData = {
  memberId: string;
  fullName: string;
  email: string;
  tier: string;
  activatedAt: string;
  expiryDate: string;
  kycVerified: boolean;
  joinedAt: string;
  issuedAt: string;
  passportPhotoUrl?: string | null;
  country?: string | null;
  kycDocumentType?: string | null;
};

const TIER_ACCENT: Record<string, { from: string; to: string; badge: string }> =
  {
    observer: { from: "#334155", to: "#1e293b", badge: "#94a3b8" },
    compute: { from: "#1e3a5f", to: "#0f172a", badge: "#60a5fa" },
    neural: { from: "#14432a", to: "#0f172a", badge: "#34d399" },
    intelligence: { from: "#2e1b5e", to: "#0f172a", badge: "#a78bfa" },
    cognitive: { from: "#4a2800", to: "#0f172a", badge: "#fbbf24" },
    research: { from: "#4a0e1a", to: "#0f172a", badge: "#fb7185" },
    // GPU tiers
    micro_test: { from: "#1a2e1a", to: "#0f172a", badge: "#34d399" },
    rtx3060: { from: "#1e3a5f", to: "#0f172a", badge: "#60a5fa" },
    rtx3090: { from: "#2e1b5e", to: "#0f172a", badge: "#a78bfa" },
    a40: { from: "#4a2800", to: "#0f172a", badge: "#fbbf24" },
    rtx4090: { from: "#14432a", to: "#0f172a", badge: "#10b981" },
    a100: { from: "#4a0e1a", to: "#0f172a", badge: "#fb7185" },
    h100: { from: "#1a1a4a", to: "#0f172a", badge: "#818cf8" },
  };

const GPU_TIER_NAMES: Record<string, string> = {
  micro_test: "Foundation Allocation",
  rtx3060: "RTX 3060 Node",
  rtx3090: "RTX 3090 Node",
  a40: "A40 Enterprise Node",
  rtx4090: "RTX 4090 Node",
  a100: "A100 Data Center Node",
  h100: "H100 Cluster Node",
  // legacy
  observer: "Observer Node",
  compute: "Compute Node",
  neural: "Neural Node",
  intelligence: "Intelligence Node",
  cognitive: "Cognitive Node",
  research: "Research Node",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysLeft(iso: string) {
  return Math.max(
    Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000),
    0,
  );
}

/* ── Face extractor using canvas crop ─────────────────────────────────────────
   Attempts to show the uploaded ID/passport photo in a passport-style frame.
   For a full face-detection solution, a backend ML service would be needed.
   Here we display the photo cropped to the upper-center (where faces typically appear).
*/
function PassportPhoto({
  url,
  name,
  badge,
}: {
  url?: string | null;
  name: string;
  badge: string;
}) {
  if (url) {
    return (
      <div
        className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2"
        style={{ borderColor: `${badge}44` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="ID photo"
          className="w-full h-full object-cover object-top"
          style={{ objectPosition: "center 15%" }}
        />
      </div>
    );
  }
  return (
    <div
      className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shrink-0 select-none"
      style={{
        background: `${badge}22`,
        border: `2px solid ${badge}44`,
        color: badge,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ContributorIDPage() {
  const router = useRouter();
  const [data, setData] = useState<IDData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch contributor ID data
        const res = await fetch("/api/contributor-id");
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error);
        }
        const base = await res.json();

        // Also fetch the KYC document photo from supabase directly
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: kycDocs } = await supabase
            .from("kyc_documents")
            .select("document_url, document_type")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const { data: userData } = await supabase
            .from("users")
            .select("country")
            .eq("id", user.id)
            .single();

          base.passportPhotoUrl = kycDocs?.document_url || null;
          base.kycDocumentType = kycDocs?.document_type || null;
          base.country = userData?.country || null;
        }

        setData(base);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <XCircle size={24} className="text-red-400" />
          </div>
          <h2 className="text-white font-black text-lg">ID Card Unavailable</h2>
          <p className="text-slate-400 text-sm">
            {error === "No active license"
              ? "Your Contributor ID card will be available after you activate a GPU Node License."
              : error || "Something went wrong."}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const tierKey = data.tier?.toLowerCase() || "observer";
  const accent = TIER_ACCENT[tierKey] || TIER_ACCENT.observer;
  const tierName = GPU_TIER_NAMES[tierKey] || data.tier;
  const days = daysLeft(data.expiryDate);
  const expired = days === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print border-b border-slate-800/60 bg-slate-950/95 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <h1 className="text-white font-black text-sm">Contributor ID Card</h1>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-3 py-1.5 border border-slate-700 rounded-lg transition-all hover:border-slate-500"
          >
            <Printer size={13} /> Print / PDF
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 pb-32 md:pb-10 space-y-5">
        {/* Info banner */}
        <div className="no-print flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl">
          <Shield size={15} className="text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-300 font-semibold text-sm">
              Official GPU Contributor ID
            </p>
            <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
              This card confirms your verified contributor status on the
              OmniTask Pro GPU Compute Network.
              {data.passportPhotoUrl
                ? " Your ID photo has been extracted from your submitted KYC document."
                : " Upload a passport photo or ID via Verification to display your photo here."}
            </p>
          </div>
        </div>

        {/* ══ CARD FRONT ══ */}
        <div className="print-card">
          <div
            className="relative rounded-3xl overflow-hidden shadow-2xl"
            style={{
              background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)`,
              border: `1px solid ${accent.badge}22`,
              minHeight: 280,
            }}
          >
            {/* Grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            {/* Top accent bar */}
            <div
              className="h-1.5 w-full"
              style={{
                background: `linear-gradient(90deg, ${accent.badge}, transparent)`,
              }}
            />

            <div className="relative z-10 p-6 md:p-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p
                    className="text-[10px] tracking-[0.3em] uppercase font-bold mb-1"
                    style={{ color: accent.badge }}
                  >
                    OmniTask Pro
                  </p>
                  <p className="text-white/50 text-[10px] tracking-widest uppercase">
                    GPU Compute Network
                  </p>
                </div>
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                  style={{
                    background: `${accent.badge}22`,
                    color: accent.badge,
                    border: `1px solid ${accent.badge}44`,
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: accent.badge }}
                  />
                  {tierName}
                </div>
              </div>

              {/* Photo + Name */}
              <div className="flex items-center gap-5 mb-6">
                <PassportPhoto
                  url={data.passportPhotoUrl}
                  name={data.fullName}
                  badge={accent.badge}
                />
                <div>
                  <h2 className="text-white font-black text-2xl tracking-tight leading-none mb-1">
                    {data.fullName}
                  </h2>
                  <p className="text-white/50 text-sm">{data.email}</p>
                  {data.country && (
                    <p className="text-white/40 text-xs mt-0.5">
                      {data.country}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    {data.kycVerified ? (
                      <>
                        <CheckCircle size={13} className="text-emerald-400" />
                        <span className="text-emerald-400 text-xs font-semibold">
                          KYC Verified
                        </span>
                      </>
                    ) : (
                      <>
                        <Clock size={13} className="text-amber-400" />
                        <span className="text-amber-400 text-xs font-semibold">
                          KYC Pending
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: "Member ID", value: data.memberId },
                  { label: "GPU Tier", value: tierName },
                  {
                    label: "Document",
                    value: data.kycDocumentType?.replace(/_/g, " ") || "—",
                  },
                  { label: "Activated", value: fmt(data.activatedAt) },
                  { label: "Expires", value: fmt(data.expiryDate) },
                  {
                    label: "Status",
                    value: expired ? "Expired" : `${days}d left`,
                  },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">
                      {label}
                    </p>
                    <p
                      className="text-white font-bold text-xs"
                      style={{
                        color:
                          label === "Expires" && expired ? "#f87171" : "white",
                      }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Barcode strip */}
              <div
                className="flex items-center justify-between pt-4"
                style={{ borderTop: `1px solid ${accent.badge}22` }}
              >
                <p
                  className="text-[9px] tracking-[0.2em] uppercase"
                  style={{ color: `${accent.badge}88` }}
                >
                  Issued {fmt(data.issuedAt)} · GPU Compute Contributor
                </p>
                <div className="flex items-center gap-[2px] h-8 opacity-30">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: i % 3 === 0 ? 3 : 1.5,
                        height: i % 5 === 0 ? 32 : i % 3 === 0 ? 24 : 20,
                        background: accent.badge,
                        borderRadius: 1,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ══ RECEIPT / BACK ══ */}
          <div
            className="rounded-3xl mt-4 p-6 md:p-8 space-y-5"
            style={{ background: "#0f172a", border: "1px solid #1e293b" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-black text-base">
                  GPU Operator License Receipt
                </p>
                <p className="text-slate-500 text-xs">
                  Official activation confirmation — OmniTask Pro
                </p>
              </div>
              <div className="text-right">
                <p className="text-slate-600 text-[10px] uppercase tracking-widest">
                  Receipt No.
                </p>
                <p className="text-white font-mono font-bold text-sm">
                  {data.memberId}-RCP
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              {[
                { label: "Contributor Name", value: data.fullName },
                { label: "Email Address", value: data.email },
                { label: "Country", value: data.country || "—" },
                { label: "GPU Node Tier", value: tierName },
                { label: "Network", value: "OmniTask Pro GPU Compute Network" },
                { label: "License Type", value: "Certified AI Operator" },
                { label: "Valid From", value: fmt(data.activatedAt) },
                { label: "Valid Until", value: fmt(data.expiryDate) },
                {
                  label: "KYC Status",
                  value: data.kycVerified ? "Verified ✓" : "Pending",
                },
                {
                  label: "ID Document",
                  value: data.kycDocumentType?.replace(/_/g, " ") || "—",
                },
                { label: "Member Since", value: fmt(data.joinedAt) },
                { label: "Issued On", value: fmt(data.issuedAt) },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between items-center py-1.5 border-b border-slate-800/60 last:border-0"
                >
                  <span className="text-slate-500 text-xs">{label}</span>
                  <span className="text-white text-xs font-semibold">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 space-y-2">
              <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
              <p className="text-slate-600 text-[10px] text-center leading-relaxed">
                This document confirms active contributor status on OmniTask Pro
                AI GPU Infrastructure Network.
                <br />
                Member ID:{" "}
                <span className="text-slate-400 font-mono">
                  {data.memberId}
                </span>{" "}
                · omnitaskpro.com
              </p>
              <div className="flex justify-center">
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
                  <Shield size={12} className="text-emerald-400" />
                  <span className="text-emerald-400 text-[10px] font-bold tracking-wider uppercase">
                    Verified GPU Operator
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="no-print flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <Download size={16} /> Download / Print ID Card
          </button>
          <button
            onClick={() => router.back()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </div>
    </div>
  );
}
