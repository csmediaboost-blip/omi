"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import AdminLayout from "@/components/AdminLayout";
import {
  Users,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  Gift,
  Shield,
} from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    pendingKYC: 0,
    pendingWithdrawals: 0,
    supportTickets: 0,
    mediaFiles: 0,
    gpuPlans: 0,
    rlhfQuestions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);

      const { count: userCount } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      const { count: transactionCount } = await supabase
        .from("payment_transactions")
        .select("*", { count: "exact", head: true });

      const { data: payments } = await supabase
        .from("payment_transactions")
        .select("amount");

      const { count: pendingKYCCount } = await supabase
        .from("kyc_documents")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: pendingWithdrawalsCount } = await supabase
        .from("withdrawal_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: ticketCount } = await supabase
        .from("support_tickets")
        .select("*", { count: "exact", head: true });

      const { count: mediaCount } = await supabase
        .from("datacenter_media")
        .select("*", { count: "exact", head: true });

      const { count: gpuCount } = await supabase
        .from("gpu_node_plans")
        .select("*", { count: "exact", head: true });

      const { count: rlhfCount } = await supabase
        .from("rlhf_questions")
        .select("*", { count: "exact", head: true });

      const totalRevenue =
        payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) ||
        0;

      setStats({
        totalUsers: userCount || 0,
        totalTransactions: transactionCount || 0,
        totalRevenue,
        pendingKYC: pendingKYCCount || 0,
        pendingWithdrawals: pendingWithdrawalsCount || 0,
        supportTickets: ticketCount || 0,
        mediaFiles: mediaCount || 0,
        gpuPlans: gpuCount || 0,
        rlhfQuestions: rlhfCount || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
  }: {
    title: string;
    value: number | string;
    icon: React.ComponentType<{ size: number; className: string }>;
    color: string;
  }) => (
    <Card className="bg-white border-gray-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-900">
          {title}
        </CardTitle>
        <Icon size={20} className={color} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      </CardContent>
    </Card>
  );

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
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back. Here's what's happening today.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={Users}
            color="text-blue-500"
          />
          <StatCard
            title="Pending KYC"
            value={stats.pendingKYC}
            icon={Clock}
            color="text-yellow-500"
          />
          <StatCard
            title="Pending Withdrawals"
            value={stats.pendingWithdrawals}
            icon={DollarSign}
            color="text-green-500"
          />
          <StatCard
            title="Support Tickets"
            value={stats.supportTickets}
            icon={AlertCircle}
            color="text-red-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">
                Financial Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Revenue</span>
                  <span className="text-xl font-bold text-gray-900">
                    ${stats.totalRevenue.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Transactions</span>
                  <span className="text-xl font-bold text-gray-900">
                    {stats.totalTransactions}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Platform Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">GPU Plans</span>
                  <span className="text-xl font-bold text-gray-900">
                    {stats.gpuPlans}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">RLHF Questions</span>
                  <span className="text-xl font-bold text-gray-900">
                    {stats.rlhfQuestions}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/referrals">
            <Card className="bg-white border-gray-200 hover:border-emerald-300 transition-colors cursor-pointer h-full">
              <CardHeader>
                <Gift className="text-emerald-500 mb-2" size={24} />
                <CardTitle className="text-gray-900">
                  Referral Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Manage referral codes and earnings
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/fraud-detection">
            <Card className="bg-white border-gray-200 hover:border-emerald-300 transition-colors cursor-pointer h-full">
              <CardHeader>
                <Shield className="text-blue-500 mb-2" size={24} />
                <CardTitle className="text-gray-900">Fraud Detection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Monitor and flag suspicious activity
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/announcements">
            <Card className="bg-white border-gray-200 hover:border-emerald-300 transition-colors cursor-pointer h-full">
              <CardHeader>
                <TrendingUp className="text-purple-500 mb-2" size={24} />
                <CardTitle className="text-gray-900">Announcements</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Create platform-wide announcements
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/system-logs">
            <Card className="bg-white border-gray-200 hover:border-emerald-300 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CheckCircle className="text-gray-500 mb-2" size={24} />
                <CardTitle className="text-gray-900">System Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  View audit trails and system activity
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link
                href="/admin/users"
                className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors"
              >
                View Users
              </Link>
              <Link
                href="/admin/kyc"
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                Review KYC
              </Link>
              <Link
                href="/admin/withdrawals"
                className="px-4 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
              >
                Process Withdrawals
              </Link>
              <Link
                href="/admin/analytics"
                className="px-4 py-2 bg-purple-50 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-100 transition-colors"
              >
                View Analytics
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
