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

interface GPUNodePlan {
  id: string;
  name: string;
  short_name: string;
  subtitle: string;
  gpu_model: string;
  vram: string;
  tdp: string;
  architecture: string;
  tflops: number;
  price_min: number;
  price_max: number;
  daily_pct: number;
  referral_pct: number;
  tier_color: string;
  instance_type: string;
  is_active: boolean;
  is_waitlist: boolean;
  is_invite_only: boolean;
  is_admin_locked: boolean;
  sort_order: number;
  created_at: string;
}

export default function GPUNodePlansPage() {
  const [plans, setPlans] = useState<GPUNodePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPlan, setEditingPlan] = useState<GPUNodePlan | null>(null);
  const [editValues, setEditValues] = useState<Partial<GPUNodePlan>>({});

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("gpu_node_plans")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("Error fetching GPU plans:", error);
        toast.error("Failed to fetch GPU plans");
        return;
      }

      setPlans(data || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (plan: GPUNodePlan) => {
    setEditingPlan(plan);
    setEditValues({ ...plan });
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;

    try {
      const { error } = await supabase
        .from("gpu_node_plans")
        .update(editValues)
        .eq("id", editingPlan.id);

      if (error) {
        console.error("Error updating plan:", error);
        toast.error("Failed to update plan");
        return;
      }

      toast.success("Plan updated successfully");
      setEditingPlan(null);
      setEditValues({});
      fetchPlans();
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred");
    }
  };

  const filteredPlans = plans.filter(
    (plan) =>
      (plan.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (plan.gpu_model?.toLowerCase() || "").includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">GPU Node Plans</h1>
        <p className="text-muted-foreground mt-1">
          Manage GPU node plan configurations and pricing
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plans ({filteredPlans.length})</CardTitle>
          <Input
            placeholder="Search by name or GPU model..."
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
          ) : filteredPlans.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No plans found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>GPU Model</TableHead>
                    <TableHead>VRAM</TableHead>
                    <TableHead>TDP</TableHead>
                    <TableHead>Price Range</TableHead>
                    <TableHead>Daily %</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">
                        {plan.name || "N/A"}
                      </TableCell>
                      <TableCell>{plan.gpu_model || "N/A"}</TableCell>
                      <TableCell>{plan.vram || "N/A"}</TableCell>
                      <TableCell>{plan.tdp || "N/A"}</TableCell>
                      <TableCell className="text-sm">
                        ${(plan.price_min || 0).toFixed(2)} - $
                        {(plan.price_max || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>{(plan.daily_pct || 0).toFixed(4)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Badge
                            variant={plan.is_active ? "default" : "secondary"}
                          >
                            {plan.is_active ? "Active" : "Inactive"}
                          </Badge>
                          {plan.is_waitlist && (
                            <Badge variant="outline">Waitlist</Badge>
                          )}
                          {plan.is_invite_only && (
                            <Badge variant="outline">Invite</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Dialog
                          open={editingPlan?.id === plan.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingPlan(null);
                              setEditValues({});
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(plan)}
                            >
                              Edit
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Edit {plan.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">
                                    Name
                                  </label>
                                  <Input
                                    value={editValues.name || ""}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        name: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Short Name
                                  </label>
                                  <Input
                                    value={editValues.short_name || ""}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        short_name: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    GPU Model
                                  </label>
                                  <Input
                                    value={editValues.gpu_model || ""}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        gpu_model: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    VRAM
                                  </label>
                                  <Input
                                    value={editValues.vram || ""}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        vram: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    TDP
                                  </label>
                                  <Input
                                    value={editValues.tdp || ""}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        tdp: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Architecture
                                  </label>
                                  <Input
                                    value={editValues.architecture || ""}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        architecture: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Price Min
                                  </label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editValues.price_min || 0}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        price_min: parseFloat(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Price Max
                                  </label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editValues.price_max || 0}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        price_max: parseFloat(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Daily %
                                  </label>
                                  <Input
                                    type="number"
                                    step="0.0001"
                                    value={editValues.daily_pct || 0}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        daily_pct: parseFloat(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Referral %
                                  </label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editValues.referral_pct || 0}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        referral_pct: parseFloat(
                                          e.target.value,
                                        ),
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Tier Color
                                  </label>
                                  <Input
                                    value={editValues.tier_color || ""}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        tier_color: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Sort Order
                                  </label>
                                  <Input
                                    type="number"
                                    value={editValues.sort_order || 0}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        sort_order: parseInt(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              <div className="space-y-2 border-t pt-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={editValues.is_active || false}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        is_active: e.target.checked,
                                      })
                                    }
                                  />
                                  <label
                                    htmlFor="is_active"
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    Active
                                  </label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="is_waitlist"
                                    checked={editValues.is_waitlist || false}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        is_waitlist: e.target.checked,
                                      })
                                    }
                                  />
                                  <label
                                    htmlFor="is_waitlist"
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    Waitlist
                                  </label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="is_invite_only"
                                    checked={editValues.is_invite_only || false}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        is_invite_only: e.target.checked,
                                      })
                                    }
                                  />
                                  <label
                                    htmlFor="is_invite_only"
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    Invite Only
                                  </label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="is_admin_locked"
                                    checked={
                                      editValues.is_admin_locked || false
                                    }
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        is_admin_locked: e.target.checked,
                                      })
                                    }
                                  />
                                  <label
                                    htmlFor="is_admin_locked"
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    Admin Locked
                                  </label>
                                </div>
                              </div>
                              <Button
                                onClick={handleSaveEdit}
                                className="w-full mt-4"
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
