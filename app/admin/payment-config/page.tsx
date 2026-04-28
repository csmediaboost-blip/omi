"use client";
// app/admin/payment-config/page.tsx
// ROOT CAUSE FIX for duplicate key error:
// 1. The anon Supabase client CANNOT read payment_config due to RLS
//    → configs state stays empty → existingKeys set is empty
//    → handleAddTemplate thinks all keys are new → tries INSERT → duplicate key constraint error
// FIX: All reads AND writes now go through /api/admin/payment-config
//    which uses the service role key and bypasses RLS entirely

import { useEffect, useState } from "react";
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
import { Edit, Save, Trash2, Plus, Eye, EyeOff, RefreshCw } from "lucide-react";

interface PaymentConfig {
  id: number;
  key: string;
  value: string;
  updated_at: string;
}

const GATEWAY_TEMPLATES: Record<
  string,
  { label: string; keys: { key: string; placeholder: string }[] }
> = {
  stripe: {
    label: "Stripe",
    keys: [
      { key: "stripe_public_key", placeholder: "pk_live_..." },
      { key: "stripe_secret_key", placeholder: "sk_live_..." },
    ],
  },
  korapay: {
    label: "KoraPay",
    keys: [
      { key: "korapay_public_key", placeholder: "pk_..." },
      { key: "korapay_secret_key", placeholder: "sk_..." },
    ],
  },
  moonpay: {
    label: "MoonPay",
    keys: [
      { key: "moonpay_api_key", placeholder: "pk_live_..." },
      { key: "moonpay_secret_key", placeholder: "sk_live_..." },
    ],
  },
  crypto_wallets: {
    label: "Crypto Wallets",
    keys: [
      { key: "crypto_wallet_btc", placeholder: "Bitcoin address..." },
      {
        key: "crypto_wallet_usdt_trc20",
        placeholder: "USDT TRC-20 address...",
      },
      {
        key: "crypto_wallet_usdt_erc20",
        placeholder: "USDT ERC-20 address...",
      },
    ],
  },
  general: {
    label: "General Settings",
    keys: [
      { key: "crypto_discount_percent", placeholder: "e.g. 5" },
      { key: "payments_enabled", placeholder: "true / false" },
    ],
  },
};

// ── All API calls go through the admin route (service role) ──────────────────
async function adminApi(body: object) {
  const res = await fetch("/api/admin/payment-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function PaymentConfigPage() {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingConfig, setEditingConfig] = useState<PaymentConfig | null>(
    null,
  );
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addingGateway, setAddingGateway] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [templateValues, setTemplateValues] = useState<Record<string, string>>(
    {},
  );

  const [deleteTarget, setDeleteTarget] = useState<PaymentConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  // FIXED: reads via admin API (service role) — not anon client
  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/payment-config");
      const data = await res.json();
      if (!res.ok) {
        toast.error("Failed to fetch: " + (data.error || "Unknown error"));
        return;
      }
      setConfigs(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingConfig) return;
    try {
      setSaving(true);
      const result = await adminApi({
        action: "update",
        id: editingConfig.id,
        value: editValue,
      });
      if (result.error) {
        toast.error("Failed to update: " + result.error);
        return;
      }
      toast.success("Updated successfully");
      setEditingConfig(null);
      setEditValue("");
      fetchConfigs();
    } catch {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSingle = async () => {
    if (!newKey.trim()) {
      toast.error("Key is required");
      return;
    }
    const exists = configs.find((c) => c.key === newKey.trim());
    if (exists) {
      toast.error(
        "Key already exists — use the Edit button to change its value.",
      );
      return;
    }
    try {
      setAddingGateway(true);
      const result = await adminApi({
        action: "insert",
        key: newKey.trim(),
        value: newValue.trim(),
      });
      if (result.error) {
        toast.error("Failed to add: " + result.error);
        return;
      }
      toast.success("Configuration added");
      setNewKey("");
      setNewValue("");
      setAddOpen(false);
      fetchConfigs();
    } catch {
      toast.error("Failed to add");
    } finally {
      setAddingGateway(false);
    }
  };

  // FIXED: uses upsert_many which does UPDATE for existing keys, INSERT for new ones
  // This replaces the broken INSERT-only logic that caused the duplicate key error
  const handleAddTemplate = async () => {
    if (!selectedTemplate) return;
    const tpl = GATEWAY_TEMPLATES[selectedTemplate];
    try {
      setAddingGateway(true);
      const result = await adminApi({
        action: "upsert_many",
        keys: tpl.keys.map((k) => ({
          key: k.key,
          value: templateValues[k.key] || "",
        })),
      });
      if (result.error) {
        toast.error("Failed: " + result.error);
        return;
      }
      toast.success(`${tpl.label} gateway configured`);
      setSelectedTemplate("");
      setTemplateValues({});
      setAddOpen(false);
      fetchConfigs();
    } catch {
      toast.error("Failed to configure gateway");
    } finally {
      setAddingGateway(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const result = await adminApi({ action: "delete", id: deleteTarget.id });
      if (result.error) {
        toast.error("Delete failed: " + result.error);
        return;
      }
      toast.success(`"${deleteTarget.key}" removed`);
      setDeleteTarget(null);
      fetchConfigs();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const toggleReveal = (id: number) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isSensitive = (key: string) =>
    key.toLowerCase().includes("secret") ||
    key.toLowerCase().includes("key") ||
    key.toLowerCase().includes("wallet") ||
    key.toLowerCase().includes("address");

  const maskValue = (value: string, id: number, key: string) => {
    if (!value || value === "EMPTY" || value === "")
      return <span className="text-slate-400 italic">EMPTY</span>;
    if (!isSensitive(key) || revealedKeys.has(id))
      return <span className="font-mono text-xs">{value}</span>;
    const masked =
      value.length <= 8
        ? "•".repeat(value.length)
        : value.slice(0, 4) +
          "•".repeat(Math.max(8, value.length - 8)) +
          value.slice(-4);
    return <span className="font-mono text-xs tracking-wider">{masked}</span>;
  };

  const filteredConfigs = configs.filter(
    (c) =>
      c.key?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.value?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const groupOf = (key: string) => {
    for (const [, tpl] of Object.entries(GATEWAY_TEMPLATES)) {
      if (tpl.keys.some((k) => k.key === key)) return tpl.label;
    }
    return "Other";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Payment Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage payment gateway credentials and crypto wallet settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchConfigs}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Gateway / Key
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Payment Configuration</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Quick Add Gateway
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(GATEWAY_TEMPLATES).map(([k, tpl]) => (
                      <button
                        key={k}
                        onClick={() => {
                          setSelectedTemplate(k === selectedTemplate ? "" : k);
                          setTemplateValues({});
                        }}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${selectedTemplate === k ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedTemplate && (
                  <div className="space-y-3 border rounded-lg p-4 bg-slate-50">
                    <p className="text-sm font-medium text-slate-700">
                      {GATEWAY_TEMPLATES[selectedTemplate].label} Keys
                    </p>
                    {GATEWAY_TEMPLATES[selectedTemplate].keys.map((k) => {
                      const existing = configs.find((c) => c.key === k.key);
                      return (
                        <div key={k.key}>
                          <label className="text-xs font-mono text-slate-500 block mb-1">
                            {k.key}
                            {existing && (
                              <span className="ml-2 text-amber-500">
                                (will overwrite existing)
                              </span>
                            )}
                          </label>
                          <Input
                            placeholder={k.placeholder}
                            value={templateValues[k.key] || ""}
                            onChange={(e) =>
                              setTemplateValues((p) => ({
                                ...p,
                                [k.key]: e.target.value,
                              }))
                            }
                            className="font-mono text-sm"
                          />
                        </div>
                      );
                    })}
                    <Button
                      onClick={handleAddTemplate}
                      disabled={addingGateway}
                      className="w-full gap-2"
                    >
                      {addingGateway ? (
                        <>
                          <Spinner className="h-4 w-4" /> Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" /> Save{" "}
                          {GATEWAY_TEMPLATES[selectedTemplate].label}
                        </>
                      )}
                    </Button>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      or add single key
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      Key
                    </label>
                    <Input
                      placeholder="e.g. my_custom_key"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      Value
                    </label>
                    <textarea
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Enter value..."
                      className="w-full p-2 border rounded-md font-mono text-sm h-20 resize-none"
                    />
                  </div>
                  <Button
                    onClick={handleAddSingle}
                    disabled={addingGateway || !newKey.trim()}
                    className="gap-2"
                  >
                    {addingGateway ? (
                      <>
                        <Spinner className="h-4 w-4" /> Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" /> Add Key
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Settings</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {configs.length} keys configured across all gateways
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by key or value..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm
                ? "No configurations found matching your search"
                : "No configurations found. Add your first gateway above."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConfigs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {config.id}
                      </TableCell>
                      <TableCell className="font-medium font-mono text-sm">
                        {config.key}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {groupOf(config.key)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex items-center gap-2">
                          {maskValue(config.value, config.id, config.key)}
                          {isSensitive(config.key) &&
                            config.value &&
                            config.value !== "EMPTY" && (
                              <button
                                onClick={() => toggleReveal(config.id)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                {revealedKeys.has(config.id) ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </button>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {config.updated_at
                          ? new Date(config.updated_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Dialog
                            open={editingConfig?.id === config.id}
                            onOpenChange={(open) => {
                              if (!open) {
                                setEditingConfig(null);
                                setEditValue("");
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingConfig(config);
                                  setEditValue(config.value);
                                }}
                              >
                                <Edit className="h-3 w-3 mr-1" /> Edit
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Edit Configuration</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <label className="text-sm font-medium">
                                    Key
                                  </label>
                                  <div className="font-mono text-sm bg-slate-100 p-3 rounded mt-1">
                                    {editingConfig?.key}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Value
                                  </label>
                                  <textarea
                                    value={editValue}
                                    onChange={(e) =>
                                      setEditValue(e.target.value)
                                    }
                                    className="w-full mt-1 p-2 border rounded-md font-mono text-sm h-32 resize-none"
                                    placeholder="Enter value..."
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    onClick={handleSaveEdit}
                                    disabled={
                                      saving ||
                                      editValue === editingConfig?.value
                                    }
                                    className="gap-2"
                                  >
                                    {saving ? (
                                      <>
                                        <Spinner className="h-4 w-4" />{" "}
                                        Saving...
                                      </>
                                    ) : (
                                      <>
                                        <Save className="h-4 w-4" /> Save
                                        Changes
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setEditingConfig(null);
                                      setEditValue("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Dialog
                            open={deleteTarget?.id === config.id}
                            onOpenChange={(open) => {
                              if (!open) setDeleteTarget(null);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:border-red-300"
                                onClick={() => setDeleteTarget(config)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-sm">
                              <DialogHeader>
                                <DialogTitle>
                                  Delete Configuration Key
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                  Are you sure you want to permanently delete{" "}
                                  <span className="font-mono font-bold text-foreground">
                                    "{deleteTarget?.key}"
                                  </span>
                                  ? This cannot be undone.
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="gap-2"
                                  >
                                    {deleting ? (
                                      <>
                                        <Spinner className="h-4 w-4" />{" "}
                                        Deleting...
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 className="h-4 w-4" /> Delete
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => setDeleteTarget(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(GATEWAY_TEMPLATES).map(([gKey, tpl]) => {
          const filled = tpl.keys.filter((k) => {
            const cfg = configs.find((c) => c.key === k.key);
            return (
              cfg && cfg.value && cfg.value !== "EMPTY" && cfg.value !== ""
            );
          });
          const complete = filled.length === tpl.keys.length;
          const partial = filled.length > 0 && !complete;
          return (
            <Card
              key={gKey}
              className={`border-2 ${complete ? "border-green-200 bg-green-50" : partial ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}
            >
              <CardContent className="pt-4 pb-4">
                <p className="font-semibold text-sm">{tpl.label}</p>
                <p
                  className={`text-xs mt-1 ${complete ? "text-green-600" : partial ? "text-amber-600" : "text-slate-400"}`}
                >
                  {complete
                    ? "✓ Configured"
                    : partial
                      ? `${filled.length}/${tpl.keys.length} keys set`
                      : "Not configured"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
