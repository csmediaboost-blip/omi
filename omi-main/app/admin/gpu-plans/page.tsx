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
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("gpu_plans")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        toast.error(`Failed to fetch GPU plans: ${error.message}`);
        return;
      }
      setPlans((data as GPUNodePlan[]) ?? []);
    } catch (err) {
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
        .from("gpu_plans")
        .update(editValues)
        .eq("id", editingPlan.id);

      if (error) {
        toast.error(`Failed to update plan: ${error.message}`);
        return;
      }
      setPlans((prev) =>
        prev.map((p) =>
          p.id === editingPlan.id ? { ...p, ...editValues } : p,
        ),
      );
      toast.success("Plan updated successfully");
      setEditingPlan(null);
      setEditValues({});
    } catch {
      toast.error("An error occurred");
    }
  };

  const togglePlanLock = async (plan: GPUNodePlan) => {
    const newLocked = !plan.is_admin_locked;
    setTogglingId(plan.id);

    try {
      // ── Direct update via service role route to bypass RLS ──────────────
      const res = await fetch("/api/admin/toggle-plan-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, locked: newLocked }),
      });

      const body = (await res.json()) as { error?: string };

      if (!res.ok) {
        toast.error(`Failed: ${body.error ?? res.statusText}`);
        return;
      }

      // Update local state after confirmed DB write
      setPlans((prev) =>
        prev.map((p) =>
          p.id === plan.id ? { ...p, is_admin_locked: newLocked } : p,
        ),
      );

      toast.success(
        newLocked
          ? `🔒 "${plan.name}" locked — hidden from new investments`
          : `🔓 "${plan.name}" unlocked — accepting investments`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setTogglingId(null);
    }
  };

  const filteredPlans = plans.filter(
    (plan) =>
      (plan.name?.toLowerCase() ?? "").includes(searchTerm.toLowerCase()) ||
      (plan.gpu_model?.toLowerCase() ?? "").includes(searchTerm.toLowerCase()),
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
                    <TableRow
                      key={plan.id}
                      className={plan.is_admin_locked ? "bg-red-950/20" : ""}
                    >
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>{plan.gpu_model}</TableCell>
                      <TableCell>{plan.vram}</TableCell>
                      <TableCell>{plan.tdp}</TableCell>
                      <TableCell className="text-sm">
                        ${(plan.price_min || 0).toFixed(2)} — $
                        {(plan.price_max || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>{(plan.daily_pct || 0).toFixed(4)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {plan.is_admin_locked ? (
                            <Badge variant="destructive">🔒 Locked</Badge>
                          ) : plan.is_active ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {plan.is_waitlist && (
                            <Badge variant="outline">Waitlist</Badge>
                          )}
                          {plan.is_invite_only && (
                            <Badge variant="outline">Invite</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => togglePlanLock(plan)}
                            disabled={togglingId === plan.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                              plan.is_admin_locked
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                : "bg-red-100 text-red-700 hover:bg-red-200"
                            }`}
                          >
                            {togglingId === plan.id
                              ? "…"
                              : plan.is_admin_locked
                                ? "🔓 Unlock Node"
                                : "🔒 Lock Node"}
                          </button>

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
                                  {(
                                    [
                                      ["Name", "name"],
                                      ["Short Name", "short_name"],
                                      ["GPU Model", "gpu_model"],
                                      ["VRAM", "vram"],
                                      ["TDP", "tdp"],
                                      ["Architecture", "architecture"],
                                      ["Tier Color", "tier_color"],
                                    ] as [string, keyof GPUNodePlan][]
                                  ).map(([label, field]) => (
                                    <div key={field}>
                                      <label className="text-sm font-medium">
                                        {label}
                                      </label>
                                      <Input
                                        value={
                                          (editValues[field] as string) ?? ""
                                        }
                                        onChange={(e) =>
                                          setEditValues({
                                            ...editValues,
                                            [field]: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                  {(
                                    [
                                      ["Price Min", "price_min", "0.01"],
                                      ["Price Max", "price_max", "0.01"],
                                      ["Daily %", "daily_pct", "0.0001"],
                                      ["Referral %", "referral_pct", "0.01"],
                                      ["Sort Order", "sort_order", "1"],
                                    ] as [string, keyof GPUNodePlan, string][]
                                  ).map(([label, field, step]) => (
                                    <div key={field}>
                                      <label className="text-sm font-medium">
                                        {label}
                                      </label>
                                      <Input
                                        type="number"
                                        step={step}
                                        value={
                                          (editValues[field] as number) ?? 0
                                        }
                                        onChange={(e) =>
                                          setEditValues({
                                            ...editValues,
                                            [field]:
                                              step === "1"
                                                ? parseInt(e.target.value)
                                                : parseFloat(e.target.value),
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="space-y-2 border-t pt-4">
                                  {(
                                    [
                                      ["Active", "is_active"],
                                      ["Waitlist", "is_waitlist"],
                                      ["Invite Only", "is_invite_only"],
                                      ["Admin Locked", "is_admin_locked"],
                                    ] as [string, keyof GPUNodePlan][]
                                  ).map(([label, field]) => (
                                    <div
                                      key={field}
                                      className="flex items-center gap-2"
                                    >
                                      <input
                                        type="checkbox"
                                        id={field}
                                        checked={
                                          (editValues[field] as boolean) ??
                                          false
                                        }
                                        onChange={(e) =>
                                          setEditValues({
                                            ...editValues,
                                            [field]: e.target.checked,
                                          })
                                        }
                                      />
                                      <label
                                        htmlFor={field}
                                        className="text-sm font-medium cursor-pointer"
                                      >
                                        {label}
                                      </label>
                                    </div>
                                  ))}
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
                        </div>
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
