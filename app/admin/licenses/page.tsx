"use client";

import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LicensesPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">License Manager</h1>
          <p className="text-gray-600 mt-1">Manage user licenses and node access</p>
        </div>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Active Licenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">License management feature coming soon.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
