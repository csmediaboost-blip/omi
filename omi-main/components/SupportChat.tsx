"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Mail,
  Paperclip,
  FileText,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Message {
  id: string;
  body: string;
  is_admin: boolean;
  created_at: string;
  image_url?: string | null;
  image_name?: string | null;
}

// Key used to persist the active ticket so a page refresh (or reopening the
// widget) reattaches to the same conversation instead of creating a new
// ticket / re-prompting for an email every time.
const STORAGE_KEY = "omnitask_support_ticket_id";

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
  const [initialized, setInitialized] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initStarted = useRef(false);

  useEffect(() => {
    if (open && !initialized && !initStarted.current) {
      initStarted.current = true;
      initializeChat();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime: listen for new messages on this ticket
  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`ticket_messages_${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  const addSystemMessage = (body: string): Message => ({
    id: `sys_${Date.now()}`,
    body,
    is_admin: true,
    created_at: new Date().toISOString(),
  });

  const persistTicketId = (id: string | null) => {
    if (typeof window === "undefined") return;
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable (private mode etc.) — fail silently,
      // chat will just not persist across refreshes
    }
  };

  const getStoredTicketId = (): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const initializeChat = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // 1) Reattach to a previously-saved ticket (covers both guests and
      // logged-in users refreshing the page mid-conversation).
      const savedTicketId = getStoredTicketId();
      if (savedTicketId) {
        const { data: existing } = await supabase
          .from("support_tickets")
          .select("id, status")
          .eq("id", savedTicketId)
          .maybeSingle();

        if (
          existing &&
          existing.status !== "closed" &&
          existing.status !== "resolved"
        ) {
          setTicketId(existing.id);
          setTicketNumber(existing.id.substring(0, 8).toUpperCase());
          await loadMessages(existing.id);
          setLoading(false);
          setInitialized(true);
          return;
        }

        // Saved ticket no longer valid — clear it and fall through to
        // normal init below (creates a fresh ticket).
        persistTicketId(null);
      }

      if (session?.user) {
        const user = session.user;
        const { data: existing } = await supabase
          .from("support_tickets")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          setTicketId(existing.id);
          setTicketNumber(existing.id.substring(0, 8).toUpperCase());
          persistTicketId(existing.id);
          await loadMessages(existing.id);
        } else {
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
            .single();
          if (error || !newTicket)
            throw error || new Error("Ticket creation failed");
          setTicketId(newTicket.id);
          setTicketNumber(newTicket.id.substring(0, 8).toUpperCase());
          persistTicketId(newTicket.id);
          setMessages([
            addSystemMessage(
              `Your support ticket #${newTicket.id.substring(0, 8).toUpperCase()} has been created. Our team will respond within 2 hours.`,
            ),
          ]);
        }
      } else {
        setShowEmailForm(true);
        setMessages([
          addSystemMessage(
            "Welcome to OmniTask Support! Please enter your email address to get started.",
          ),
        ]);
      }
    } catch (err) {
      console.error("[SupportChat] init error:", err);
      setShowEmailForm(true);
      setMessages([
        addSystemMessage(
          "Welcome! Please enter your email to start a support conversation.",
        ),
      ]);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  };

  const handleGuestEmailSubmit = async () => {
    if (!guestEmail.trim() || !guestEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const { data: newTicket, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: null,
          guest_email: guestEmail.trim(),
          subject: "Guest Support Request",
          category: "general",
          status: "open",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !newTicket)
        throw error || new Error("Failed to create ticket");
      setTicketId(newTicket.id);
      setTicketNumber(newTicket.id.substring(0, 8).toUpperCase());
      persistTicketId(newTicket.id);
      setShowEmailForm(false);
      setMessages([
        addSystemMessage(
          `Thanks for reaching out! Your ticket #${newTicket.id.substring(0, 8).toUpperCase()} has been created. We'll reply to ${guestEmail.trim()} within 2 hours.`,
        ),
      ]);
    } catch (err) {
      console.error("[SupportChat] guest ticket error:", err);
      toast.error("Failed to create support ticket. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (tId: string) => {
    const { data, error } = await supabase
      .from("support_messages")
      .select("id, body, is_admin, created_at, image_url, image_name")
      .eq("ticket_id", tId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[SupportChat] loadMessages error:", error);
      return;
    }
    setMessages(data || []);
  };

  // Upload via server-side API route — avoids mobile auth/CORS stalls with Supabase Storage
  const uploadAttachment = async (
    file: File,
    currentTicketId: string,
  ): Promise<{ url: string; name: string } | null> => {
    try {
      setUploadingFile(true);

      // 30-second hard timeout so it never hangs forever on mobile
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("ticketId", currentTicketId);

      const res = await fetch("/api/support/upload-attachment", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const { url, name } = await res.json();
      return { url, name };
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error("[SupportChat] upload error:", err);
      toast.error(
        isAbort
          ? "Upload timed out. Please try again."
          : "Failed to upload file. Please try again.",
      );
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendMessage = async () => {
    const currentTicketId = ticketId;
    if ((!messageInput.trim() && !attachmentFile) || !currentTicketId) return;

    setSending(true);
    const body = messageInput.trim();
    const fileToSend = attachmentFile;

    // Clear inputs immediately for instant feedback
    setMessageInput("");
    setAttachmentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      let imageUrl: string | null = null;
      let imageName: string | null = null;

      // Step 1: upload file if present
      if (fileToSend) {
        const uploaded = await uploadAttachment(fileToSend, currentTicketId);
        if (!uploaded) {
          setSending(false);
          return;
        }
        imageUrl = uploaded.url;
        imageName = uploaded.name;
      }

      // Step 2: send message via server API (service role bypasses RLS for guests too)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch("/api/support/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: currentTicketId,
          body: body || (imageName ? `[File: ${imageName}]` : ""),
          image_url: imageUrl,
          image_name: imageName,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Send failed");
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error("[SupportChat] send error:", err);
      toast.error(
        isAbort
          ? "Send timed out. Please try again."
          : "Failed to send message. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const isImage = (name?: string | null) => {
    if (!name) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg|heic|heif)$/i.test(name);
  };

  return (
    <>
      {/* Floating button */}
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

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-32 right-5 md:bottom-20 md:right-5 w-96 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col h-[480px] overflow-hidden z-50">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="font-bold text-base">OmniTask Support</h3>
              {ticketNumber && (
                <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded-full">
                  #{ticketNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-100">
              🟢 Online · We reply within 2 hours
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <Loader2 size={24} className="animate-spin text-emerald-500" />
                <span className="text-sm text-gray-400">Connecting...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                <p>Start a conversation with our team</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.is_admin ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      msg.is_admin
                        ? "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
                        : "bg-emerald-600 text-white rounded-tr-sm"
                    }`}
                  >
                    {/* Image/file attachment */}
                    {msg.image_url && (
                      <div className="mb-2">
                        {isImage(msg.image_name) ? (
                          <AttachmentImage
                            url={msg.image_url}
                            name={msg.image_name}
                            isAdmin={msg.is_admin}
                          />
                        ) : (
                          <a
                            href={msg.image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              msg.is_admin
                                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                : "bg-emerald-700 text-white hover:bg-emerald-800"
                            }`}
                          >
                            <FileText size={14} />
                            <span className="truncate max-w-[180px]">
                              {msg.image_name || "Download file"}
                            </span>
                          </a>
                        )}
                      </div>
                    )}
                    {/* Body text — hide auto-generated [File: ...] label */}
                    {msg.body &&
                      !(msg.image_url && msg.body.startsWith("[File:")) && (
                        <p className="leading-relaxed">{msg.body}</p>
                      )}
                    <p
                      className={`text-[10px] mt-1 ${msg.is_admin ? "text-gray-400" : "text-emerald-200"}`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Guest email form */}
          {showEmailForm && (
            <div className="border-t border-gray-200 p-4 space-y-3 flex-shrink-0 bg-white">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Mail size={15} /> Your Email Address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm text-gray-800"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGuestEmailSubmit();
                  }
                }}
                disabled={loading}
                autoFocus
              />
              <button
                onClick={handleGuestEmailSubmit}
                disabled={loading || !guestEmail.trim()}
                className="w-full bg-emerald-600 text-white px-3 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Start Chat →"
                )}
              </button>
            </div>
          )}

          {/* Input area */}
          {!showEmailForm && (
            <div className="border-t border-gray-200 bg-white flex-shrink-0">
              {/* Attachment preview */}
              {attachmentFile && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-700">
                  {isImage(attachmentFile.name) ? (
                    <ImageIcon size={13} />
                  ) : (
                    <FileText size={13} />
                  )}
                  <span className="truncate flex-1 font-medium">
                    {attachmentFile.name}
                  </span>
                  <button
                    onClick={() => {
                      setAttachmentFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 p-3">
                <input
                  ref={fileInputRef}
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
                      setAttachmentFile(f);
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-400 hover:text-emerald-600 transition-colors p-1 flex-shrink-0"
                  title="Attach file (max 10 MB)"
                  disabled={sending || uploadingFile}
                >
                  <Paperclip size={18} />
                </button>
                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 px-3 py-2 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm text-gray-800 placeholder-gray-400"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={sending || uploadingFile}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={
                    sending ||
                    uploadingFile ||
                    (!messageInput.trim() && !attachmentFile)
                  }
                  className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending || uploadingFile ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Helper component: handles broken image URLs gracefully ────────────────
// Previously a broken/unauthorized image_url would just sit as a perpetually
// "loading" broken <img> with no feedback. This shows a fallback download
// link if the image fails to load (e.g. private bucket, deleted file).
function AttachmentImage({
  url,
  name,
  isAdmin,
}: {
  url: string;
  name?: string | null;
  isAdmin: boolean;
}) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
          isAdmin
            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
            : "bg-emerald-700 text-white hover:bg-emerald-800"
        }`}
      >
        <AlertCircle size={14} />
        <span className="truncate max-w-[180px]">
          {name || "Image unavailable — click to open"}
        </span>
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt={name || "image"}
        className="rounded-xl max-h-40 w-auto cursor-pointer hover:opacity-90 transition-opacity"
        onError={() => setErrored(true)}
      />
    </a>
  );
}
