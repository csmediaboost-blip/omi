"use client";

import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EmailTemplatesPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-gray-600 mt-1">Manage system email templates</p>
        </div>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Email Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Email template management feature coming soon.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
