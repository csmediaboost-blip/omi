"use client";
// app/admin/support-tickets/page.tsx

import { useEffect, useRef, useState } from "react";
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
import {
  FileText,
  Image as ImageIcon,
  Paperclip,
  Download,
} from "lucide-react";

interface SupportTicket {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  is_admin: boolean;
  created_at: string;
  delivery_status?: string;
  delivered_at?: string;
  image_url?: string | null;
  image_name?: string | null;
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingTicket, setEditingTicket] = useState<SupportTicket | null>(null);
  const [editValues, setEditValues] = useState<Partial<SupportTicket>>({});
  const [viewingTicket, setViewingTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [ticketsWithNewMessages, setTicketsWithNewMessages] = useState<Set<string>>(new Set());
  const [adminAttachmentFile, setAdminAttachmentFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep a ref to the currently viewed ticket id so the realtime callback
  // (which closes over a stale value) can always read the latest value.
  const viewingTicketIdRef = useRef<string | null>(null);
  useEffect(() => {
    viewingTicketIdRef.current = viewingTicket?.id ?? null;
  }, [viewingTicket]);

  useEffect(() => {
    fetchTickets();
  }, [filterStatus]);

  // Auto-scroll when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Global realtime: flag new user messages across all tickets
  // FIX: Previously every INSERT — including messages on the ticket the admin
  // has open — was added to ticketsWithNewMessages, causing the dot to flash
  // on tickets the admin is actively reading. We now skip notification if the
  // message belongs to the ticket currently open in the dialog.
  useEffect(() => {
    const channel = supabase
      .channel("admin_support_messages_watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const msg = payload.new as TicketMessage;
          const currentlyViewingId = viewingTicketIdRef.current;

          if (!msg.is_admin) {
            // Only show the "new message" dot if the admin is NOT already
            // looking at this ticket.
            if (msg.ticket_id !== currentlyViewingId) {
              setTicketsWithNewMessages((prev) =>
                new Set(prev).add(msg.ticket_id),
              );
            }
          }

          // If admin has this ticket open, append the message live
          if (currentlyViewingId && currentlyViewingId === msg.ticket_id) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // empty deps — viewingTicketIdRef is always current via the effect above

  const fetchTickets = async () => {
    try {
      setLoading(true);
      let query = supabase.from("support_tickets").select("*");
      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) {
        toast.error("Failed to fetch support tickets: " + error.message);
        return;
      }
      setTickets(data || []);
    } catch {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (ticketId: string) => {
    try {
      const res = await fetch(
        `/api/admin/support-messages?ticketId=${ticketId}`,
      );
      const result = await res.json();
      if (!res.ok || !result.success) {
        console.error("[Admin] fetchMessages error:", result.error);
        toast.error(
          "Could not load messages: " + (result.error || "Unknown error"),
        );
        return;
      }
      setMessages(result.messages || []);
    } catch (err) {
      console.error("[Admin] fetchMessages exception:", err);
      toast.error("Could not load messages");
    }
  };

  const handleViewMessages = async (ticket: SupportTicket) => {
    setViewingTicket(ticket);
    // Clear the "new message" dot as soon as admin opens the ticket
    setTicketsWithNewMessages((prev) => {
      const next = new Set(prev);
      next.delete(ticket.id);
      return next;
    });
    await fetchMessages(ticket.id);
  };

  // Upload admin attachment via Supabase JS client (admin is authenticated)
  const uploadAdminAttachment = async (
    file: File,
    ticketId: string,
  ): Promise<{ url: string; name: string } | null> => {
    try {
      setUploadingFile(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${ticketId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("support-attachments")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("support-attachments")
        .getPublicUrl(path);
      return { url: urlData.publicUrl, name: file.name };
    } catch (err) {
      console.error("[Admin] upload error:", err);
      toast.error("Failed to upload file");
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !adminAttachmentFile) || !viewingTicket) return;

    try {
      setSendingMessage(true);

      let attachment: { url: string; name: string } | null = null;
      if (adminAttachmentFile) {
        attachment = await uploadAdminAttachment(
          adminAttachmentFile,
          viewingTicket.id,
        );
        if (!attachment) {
          setSendingMessage(false);
          return;
        }
      }

      const res = await fetch("/api/admin/support-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: viewingTicket.id,
          body: newMessage.trim() || (attachment ? `[File: ${attachment.name}]` : ""),
          image_url: attachment?.url || null,
          image_name: attachment?.name || null,
        }),
      });

      let result: { success?: boolean; error?: string } = {};
      try {
        result = await res.json();
      } catch {
        toast.error("Server returned invalid response");
        return;
      }

      if (!res.ok || !result.success) {
        toast.error("Failed to send: " + (result.error || "Unknown error"));
        return;
      }

      toast.success("Message sent");
      setNewMessage("");
      setAdminAttachmentFile(null);
      if (adminFileInputRef.current) adminFileInputRef.current.value = "";

      setTimeout(() => fetchMessages(viewingTicket.id), 300);

      if (viewingTicket.status === "open") {
        await supabase
          .from("support_tickets")
          .update({
            status: "in_progress",
            updated_at: new Date().toISOString(),
          })
          .eq("id", viewingTicket.id);
        setViewingTicket({ ...viewingTicket, status: "in_progress" });
        fetchTickets();
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleEditClick = (ticket: SupportTicket) => {
    setEditingTicket(ticket);
    setEditValues(ticket);
  };

  const handleSaveEdit = async () => {
    if (!editingTicket) return;
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ ...editValues, updated_at: new Date().toISOString() })
        .eq("id", editingTicket.id);
      if (error) {
        toast.error("Failed to update ticket: " + error.message);
        return;
      }
      toast.success("Ticket updated");
      setEditingTicket(null);
      setEditValues({});
      fetchTickets();
    } catch {
      toast.error("An error occurred");
    }
  };

  const filteredTickets = tickets.filter(
    (t) =>
      (t.subject?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (t.category?.toLowerCase() || "").includes(searchTerm.toLowerCase()),
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "in_progress":
        return "bg-amber-100 text-amber-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const isImageFile = (name?: string | null) =>
    name ? /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name) : false;

  return (
    <AdminLayout>
      <div className="space-y-6 bg-white">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Support Tickets
          </h1>
          <p className="text-gray-500 mt-1">
            Manage and respond to customer support tickets
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tickets ({filteredTickets.length})</CardTitle>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Search by subject or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : filteredTickets.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No tickets found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {ticket.subject || "N/A"}
                        </TableCell>
                        <TableCell>{ticket.category || "N/A"}</TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-bold px-2 py-1 rounded-full ${statusColor(ticket.status)}`}
                          >
                            {(ticket.status || "unknown")
                              .replace("_", " ")
                              .toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell>{ticket.priority || "normal"}</TableCell>
                        <TableCell className="text-sm text-gray-400">
                          {ticket.created_at
                            ? new Date(ticket.created_at).toLocaleDateString()
                            : "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewMessages(ticket)}
                              className="relative"
                            >
                              Messages
                              {ticketsWithNewMessages.has(ticket.id) && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                              )}
                            </Button>

                            <Dialog
                              open={editingTicket?.id === ticket.id}
                              onOpenChange={(open) => {
                                if (!open) {
                                  setEditingTicket(null);
                                  setEditValues({});
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditClick(ticket)}
                                >
                                  Edit
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Edit Ticket</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <label className="text-sm font-medium">
                                      Subject
                                    </label>
                                    <Input
                                      value={editValues.subject || ""}
                                      onChange={(e) =>
                                        setEditValues({
                                          ...editValues,
                                          subject: e.target.value,
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
                                      <option value="open">Open</option>
                                      <option value="in_progress">
                                        In Progress
                                      </option>
                                      <option value="resolved">Resolved</option>
                                      <option value="closed">Closed</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">
                                      Priority
                                    </label>
                                    <select
                                      value={editValues.priority || ""}
                                      onChange={(e) =>
                                        setEditValues({
                                          ...editValues,
                                          priority: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-2 border rounded-md"
                                    >
                                      <option value="low">Low</option>
                                      <option value="normal">Normal</option>
                                      <option value="high">High</option>
                                      <option value="critical">Critical</option>
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

        {/* Messages Dialog */}
        <Dialog
          open={!!viewingTicket}
          onOpenChange={(open) => {
            if (!open) {
              setViewingTicket(null);
              setMessages([]);
              setNewMessage("");
              setAdminAttachmentFile(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl">
            {/* Dialog Header */}
            <DialogHeader className="px-6 py-4 border-b bg-white flex-shrink-0">
              <DialogTitle className="flex items-center gap-3 text-gray-900">
                <span className="truncate">{viewingTicket?.subject}</span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${statusColor(viewingTicket?.status || "")}`}
                >
                  {(viewingTicket?.status || "")
                    .replace("_", " ")
                    .toUpperCase()}
                </span>
              </DialogTitle>
              {viewingTicket?.guest_email && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Guest: {viewingTicket.guest_email}
                </p>
              )}
            </DialogHeader>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 min-h-[300px]">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  No messages yet — be the first to respond.
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.is_admin ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        msg.is_admin
                          ? "bg-emerald-600 text-white rounded-br-sm"
                          : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                      }`}
                    >
                      {/* Sender label */}
                      <p
                        className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${msg.is_admin ? "text-emerald-200" : "text-gray-400"}`}
                      >
                        {msg.is_admin ? "Admin Reply" : "User"}
                      </p>

                      {/* Attachment */}
                      {msg.image_url && (
                        <div className="mb-2">
                          {isImageFile(msg.image_name) ? (
                            <a
                              href={msg.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={msg.image_url}
                                alt={msg.image_name || "attachment"}
                                className="rounded-xl max-h-52 w-auto cursor-pointer hover:opacity-90 transition-opacity border border-white/20"
                              />
                            </a>
                          ) : (
                            <a
                              href={msg.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={msg.image_name || undefined}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                msg.is_admin
                                  ? "bg-emerald-700 text-white hover:bg-emerald-800"
                                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                              }`}
                            >
                              <Download size={13} />
                              <span className="truncate max-w-[200px]">
                                {msg.image_name || "Download file"}
                              </span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Body */}
                      {msg.body &&
                        !(msg.image_url && msg.body.startsWith("[File:")) && (
                          <p className="leading-relaxed break-words">
                            {msg.body}
                          </p>
                        )}

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2 gap-3">
                        <p
                          className={`text-[10px] ${msg.is_admin ? "text-emerald-200" : "text-gray-400"}`}
                        >
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                        {msg.is_admin && (
                          <div className="flex items-center gap-1.5">
                            {msg.delivery_status === "delivered" ? (
                              <>
                                <span className="w-1.5 h-1.5 bg-green-300 rounded-full inline-block" />
                                <span className="text-[10px] text-emerald-200 font-semibold">
                                  Delivered
                                </span>
                              </>
                            ) : msg.delivery_status === "failed" ? (
                              <>
                                <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />
                                <span className="text-[10px] text-red-200 font-semibold">
                                  Failed
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 bg-yellow-300 rounded-full inline-block animate-pulse" />
                                <span className="text-[10px] text-emerald-200 font-semibold">
                                  Sending…
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Admin attachment preview */}
            {adminAttachmentFile && (
              <div className="flex items-center gap-2 px-5 py-2 bg-emerald-50 border-t border-emerald-100 text-xs text-emerald-700 flex-shrink-0">
                {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(
                  adminAttachmentFile.name,
                ) ? (
                  <ImageIcon size={13} />
                ) : (
                  <FileText size={13} />
                )}
                <span className="truncate flex-1 font-medium">
                  {adminAttachmentFile.name}
                </span>
                <button
                  onClick={() => {
                    setAdminAttachmentFile(null);
                    if (adminFileInputRef.current)
                      adminFileInputRef.current.value = "";
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2 px-5 py-4 border-t bg-white flex-shrink-0">
              <input
                ref={adminFileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 10 * 1024 * 1024) {
                      toast.error("File must be under 10 MB");
                      return;
                    }
                    setAdminAttachmentFile(f);
                  }
                }}
              />
              <button
                onClick={() => adminFileInputRef.current?.click()}
                className="text-gray-400 hover:text-emerald-600 transition-colors p-2 flex-shrink-0"
                title="Attach file"
                disabled={sendingMessage || uploadingFile}
              >
                <Paperclip size={18} />
              </button>
              <Input
                placeholder="Type your reply..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="flex-1"
                disabled={sendingMessage || uploadingFile}
              />
              <Button
                onClick={handleSendMessage}
                disabled={
                  sendingMessage ||
                  uploadingFile ||
                  (!newMessage.trim() && !adminAttachmentFile)
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sendingMessage || uploadingFile ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}