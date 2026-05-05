"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  Lock,
  CreditCard,
  RefreshCw,
  ArrowLeft,
  Info,
  ChevronRight,
  Bitcoin,
  Banknote,
  Globe,
} from "lucide-react";
import { Card } from "@/components/ui/card";

// ── Country → payout method routing ─────────────────────────────────────────
// These countries use Korapay (local currency transfers)
const KORAPAY_COUNTRIES: Record<
  string,
  { currency: string; methods: string[]; label: string }
> = {
  Nigeria: {
    currency: "NGN",
    methods: ["bank_transfer", "card", "virtual_account"],
    label: "Bank Transfer / Card / Virtual Account (NGN)",
  },
  Kenya: {
    currency: "KES",
    methods: ["mobile_money", "card"],
    label: "M-Pesa / Card (KES)",
  },
  Ghana: {
    currency: "GHS",
    methods: ["mobile_money", "card"],
    label: "Mobile Money / Card (GHS)",
  },
  "South Africa": {
    currency: "ZAR",
    methods: ["eft"],
    label: "EFT / Pay with Bank (ZAR)",
  },
  Cameroon: {
    currency: "XAF",
    methods: ["mobile_money"],
    label: "Mobile Money (XAF)",
  },
  "Ivory Coast": {
    currency: "XOF",
    methods: ["mobile_money"],
    label: "Mobile Money (XOF)",
  },
  Egypt: {
    currency: "EGP",
    methods: ["mobile_money"],
    label: "Mobile Money / Wallet (EGP)",
  },
};

// Mobile money label by country
const MOBILE_MONEY_LABEL: Record<string, string> = {
  Kenya: "M-Pesa number",
  Ghana: "MoMo number (MTN / Vodafone / AirtelTigo)",
  Cameroon: "Mobile Money number (MTN / Orange)",
  "Ivory Coast": "Mobile Money number (MTN / Orange / Moov)",
  Egypt: "Wallet number (Vodafone / Etisalat / Orange)",
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

type PayoutMethod = "bank" | "mobile_money" | "crypto";

type Profile = {
  id: string;
  full_name: string | null;
  kyc_full_name: string | null;
  kyc_verified: boolean;
  payout_registered: boolean;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_bank_name: string | null;
  payout_account_type: string | null;
  payout_kyc_match: boolean;
  payout_locked: boolean;
  payout_change_requested: boolean;
  kyc_status: string | null;
  country: string | null;
};

export default function PayoutSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form state
  const [country, setCountry] = useState("");
  const [method, setMethod] = useState<PayoutMethod>("bank");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  // Crypto specific
  const [cryptoNetwork, setCryptoNetwork] = useState("USDT_TRC20");
  const [cryptoWallet, setCryptoWallet] = useState("");
  const [cryptoName, setCryptoName] = useState("");

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth/signin");
      return;
    }

    const { data } = await supabase
      .from("users")
      .select(
        "id,full_name,kyc_full_name,kyc_verified,payout_registered,payout_account_name,payout_account_number,payout_bank_name,payout_account_type,payout_kyc_match,payout_locked,payout_change_requested,kyc_status,country",
      )
      .eq("id", user.id)
      .single();

    setProfile(data);

    // Pre-fill from existing data
    if (data?.payout_account_name) setAccountName(data.payout_account_name);
    if (data?.payout_account_number)
      setAccountNumber(data.payout_account_number);
    if (data?.payout_bank_name) setBankName(data.payout_bank_name);
    if (data?.country) setCountry(data.country);
    // Auto-fill name from KYC
    const kycName = data?.kyc_full_name || data?.full_name || "";
    if (!data?.payout_account_name && kycName) setAccountName(kycName);
    if (kycName) setCryptoName(kycName);

    setLoading(false);
  }

  const korapayInfo = KORAPAY_COUNTRIES[country];
  const isKorapay = !!korapayInfo;
  const kycName = profile?.kyc_full_name || profile?.full_name || "";
  const isLocked = profile?.payout_locked && profile?.payout_registered;
  const reKycPending = profile?.kyc_status === "pending_rekyc";

  // Name match check
  const nameMatches =
    accountName.trim().toLowerCase() === kycName.trim().toLowerCase();

  async function register() {
    if (!profile) return;
    if (!country) {
      showToast("Select your country first", false);
      return;
    }
    if (method === "crypto") {
      if (!cryptoWallet.trim()) {
        showToast("Enter your wallet address", false);
        return;
      }
      if (!cryptoName.trim()) {
        showToast("Enter account holder name", false);
        return;
      }
    } else {
      if (!accountName.trim()) {
        showToast("Account holder name is required", false);
        return;
      }
      if (!accountNumber.trim()) {
        showToast("Account number / mobile number is required", false);
        return;
      }
      if (!bankName.trim()) {
        showToast("Bank / platform name is required", false);
        return;
      }
      if (profile.kyc_verified && !nameMatches) {
        showToast(
          "Account name must match your KYC verified name: " + kycName,
          false,
        );
        return;
      }
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("register_payout_account", {
        p_user_id: profile.id,
        p_account_name:
          method === "crypto" ? cryptoName.trim() : accountName.trim(),
        p_account_number:
          method === "crypto" ? cryptoWallet.trim() : accountNumber.trim(),
        p_bank_name:
          method === "crypto" ? `Crypto — ${cryptoNetwork}` : bankName.trim(),
        p_account_type:
          method === "crypto"
            ? `crypto_${cryptoNetwork.toLowerCase()}`
            : isKorapay && korapayInfo.methods[0] === "mobile_money"
              ? "mobile_money"
              : "bank",
      });

      if (error || !data?.allowed) {
        showToast(
          data?.reason || error?.message || "Registration failed",
          false,
        );
      } else {
        showToast("Payout account registered successfully");
        load();
      }
    } catch (err: any) {
      showToast(err.message || "Failed", false);
    }
    setSaving(false);
  }

  async function requestChange() {
    if (!profile) return;
    const confirmed = window.confirm(
      "Changing your payout account requires a new identity verification (KYC). " +
        "Your current payout account will be suspended during the review period. Continue?",
    );
    if (!confirmed) return;
    const { data, error } = await supabase.rpc("request_payout_change", {
      p_user_id: profile.id,
    });
    if (error) {
      showToast(error.message, false);
      return;
    }
    showToast(
      data?.message || "Change request submitted. Complete new KYC to proceed.",
    );
    load();
  }

  if (loading)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl max-w-sm ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-800/60 bg-slate-950/95 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard/verification")}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={15} /> Verification
          </button>
          <h1 className="text-white font-black text-sm flex items-center gap-2">
            <CreditCard size={15} className="text-emerald-400" /> Payout Account
          </h1>
          <div className="w-24" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        {/* KYC requirement notice */}
        {!profile?.kyc_verified && profile?.kyc_status !== "pending" && (
          <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl">
            <AlertTriangle
              size={16}
              className="text-amber-400 shrink-0 mt-0.5"
            />
            <div>
              <p className="text-amber-300 font-bold text-sm">
                Identity Verification Required First
              </p>
              <p className="text-amber-400/70 text-xs mt-1 leading-relaxed">
                Complete your KYC identity verification before registering a
                payout account. Your account holder name will be validated
                against your verified identity.
              </p>
              <button
                onClick={() => router.push("/dashboard/verification")}
                className="mt-2 text-amber-400 text-xs font-semibold flex items-center gap-1 hover:text-amber-300 transition-colors"
              >
                Verify Identity <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}

        {profile?.kyc_status === "pending" && !profile.kyc_verified && (
          <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl">
            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-blue-300 text-sm">
              Your KYC is under review. You can register your payout account now
              — it will be activated once KYC is approved.
            </p>
          </div>
        )}

        {/* Re-KYC notice */}
        {reKycPending && (
          <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 p-4 rounded-2xl">
            <RefreshCw size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-bold text-sm">
                Identity Re-Verification Required
              </p>
              <p className="text-red-400/70 text-xs mt-1">
                Your payout change request is under admin review. Your current
                payout account is suspended until verification is complete.
              </p>
            </div>
          </div>
        )}

        {/* Current account */}
        {profile?.payout_registered && (
          <Card className="p-5 bg-slate-900/60 border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-sm">
                Current Payout Account
              </h2>
              {profile.payout_kyc_match ? (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                  KYC Verified ✓
                </span>
              ) : (
                <span className="text-[10px] font-bold text-red-400 bg-red-900/20 border border-red-800/40 px-2 py-0.5 rounded-full">
                  Name Mismatch
                </span>
              )}
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                { l: "Account Holder", v: profile.payout_account_name || "—" },
                {
                  l: "Account / Wallet",
                  v: profile.payout_account_number
                    ? `****${profile.payout_account_number.slice(-4)}`
                    : "—",
                },
                { l: "Bank / Platform", v: profile.payout_bank_name || "—" },
                {
                  l: "Type",
                  v: (profile.payout_account_type || "bank").replace(/_/g, " "),
                },
              ].map(({ l, v }) => (
                <div
                  key={l}
                  className="flex justify-between py-1 border-b border-slate-800/60 last:border-0"
                >
                  <span className="text-slate-500">{l}</span>
                  <span className="text-white font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Registration form */}
        {!isLocked && !reKycPending && (
          <Card className="p-5 bg-slate-900/60 border-slate-800 rounded-2xl space-y-5">
            <h2 className="text-white font-bold text-sm">
              {profile?.payout_registered
                ? "Update Payout Account"
                : "Register Payout Account"}
            </h2>

            {/* KYC name info */}
            {kycName && (
              <div className="flex items-start gap-2 bg-slate-800/60 p-3 rounded-xl">
                <Shield
                  size={13}
                  className="text-emerald-400 shrink-0 mt-0.5"
                />
                <p className="text-slate-400 text-xs">
                  Your KYC verified name:{" "}
                  <strong className="text-white">{kycName}</strong>. The account
                  holder name must match this exactly.
                </p>
              </div>
            )}

            {/* STEP 1 — Country */}
            <div>
              <label className="text-slate-400 text-xs mb-1.5 block font-semibold flex items-center gap-1.5">
                <Globe size={12} /> Country{" "}
                <span className="text-red-400">*</span>
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">Select your country</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {country && (
                <p className="text-xs mt-1.5">
                  {isKorapay ? (
                    <span className="text-emerald-400">
                      ✓ Local payout available:{" "}
                      <strong>{korapayInfo.label}</strong>
                    </span>
                  ) : (
                    <span className="text-blue-400">
                      ✓ International payout via bank transfer or crypto (USD)
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* STEP 2 — Payment method */}
            {country && (
              <div>
                <label className="text-slate-400 text-xs mb-2 block font-semibold">
                  Payment Method <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Bank / Mobile Money — always shown */}
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${method === "bank" || method === "mobile_money" ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700 hover:border-slate-600"}`}
                    onClick={() =>
                      setMethod(
                        isKorapay && korapayInfo.methods[0] === "mobile_money"
                          ? "mobile_money"
                          : "bank",
                      )
                    }
                  >
                    <Banknote
                      size={15}
                      className={
                        method === "bank" || method === "mobile_money"
                          ? "text-emerald-400"
                          : "text-slate-600"
                      }
                    />
                    <div>
                      <p className="text-white text-xs font-semibold">
                        {isKorapay && korapayInfo.methods[0] === "mobile_money"
                          ? "Mobile Money"
                          : "Bank Account"}
                      </p>
                      <p className="text-slate-600 text-[10px]">
                        {isKorapay
                          ? korapayInfo.currency
                          : "USD / International"}
                      </p>
                    </div>
                  </label>

                  {/* Crypto — always available */}
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${method === "crypto" ? "border-amber-500/40 bg-amber-500/5" : "border-slate-700 hover:border-slate-600"}`}
                    onClick={() => setMethod("crypto")}
                  >
                    <Bitcoin
                      size={15}
                      className={
                        method === "crypto"
                          ? "text-amber-400"
                          : "text-slate-600"
                      }
                    />
                    <div>
                      <p className="text-white text-xs font-semibold">
                        Cryptocurrency
                      </p>
                      <p className="text-slate-600 text-[10px]">
                        BTC / USDT — any country
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* STEP 3 — Account details */}
            {country && (method === "bank" || method === "mobile_money") && (
              <div className="space-y-3">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  {method === "mobile_money"
                    ? "Mobile Money Details"
                    : "Bank Account Details"}
                </p>

                {/* Account holder name */}
                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                    Account Holder Name <span className="text-red-400">*</span>
                    {kycName && (
                      <span className="text-slate-600 font-normal ml-1">
                        (must match: "{kycName}")
                      </span>
                    )}
                  </label>
                  <input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder={kycName || "Full name as on account"}
                    className={`w-full bg-slate-800 border text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none ${
                      accountName && kycName && !nameMatches
                        ? "border-red-500/50 focus:border-red-500/70"
                        : "border-slate-700 focus:border-emerald-500/40"
                    }`}
                  />
                  {accountName && kycName && !nameMatches && (
                    <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                      <AlertTriangle size={11} /> Name doesn't match your KYC
                      name — this will be rejected
                    </p>
                  )}
                  {accountName && kycName && nameMatches && (
                    <p className="text-emerald-400 text-xs mt-1 flex items-center gap-1">
                      <CheckCircle size={11} /> Name matches your verified
                      identity
                    </p>
                  )}
                </div>

                {/* Account number / mobile number */}
                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                    {method === "mobile_money"
                      ? (MOBILE_MONEY_LABEL[country] || "Mobile Money Number") +
                        " *"
                      : "Account Number *"}
                  </label>
                  <input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder={
                      method === "mobile_money"
                        ? "+254 700 000 000"
                        : "Enter account number"
                    }
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none"
                  />
                </div>

                {/* Bank / platform name */}
                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                    {method === "mobile_money"
                      ? "Mobile Network *"
                      : "Bank Name *"}
                  </label>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder={
                      method === "mobile_money"
                        ? country === "Kenya"
                          ? "Safaricom (M-Pesa)"
                          : country === "Ghana"
                            ? "MTN / Vodafone / AirtelTigo"
                            : "Mobile network name"
                        : "Bank name"
                    }
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none"
                  />
                </div>

                {/* Bank code — only for bank accounts */}
                {method === "bank" && (
                  <div>
                    <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                      Bank Code / Sort Code / Routing Number (if applicable)
                    </label>
                    <input
                      value={bankCode}
                      onChange={(e) => setBankCode(e.target.value)}
                      placeholder="Optional — required for some countries"
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none"
                    />
                  </div>
                )}

                {/* Payout info box */}
                <div className="flex items-start gap-2 bg-slate-800/40 p-3 rounded-xl">
                  <Info size={12} className="text-slate-500 shrink-0 mt-0.5" />
                  <p className="text-slate-500 text-xs leading-relaxed">
                    {isKorapay
                      ? `Payouts processed via Direct Transfer in ${korapayInfo.currency}. Payments are issued on Fridays. Exchange rate applied at time of payout.`
                      : "Payouts processed in USD via international bank transfer (SWIFT/IBAN). Payments are issued on Fridays."}
                  </p>
                </div>
              </div>
            )}

            {/* Crypto fields */}
            {country && method === "crypto" && (
              <div className="space-y-3">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  Cryptocurrency Wallet
                </p>

                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                    Full Legal Name <span className="text-red-400">*</span>
                    {kycName && (
                      <span className="text-slate-600 font-normal ml-1">
                        (must match KYC: "{kycName}")
                      </span>
                    )}
                  </label>
                  <input
                    value={cryptoName}
                    onChange={(e) => setCryptoName(e.target.value)}
                    placeholder={kycName || "Your full legal name"}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                    Network / Coin <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={cryptoNetwork}
                    onChange={(e) => setCryptoNetwork(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="USDT_TRC20">
                      USDT — TRC20 (Tron Network) — Recommended
                    </option>
                    <option value="USDT_ERC20">
                      USDT — ERC20 (Ethereum Network)
                    </option>
                    <option value="USDT_BEP20">
                      USDT — BEP20 (BNB Smart Chain)
                    </option>
                    <option value="BTC">Bitcoin (BTC)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block font-semibold">
                    Wallet Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={cryptoWallet}
                    onChange={(e) => setCryptoWallet(e.target.value)}
                    placeholder="Enter your wallet address"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm font-mono focus:border-emerald-500/40 outline-none"
                  />
                </div>

                <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl">
                  <AlertTriangle
                    size={12}
                    className="text-amber-400 shrink-0 mt-0.5"
                  />
                  <p className="text-amber-300 text-xs leading-relaxed">
                    Always double-check your wallet address and network. Sending
                    to the wrong address is irreversible. USDT TRC20 is
                    recommended — lowest fees. A 5% crypto discount applies to
                    license purchases.
                  </p>
                </div>
              </div>
            )}

            {/* Register button */}
            {country && (
              <button
                onClick={register}
                disabled={saving}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 rounded-xl transition-all disabled:opacity-50 text-sm"
              >
                {saving
                  ? "Verifying & Registering..."
                  : "Register Payout Account"}
              </button>
            )}

            <p className="text-slate-600 text-xs text-center leading-relaxed">
              By registering, you confirm this account belongs to you and
              matches your verified identity. Providing false information will
              result in permanent account suspension.
            </p>
          </Card>
        )}

        {/* Change account button */}
        {isLocked && !profile?.payout_change_requested && (
          <Card className="p-5 bg-slate-900/40 border-slate-800/50 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-amber-400" />
              <h3 className="text-white font-bold text-sm">
                Change Payout Account
              </h3>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Your payout account is locked for security. To change it, you must
              complete a new identity verification (KYC). Your current payout
              account will be suspended during the review period.
            </p>
            <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/15 p-3 rounded-xl">
              <AlertTriangle
                size={13}
                className="text-red-400 shrink-0 mt-0.5"
              />
              <p className="text-red-400/70  text-white">
                Withdrawals will be temporarily suspended until the new KYC is
                approved.
              </p>
            </div>
            <button
              onClick={requestChange}
              className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold py-2.5 rounded-xl transition-all text-sm"
            >
              Request Account Change (Requires New KYC)
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
