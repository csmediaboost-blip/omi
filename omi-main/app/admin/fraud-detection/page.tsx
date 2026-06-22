"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AdminLayout from "@/components/AdminLayout";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, CheckCircle, Flag } from "lucide-react";
import { toast } from "sonner";

export default function FraudDetectionPage() {
  const [flaggedUsers, setFlaggedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlaggedUsers();
  }, []);

  const fetchFlaggedUsers = async () => {
    try {
      const { data } = await supabase
        .from("users")
        .select("id, email, account_flagged, created_at, balance_available")
        .eq("account_flagged", true)
        .order("created_at", { ascending: false });

      setFlaggedUsers(data || []);
    } catch (error) {
      console.error("Error fetching flagged users:", error);
    } finally {
      setLoading(false);
    }
  };

  const unflagUser = async (userId: string) => {
    try {
      await supabase
        .from("users")
        .update({ account_flagged: false })
        .eq("id", userId);

      toast.success("User unflagged successfully");
      fetchFlaggedUsers();
    } catch (error) {
      toast.error("Failed to unflag user");
      console.error(error);
    }
  };

  const flagUser = async (userId: string) => {
    try {
      await supabase
        .from("users")
        .update({ account_flagged: true })
        .eq("id", userId);

      toast.success("User flagged successfully");
      fetchFlaggedUsers();
    } catch (error) {
      toast.error("Failed to flag user");
      console.error(error);
    }
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
          <h1 className="text-3xl font-bold text-gray-900">Fraud Detection</h1>
          <p className="text-gray-600 mt-1">
            Monitor and manage flagged suspicious accounts
          </p>
        </div>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Flagged Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {flaggedUsers.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <CheckCircle size={20} className="mr-2" />
                  <span>No flagged users</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-bold text-gray-900">
                          Email
                        </th>
                        <th className="text-left py-3 px-4 font-bold text-gray-900">
                          Balance
                        </th>
                        <th className="text-left py-3 px-4 font-bold text-gray-900">
                          Flagged Date
                        </th>
                        <th className="text-left py-3 px-4 font-bold text-gray-900">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {flaggedUsers.map((user: any) => (
                        <tr
                          key={user.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-4 text-gray-900">
                            {user.email}
                          </td>
                          <td className="py-3 px-4 text-gray-900">
                            ${(user.balance_available || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-sm">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 flex gap-2">
                            <button
                              onClick={() => unflagUser(user.id)}
                              className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200 transition-colors"
                            >
                              Unflag
                            </button>
                            <button
                              onClick={() => flagUser(user.id)}
                              className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors"
                            >
                              Keep Flagged
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500" />
              Fraud Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-gray-600">
              <p>• Multiple withdrawal requests in short time span</p>
              <p>• Unusual transaction patterns detected</p>
              <p>• Account with high withdrawal requests</p>
              <p>
                • Manual flag by admin (recommended for suspicious activity)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
