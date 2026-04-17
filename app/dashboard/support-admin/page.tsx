"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Send,
  Loader2,
  Check,
  CheckCheck,
  Search,
  X,
} from "lucide-react";

type Message = {
  id: string;
  message?: string | null;
  body?: string | null;
  is_admin: boolean;
  sender_id: string | null;
  image_url?: string | null;
  image_name?: string | null;
  seen: boolean;
  created_at: string;
};

type Ticket = {
  id: string;
  status: string;
  subject: string;
  guest_name?: string;
  guest_email?: string;
  user_id?: string;
  created_at: string;
  last_message_at: string;
};

function getText(msg: Message): string {
  return msg.message || msg.body || "";
}

export default function SupportAdminPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load all tickets
  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .in("status", ["open", "in_progress", "resolved", "closed"])
      .order("last_message_at", { ascending: false });

    if (!error && data) {
      setTickets(data);
    }
    setLoading(false);
  }

  // Load messages for selected ticket
  useEffect(() => {
    if (!selectedTicket) return;

    async function loadMessages() {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", selectedTicket.id)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data);
        
        // Mark messages as seen by admin
        await supabase
          .from("support_messages")
          .update({ seen: true })
          .eq("ticket_id", selectedTicket.id)
          .eq("is_admin", false);
      }

      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        150,
      );
    }

    loadMessages();

    // Subscribe to new messages for this ticket
    const ch = supabase
      .channel(`admin_support_${selectedTicket.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${selectedTicket.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedTicket]);

  async function sendReply() {
    if (!selectedTicket || !replyText.trim()) return;
    setSending(true);

    const { data, error } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: selectedTicket.id,
        sender_id: null,
        is_admin: true,
        message: replyText.trim(),
        seen: false,
      })
      .select();

    if (!error && data && data.length > 0) {
      setMessages((prev) => [...prev, data[0]]);
      
      // Update ticket last message time
      await supabase
        .from("support_tickets")
        .update({ 
          last_message_at: new Date().toISOString(),
          status: "in_progress"
        })
        .eq("id", selectedTicket.id);

      setReplyText("");
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
    }

    setSending(false);
  }

  async function updateTicketStatus(ticketId: string, status: string) {
    await supabase
      .from("support_tickets")
      .update({ status })
      .eq("id", ticketId);

    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({ ...selectedTicket, status });
    }

    loadTickets();
  }

  const filteredTickets = tickets.filter((t) =>
    searchQuery === ""
      ? true
      : t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.guest_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.guest_name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-black text-white mb-6">Support Admin</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tickets List */}
          <div className="lg:col-span-1 bg-slate-900 rounded-2xl border border-white/8 p-4 h-fit">
            <div className="mb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicket(ticket)}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    selectedTicket?.id === ticket.id
                      ? "bg-emerald-500/20 border border-emerald-500/50"
                      : "bg-slate-800/50 border border-slate-700/50 hover:border-slate-600"
                  }`}
                  style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-white font-bold text-sm truncate">
                      {ticket.guest_name || ticket.subject}
                    </p>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        ticket.status === "open"
                          ? "bg-red-500/20 text-red-300"
                          : ticket.status === "in_progress"
                            ? "bg-blue-500/20 text-blue-300"
                            : ticket.status === "resolved"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-slate-600/20 text-slate-300"
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mb-1 truncate">
                    {ticket.guest_email || "No email"}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {ticket.subject}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Chat View */}
          <div className="lg:col-span-2 bg-slate-900 rounded-2xl border border-white/8 overflow-hidden flex flex-col h-[70vh]">
            {selectedTicket ? (
              <>
                {/* Header */}
                <div className="bg-emerald-600/20 border-b border-white/8 p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-black text-base">
                        {selectedTicket.guest_name || "Guest"}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {selectedTicket.guest_email}
                      </p>
                      <p className="text-slate-500 text-xs mt-1">
                        Ticket: #{selectedTicket.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    <select
                      value={selectedTicket.status}
                      onChange={(e) =>
                        updateTicketStatus(selectedTicket.id, e.target.value)
                      }
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2
                        size={20}
                        className="text-emerald-400 animate-spin"
                      />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      No messages yet
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.is_admin ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div className={`max-w-[75%] space-y-1`}>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                              msg.is_admin
                                ? "rounded-tr-sm bg-emerald-600/20 border border-emerald-500/30 text-emerald-100"
                                : "rounded-tl-sm bg-slate-800/60 border border-slate-700/50 text-slate-100"
                            }`}
                          >
                            {getText(msg)}
                          </div>
                          {msg.image_url && (
                            <a
                              href={msg.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg overflow-hidden border border-slate-700"
                            >
                              <img
                                src={msg.image_url}
                                alt={msg.image_name || "Attachment"}
                                className="max-h-48 w-full object-cover"
                              />
                            </a>
                          )}
                          <div
                            className={`flex items-center gap-1 text-[10px] text-slate-600 ${
                              msg.is_admin ? "justify-end" : "justify-start"
                            }`}
                          >
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString(
                                "en",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                            {msg.is_admin && msg.seen && (
                              <CheckCheck size={10} className="text-emerald-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Input */}
                <div className="border-t border-slate-800/50 p-4 shrink-0">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendReply();
                        }
                      }}
                      placeholder="Type your reply..."
                      rows={2}
                      className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                      style={{ maxHeight: "80px" }}
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                      className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shrink-0"
                      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent", minHeight: "44px", minWidth: "44px", pointerEvents: "auto" }}
                    >
                      {sending ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                <p>Select a ticket to view messages</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
