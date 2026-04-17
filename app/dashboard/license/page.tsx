"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardNavigation from "@/components/dashboard-navigation";
import { supabase } from "@/lib/supabase";
import { Copy, Check, Shield, Key, Loader2, Mail, CheckCircle2, ArrowLeft } from "lucide-react";

type UserLicense = {
  id: string;
  user_id: string;
  license_key: string;
  status: string;
  created_at: string;
  expires_at: string | null;
};

function LicenseKeyDisplay({ licenseKey, userEmail }: { licenseKey: string; userEmail: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto bg-emerald-500/10 border border-emerald-500/25">
          <Key size={32} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-white">Your License Key</h1>
        <p className="text-slate-400">Pre-generated key for your account</p>
      </div>

      {/* Key Display Box */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">License Key</label>
          <div className="flex gap-3 items-center">
            <div className="flex-1 rounded-lg bg-slate-900/50 border border-slate-700 px-4 py-4 font-mono text-lg text-emerald-300 break-all">
              {licenseKey}
            </div>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check size={20} className="text-emerald-400" />
              ) : (
                <Copy size={20} className="text-emerald-300" />
              )}
            </button>
          </div>
        </div>

        {/* Key Info */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-500/20">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Status</p>
            <div className="flex items-center gap-2 mt-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-300">Active</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Valid</p>
            <p className="text-sm font-semibold text-emerald-300 mt-2">4 Years</p>
          </div>
        </div>
      </div>

      {/* Email Notification */}
      <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-4 flex gap-3">
        <Mail size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-blue-300">Key Sent to Email</p>
          <p className="text-xs text-blue-200/80">{userEmail}</p>
        </div>
      </div>

      {/* Usage Info */}
      <div className="space-y-3 bg-slate-900/30 rounded-lg p-4 border border-slate-700">
        <h3 className="text-sm font-semibold text-white">How to Use</h3>
        <ol className="text-sm text-slate-300 space-y-2">
          <li>1. Copy your license key above</li>
          <li>2. Go to the Checkout page to purchase a GPU plan</li>
          <li>3. Your key will be validated automatically at checkout</li>
          <li>4. Upon successful payment, your GPU plan activates immediately</li>
        </ol>
      </div>

      {/* Terms Notice */}
      <div className="space-y-2 bg-amber-500/10 rounded-lg p-4 border border-amber-500/30">
        <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Important</p>
        <p className="text-xs text-amber-200/80 leading-relaxed">
          Your license key is personal and non-transferable. Never share it with anyone. Each key is tied to your account and can only be used once during checkout.
        </p>
      </div>
    </div>
  );
}

function LicensePageContent() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [license, setLicense] = useState<UserLicense | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/signin");
          return;
        }

        setUserId(user.id);
        setUserEmail(user.email || "");

        // Fetch user's license
        const { data: licenses, error: licenseError } = await supabase
          .from("license_keys")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (licenseError && licenseError.code !== "PGRST116") {
          // PGRST116 = no rows found, which is fine for first-time users
          console.error("License fetch error:", licenseError);
        }

        if (licenses) {
          setLicense(licenses as UserLicense);
        } else {
          // Generate a new key for first-time user
          const generatedKey = `OMNI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

          const { data: newLicense, error: createError } = await supabase
            .from("license_keys")
            .insert({
              user_id: user.id,
              license_key: generatedKey,
              status: "active",
            })
            .select()
            .single();

          if (createError) {
            console.error("License creation error:", createError);
            setError("Failed to generate license key");
          } else {
            setLicense(newLicense as UserLicense);
          }
        }
      } catch (err: any) {
        console.error("License page error:", err);
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-red-400 font-semibold">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!license) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-slate-400">No license found. Please contact support.</p>
      </div>
    );
  }

  return <LicenseKeyDisplay licenseKey={license.license_key} userEmail={userEmail} />;
}

export default function LicensePage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <DashboardNavigation />
      <div className="max-w-2xl mx-auto p-4 pt-24 sm:pt-32 pb-32">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 size={32} className="text-emerald-400 animate-spin" />
            </div>
          }
        >
          <LicensePageContent />
        </Suspense>
      </div>
    </div>
  );
}
