"use client";
// app/admin/support-tickets/page.tsx
// FIXED:
// 1. Messages table changed from "support_ticket_messages" → "support_messages" (actual table)
// 2. Message insert uses correct column "body" not "message", and "is_admin: true"
// 3. Uses supabaseAdmin (service role) via API route to bypass RLS for sending messages

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

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

// Matches the actual support_messages table schema
// (same table used by the user-facing gpu-plans page)
interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string; // ← actual column name is "body"
  is_admin: boolean; // ← actual column name
  created_at: string;
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingTicket, setEditingTicket] = useState<SupportTicket | null>(
    null,
  );
  const [editValues, setEditValues] = useState<Partial<SupportTicket>>({});
  const [viewingTicket, setViewingTicket] = useState<SupportTicket | null>(
    null,
  );
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [filterStatus]);

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
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // ── Load messages from the CORRECT table: support_messages ───────────────
  const fetchMessages = async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from("support_messages") // ← FIXED: was "support_ticket_messages"
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        toast.error("Could not load messages: " + error.message);
        return;
      }
      setMessages(data || []);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleViewMessages = async (ticket: SupportTicket) => {
    setViewingTicket(ticket);
    await fetchMessages(ticket.id);
  };

  // ── Send message via admin API route (bypasses RLS) ─────────────────────
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !viewingTicket) return;

    try {
      setSendingMessage(true);

      // Call the admin API route which uses the service role key
      const res = await fetch("/api/admin/support-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: viewingTicket.id,
          body: newMessage.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(
          "Failed to send message: " + (result.error || "Unknown error"),
        );
        return;
      }

      toast.success("Message sent");
      setNewMessage("");
      await fetchMessages(viewingTicket.id);

      // Update ticket status to in_progress if it was open
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
    } catch (error) {
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
    (ticket) =>
      (ticket.subject?.toLowerCase() || "").includes(
        searchTerm.toLowerCase(),
      ) ||
      (ticket.category?.toLowerCase() || "").includes(searchTerm.toLowerCase()),
  );

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "open":
        return "default";
      case "in_progress":
        return "secondary";
      case "resolved":
        return "outline";
      default:
        return "secondary";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "in_progress":
        return "bg-amber-100 text-amber-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 bg-white">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Support Tickets</h1>
          <p className="text-gray-600 mt-1">
            Manage customer support tickets
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
              className="px-3 py-2 border rounded-md"
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
            <p className="text-center text-muted-foreground py-8">
              No tickets found
            </p>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {ticket.created_at
                          ? new Date(ticket.created_at).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {/* Messages button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewMessages(ticket)}
                          >
                            Messages
                          </Button>

                          {/* Edit dialog */}
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
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingTicket?.subject}
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor(viewingTicket?.status || "")}`}
              >
                {(viewingTicket?.status || "").replace("_", " ").toUpperCase()}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 mb-4 border rounded-lg p-4 min-h-[200px]">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No messages yet — be the first to respond.
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.is_admin ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.is_admin
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    <p className="text-[10px] font-bold mb-0.5 opacity-70">
                      {msg.is_admin ? "Admin" : "User"}
                    </p>
                    <p className="leading-relaxed">{msg.body}</p>
                    <p className="text-[10px] mt-1 opacity-60">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
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
            />
            <Button
              onClick={handleSendMessage}
              disabled={sendingMessage || !newMessage.trim()}
            >
              {sendingMessage ? <Spinner className="h-4 w-4" /> : "Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
