"use client";

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

  const load = useCallback(async () => {
    if (loadCalledRef.current) return;
    loadCalledRef.current = true;
    if (mountedRef.current) {
      setLoading(true);
      setLoadErr("");
    }
    try {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();
      if (sessErr || !session?.user) {
        router.push("/auth/signin");
        return;
      }
      const uid = session.user.id;
      const { data, error } = await supabase
        .from("users")
        .select(
          "id,email,full_name,phone,phone_verified,kyc_verified,kyc_status,kyc_full_name,payout_registered,cla_signed,terms_signed",
        )
        .eq("id", uid)
        .single();
      if (!mountedRef.current) return;
      if (error) {
        if (error.code === "PGRST116" || error.message?.includes("no rows")) {
          const { data: created } = await supabase
            .from("users")
            .insert({
              id: uid,
              email: session.user.email || "",
              kyc_status: "not_started",
              kyc_verified: false,
              phone_verified: false,
              payout_registered: false,
              cla_signed: false,
              terms_signed: false,
            })
            .select(
              "id,email,full_name,phone,phone_verified,kyc_verified,kyc_status,kyc_full_name,payout_registered,cla_signed,terms_signed",
            )
            .single();
          if (created && mountedRef.current) setProfile(created);
        } else {
          if (mountedRef.current)
            setLoadErr(`Failed to load: ${error.message}`);
        }
        return;
      }
      if (!data || !mountedRef.current) return;
      setProfile(data);
      if (data.kyc_full_name) setIdFullName(data.kyc_full_name);
      else if (data.full_name) setIdFullName(data.full_name);
      if (data.phone) setIdPhone(data.phone);
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
      if (mountedRef.current)
        setLoadErr(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // ─────────────────────────────────────────────────────────────────────────
  // uploadFile — uses Promise.race so the upload can NEVER hang forever.
  // The standard supabase.storage.upload() call is used (no createSignedUploadUrl
  // needed — that requires extra permissions). We race it against a 30-second
  // timer. If the timer wins, we catch the rejection and surface a clear error.
  // ─────────────────────────────────────────────────────────────────────────
  async function uploadFile(file: File, path: string): Promise<string | null> {
    const TIMEOUT_MS = 30000; // 30 seconds — enough for a 5 MB file on 4G

    for (const bucket of ["kyc-documents", "documents"]) {
      try {
        // Race: upload vs timeout
        type UploadResult = { data: any; error: any };
        const result = await Promise.race<UploadResult>([
          supabase.storage.from(bucket).upload(path, file, {
            upsert: true,
            cacheControl: "3600",
          }) as Promise<UploadResult>,
          new Promise<UploadResult>((_, reject) =>
            setTimeout(() => reject(new Error("UPLOAD_TIMEOUT")), TIMEOUT_MS),
          ),
        ]);

        // Storage returned an error (not a timeout)
        if (result.error) {
          const msg = result.error.message || "";
          // Bucket missing — try the next one
          if (
            msg.includes("not found") ||
            msg.includes("Bucket") ||
            msg.includes("404")
          ) {
            continue;
          }
          // RLS blocked — surface clearly
          if (
            msg.includes("policy") ||
            msg.includes("403") ||
            msg.includes("Unauthorized") ||
            msg.includes("new row")
          ) {
            throw new Error(
              "Upload blocked by storage policy. Go to Supabase → Storage → " +
                "kyc-documents → Policies and add an INSERT policy for authenticated users, then try again.",
            );
          }
          throw new Error(`Upload error: ${msg}`);
        }

        // ✅ Upload succeeded — return public URL
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);
        return urlData?.publicUrl ?? null;
      } catch (e: any) {
        if (e.message === "UPLOAD_TIMEOUT") {
          throw new Error(
            "Upload timed out after 30 seconds. Your internet connection is too slow for the file size. " +
              "Try compressing the image or connecting to a faster network, then submit again.",
          );
        }
        // Bucket-related errors — try next bucket
        if (
          e.message?.includes("not found") ||
          e.message?.includes("Bucket") ||
          e.message?.includes("404")
        ) {
          continue;
        }
        throw e; // real error — bubble up
      }
    }

    // Both buckets failed
    throw new Error(
      "Storage not configured. In Supabase: Storage → kyc-documents → Policies → " +
        "add INSERT policy with expression: (auth.role() = 'authenticated')",
    );
  }

  // ── Submit KYC ───────────────────────────────────────────────────────────
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
    if (idFile.size > 5 * 1024 * 1024) {
      showToast("File too large — max 5 MB", false);
      return;
    }

    setSaving(true);
    let docUrl = "";

    try {
      const uid = profile.id;
      const ts = Date.now();
      const ext = idFile.name.split(".").pop() || "jpg";

      setUploadProgress(
        `Uploading ${DOC_TYPES[idType]?.label}... (${(idFile.size / 1024).toFixed(0)} KB) — please wait`,
      );

      try {
        docUrl =
          (await uploadFile(idFile, `kyc/${uid}/doc-${ts}.${ext}`)) || "";
      } catch (uploadErr: any) {
        // Show the upload error clearly but still save the form data
        showToast(uploadErr.message, false);
        docUrl = "";
        await new Promise((r) => setTimeout(r, 2500));
      }

      setUploadProgress("Saving your details...");

      const { error: docErr } = await supabase.from("kyc_documents").insert({
        user_id: uid,
        document_type: idType,
        document_number: idNumber.trim(),
        document_url: docUrl || null,
        full_name: idFullName.trim(),
        country: idCountry,
        phone: idPhone.trim(),
        address: idAddress.trim(),
        city: idCity.trim(),
        gender: idGender,
        date_of_birth: idDob,
        status: "pending",
      });

      if (
        docErr &&
        docErr.code !== "42P01" &&
        !docErr.message?.includes("does not exist")
      ) {
        throw new Error(`Could not save record: ${docErr.message}`);
      }

      const { error: updErr } = await supabase
        .from("users")
        .update({
          full_name: idFullName.trim(),
          kyc_full_name: idFullName.trim(),
          kyc_status: "pending",
          phone: idPhone.trim(),
          phone_verified: true,
          country: idCountry,
        })
        .eq("id", uid);

      if (updErr)
        throw new Error(`Could not update profile: ${updErr.message}`);

      setUploadProgress("");
      showToast(
        docUrl
          ? "Identity submitted — pending review within 24–48 hrs ✓"
          : "Details saved (photo upload failed) — our team will contact you ✓",
      );
      loadCalledRef.current = false;
      load();
    } catch (err: unknown) {
      setUploadProgress("");
      showToast(
        err instanceof Error
          ? err.message
          : "Submission failed — please try again",
        false,
      );
    } finally {
      setSaving(false);
    }
  }

  async function signAgreements() {
    if (!profile) {
      showToast("Profile not loaded", false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ cla_signed: true, terms_signed: true })
      .eq("id", profile.id);
    if (error) showToast(error.message, false);
    else {
      showToast("Agreements signed ✓");
      loadCalledRef.current = false;
      load();
    }
    setSaving(false);
  }

  if (loading)
    return (
      <div className="flex min-h-screen bg-slate-950">
        <DashboardNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading your profile...</p>
            <button
              onClick={() => {
                loadCalledRef.current = false;
                load();
              }}
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
                loadCalledRef.current = false;
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

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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
                      onClick={async () => {
                        await supabase
                          .from("users")
                          .update({ kyc_status: "not_started" })
                          .eq("id", profile!.id);
                        loadCalledRef.current = false;
                        load();
                      }}
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
                                  JPG, PNG or PDF — max 5 MB
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
                              if (f && f.size > 5 * 1024 * 1024) {
                                showToast("File too large — max 5 MB", false);
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
                    <div className="flex items-center gap-2 bg-blue-900/20 border border-blue-800/40 p-3 rounded-xl">
                      <Loader2
                        size={13}
                        className="text-blue-400 animate-spin shrink-0"
                      />
                      <p className="text-blue-300 text-xs">{uploadProgress}</p>
                    </div>
                  )}

                  <button
                    onClick={submitIdentity}
                    disabled={saving}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 rounded-xl transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {uploadProgress ? " Uploading..." : " Submitting..."}
                      </>
                    ) : (
                      "Submit Identity Verification"
                    )}
                  </button>
                  <p className="text-center text-slate-600 text-xs">
                    Fields marked <span className="text-red-400">*</span> are
                    required · Used only for identity verification
                  </p>
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
                  <button
                    onClick={signAgreements}
                    disabled={saving}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 rounded-xl transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />{" "}
                        Signing...
                      </>
                    ) : (
                      "✓ I Have Read and Accept Both Agreements"
                    )}
                  </button>
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
                  <button
                    onClick={() => router.push("/dashboard/settings/payout")}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <CreditCard size={14} /> Register Payout Account{" "}
                    <ChevronRight size={14} />
                  </button>
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
