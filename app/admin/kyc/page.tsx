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
import { ExternalLink, CheckCircle, XCircle, Eye } from "lucide-react";

interface KYCDocument {
  id: string;
  user_id: string;
  document_type: string;
  document_url: string | null;
  status: string;
  document_number?: string;
  full_name?: string;
  phone?: string;
  gender?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  country?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  national_id: "National Identity Card",
  passport: "International Passport",
  drivers_license: "Driver's License",
  voters_card: "Voter's Card",
  residence_permit: "Residence Permit",
};

export default function KYCPage() {
  const [documents, setDocuments] = useState<KYCDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedDoc, setSelectedDoc] = useState<KYCDocument | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [filterStatus]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      let query = supabase.from("kyc_documents").select("*");
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
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
      (doc.full_name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (doc.country?.toLowerCase() || "").includes(searchTerm.toLowerCase()),
  );

  // ─────────────────────────────────────────────────────────────────
  // CRITICAL FIX: When admin approves/rejects, we must update BOTH:
  //   1. kyc_documents.status  — what admin sees
  //   2. users.kyc_verified + users.kyc_status — what the user sees
  // Without step 2, users are permanently stuck on "pending" even
  // after admin approval.
  // ─────────────────────────────────────────────────────────────────
  const updateDocumentStatus = async (
    docId: string,
    userId: string,
    newStatus: string,
  ) => {
    setActionLoading(true);
    try {
      // 1. Update kyc_documents table
      const { error: docErr } = await supabase
        .from("kyc_documents")
        .update({ status: newStatus, reviewed_at: new Date().toISOString() })
        .eq("id", docId);

      if (docErr) throw docErr;

      // 2. Update users table — THIS is what the user's dashboard reads
      const userUpdate: Record<string, any> = {
        kyc_status: newStatus, // "verified" | "rejected"
      };
      if (newStatus === "verified") {
        userUpdate.kyc_verified = true;
      } else if (newStatus === "rejected") {
        userUpdate.kyc_verified = false;
      }

      const { error: userErr } = await supabase
        .from("users")
        .update(userUpdate)
        .eq("id", userId);

      if (userErr) throw userErr;

      toast.success(
        newStatus === "verified"
          ? "✅ KYC Approved — user has been notified"
          : "❌ KYC Rejected — user can resubmit",
      );
      setSelectedDoc(null);
      fetchDocuments();
    } catch (error: any) {
      console.error("Error updating document:", error);
      toast.error(`Failed to update: ${error?.message || "unknown error"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = documents.filter((d) => d.status === "pending").length;
  const verifiedCount = documents.filter((d) => d.status === "verified").length;
  const rejectedCount = documents.filter((d) => d.status === "rejected").length;
  const total = pendingCount + verifiedCount + rejectedCount;

  // Check if a URL is an image (not PDF)
  const isImageUrl = (url: string | null) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes(".jpg") ||
      lower.includes(".jpeg") ||
      lower.includes(".png") ||
      lower.includes(".webp") ||
      lower.includes(".gif") ||
      lower.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6 bg-white">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">KYC Documents</h1>
          <p className="text-gray-600 mt-1">
            Verify and manage user identity submissions
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {pendingCount}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Awaiting review
              </p>
              <div className="bg-gray-200 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${total ? (pendingCount / total) * 100 : 0}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Verified
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {verifiedCount}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Successfully verified
              </p>
              <div className="bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${total ? (verifiedCount / total) * 100 : 0}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {rejectedCount}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Needs resubmission
              </p>
              <div className="bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${total ? (rejectedCount / total) * 100 : 0}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Document Review Queue</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click <strong>Review</strong> to see the uploaded ID photo and
              approve or reject
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Search by name, document number, or country..."
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
              <Button
                variant="outline"
                size="sm"
                onClick={fetchDocuments}
                className="ml-auto"
              >
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-8 w-8" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Eye size={32} className="mx-auto mb-2 opacity-20" />
                No KYC documents found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Doc Number</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Photo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.full_name || "N/A"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {DOC_TYPE_LABELS[doc.document_type] ||
                            doc.document_type ||
                            "N/A"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {doc.document_number || "N/A"}
                        </TableCell>
                        <TableCell>{doc.country || "N/A"}</TableCell>
                        <TableCell>
                          {doc.document_url ? (
                            <a
                              href={doc.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              <ExternalLink size={12} /> View
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs">
                              No file
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              doc.status === "verified"
                                ? "default"
                                : doc.status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className={
                              doc.status === "verified"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : doc.status === "pending"
                                  ? "bg-orange-100 text-orange-800 border-orange-200"
                                  : ""
                            }
                          >
                            {doc.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(doc.created_at).toLocaleDateString("en", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <Dialog
                            open={selectedDoc?.id === doc.id}
                            onOpenChange={(open) => {
                              if (!open) {
                                setSelectedDoc(null);
                                setImgError(false);
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedDoc(doc);
                                  setImgError(false);
                                }}
                                className={
                                  doc.status === "pending"
                                    ? "border-orange-300 text-orange-700 hover:bg-orange-50"
                                    : ""
                                }
                              >
                                Review
                              </Button>
                            </DialogTrigger>

                            {/* ── Review Dialog ── */}
                            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  KYC Review
                                  {selectedDoc && (
                                    <Badge
                                      variant={
                                        selectedDoc.status === "verified"
                                          ? "default"
                                          : selectedDoc.status === "rejected"
                                            ? "destructive"
                                            : "secondary"
                                      }
                                      className="text-xs"
                                    >
                                      {selectedDoc.status}
                                    </Badge>
                                  )}
                                </DialogTitle>
                                <DialogDescription>
                                  Review the submitted identity document and
                                  approve or reject. Approval will instantly
                                  unlock the user's account.
                                </DialogDescription>
                              </DialogHeader>

                              {selectedDoc && (
                                <div className="space-y-5">
                                  {/* ── ID Photo ── */}
                                  <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-2">
                                      📄 Uploaded Document —{" "}
                                      {DOC_TYPE_LABELS[
                                        selectedDoc.document_type
                                      ] || selectedDoc.document_type}
                                    </p>
                                    {selectedDoc.document_url ? (
                                      <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                                        {isImageUrl(selectedDoc.document_url) &&
                                        !imgError ? (
                                          // Show image inline
                                          <img
                                            src={selectedDoc.document_url}
                                            alt="Submitted ID document"
                                            className="w-full max-h-80 object-contain"
                                            onError={() => setImgError(true)}
                                          />
                                        ) : (
                                          // PDF or broken image — show open link
                                          <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center">
                                            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                                              <ExternalLink
                                                size={22}
                                                className="text-blue-500"
                                              />
                                            </div>
                                            <div>
                                              <p className="text-sm font-medium text-gray-700">
                                                {imgError
                                                  ? "Image failed to load"
                                                  : "Document file (PDF or non-image)"}
                                              </p>
                                              <p className="text-xs text-gray-400 mt-0.5">
                                                Open in a new tab to view
                                              </p>
                                            </div>
                                            <a
                                              href={selectedDoc.document_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                              <ExternalLink size={14} /> Open
                                              Document
                                            </a>
                                          </div>
                                        )}

                                        {/* Always show open-in-tab link below image too */}
                                        {isImageUrl(selectedDoc.document_url) &&
                                          !imgError && (
                                            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex justify-end">
                                              <a
                                                href={selectedDoc.document_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                                              >
                                                <ExternalLink size={11} /> Open
                                                full size
                                              </a>
                                            </div>
                                          )}
                                      </div>
                                    ) : (
                                      <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400">
                                        No document uploaded
                                      </div>
                                    )}
                                  </div>

                                  {/* ── Submitted details ── */}
                                  <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-3">
                                      👤 Submitted Details
                                    </p>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm bg-gray-50 rounded-xl p-4">
                                      {[
                                        {
                                          label: "Full Name",
                                          value: selectedDoc.full_name,
                                        },
                                        {
                                          label: "Document Type",
                                          value:
                                            DOC_TYPE_LABELS[
                                              selectedDoc.document_type
                                            ] || selectedDoc.document_type,
                                        },
                                        {
                                          label: "Document No.",
                                          value: selectedDoc.document_number,
                                        },
                                        {
                                          label: "Country",
                                          value: selectedDoc.country,
                                        },
                                        {
                                          label: "Phone",
                                          value: selectedDoc.phone,
                                        },
                                        {
                                          label: "Gender",
                                          value: selectedDoc.gender
                                            ? selectedDoc.gender
                                                .charAt(0)
                                                .toUpperCase() +
                                              selectedDoc.gender.slice(1)
                                            : undefined,
                                        },
                                        {
                                          label: "Date of Birth",
                                          value: selectedDoc.date_of_birth,
                                        },
                                        {
                                          label: "Address",
                                          value: selectedDoc.address,
                                        },
                                        {
                                          label: "City / State",
                                          value: selectedDoc.city,
                                        },
                                        {
                                          label: "Submitted",
                                          value: new Date(
                                            selectedDoc.created_at,
                                          ).toLocaleString(),
                                        },
                                        {
                                          label: "User ID",
                                          value: selectedDoc.user_id,
                                        },
                                      ].map(({ label, value }) => (
                                        <div key={label}>
                                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                                            {label}
                                          </p>
                                          <p
                                            className={`text-gray-900 mt-0.5 break-all ${label === "User ID" ? "font-mono text-xs" : ""}`}
                                          >
                                            {value || (
                                              <span className="text-gray-300">
                                                —
                                              </span>
                                            )}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* ── Action buttons ── */}
                                  {selectedDoc.status === "pending" ? (
                                    <div className="flex gap-3 pt-1">
                                      <Button
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold gap-2"
                                        disabled={actionLoading}
                                        onClick={() =>
                                          updateDocumentStatus(
                                            selectedDoc.id,
                                            selectedDoc.user_id,
                                            "verified",
                                          )
                                        }
                                      >
                                        {actionLoading ? (
                                          <Spinner className="h-4 w-4" />
                                        ) : (
                                          <CheckCircle size={16} />
                                        )}
                                        Approve — Verify User
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        className="flex-1 font-bold gap-2"
                                        disabled={actionLoading}
                                        onClick={() =>
                                          updateDocumentStatus(
                                            selectedDoc.id,
                                            selectedDoc.user_id,
                                            "rejected",
                                          )
                                        }
                                      >
                                        {actionLoading ? (
                                          <Spinner className="h-4 w-4" />
                                        ) : (
                                          <XCircle size={16} />
                                        )}
                                        Reject
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200">
                                      {selectedDoc.status === "verified" ? (
                                        <CheckCircle
                                          size={16}
                                          className="text-green-600"
                                        />
                                      ) : (
                                        <XCircle
                                          size={16}
                                          className="text-red-600"
                                        />
                                      )}
                                      <p className="text-sm text-gray-600">
                                        This document was{" "}
                                        <strong>{selectedDoc.status}</strong>
                                        {selectedDoc.reviewed_at &&
                                          ` on ${new Date(selectedDoc.reviewed_at).toLocaleDateString()}`}
                                        .
                                      </p>
                                      {/* Allow re-reviewing already processed docs */}
                                      <div className="ml-auto flex gap-2">
                                        {selectedDoc.status !== "verified" && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-green-700 border-green-300"
                                            disabled={actionLoading}
                                            onClick={() =>
                                              updateDocumentStatus(
                                                selectedDoc.id,
                                                selectedDoc.user_id,
                                                "verified",
                                              )
                                            }
                                          >
                                            Approve
                                          </Button>
                                        )}
                                        {selectedDoc.status !== "rejected" && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-700 border-red-300"
                                            disabled={actionLoading}
                                            onClick={() =>
                                              updateDocumentStatus(
                                                selectedDoc.id,
                                                selectedDoc.user_id,
                                                "rejected",
                                              )
                                            }
                                          >
                                            Reject
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )}
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
