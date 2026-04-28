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

interface WithdrawalQueue {
  id: string;
  user_id: string;
  amount: number;
  wallet_address: string;
  status: string;
}

export default function WithdrawalQueuePage() {
  const [items, setItems] = useState<WithdrawalQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingItem, setEditingItem] = useState<WithdrawalQueue | null>(null);
  const [editValues, setEditValues] = useState<Partial<WithdrawalQueue>>({});

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("withdrawal_queue")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        console.error("Error fetching withdrawal queue:", error);
        toast.error("Failed to fetch withdrawal queue");
        return;
      }

      setItems(data || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (item: WithdrawalQueue) => {
    setEditingItem(item);
    setEditValues(item);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    try {
      const { error } = await supabase
        .from("withdrawal_queue")
        .update(editValues)
        .eq("id", editingItem.id);

      if (error) {
        console.error("Error updating item:", error);
        toast.error("Failed to update item");
        return;
      }

      toast.success("Item updated successfully");
      setEditingItem(null);
      setEditValues({});
      fetchItems();
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    }
  };

  const filteredItems = items.filter((item) =>
    (item.wallet_address?.toLowerCase() || "").includes(
      searchTerm.toLowerCase(),
    ),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Withdrawal Queue</h1>
        <p className="text-muted-foreground mt-1">
          Manage pending withdrawal requests
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue Items</CardTitle>
          <Input
            placeholder="Search by wallet address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-2"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No items in queue
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Wallet Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>${(item.amount || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {item.wallet_address
                          ? item.wallet_address.slice(0, 20) + "..."
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge>{item.status || "pending"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Dialog
                          open={editingItem?.id === item.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingItem(null);
                              setEditValues({});
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(item)}
                            >
                              Edit
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Withdrawal</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <label className="text-sm font-medium">
                                  Amount
                                </label>
                                <Input
                                  type="number"
                                  value={editValues.amount || 0}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      amount: parseFloat(e.target.value),
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium">
                                  Wallet Address
                                </label>
                                <Input
                                  value={editValues.wallet_address || ""}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      wallet_address: e.target.value,
                                    })
                                  }
                                />
                              </div>
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
