"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE BUG FIX SUMMARY
//
// ROOT CAUSE: Android Chrome / iOS Safari — fetch() calls to Supabase
// endpoints (Auth, Storage, PostgREST/DB) stall indefinitely. They never
// resolve or reject, so even Promise.race timeouts never fire.
//
// SOLUTION: Every Supabase call is now server-side via Next.js API routes.
// The mobile browser only ever fetches its OWN server (/api/*), which uses
// Node.js fetch (rock-solid). The only exception is XHR for the file upload
// which bypasses fetch entirely.
//
// API ROUTES USED:
//   GET  /api/kyc-profile          → load session + user profile
//   POST /api/kyc-upload-url       → generate signed Storage URL
//   POST /api/kyc-submit           → insert kyc_documents + update users
//   POST /api/kyc-sign-agreements  → update cla_signed + terms_signed
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  CheckCircle,
  Clock,
  Upload,
  User,
  AlertCircle,
  ChevronRight,
  ArrowLeft,
  CreditCard,
  BookOpen,
  Check,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  phone_verified: boolean;
  kyc_verified: boolean;
  kyc_status: string | null;
  kyc_full_name: string | null;
  payout_registered: boolean;
  cla_signed: boolean;
  terms_signed: boolean;
};
type Step = "identity" | "agreement" | "payout";

const DOC_TYPES: Record<
  string,
  { label: string; uploadLabel: string; hint: string }
> = {
  national_id: {
    label: "National Identity Card",
    uploadLabel: "Upload National Identity Card",
    hint: "Clear photo of the front of your National ID card",
  },
  passport: {
    label: "International Passport",
    uploadLabel: "Upload International Passport",
    hint: "Clear photo of your passport bio-data page",
  },
  drivers_license: {
    label: "Driver's License",
    uploadLabel: "Upload Driver's License",
    hint: "Clear photo of the front of your Driver's License",
  },
  voters_card: {
    label: "Voter's Card / Registration",
    uploadLabel: "Upload Voter's Card",
    hint: "Clear photo of your Voter's Registration card",
  },
  residence_permit: {
    label: "Residence Permit",
    uploadLabel: "Upload Residence Permit",
    hint: "Clear photo of your Residence Permit document",
  },
};

const COUNTRIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Argentina",
  "Australia",
  "Austria",
  "Bangladesh",
  "Belgium",
  "Bolivia",
  "Brazil",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Congo",
  "Croatia",
  "Czech Republic",
  "Denmark",
  "Ecuador",
  "Egypt",
  "Ethiopia",
  "Finland",
  "France",
  "Germany",
  "Ghana",
  "Greece",
  "Guatemala",
  "Honduras",
  "Hungary",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Ivory Coast",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "South Korea",
  "Kuwait",
  "Lebanon",
  "Malaysia",
  "Mexico",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Nigeria",
  "Norway",
  "Pakistan",
  "Panama",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Romania",
  "Russia",
  "Rwanda",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Singapore",
  "South Africa",
  "Spain",
  "Sri Lanka",
  "Sweden",
  "Switzerland",
  "Syria",
  "Tanzania",
  "Thailand",
  "Tunisia",
  "Turkey",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zimbabwe",
];

// ─────────────────────────────────────────────────────────────────────────────
// withTimeout
// ─────────────────────────────────────────────────────────────────────────────
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let handle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    handle = setTimeout(
      () =>
        reject(
          new Error(`${label} timed out — check your connection and try again`),
        ),
      ms,
    );
  });
  return Promise.race([
    promise.then((v) => {
      clearTimeout(handle);
      return v;
    }),
    timeout,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// serverFetch — fetch to our own Next.js API with timeout.
// Calls to /api/* go to Vercel/Node.js — never stall on mobile.
// ─────────────────────────────────────────────────────────────────────────────
async function serverFetch(
  path: string,
  options: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<any> {
  const res = await withTimeout(
    fetch(path, { ...options, credentials: "include" }),
    timeoutMs,
    label,
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(json?.error ?? `${label} failed (${res.status})`);
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// compressImage
// ─────────────────────────────────────────────────────────────────────────────
function compressImage(file: File, maxWidth: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Compression failed"));
            return;
          }
          resolve(
            new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
              type: "image/jpeg",
            }),
          );
        },
        "image/jpeg",
        0.75,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// uploadViaXHR — XHR PUT to a signed URL.
// XHR has a native .timeout and .upload.onprogress — both guaranteed on mobile.
// ─────────────────────────────────────────────────────────────────────────────
function uploadViaXHR(
  signedUrl: string,
  file: File,
  contentType: string,
  timeoutMs: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = timeoutMs;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}) — please try again`));
    xhr.onerror = () =>
      reject(new Error("Network error during upload — check your connection"));
    xhr.ontimeout = () =>
      reject(
        new Error("Upload timed out — try a smaller image or better signal"),
      );
    xhr.onabort = () => reject(new Error("Upload was cancelled"));

    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      contentType || "application/octet-stream",
    );
    xhr.send(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// uploadFileForKYC
// ─────────────────────────────────────────────────────────────────────────────
async function uploadFileForKYC(
  file: File,
  path: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  const contentType = file.type || mimeMap[ext] || "application/octet-stream";

  // Compress images
  let fileToUpload = file;
  if (file.type.startsWith("image/") && file.size > 400 * 1024) {
    try {
      onProgress?.(2);
      fileToUpload = await compressImage(file, 1200);
      console.log(
        `[KYC] Compressed ${(file.size / 1024).toFixed(0)}KB → ${(fileToUpload.size / 1024).toFixed(0)}KB`,
      );
    } catch {
      fileToUpload = file;
    }
  }

  // Get signed URL from server
  onProgress?.(5);
  const { signedUrl, bucket } = await serverFetch(
    "/api/kyc-upload-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    },
    20_000,
    "Get upload URL",
  );
  if (!signedUrl) throw new Error("No signed URL returned from server");

  // XHR upload
  onProgress?.(8);
  await uploadViaXHR(signedUrl, fileToUpload, contentType, 120_000, (pct) =>
    onProgress?.(8 + Math.round(pct * 0.9)),
  );
  onProgress?.(100);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData?.publicUrl ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function VerificationPage() {
  const router = useRouter();
  const mountedRef = useRef(true);
  const loadCalledRef = useRef(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [activeStep, setActiveStep] = useState<Step>("identity");
  const [toastMsg, setToastMsg] = useState<{ msg: string; ok: boolean } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPct, setUploadPct] = useState(0);

  const [idFullName, setIdFullName] = useState("");
  const [idPhone, setIdPhone] = useState("");
  const [idCountry, setIdCountry] = useState("");
  const [idAddress, setIdAddress] = useState("");
  const [idCity, setIdCity] = useState("");
  const [idGender, setIdGender] = useState("");
  const [idDob, setIdDob] = useState("");
  const [idType, setIdType] = useState("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function showToast(msg: string, ok = true) {
    if (!mountedRef.current) return;
    setToastMsg({ msg, ok });
    setTimeout(() => {
      if (mountedRef.current) setToastMsg(null);
    }, 6000);
  }

  // ── load — calls /api/kyc-profile (server-side, no mobile stall) ────────
  const load = useCallback(async () => {
    if (loadCalledRef.current) return;
    loadCalledRef.current = true;
    if (mountedRef.current) {
      setLoading(true);
      setLoadErr("");
    }

    try {
      const { profile: data } = await serverFetch(
        "/api/kyc-profile",
        { method: "GET" },
        20_000,
        "Loading profile",
      );

      if (!mountedRef.current) return;

      setProfile(data);
      if (data.kyc_full_name) setIdFullName(data.kyc_full_name);
      else if (data.full_name) setIdFullName(data.full_name);
      if (data.phone) setIdPhone(data.phone);

      // Redirect if already verified and a redirect URL was stored
      if (data.kyc_verified) {
        const redirect =
          typeof window !== "undefined"
            ? sessionStorage.getItem("kyc_redirect")
            : null;
        if (redirect) {
          sessionStorage.removeItem("kyc_redirect");
          router.push(redirect);
          return;
        }
      }

      if (!data.kyc_verified) setActiveStep("identity");
      else if (!data.cla_signed || !data.terms_signed)
        setActiveStep("agreement");
      else if (!data.payout_registered) setActiveStep("payout");
      else setActiveStep("identity");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // 401 = not logged in
      if (msg.includes("Unauthorized") || msg.includes("401")) {
        router.push("/auth/signin");
        return;
      }
      if (mountedRef.current) setLoadErr(msg);
    } finally {
      loadCalledRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // ── submitIdentity ───────────────────────────────────────────────────────
  async function submitIdentity() {
    if (!profile) {
      showToast("Profile not loaded yet", false);
      return;
    }
    if (!idFullName.trim()) {
      showToast("Full legal name is required", false);
      return;
    }
    if (!idPhone.trim()) {
      showToast("Phone number is required", false);
      return;
    }
    if (!idCountry) {
      showToast("Country is required", false);
      return;
    }
    if (!idGender) {
      showToast("Gender is required", false);
      return;
    }
    if (!idDob) {
      showToast("Date of birth is required", false);
      return;
    }
    if (!idNumber.trim()) {
      showToast("Document number is required", false);
      return;
    }
    if (!idAddress.trim()) {
      showToast("Residential address is required", false);
      return;
    }
    if (!idFile) {
      showToast(
        `Please upload a photo of your ${DOC_TYPES[idType]?.label}`,
        false,
      );
      return;
    }
    if (idFile.size > 15 * 1024 * 1024) {
      showToast("File too large — max 15 MB", false);
      return;
    }

    setSaving(true);
    setUploadPct(0);
    setUploadProgress("");

    const nuclearHandle = setTimeout(() => {
      if (mountedRef.current) {
        setSaving(false);
        setUploadProgress("");
        setUploadPct(0);
        showToast(
          "Request timed out — please check your signal and try again",
          false,
        );
      }
    }, 150_000);

    try {
      const uid = profile.id;
      const ts = Date.now();
      const ext = idFile.name.split(".").pop() || "jpg";
      const path = `kyc/${uid}/doc-${ts}.${ext}`;

      // Step 1: Upload file
      setUploadProgress(
        `Uploading ${DOC_TYPES[idType]?.label}… (${(idFile.size / 1024).toFixed(0)} KB)`,
      );
      const docUrl = await uploadFileForKYC(idFile, path, (pct) => {
        if (mountedRef.current) {
          setUploadPct(pct);
          setUploadProgress(`Uploading… ${pct}%`);
        }
      });

      // Step 2: Save to DB via server
      setUploadProgress("Saving your details…");
      setUploadPct(0);

      await serverFetch(
        "/api/kyc-submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType: idType,
            documentNumber: idNumber.trim(),
            documentUrl: docUrl,
            fullName: idFullName.trim(),
            country: idCountry,
            phone: idPhone.trim(),
            address: idAddress.trim(),
            city: idCity.trim(),
            gender: idGender,
            dateOfBirth: idDob,
          }),
        },
        30_000,
        "Saving KYC record",
      );

      setUploadProgress("");
      showToast("Identity submitted — pending review within 24–48 hrs ✓");
      load();
    } catch (err: unknown) {
      setUploadProgress("");
      setUploadPct(0);
      showToast(
        err instanceof Error
          ? err.message
          : "Submission failed — please try again",
        false,
      );
    } finally {
      clearTimeout(nuclearHandle);
      setSaving(false);
    }
  }

  // ── signAgreements ───────────────────────────────────────────────────────
  async function signAgreements() {
    if (!profile) {
      showToast("Profile not loaded", false);
      return;
    }
    setSaving(true);
    try {
      await serverFetch(
        "/api/kyc-sign-agreements",
        { method: "POST" },
        20_000,
        "Signing agreements",
      );
      showToast("Agreements signed ✓");
      load();
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to sign — please retry",
        false,
      );
    } finally {
      setSaving(false);
    }
  }

  // ── resetKycStatus ───────────────────────────────────────────────────────
  async function resetKycStatus() {
    try {
      await serverFetch(
        "/api/kyc-submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resetOnly: true }),
        },
        15_000,
        "Reset KYC status",
      );
    } catch (e: any) {
      showToast(e.message, false);
      return;
    }
    load();
  }

  // ── Loading / error states ───────────────────────────────────────────────
  if (loading)
    return (
      <div className="flex min-h-screen bg-slate-950">
        <DashboardNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading your profile…</p>
            <button
              onClick={() => load()}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Tap to retry
            </button>
          </div>
        </div>
      </div>
    );

  if (loadErr)
    return (
      <div className="flex min-h-screen bg-slate-950">
        <DashboardNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center max-w-sm">
            <AlertCircle size={32} className="text-red-400" />
            <p className="text-slate-300 font-bold text-sm">{loadErr}</p>
            <button
              onClick={() => {
                setLoadErr("");
                load();
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-2.5 rounded-xl text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );

  const steps = [
    {
      key: "identity" as Step,
      label: "Identity",
      icon: User,
      done: !!profile?.kyc_verified,
    },
    {
      key: "agreement" as Step,
      label: "Agreements",
      icon: BookOpen,
      done: !!profile?.cla_signed && !!profile?.terms_signed,
    },
    {
      key: "payout" as Step,
      label: "Payout",
      icon: CreditCard,
      done: !!profile?.payout_registered,
    },
  ];
  const donePct = Math.round(
    (steps.filter((s) => s.done).length / steps.length) * 100,
  );
  const allDone = steps.every((s) => s.done);
  const kycPending =
    profile?.kyc_status === "pending" && !profile?.kyc_verified;
  const currentDoc = DOC_TYPES[idType] ?? DOC_TYPES.national_id;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />
      <div className="flex-1 overflow-y-auto">
        {toastMsg && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl max-w-xs ${toastMsg.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
          >
            {toastMsg.msg}
          </div>
        )}

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-28 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-white font-black text-xl">
                Identity Verification
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Complete all steps to unlock withdrawals
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-bold text-sm">
                Verification Progress
              </p>
              <p
                className={`text-sm font-black ${allDone ? "text-emerald-400" : "text-slate-400"}`}
              >
                {donePct}%
              </p>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-700"
                style={{ width: `${donePct}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {steps.map(({ key, label, icon: Icon, done }) => {
                const isPending = key === "identity" && kycPending;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveStep(key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${activeStep === key ? "bg-emerald-500/10 border border-emerald-500/30" : "hover:bg-slate-800/60"}`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${done ? "bg-emerald-500/20 border border-emerald-500/40" : isPending ? "bg-amber-500/10 border border-amber-500/30" : "bg-slate-800 border border-slate-700"}`}
                    >
                      {done ? (
                        <Check size={15} className="text-emerald-400" />
                      ) : isPending ? (
                        <Clock size={13} className="text-amber-400" />
                      ) : (
                        <Icon size={14} className="text-slate-500" />
                      )}
                    </div>
                    <p
                      className={`text-[10px] font-semibold ${done ? "text-emerald-400" : isPending ? "text-amber-400" : activeStep === key ? "text-white" : "text-slate-600"}`}
                    >
                      {label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ IDENTITY ══ */}
          {activeStep === "identity" && (
            <Card className="p-5 bg-slate-900/60 border-slate-800 rounded-2xl space-y-5">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${profile?.kyc_verified ? "bg-emerald-500/20" : kycPending ? "bg-amber-500/10" : "bg-slate-800"}`}
                >
                  {profile?.kyc_verified ? (
                    <CheckCircle size={16} className="text-emerald-400" />
                  ) : kycPending ? (
                    <Clock size={16} className="text-amber-400" />
                  ) : (
                    <User size={16} className="text-slate-500" />
                  )}
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">
                    Identity Verification
                  </h2>
                  <p className="text-slate-500 text-xs">
                    {profile?.kyc_verified
                      ? "Verified"
                      : kycPending
                        ? "Under Review — 24–48 hrs"
                        : "Fill all fields accurately"}
                  </p>
                </div>
              </div>

              {profile?.kyc_verified && (
                <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-800/40 p-3 rounded-xl">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <p className="text-emerald-300 text-sm">
                    Verified as{" "}
                    <strong>
                      {profile.kyc_full_name || profile.full_name}
                    </strong>
                  </p>
                </div>
              )}

              {kycPending && (
                <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-800/40 p-4 rounded-xl">
                  <Clock size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-amber-300 font-semibold text-sm">
                      Documents Under Review
                    </p>
                    <p className="text-amber-400/70 text-xs mt-1">
                      Being reviewed — 24–48 hours.
                    </p>
                    <button
                      onClick={resetKycStatus}
                      className="mt-2 text-amber-400 hover:text-amber-300 text-xs underline underline-offset-2"
                    >
                      Submitted wrong info? Tap to resubmit →
                    </button>
                  </div>
                </div>
              )}

              {!profile?.kyc_verified && !kycPending && (
                <div className="space-y-5">
                  <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 p-3 rounded-xl">
                    <AlertCircle
                      size={13}
                      className="text-blue-400 shrink-0 mt-0.5"
                    />
                    <p className="text-blue-300 text-xs leading-relaxed">
                      Enter details exactly as they appear on your
                      government-issued ID.
                    </p>
                  </div>

                  <section>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">
                      Personal Information
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          Full Legal Name{" "}
                          <span className="text-red-400">*</span>{" "}
                          <span className="text-slate-600 font-normal">
                            (exactly as on ID)
                          </span>
                        </label>
                        <input
                          value={idFullName}
                          onChange={(e) => setIdFullName(e.target.value)}
                          placeholder="e.g. John Michael Smith"
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none placeholder-slate-600"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                            Date of Birth{" "}
                            <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="date"
                            value={idDob}
                            onChange={(e) => setIdDob(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                            Gender <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={idGender}
                            onChange={(e) => setIdGender(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm"
                          >
                            <option value="">Select</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          Phone Number <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="tel"
                          value={idPhone}
                          onChange={(e) => setIdPhone(e.target.value)}
                          placeholder="+234 800 000 0000"
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none placeholder-slate-600"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          Country of Residence{" "}
                          <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={idCountry}
                          onChange={(e) => setIdCountry(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm"
                        >
                          <option value="">Select your country</option>
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          Full Residential Address{" "}
                          <span className="text-red-400">*</span>
                        </label>
                        <input
                          value={idAddress}
                          onChange={(e) => setIdAddress(e.target.value)}
                          placeholder="Street address, apartment number"
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none placeholder-slate-600"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          City / State
                        </label>
                        <input
                          value={idCity}
                          onChange={(e) => setIdCity(e.target.value)}
                          placeholder="City, State / Province"
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none placeholder-slate-600"
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">
                      Identity Document
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          Document Type <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={idType}
                          onChange={(e) => {
                            setIdType(e.target.value);
                            setIdFile(null);
                          }}
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm"
                        >
                          {Object.entries(DOC_TYPES).map(([val, { label }]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          {currentDoc.label} Number{" "}
                          <span className="text-red-400">*</span>
                        </label>
                        <input
                          value={idNumber}
                          onChange={(e) => setIdNumber(e.target.value)}
                          placeholder={`Enter your ${currentDoc.label} number`}
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none placeholder-slate-600"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                          {currentDoc.uploadLabel}{" "}
                          <span className="text-red-400">*</span>
                        </label>
                        <label
                          className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${idFile ? "border-emerald-500/40 bg-emerald-500/5" : "border-dashed border-slate-600 hover:border-slate-400 bg-slate-800/40"}`}
                        >
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${idFile ? "bg-emerald-500/10" : "bg-slate-700"}`}
                          >
                            <Upload
                              size={18}
                              className={
                                idFile ? "text-emerald-400" : "text-slate-500"
                              }
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            {idFile ? (
                              <>
                                <p className="text-emerald-400 text-sm font-semibold truncate">
                                  {idFile.name}
                                </p>
                                <p className="text-slate-500 text-xs mt-0.5">
                                  {(idFile.size / 1024).toFixed(0)} KB — tap to
                                  replace
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-slate-300 text-sm font-semibold">
                                  {currentDoc.hint}
                                </p>
                                <p className="text-slate-500 text-xs mt-0.5">
                                  JPG, PNG or PDF — max 15 MB
                                </p>
                              </>
                            )}
                          </div>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f && f.size > 15 * 1024 * 1024) {
                                showToast("File too large — max 15 MB", false);
                                return;
                              }
                              setIdFile(f || null);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </section>

                  {uploadProgress && (
                    <div className="space-y-2 bg-blue-900/20 border border-blue-800/40 p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Loader2
                          size={13}
                          className="text-blue-400 animate-spin shrink-0"
                        />
                        <p className="text-blue-300 text-xs">
                          {uploadProgress}
                        </p>
                      </div>
                      {uploadPct > 0 && (
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full transition-all duration-300"
                            style={{ width: `${uploadPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pb-4">
                    <button
                      onClick={submitIdentity}
                      disabled={saving}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-xl transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          {uploadProgress.startsWith("Saving")
                            ? " Saving…"
                            : uploadProgress
                              ? " Uploading…"
                              : " Submitting…"}
                        </>
                      ) : (
                        "Submit Identity Verification"
                      )}
                    </button>
                    <p className="text-center text-slate-600 text-xs mt-3">
                      Fields marked <span className="text-red-400">*</span> are
                      required · Used only for identity verification
                    </p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ══ AGREEMENTS ══ */}
          {activeStep === "agreement" && (
            <Card className="p-5 bg-slate-900/60 border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${profile?.cla_signed && profile?.terms_signed ? "bg-emerald-500/20" : "bg-slate-800"}`}
                >
                  {profile?.cla_signed && profile?.terms_signed ? (
                    <CheckCircle size={16} className="text-emerald-400" />
                  ) : (
                    <BookOpen size={16} className="text-slate-500" />
                  )}
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">
                    Platform Agreements
                  </h2>
                  <p className="text-slate-500 text-xs">
                    {profile?.cla_signed && profile?.terms_signed
                      ? "All agreements signed"
                      : "Review and sign to continue"}
                  </p>
                </div>
              </div>
              {profile?.cla_signed && profile?.terms_signed ? (
                <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-800/40 p-3 rounded-xl">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <p className="text-emerald-300 text-sm">
                    All platform agreements signed
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    {
                      title: "Contributor License Agreement (CLA)",
                      body: "This agreement governs your participation as a data contributor on OmniTask Pro. By accepting, you confirm that:\n\n• You are legally authorized to work as a data contributor in your jurisdiction.\n• All task submissions represent your own original work and honest effort.\n• You grant OmniTask Pro a non-exclusive, worldwide license to use your contributions for AI training and research purposes.\n• You will maintain confidentiality of all proprietary task content.\n• Fraudulent submissions will result in immediate account suspension without payout.\n• Your contributor status may be revoked for consistent quality failures.",
                    },
                    {
                      title: "Platform Terms & Contributor Earnings Agreement",
                      body: "By accepting these terms, you agree to the following:\n\n• OmniTask Pro operates a structured weekly payout system (every Friday).\n• Minimum withdrawal amount is $10 USD. Maximum weekly withdrawal is $500 USD.\n• Your payout account name must exactly match your KYC verified identity.\n• OmniTask Pro reserves the right to withhold payouts pending fraud investigations.\n• Referral commissions are credited after the referred contributor's first approved task.\n• Platform terms may be updated with 14 days' notice to registered contributors.",
                    },
                  ].map(({ title, body }) => (
                    <div
                      key={title}
                      className="border border-slate-800 rounded-xl overflow-hidden"
                    >
                      <div className="bg-slate-800/40 px-4 py-3">
                        <p className="text-white font-semibold text-sm">
                          {title}
                        </p>
                      </div>
                      <div className="p-4">
                        <div className="text-slate-400 text-xs leading-relaxed whitespace-pre-line">
                          {body}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl">
                    <AlertCircle
                      size={13}
                      className="text-amber-400 shrink-0 mt-0.5"
                    />
                    <p className="text-amber-300 text-xs">
                      By clicking below, you are electronically signing both
                      agreements.
                    </p>
                  </div>
                  <div className="pb-4">
                    <button
                      onClick={signAgreements}
                      disabled={saving}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-xl transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />{" "}
                          Signing…
                        </>
                      ) : (
                        "✓ I Have Read and Accept Both Agreements"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ══ PAYOUT ══ */}
          {activeStep === "payout" && (
            <Card className="p-5 bg-slate-900/60 border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${profile?.payout_registered ? "bg-emerald-500/20" : "bg-slate-800"}`}
                >
                  {profile?.payout_registered ? (
                    <CheckCircle size={16} className="text-emerald-400" />
                  ) : (
                    <CreditCard size={16} className="text-slate-500" />
                  )}
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm">
                    Payout Account
                  </h2>
                  <p className="text-slate-500 text-xs">
                    {profile?.payout_registered
                      ? "Registered"
                      : "Register your withdrawal account"}
                  </p>
                </div>
              </div>
              {profile?.payout_registered ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-800/40 p-3 rounded-xl">
                    <CheckCircle size={14} className="text-emerald-400" />
                    <p className="text-emerald-300 text-sm">
                      Payout account registered
                    </p>
                  </div>
                  <button
                    onClick={() => router.push("/dashboard/settings/payout")}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                  >
                    <CreditCard size={13} /> Manage Payout Account{" "}
                    <ChevronRight size={13} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Register your bank account or crypto wallet. Your account
                    name must match your verified identity exactly.
                  </p>
                  {!profile?.kyc_verified && (
                    <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl">
                      <AlertCircle
                        size={13}
                        className="text-amber-400 shrink-0 mt-0.5"
                      />
                      <p className="text-amber-300 text-xs">
                        Complete identity verification first.
                      </p>
                    </div>
                  )}
                  <div className="pb-4">
                    <button
                      onClick={() => router.push("/dashboard/settings/payout")}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                    >
                      <CreditCard size={14} /> Register Payout Account{" "}
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {allDone && (
            <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-2xl p-5 text-center space-y-3">
              <CheckCircle size={32} className="text-emerald-400 mx-auto" />
              <p className="text-white font-black text-lg">
                Verification Complete
              </p>
              <p className="text-slate-400 text-sm">
                Your account is fully verified. You can now withdraw earnings.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-2.5 rounded-xl transition-all text-sm"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
