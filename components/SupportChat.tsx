"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader2, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Message {
  id: string;
  body: string;
  is_admin: boolean;
  created_at: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  ticket_number?: string;
  user_email?: string;
}

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load or create support ticket when chat opens
  useEffect(() => {
    if (open && !ticketId) {
      initializeChat();
    }
  }, [open]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const initializeChat = async () => {
    try {
      setLoading(true);
      
      // Set 5-second timeout - if chat doesn't load, show fallback
      const timeoutId = setTimeout(() => {
        if (loading) {
          console.warn("[v0] Chat loading timeout - showing fallback");
          const fallbackMessage: Message = {
            id: "fallback",
            body: "Welcome to OmniTask Support! Please enter your email address to get started.",
            is_admin: true,
            created_at: new Date().toISOString(),
          };
          setMessages([fallbackMessage]);
          setIsGuest(true);
          setShowEmailForm(true);
          setLoading(false);
        }
      }, 5000);

      const { data: { user } } = await supabase.auth.getUser();
      clearTimeout(timeoutId);
      
      if (user) {
        // Authenticated user
        setIsGuest(false);
        
        // Check for existing ticket with timeout
        const { data: existingTicket, error: ticketError } = await supabase
          .from("support_tickets")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "open")
          .limit(1)
          .single()
          .timeout(3000);

        if (existingTicket && !ticketError) {
          setTicketId(existingTicket.id);
          setTicketNumber(existingTicket.id.substring(0, 8).toUpperCase());
          loadMessages(existingTicket.id);
        } else {
          // Create new ticket for authenticated user
          const { data: newTicket, error } = await supabase
            .from("support_tickets")
            .insert({
              user_id: user.id,
              subject: "Support Request",
              category: "general",
              status: "open",
              created_at: new Date().toISOString(),
            })
            .select("id")
            .single()
            .timeout(3000);

          if (error || !newTicket) {
            throw error || new Error("Failed to create ticket");
          }
          
          setTicketId(newTicket.id);
          setTicketNumber(newTicket.id.substring(0, 8).toUpperCase());
          
          const welcomeMessage: Message = {
            id: "welcome",
            body: `Your support ticket number is #${newTicket.id.substring(0, 8).toUpperCase()}. Please keep this number handy for future reference. Our team will respond within 2 hours.`,
            is_admin: true,
            created_at: new Date().toISOString(),
          };
          setMessages([welcomeMessage]);
        }
      } else {
        // Guest user - show email form
        setIsGuest(true);
        setShowEmailForm(true);
        
        const welcomeMessage: Message = {
          id: "welcome",
          body: "Welcome to OmniTask Support! Please enter your email address to get started.",
          is_admin: true,
          created_at: new Date().toISOString(),
        };
        setMessages([welcomeMessage]);
      }
    } catch (error) {
      console.error("[v0] Chat initialization error:", error);
      // Show fallback instead of closing
      const fallbackMessage: Message = {
        id: "fallback",
        body: "Welcome to OmniTask Support! Please enter your email address to get started.",
        is_admin: true,
        created_at: new Date().toISOString(),
      };
      setMessages([fallbackMessage]);
      setIsGuest(true);
      setShowEmailForm(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestEmailSubmit = async () => {
    if (!guestEmail.trim() || !guestEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    try {
      setLoading(true);
      
      // Create ticket for guest
      const { data: newTicket, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: null, // No user_id for guests
          guest_email: guestEmail,
          subject: "Guest Support Request",
          category: "general",
          status: "open",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;
      
      setTicketId(newTicket.id);
      setTicketNumber(newTicket.id.substring(0, 8).toUpperCase());
      setShowEmailForm(false);
      
      const welcomeMessage: Message = {
        id: "welcome",
        body: `Thanks for reaching out! Your support ticket number is #${newTicket.id.substring(0, 8).toUpperCase()}. We've sent a confirmation to ${guestEmail}. Our team will respond within 2 hours.`,
        is_admin: true,
        created_at: new Date().toISOString(),
      };
      setMessages([welcomeMessage]);
    } catch (error) {
      console.error("[v0] Failed to create guest ticket:", error);
      toast.error("Failed to create support ticket");
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (tId: string) => {
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", tId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("[v0] Failed to load messages:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !ticketId) return;

    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();

      // Insert message with sender_id (null for guest)
      const { error } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: ticketId,
          sender_id: user?.id || null,
          body: messageInput,
          is_admin: false,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;

      setMessageInput("");
      loadMessages(ticketId);
      toast.success("Message sent!");
    } catch (error) {
      console.error("[v0] Failed to send message:", error);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Chat Button - Fixed on right side */}
      <div className="fixed bottom-24 md:bottom-5 right-5 z-50">
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all bg-gradient-to-br from-emerald-500 to-emerald-600 hover:shadow-xl hover:scale-110"
          aria-label="Open support chat"
        >
          {open ? (
            <X size={24} className="text-white" />
          ) : (
            <MessageSquare size={24} className="text-white" />
          )}
        </button>
      </div>

      {/* Chat Window - Always on right side */}
      {open && (
        <div className="fixed bottom-32 right-5 md:bottom-20 md:right-5 w-96 max-w-[90vw] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col h-96 max-h-96 overflow-hidden z-50">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white p-4 rounded-t-lg flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-base">OmniTask Support</h3>
              {ticketNumber && (
                <span className="text-xs font-mono bg-emerald-700 px-2 py-1 rounded">
                  #{ticketNumber}
                </span>
              )}
            </div>
            <p className="text-sm opacity-90">Online · We reply within 2 hours</p>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={20} className="animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                <p>Start a conversation with our support team</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.is_admin ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                      msg.is_admin
                        ? "bg-gray-200 text-gray-800"
                        : "bg-emerald-500 text-white"
                    }`}
                  >
                    <p className="leading-relaxed">{msg.body}</p>
                    <p className={`text-xs mt-1 ${msg.is_admin ? "text-gray-600" : "text-emerald-100"}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Guest Email Form */}
          {showEmailForm && (
            <div className="border-t border-gray-200 p-4 space-y-3 flex-shrink-0 bg-gradient-to-r from-emerald-50 to-gray-50">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Mail size={16} /> Your Email
              </label>
              <input
                type="email"
                placeholder="Enter your email..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGuestEmailSubmit();
                  }
                }}
                disabled={loading}
              />
              <button
                onClick={handleGuestEmailSubmit}
                disabled={loading || !guestEmail.trim()}
                className="w-full bg-emerald-500 text-white px-3 py-2 rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Starting Chat...
                  </>
                ) : (
                  "Start Chat"
                )}
              </button>
            </div>
          )}

          {/* Input Area - Only show after guest email collected */}
          {!showEmailForm && (
            <div className="border-t border-gray-200 p-4 flex gap-2 flex-shrink-0 bg-white rounded-b-lg">
              <input
                type="text"
                placeholder="Type your message..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={sending}
              />
              <button
                onClick={handleSendMessage}
                disabled={sending || !messageInput.trim()}
                className="bg-emerald-500 text-white px-3 py-2 rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
