"use client";

import { useState, useEffect } from "react";
import DashboardNavigation from "@/components/dashboard-navigation";
import { supabase } from "@/lib/supabase";
import {
  Copy,
  Check,
  Key,
  Loader2,
  Shield,
  AlertCircle,
  Download,
  FileText,
  Lock,
  CheckCircle,
} from "lucide-react";

type UserLicense = {
  id: string;
  key: string;
  created_at: string;
  expires_at: string;
  validated: boolean;
  user_id: string;
};

export default function LicensePage() {
  const [license, setLicense] = useState<UserLicense | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUserAndLicense();
  }, []);

  async function loadUserAndLicense() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const { data: licenses, error } = await supabase
        .from("license_keys")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!error && licenses) {
        setLicense(licenses as UserLicense);
      }
    } catch (err) {
      console.error("Error loading license:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = () => {
    if (license) {
      navigator.clipboard.writeText(license.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const isExpired = license && new Date(license.expires_at) < new Date();

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
            Compute License
          </h1>
          <p className="text-lg text-muted-foreground">
            Your authorization credential for task execution and GPU compute access across the OmniTask platform.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : license ? (
          <div className="space-y-8">
            {/* License Document Card */}
            <div className="border border-border rounded-2xl bg-card p-8 space-y-6">
              {/* Top Section - Official Header */}
              <div className="flex items-start justify-between pb-6 border-b border-border">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Key className="w-6 h-6 text-primary" />
                    <h2 className="text-2xl font-bold text-foreground">
                      Compute License Agreement
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Issued to your OmniTask account
                  </p>
                </div>
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>

              {/* License Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column */}
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                      License Key
                    </label>
                    <div className="bg-muted rounded-lg p-4 border border-border font-mono text-sm text-foreground break-all select-all">
                      {license.key}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                      License ID
                    </label>
                    <div className="bg-muted rounded-lg p-4 border border-border font-mono text-sm text-foreground">
                      {license.id}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                      Issued Date
                    </label>
                    <div className="bg-muted rounded-lg p-4 border border-border text-foreground">
                      {formatDate(license.created_at)}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                      Expiration Date
                    </label>
                    <div className={`bg-muted rounded-lg p-4 border text-foreground ${
                      isExpired ? "border-destructive/50" : "border-border"
                    }`}>
                      {formatDate(license.expires_at)}
                      {isExpired && (
                        <p className="text-xs text-destructive mt-2 font-semibold">
                          ⚠ License has expired
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                      Status
                    </label>
                    <div className={`rounded-lg p-4 border flex items-center gap-2 ${
                      license.validated
                        ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-600"
                        : "bg-amber-500/5 border-amber-500/30 text-amber-600"
                    }`}>
                      {license.validated ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-semibold">Validated</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          <span className="font-semibold">Pending Validation</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                      License Type
                    </label>
                    <div className="bg-muted rounded-lg p-4 border border-border text-foreground font-semibold">
                      Distributed Compute
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage Rights Section */}
              <div className="pt-6 border-t border-border">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
                  Authorized Rights
                </h3>
                <ul className="space-y-3">
                  <li className="flex gap-3 items-start">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground text-sm">
                      Execute distributed computing tasks across GPU node network
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground text-sm">
                      Access real-time task allocation and routing systems
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground text-sm">
                      Leverage neural network optimization and batch processing
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground text-sm">
                      Monitor compute metrics and earnings in real-time dashboard
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground text-sm">
                      Withdraw earnings via secure payout channels
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied to Clipboard
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy License Key
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  const content = `License Key: ${license.key}\nLicense ID: ${license.id}\nIssued: ${formatDate(license.created_at)}\nExpires: ${formatDate(license.expires_at)}`;
                  const element = document.createElement("a");
                  element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(content));
                  element.setAttribute("download", "omnit task-license.txt");
                  element.style.display = "none";
                  document.body.appendChild(element);
                  element.click();
                  document.body.removeChild(element);
                }}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-muted transition-colors"
              >
                <Download className="w-4 h-4" />
                Download License
              </button>
            </div>

            {/* Security Notice */}
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/30 p-4 flex gap-3">
              <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  Security & Privacy
                </p>
                <p className="text-sm text-muted-foreground">
                  Your license key is tied to your account and encrypted in transit. Never share your key with third parties. This credential grants full compute access—treat it like a password.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/50 border border-border p-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No License Key Generated
            </h3>
            <p className="text-muted-foreground mb-6">
              Your license key will appear here once generated. Contact support if you need assistance.
            </p>
            <a
              href="/dashboard"
              className="inline-block px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Return to Dashboard
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
