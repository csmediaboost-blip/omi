"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNavigation from "@/components/dashboard-navigation";
import { AlertCircle, CheckCircle, Loader, DollarSign, ArrowRight, Shield } from "lucide-react";

type WithdrawalStatus = "idle" | "loading" | "pin_required" | "submitted" | "success" | "error" | "kyc_required";

interface WithdrawalData {
  status: WithdrawalStatus;
  error?: string;
  amount?: number;
  availableBalance: number;
  minimumAmount: number;
  kycStatus?: string;
}

export default function WithdrawPage() {
  const router = useRouter();
  const [data, setData] = useState<WithdrawalData>({
    status: "idle",
    availableBalance: 0,
    minimumAmount: 5,
  });
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // Fetch user balance on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/signin");
          return;
        }

        const { data: userData } = await supabase
          .from("users")
          .select("balance_available, kyc_status")
          .eq("id", user.id)
          .single();

        if (userData) {
          // FEATURE: Check if KYC is approved before allowing withdrawal
          const isKYCApproved = userData.kyc_status === "approved";
          
          setData(prev => ({
            ...prev,
            availableBalance: parseFloat(userData.balance_available) || 0,
            kycStatus: userData.kyc_status,
            status: isKYCApproved ? "idle" : "kyc_required",
          }));
        }

        // Fetch withdrawal history
        const { data: historyData } = await supabase
          .from("withdrawal_requests")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (historyData) {
          setHistory(historyData);
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
      }
    };

    fetchUserData();
  }, [router]);

  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const withdrawAmount = parseFloat(amount);
    
    // Validation
    if (!withdrawAmount || withdrawAmount < data.minimumAmount) {
      setData(prev => ({
        ...prev,
        error: `Minimum withdrawal is $${data.minimumAmount}`,
        status: "error",
      }));
      return;
    }

    if (withdrawAmount > data.availableBalance) {
      setData(prev => ({
        ...prev,
        error: `Insufficient balance. Available: $${data.availableBalance.toFixed(2)}`,
        status: "error",
      }));
      return;
    }

    // Request PIN verification
    setShowPinInput(true);
    setData(prev => ({ ...prev, status: "pin_required" }));
  };

  const handleConfirmWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pin) {
      setData(prev => ({
        ...prev,
        error: "PIN is required",
        status: "error",
      }));
      return;
    }

    try {
      setData(prev => ({ ...prev, status: "loading" }));

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No session available");
      }

      // Step 1: Verify PIN
      const pinVerifyRes = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "x-pin-endpoint": "withdrawal",
        },
        body: JSON.stringify({ pin }),
      });

      if (!pinVerifyRes.ok) {
        const pinError = await pinVerifyRes.json();
        throw new Error(pinError.error || "PIN verification failed");
      }

      // Step 2: Create withdrawal request
      const withdrawAmount = parseFloat(amount);
      const withdrawRes = await fetch("/api/withdraw/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          amount: withdrawAmount,
        }),
      });

      if (!withdrawRes.ok) {
        const withdrawError = await withdrawRes.json();
        throw new Error(withdrawError.error || "Withdrawal request failed");
      }

      // Success
      setData(prev => ({
        ...prev,
        status: "success",
        amount: withdrawAmount,
      }));

      setAmount("");
      setPin("");
      setShowPinInput(false);

      // Refresh history
      const { data: newHistory } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (newHistory) {
        setHistory(newHistory);
      }

      // Reset status after 3 seconds
      setTimeout(() => {
        setData(prev => ({ ...prev, status: "idle" }));
      }, 3000);
    } catch (err: any) {
      setData(prev => ({
        ...prev,
        error: err.message || "An error occurred",
        status: "error",
      }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Withdraw Funds</h1>
          <p className="text-muted-foreground">Request a withdrawal from your available balance</p>
        </div>

        {/* Balance Display */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Available Balance</p>
              <p className="text-3xl font-bold text-foreground">
                ${data.availableBalance.toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-primary opacity-20" />
          </div>
        </div>

        {/* KYC Required Alert */}
        {data.status === "kyc_required" && (
          <div className="bg-warning/10 border border-warning rounded-lg p-6 mb-6">
            <div className="flex items-start gap-4">
              <Shield className="w-6 h-6 text-warning flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-foreground mb-2">KYC Verification Required</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  You must complete identity verification before you can withdraw funds. This is required for security and compliance.
                </p>
                <button
                  onClick={() => window.location.href = "/dashboard/verification"}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition"
                >
                  Complete Verification
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Withdrawal Form */}
        {data.status !== "kyc_required" && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          {!showPinInput ? (
            <form onSubmit={handleSubmitWithdrawal}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Withdrawal Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min={data.minimumAmount}
                    max={data.availableBalance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Minimum: $${data.minimumAmount}`}
                    className="w-full pl-8 pr-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Minimum: ${data.minimumAmount} | Available: ${data.availableBalance.toFixed(2)}
                </p>
              </div>

              {data.error && data.status === "error" && (
                <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg mb-4">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                  <p className="text-sm text-destructive">{data.error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!amount || data.status === "loading"}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {data.status === "loading" ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmWithdrawal}>
              <div className="mb-6">
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg mb-6">
                  <p className="text-sm text-foreground font-medium">Withdrawal Amount</p>
                  <p className="text-2xl font-bold text-primary">${amount}</p>
                </div>

                <label className="block text-sm font-medium text-foreground mb-2">
                  Enter your PIN to confirm
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN"
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={6}
                />
              </div>

              {data.error && data.status === "error" && (
                <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg mb-4">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                  <p className="text-sm text-destructive">{data.error}</p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinInput(false);
                    setPin("");
                    setData(prev => ({ ...prev, status: "idle" }));
                  }}
                  className="flex-1 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium py-2 rounded-lg transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!pin || data.status === "loading"}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {data.status === "loading" ? "Processing..." : "Confirm Withdrawal"}
                </button>
              </div>
            </form>
          )}
        </div>
        )}

        {/* Success Message */}
        {data.status === "success" && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">
              Withdrawal request submitted successfully. Amount: ${data.amount?.toFixed(2)}
            </p>
          </div>
        )}

        {/* Withdrawal History */}
        {history.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Recent Withdrawals</h2>
            <div className="space-y-3">
              {history.map((withdrawal) => (
                <div key={withdrawal.id} className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                  <div>
                    <p className="font-medium text-foreground">${withdrawal.amount?.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(withdrawal.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      withdrawal.status === "completed" ? "text-green-600" :
                      withdrawal.status === "pending" ? "text-yellow-600" :
                      "text-red-600"
                    }`}>
                      {withdrawal.status?.charAt(0).toUpperCase() + withdrawal.status?.slice(1)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
