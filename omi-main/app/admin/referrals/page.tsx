"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AdminLayout from "@/components/AdminLayout";
import { Spinner } from "@/components/ui/spinner";
import { Edit2, Trash2, Copy, Check } from "lucide-react";

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchReferrals();
  }, []);

  const fetchReferrals = async () => {
    try {
      const { data } = await supabase
        .from("users")
        .select("id, email, referral_code, referral_earnings, referral_count")
        .gt("referral_count", 0)
        .order("referral_count", { ascending: false });

      setReferrals(data || []);
    } catch (error) {
      console.error("Error fetching referrals:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Spinner />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Referral Management
          </h1>
          <p className="text-gray-600 mt-1">
            Manage user referrals and earnings
          </p>
        </div>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Referral Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-gray-600 text-sm">Total Active Referrals</p>
                <p className="text-2xl font-bold text-gray-900">
                  {referrals.length}
                </p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Total Referral Count</p>
                <p className="text-2xl font-bold text-gray-900">
                  {referrals.reduce((sum: number, r: any) => sum + (r.referral_count || 0), 0)}
                </p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Total Earnings</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${referrals
                    .reduce((sum: number, r: any) => sum + (r.referral_earnings || 0), 0)
                    .toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Top Referrers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-bold text-gray-900">
                      User Email
                    </th>
                    <th className="text-left py-3 px-4 font-bold text-gray-900">
                      Code
                    </th>
                    <th className="text-left py-3 px-4 font-bold text-gray-900">
                      Count
                    </th>
                    <th className="text-left py-3 px-4 font-bold text-gray-900">
                      Earnings
                    </th>
                    <th className="text-left py-3 px-4 font-bold text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.slice(0, 10).map((referral: any) => (
                    <tr
                      key={referral.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-3 px-4 text-gray-900">
                        {referral.email}
                      </td>
                      <td className="py-3 px-4">
                        <code className="bg-gray-100 px-2 py-1 rounded text-gray-900 text-xs">
                          {referral.referral_code}
                        </code>
                      </td>
                      <td className="py-3 px-4 text-gray-900">
                        {referral.referral_count}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">
                        ${(referral.referral_earnings || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 flex gap-2">
                        <button
                          onClick={() =>
                            copyToClipboard(referral.referral_code)
                          }
                          className="p-1 hover:bg-gray-200 rounded text-gray-600"
                        >
                          {copied === referral.referral_code ? (
                            <Check size={16} className="text-green-500" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                        <button className="p-1 hover:bg-gray-200 rounded text-gray-600">
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
