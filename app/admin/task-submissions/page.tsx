"use client";

import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TaskSubmissionsPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Task Submissions</h1>
          <p className="text-gray-600 mt-1">Monitor and approve task submissions</p>
        </div>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Pending Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Task submissions feature coming soon.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
