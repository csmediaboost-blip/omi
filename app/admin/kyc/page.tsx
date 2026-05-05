"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

interface KYCDocument {
  id: string;
  user_id: string;
  document_type: string;
  document_url: string;
  status: string;
  document_number?: string;
  full_name?: string;
  phone?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  country?: string;
}

export default function KYCPage() {
  const [documents, setDocuments] = useState<KYCDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedDoc, setSelectedDoc] = useState<KYCDocument | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [filterStatus]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      let query = supabase.from("kyc_documents").select("*");

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching KYC documents:", error);
      toast.error("Failed to fetch KYC documents");
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      (doc.document_number?.toLowerCase() || "").includes(
        searchTerm.toLowerCase(),
      ) ||
      (doc.full_name?.toLowerCase() || "").includes(searchTerm.toLowerCase()),
  );

  const updateDocumentStatus = async (docId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("kyc_documents")
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", docId);

      if (error) throw error;
      toast.success(`Document status updated to ${newStatus}`);
      setSelectedDoc(null);
      fetchDocuments();
    } catch (error) {
      console.error("Error updating document:", error);
      toast.error("Failed to update document status");
    }
  };

  const pendingCount = documents.filter((d) => d.status === "pending").length;
  const verifiedCount = documents.filter((d) => d.status === "verified").length;

  return (
    <AdminLayout>
      <div className="space-y-6 bg-white">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">KYC Documents</h1>
          <p className="text-gray-600 mt-1">
            Verify and manage user KYC documents
          </p>
        </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Verification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {pendingCount}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
            {/* Progress bar showing pending percentage */}
            <div className="mt-3 bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full transition-all"
                style={{
                  width: `${((pendingCount / (pendingCount + verifiedCount)) * 100) || 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Verified Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {verifiedCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Successfully verified
            </p>
            {/* Progress bar showing verified percentage */}
            <div className="mt-3 bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{
                  width: `${((verifiedCount / (pendingCount + verifiedCount)) * 100) || 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Verification</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review and approve/reject KYC documents
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Search by document number or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No KYC documents found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Document Number</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.full_name || "N/A"}</TableCell>
                      <TableCell>{doc.document_type || "N/A"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {doc.document_number || "N/A"}
                      </TableCell>
                      <TableCell>{doc.country || "N/A"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            doc.status === "verified"
                              ? "default"
                              : doc.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Dialog
                          open={selectedDoc?.id === doc.id}
                          onOpenChange={(open) => !open && setSelectedDoc(null)}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedDoc(doc)}
                            >
                              Review
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Review KYC Document</DialogTitle>
                              <DialogDescription>
                                Review and approve/reject this document
                              </DialogDescription>
                            </DialogHeader>
                            {selectedDoc && (
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-medium">
                                    Full Name: {selectedDoc.full_name}
                                  </p>
                                  <p className="text-sm">
                                    Document Type: {selectedDoc.document_type}
                                  </p>
                                  <p className="text-sm">
                                    Document Number:{" "}
                                    {selectedDoc.document_number}
                                  </p>
                                  <p className="text-sm">
                                    Country: {selectedDoc.country}
                                  </p>
                                  <p className="text-sm">
                                    Phone: {selectedDoc.phone}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    className="flex-1"
                                    onClick={() =>
                                      updateDocumentStatus(
                                        selectedDoc.id,
                                        "verified",
                                      )
                                    }
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    className="flex-1"
                                    onClick={() =>
                                      updateDocumentStatus(
                                        selectedDoc.id,
                                        "rejected",
                                      )
                                    }
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}
