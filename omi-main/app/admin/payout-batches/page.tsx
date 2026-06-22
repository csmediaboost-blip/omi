"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

interface PayoutBatch {
  id: string;
  batch_id: string;
  scheduled_for: string;
  slot_name: string;
  status: string;
  total_amount: number;
  total_count: number;
  processed_at?: string;
  created_at: string;
}

export default function PayoutBatchesPage() {
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingBatch, setEditingBatch] = useState<PayoutBatch | null>(null);
  const [editValues, setEditValues] = useState<Partial<PayoutBatch>>({});

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      let query = supabase.from("payout_batches").select("*");

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) {
        console.error("Error fetching batches:", error);
        toast.error("Failed to fetch payout batches");
        return;
      }

      setBatches(data || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (batch: PayoutBatch) => {
    setEditingBatch(batch);
    setEditValues(batch);
  };

  const handleSaveEdit = async () => {
    if (!editingBatch) return;

    try {
      const { error } = await supabase
        .from("payout_batches")
        .update(editValues)
        .eq("id", editingBatch.id);

      if (error) {
        console.error("Error updating batch:", error);
        toast.error("Failed to update batch");
        return;
      }

      toast.success("Batch updated successfully");
      setEditingBatch(null);
      setEditValues({});
      fetchBatches();
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    }
  };

  const filteredBatches = batches.filter(
    (batch) =>
      (batch.batch_id?.toLowerCase() || "").includes(
        searchTerm.toLowerCase(),
      ) ||
      (batch.slot_name?.toLowerCase() || "").includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payout Batches</h1>
        <p className="text-muted-foreground mt-1">
          Monitor payout batch processing
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Batches</CardTitle>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Search by batch ID or slot name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                fetchBatches();
              }}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : filteredBatches.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No batches found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Slot Name</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled For</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium font-mono text-sm">
                        {batch.batch_id?.slice(0, 12) || "N/A"}
                      </TableCell>
                      <TableCell>{batch.slot_name || "N/A"}</TableCell>
                      <TableCell>
                        ${(batch.total_amount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>{batch.total_count || 0}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            batch.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {batch.status || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {batch.scheduled_for
                          ? new Date(batch.scheduled_for).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Dialog
                          open={editingBatch?.id === batch.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingBatch(null);
                              setEditValues({});
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(batch)}
                            >
                              Edit
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Batch</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <label className="text-sm font-medium">
                                  Status
                                </label>
                                <select
                                  value={editValues.status || ""}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      status: e.target.value,
                                    })
                                  }
                                  className="w-full px-3 py-2 border rounded-md"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="processing">Processing</option>
                                  <option value="completed">Completed</option>
                                  <option value="failed">Failed</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-sm font-medium">
                                  Total Amount
                                </label>
                                <Input
                                  type="number"
                                  value={editValues.total_amount || 0}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      total_amount: parseFloat(e.target.value),
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium">
                                  Total Count
                                </label>
                                <Input
                                  type="number"
                                  value={editValues.total_count || 0}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      total_count: parseInt(e.target.value),
                                    })
                                  }
                                />
                              </div>
                              <Button
                                onClick={handleSaveEdit}
                                className="w-full"
                              >
                                Save Changes
                              </Button>
                            </div>
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
  );
}
