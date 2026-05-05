"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cacheService } from "@/lib/cache-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Users, TrendingUp, Award } from "lucide-react";

interface ReferralData {
  totalReferrals: number;
  totalCommission: number;
  pendingCommission: number;
  activeReferrals: number;
  referralCode: string;
}

interface Referral {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  referred_email: string;
  commission_amount: number;
  commission_status: string;
  referred_user_tier: string;
  created_at: string;
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch user referral code
      const { data: userData } = await supabase
        .from("users")
        .select("referral_code, total_commission_earned")
        .eq("id", user.id)
        .single();

      // Fetch referrals made by user
      const { data: referralList } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });

      // Calculate stats
      const totalReferrals = referralList?.length || 0;
      const activeReferrals =
        referralList?.filter((r) => r.commission_status !== "claimed").length ||
        0;
      const totalCommission =
        referralList?.reduce(
          (sum, r) => sum + (r.commission_amount || 0),
          0
        ) || 0;
      const pendingCommission =
        referralList
          ?.filter((r) => r.commission_status === "pending")
          .reduce((sum, r) => sum + (r.commission_amount || 0), 0) || 0;

      setData({
        totalReferrals,
        totalCommission,
        pendingCommission,
        activeReferrals,
        referralCode: userData?.referral_code || "N/A",
      });

      setReferrals(referralList || []);
    } catch (error) {
      console.error("Error fetching referral data:", error);
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = () => {
    if (data?.referralCode) {
      navigator.clipboard.writeText(data.referralCode);
      toast.success("Referral code copied to clipboard!");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading referral data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Referral Program</h1>
        <p className="text-gray-600 mt-2">
          Earn commissions by referring friends to our platform
        </p>
      </div>

      {/* Your Referral Code Section */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-600" />
            Your Referral Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 bg-white p-4 rounded-lg border border-blue-300">
            <code className="flex-1 text-lg font-mono font-bold text-blue-600">
              {data?.referralCode}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copyReferralCode}
              className="gap-2"
            >
              <Copy className="w-4 h-4" />
              Copy
            </Button>
          </div>
          <p className="text-sm text-gray-700">
            Share this code with friends. When they sign up using your code,
            you'll earn a commission on their first investment.
          </p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {data?.totalReferrals || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              People you've referred
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Total Commission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              ${(data?.totalCommission || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Earned commissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="w-4 h-4" />
              Pending Commission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              ${(data?.pendingCommission || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting confirmation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Active Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {data?.activeReferrals || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Still investing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Referrals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Your Referrals</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            View details of all users you&apos;ve referred
          </p>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No referrals yet</p>
              <p className="text-sm text-gray-400">
                Start earning by sharing your referral code with others
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold">Email</th>
                    <th className="text-left py-3 px-4 font-semibold">Tier</th>
                    <th className="text-right py-3 px-4 font-semibold">
                      Commission
                    </th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">
                      Referred
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((ref) => (
                    <tr key={ref.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 truncate">
                        {ref.referred_email}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">
                          {ref.referred_user_tier || "Basic"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-green-600">
                        ${ref.commission_amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            ref.commission_status === "claimed"
                              ? "secondary"
                              : ref.commission_status === "pending"
                                ? "outline"
                                : "default"
                          }
                        >
                          {ref.commission_status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {new Date(ref.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">
              1
            </div>
            <div>
              <p className="font-semibold">Share Your Code</p>
              <p className="text-gray-600">
                Send your referral code to friends and colleagues
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">
              2
            </div>
            <div>
              <p className="font-semibold">They Sign Up</p>
              <p className="text-gray-600">
                They create an account using your referral code
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <p className="font-semibold">They Invest</p>
              <p className="text-gray-600">
                When they make their first investment, you earn commission
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">
              4
            </div>
            <div>
              <p className="font-semibold">Get Paid</p>
              <p className="text-gray-600">
                Commission is deposited to your account after confirmation
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
