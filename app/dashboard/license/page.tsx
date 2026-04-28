"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Clock,
  Zap,
  Server,
  ArrowRight,
} from "lucide-react";

type UserLicense = {
  id: string;
  key: string;
  created_at: string;
  activated_at: string | null;
  expires_at: string;
  validated: boolean;
  user_id: string;
};

export default function LicensePage() {
  const router = useRouter();
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
      if (!user) {
        router.push("/signin");
        return;
      }

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

  const handleCheckout = () => {
    router.push("/dashboard/checkout");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const isExpired = license && new Date(license.expires_at) < new Date();
  const activationStatus = license?.activated_at ? "Active" : "Pending Activation";
  const isActive = license?.activated_at !== null;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <main className="max-w-5xl mx-auto px-4 py-8 md:py-16">
        {loading ? (
          <div className="flex justify-center items-center py-40">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : license ? (
          <div className="space-y-8">
            {/* MASTER LICENSE CERTIFICATE */}
            <div className="border-4 border-primary/20 rounded-2xl bg-gradient-to-b from-slate-900/50 to-background p-8 md:p-12 space-y-8">
              
              {/* Header Section */}
              <div className="text-center border-b-2 border-primary/10 pb-8">
                <div className="flex justify-center mb-4">
                  <Shield className="w-12 h-12 text-primary" />
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-foreground mb-2">
                  OmniTask Pro
                </h1>
                <h2 className="text-xl md:text-2xl font-bold text-primary mb-4">
                  Distributed GPU Computing License Agreement
                </h2>
                <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold">
                  Enterprise Grade · Cryptographically Secured · ISO-Compliant
                </p>
              </div>

              {/* License Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* License Key Section */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block">
                    License Key
                  </label>
                  <div className="bg-muted/50 border border-border rounded-lg p-4 font-mono text-sm text-foreground break-all select-all hover:bg-muted/80 transition">
                    {license.key}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors text-sm"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy License Key
                      </>
                    )}
                  </button>
                </div>

                {/* Status Section */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block">
                    License Status
                  </label>
                  <div className={`rounded-lg p-4 border flex items-center gap-3 ${
                    isActive
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-amber-500/5 border-amber-500/30"
                  }`}>
                    {isActive ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="font-bold text-emerald-600 text-sm">Active</p>
                          <p className="text-xs text-emerald-600/70">Computing rights enabled</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Clock className="w-5 h-5 text-amber-600" />
                        <div>
                          <p className="font-bold text-amber-600 text-sm">Pending Activation</p>
                          <p className="text-xs text-amber-600/70">Click activate to begin</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Issue Date */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block">
                    Issue Date
                  </label>
                  <div className="bg-muted/50 border border-border rounded-lg p-4 text-foreground font-semibold">
                    {formatDate(license.created_at)}
                  </div>
                </div>

                {/* Expiration Date */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block">
                    Expiration Date (4 Years)
                  </label>
                  <div className={`rounded-lg p-4 border font-semibold ${
                    isExpired ? "bg-destructive/5 border-destructive/30 text-destructive" : "bg-muted/50 border-border text-foreground"
                  }`}>
                    {formatDate(license.expires_at)}
                    {isExpired && <p className="text-xs mt-1">License has expired. Renew to continue.</p>}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-primary/10" />

              {/* Authorized Capabilities */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Authorized Computing Capabilities
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex gap-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <Server className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">Distributed GPU Access</p>
                      <p className="text-xs text-muted-foreground mt-1">Execute compute tasks across 12,400+ global GPU nodes</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <Zap className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">Real-Time Task Allocation</p>
                      <p className="text-xs text-muted-foreground mt-1">Instant routing to optimal compute resources</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <Lock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">Advanced GPU Rental Economics</p>
                      <p className="text-xs text-muted-foreground mt-1">Optimize rental strategies with enterprise-grade analytics</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-4 rounded-lg bg-muted/30 border border-border">
                    <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">Task System Access</p>
                      <p className="text-xs text-muted-foreground mt-1">Leverage neural network optimization & batch processing</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-primary/10" />

              {/* License Terms */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  License Agreement & Terms
                </h3>
                <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                  <div className="bg-muted/20 border border-border rounded-lg p-6 space-y-4">
                    <div>
                      <h4 className="font-bold text-foreground mb-2">1. Training Modules & Onboarding</h4>
                      <p>This license grants you access to comprehensive training modules covering distributed computing fundamentals, GPU economics, network architecture, and operational best practices. All modules are designed for professional operators and system administrators managing enterprise GPU workloads.</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">2. GPU Rental Mechanics & Economics</h4>
                      <p>You gain full access to real-time GPU rental markets, dynamic pricing intelligence, rental optimization algorithms, and economic modeling tools. Understand market trends, maximize ROI on GPU rental operations, and execute advanced trading strategies on the distributed computing network.</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">3. Task System Guide & Execution</h4>
                      <p>Complete control over task creation, scheduling, monitoring, and execution across the global network. Submit jobs for processing on thousands of verified GPU nodes, track real-time performance metrics, and manage earnings with transparent settlement and withdrawal options.</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">4. Network Rights & Obligations</h4>
                      <p>Licensee warrants that this license is for lawful computational purposes only. OmniTask Pro reserves the right to suspend license if terms are violated. All intellectual property associated with the platform remains the exclusive property of OmniTask Pro.</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">5. Liability & Indemnification</h4>
                      <p>OmniTask Pro provides computing services AS IS. User assumes all risk for outcomes of computations. OmniTask Pro is not liable for data loss, service interruption, or profit loss resulting from GPU compute operations.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-primary/10" />

              {/* Security Notice */}
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/30 p-6 flex gap-4">
                <Shield className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-foreground mb-2">Enterprise Security</h4>
                  <p className="text-sm text-muted-foreground">Your license key is uniquely generated and tied to your account. Keys are encrypted in transit and at rest. Treat this credential like a password—never share it with third parties. Unauthorized use violates our terms and may result in legal action.</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  const content = `License Agreement\n\nLicense Key: ${license.key}\nLicense ID: ${license.id}\nIssued: ${formatDate(license.created_at)}\nExpires: ${formatDate(license.expires_at)}\nStatus: ${isActive ? "Active" : "Pending Activation"}`;
                  const element = document.createElement("a");
                  element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(content));
                  element.setAttribute("download", "OmniTask-License.txt");
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

              <button
                onClick={handleCheckout}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors ml-auto"
              >
                Activate & Proceed to Checkout
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Info Box */}
            <div className="rounded-lg bg-muted/30 border border-border p-6">
              <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-primary" />
                What Happens Next?
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Your license activation begins immediately upon clicking "Activate"</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Proceed to secure checkout to confirm your 4-year computing subscription</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>Upon payment completion, full access to all GPU computing capabilities is granted</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">4.</span>
                  <span>Earn immediately by submitting tasks to the global GPU network</span>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/50 border border-border p-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No License Generated Yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Your enterprise license key will appear here once activated. This is a one-time setup that grants you immediate access to billions of dollars in GPU computing infrastructure.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-block px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
