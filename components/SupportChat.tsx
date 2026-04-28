"use client";
// components/SupportChat.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  MessageSquare,
  X,
  Send,
  Paperclip,
  Image as ImageIcon,
  ChevronDown,
  Loader2,
  Check,
  CheckCheck,
  Headphones,
  GripVertical,
} from "lucide-react";

type Message = {
  id: string;
  message: string | null;
  body: string | null;
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
  created_at: string;
};

function getText(msg: Message): string {
  return msg.message || msg.body || "";
}

const QUICK_TOPICS = [
  "Payment not confirmed",
  "Withdrawal issue",
  "KYC verification",
  "GPU plan question",
  "Account access problem",
  "Other",
];

const GUEST_KEY = "omnitask_support_ticket_id";

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"start" | "form" | "chat">("start");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ─── POSITION ──────────────────────────────────────────────────
  // We don't set position until after mount so we can read window.innerWidth.
  // Until then, render nothing (avoids SSR mismatch AND the flash to right: 20).
  const [position, setPosition] = useState<{
    bottom: number;
    right: number;
  } | null>(null);

  useEffect(() => {
    // Mobile (< 768px): position on the right, above the mobile nav
    // Mobile nav is 64px tall, add safe-area-inset-bottom (usually 0-20px)
    // Button is 56px (w-14), so position it 12px from right edge
    // Desktop: bottom-right corner
    if (window.innerWidth < 768) {
      const safeAreaBottom = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "env(safe-area-inset-bottom)"
        ) || "0"
      );
      // Bottom position: 64px (nav height) + 12px (spacing) + safe area
      const bottomPos = 64 + 12 + safeAreaBottom;
      setPosition({ bottom: bottomPos, right: 12 });
    } else {
      setPosition({ bottom: 20, right: 20 });
    }
  }, []);

  // ─── DRAG STATE ────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const chatButtonRef = useRef<HTMLDivElement>(null);

  // Track drag distance to distinguish tap (<6px) from drag (≥6px)
  const dragStartPos = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);

  const scrollBottom = useCallback(() => {
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      150,
    );
  }, []);

  const loadMessages = useCallback(
    async (ticketId: string) => {
      setLoading(true);
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      setMessages((data || []) as Message[]);
      setLoading(false);
      scrollBottom();
    },
    [scrollBottom],
  );

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email || "");
        setFormEmail(user.email || "");
        const { data: p } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        if (p?.full_name) {
          setUserName(p.full_name);
          setFormName(p.full_name);
        }
        const { data: t } = await supabase
          .from("support_tickets")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (t) {
          setTicket(t);
          setStage("chat");
          await loadMessages(t.id);
          return;
        }
      }
      try {
        const sid = localStorage.getItem(GUEST_KEY);
        if (sid) {
          const { data: t } = await supabase
            .from("support_tickets")
            .select("*")
            .eq("id", sid)
            .maybeSingle();
          if (t && ["open", "in_progress"].includes(t.status)) {
            setTicket(t);
            setStage("chat");
            await loadMessages(t.id);
            return;
          } else {
            localStorage.removeItem(GUEST_KEY);
          }
        }
      } catch {
        /* ignore */
      }
    }
    init();
  }, [loadMessages]);

  useEffect(() => {
    if (!ticket) return;
    const ch = supabase
      .channel(`sc_${ticket.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${ticket.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            prev.find((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
          if (msg.is_admin && !open) setUnreadCount((c) => c + 1);
          scrollBottom();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ticket, open, scrollBottom]);

  useEffect(() => {
    if (open) setUnreadCount(0);
  }, [open]);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5242880) {
      alert("Image must be under 5MB");
      return;
    }
    setImageFile(file);
    const r = new FileReader();
    r.onload = (ev) => setImagePreview(ev.target?.result as string);
    r.readAsDataURL(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadImage(file: File) {
    try {
      const ext = file.name.split(".").pop();
      const path = `support/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("support-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) return null;
      return {
        url: supabase.storage.from("support-images").getPublicUrl(path).data
          .publicUrl,
        name: file.name,
      };
    } catch {
      return null;
    }
  }

  async function insertMessage(
    ticketId: string,
    msgText: string,
    isAdmin: boolean,
    senderId: string | null,
    imgUrl?: string | null,
    imgName?: string | null,
  ) {
    return supabase
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        sender_id: senderId,
        is_admin: isAdmin,
        message: msgText,
        body: msgText,
        image_url: imgUrl ?? null,
        image_name: imgName ?? null,
        seen: false,
      })
      .select()
      .single();
  }

  async function handleStartChat() {
    if (!formTopic) {
      alert("Please select a topic");
      return;
    }
    if (!formMessage.trim()) {
      alert("Please describe your issue");
      return;
    }
    const name = formName.trim() || userName || "User";
    const email = formEmail.trim() || userEmail;
    setLoading(true);

    const { data: newTicket, error: ticketErr } = await supabase
      .from("support_tickets")
      .insert({
        user_id: userId || null,
        guest_name: name,
        guest_email: email,
        subject: formTopic,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (ticketErr || !newTicket) {
      alert("Failed to create ticket.");
      setLoading(false);
      return;
    }
    try {
      localStorage.setItem(GUEST_KEY, newTicket.id);
    } catch {
      /* ignore */
    }

    let imgUrl = null,
      imgName = null;
    if (imageFile) {
      setUploading(true);
      const r = await uploadImage(imageFile);
      if (r) {
        imgUrl = r.url;
        imgName = r.name;
      }
      setUploading(false);
    }

    await insertMessage(
      newTicket.id,
      `[${formTopic}]\n${formMessage.trim()}`,
      false,
      userId,
      imgUrl,
      imgName,
    );

    const reply = `Hi ${name}! 👋 Thanks for reaching out about "${formTopic}". Our support team will respond within 2 hours (09:00–18:00 UTC). Ticket ID: #${newTicket.id.slice(0, 8).toUpperCase()}.`;
    await insertMessage(newTicket.id, reply, true, null);

    setTicket(newTicket);
    setStage("chat");
    removeImage();
    setLoading(false);
    await loadMessages(newTicket.id);
  }

  async function sendMessage() {
    if (!ticket || (!text.trim() && !imageFile)) return;
    setSending(true);
    let imgUrl = null,
      imgName = null;
    if (imageFile) {
      setUploading(true);
      const r = await uploadImage(imageFile);
      if (r) {
        imgUrl = r.url;
        imgName = r.name;
      }
      setUploading(false);
    }
    const msgText =
      text.trim() ||
      (imgName ? `Sent an image: ${imgName}` : "📎 Image attached");
    const { data: nm, error } = await insertMessage(
      ticket.id,
      msgText,
      false,
      userId,
      imgUrl,
      imgName,
    );
    if (!error && nm) {
      setMessages((prev) =>
        prev.find((m) => m.id === nm.id) ? prev : [...prev, nm as Message],
      );
      await supabase
        .from("support_tickets")
        .update({ last_message_at: new Date().toISOString(), status: "open" })
        .eq("id", ticket.id);
      setText("");
      removeImage();
      scrollBottom();
    } else {
      alert("Failed to send. Please try again.");
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ─── DRAG HANDLERS ─────────────────────────────────────────────
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("button, textarea, input, a")) return;
    setIsDragging(true);
    didDrag.current = false;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartPos.current = { x: clientX, y: clientY };
    if (chatButtonRef.current) {
      const rect = chatButtonRef.current.getBoundingClientRect();
      setDragOffset({ x: clientX - rect.left, y: clientY - rect.top });
    }
  };

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const clientX = e instanceof TouchEvent ? e.touches[0].clientX : e.clientX;
    const clientY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
    const dx = clientX - dragStartPos.current.x;
    const dy = clientY - dragStartPos.current.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) didDrag.current = true;
    const newRight = window.innerWidth - clientX + dragOffset.x;
    const newBottom = window.innerHeight - clientY + dragOffset.y;
    setPosition({
      bottom: Math.max(0, Math.min(newBottom, window.innerHeight - 100)),
      right: Math.max(0, Math.min(newRight, window.innerWidth - 56)),
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (!didDrag.current) setOpen((v) => !v);
    didDrag.current = false;
  };

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("touchend", handleDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDragging, dragOffset]);

  const tapStyle = {
    WebkitTapHighlightColor: "transparent",
    outline: "none",
  } as React.CSSProperties;

  // ── Don't render at all until position is known (avoids flash to wrong corner)
  if (!position) return null;

  return (
    <>
      <div
        ref={chatButtonRef}
        className="fixed z-50 flex flex-col items-end gap-2"
        style={{
          bottom: `${position.bottom}px`,
          right: `${position.right}px`,
          pointerEvents: "auto",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* Chat Container */}
        {open && (
          <div
            className="flex flex-col rounded-2xl shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing"
            style={{
              width: "min(380px,calc(100vw - 32px))",
              height: "min(560px,calc(100vh - 110px))",
              background: "#0d1117",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.7)",
              pointerEvents: "auto",
            }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3.5 shrink-0"
              style={{
                background: "linear-gradient(135deg,#059669,#047857)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                  <Headphones size={15} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-sm">
                    OmniTask Support
                  </p>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    <p className="text-emerald-200 text-[10px]">
                      Online · Replies in ~2 hours
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white p-1"
                style={{
                  ...tapStyle,
                  touchAction: "manipulation",
                  minHeight: "32px",
                  minWidth: "32px",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {/* start */}
              {stage === "start" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="text-center pt-2">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare size={24} className="text-emerald-400" />
                    </div>
                    <p className="text-white font-black text-base">
                      How can we help?
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      Start a conversation with our support team
                    </p>
                  </div>
                  <div className="space-y-2">
                    {QUICK_TOPICS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setFormTopic(t);
                          setStage("form");
                        }}
                        className="w-full text-left px-4 py-3 rounded-xl text-sm text-slate-300 hover:text-white transition-all flex items-center justify-between gap-2"
                        style={{
                          background: "rgba(30,41,59,0.6)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          ...tapStyle,
                          touchAction: "manipulation",
                        }}
                      >
                        {t}
                        <ChevronDown
                          size={12}
                          className="text-slate-500 -rotate-90 shrink-0"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* form */}
              {stage === "form" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => setStage("start")}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                    style={{ ...tapStyle, touchAction: "manipulation" }}
                  >
                    ← Back
                  </button>
                  <div
                    className="rounded-xl px-3 py-2"
                    style={{
                      background: "rgba(16,185,129,0.08)",
                      border: "1px solid rgba(16,185,129,0.15)",
                    }}
                  >
                    <p className="text-emerald-400 text-xs font-bold">
                      {formTopic}
                    </p>
                  </div>
                  {!userId && (
                    <>
                      <div>
                        <label className="text-slate-400 text-xs font-bold mb-1.5 block">
                          Your Name
                        </label>
                        <input
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="John Doe"
                          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-bold mb-1.5 block">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={formEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                          placeholder="you@email.com"
                          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-slate-400 text-xs font-bold mb-1.5 block">
                      Describe your issue
                    </label>
                    <textarea
                      value={formMessage}
                      onChange={(e) => setFormMessage(e.target.value)}
                      placeholder="Please describe what's happening in detail..."
                      rows={4}
                      className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs font-bold mb-1.5 block flex items-center gap-1">
                      <ImageIcon size={10} /> Attach Screenshot (optional)
                    </label>
                    {imagePreview ? (
                      <div
                        className="relative rounded-xl overflow-hidden"
                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full max-h-32 object-cover"
                        />
                        <button
                          type="button"
                          onClick={removeImage}
                          className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                          style={{
                            touchAction: "manipulation",
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          <X size={10} className="text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-300 flex items-center justify-center gap-2 border-dashed"
                        style={{
                          background: "rgba(30,41,59,0.4)",
                          border: "1px dashed rgba(255,255,255,0.1)",
                          ...tapStyle,
                          touchAction: "manipulation",
                        }}
                      >
                        <Paperclip size={12} /> Click to attach image or
                        screenshot
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleStartChat}
                    disabled={loading || !formMessage.trim()}
                    className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg,#059669,#10b981)",
                      ...tapStyle,
                      touchAction: "manipulation",
                      minHeight: "44px",
                      pointerEvents: "auto",
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Starting
                        chat...
                      </>
                    ) : (
                      <>
                        <Send size={14} /> Start Chat
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* chat */}
              {stage === "chat" && (
                <>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {loading ? (
                      <div className="flex justify-center pt-8">
                        <Loader2
                          size={20}
                          className="text-emerald-400 animate-spin"
                        />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center pt-6 text-slate-500 text-sm">
                        No messages yet
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const txt = getText(msg);
                        if (!txt && !msg.image_url) return null;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${msg.is_admin ? "justify-start" : "justify-end"}`}
                          >
                            {msg.is_admin && (
                              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mr-2 mt-1">
                                <Headphones
                                  size={10}
                                  className="text-emerald-400"
                                />
                              </div>
                            )}
                            <div className="max-w-[80%] space-y-1">
                              {txt && (
                                <div
                                  className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.is_admin ? "rounded-tl-sm" : "rounded-tr-sm"}`}
                                  style={
                                    msg.is_admin
                                      ? {
                                          background: "rgba(30,41,59,0.9)",
                                          border:
                                            "1px solid rgba(255,255,255,0.07)",
                                          color: "#e2e8f0",
                                        }
                                      : {
                                          background:
                                            "linear-gradient(135deg,#059669,#047857)",
                                          color: "white",
                                        }
                                  }
                                >
                                  {txt}
                                </div>
                              )}
                              {msg.image_url && (
                                <a
                                  href={msg.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block rounded-xl overflow-hidden"
                                  style={{
                                    border: "1px solid rgba(255,255,255,0.1)",
                                  }}
                                >
                                  <img
                                    src={msg.image_url}
                                    alt={msg.image_name || "Attachment"}
                                    className="max-h-48 w-full object-cover"
                                  />
                                </a>
                              )}
                              <div
                                className={`flex items-center gap-1 text-[10px] text-slate-600 ${msg.is_admin ? "justify-start" : "justify-end"}`}
                              >
                                <span>
                                  {new Date(msg.created_at).toLocaleTimeString(
                                    "en",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                                {!msg.is_admin &&
                                  (msg.seen ? (
                                    <CheckCheck
                                      size={10}
                                      className="text-emerald-400"
                                    />
                                  ) : (
                                    <Check size={10} />
                                  ))}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {imagePreview && (
                    <div className="px-3 py-2 border-t border-slate-800/50 flex items-center gap-2">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                      <p className="text-white text-xs font-bold truncate flex-1">
                        {imageFile?.name}
                      </p>
                      <button
                        type="button"
                        onClick={removeImage}
                        className="text-slate-500 hover:text-red-400"
                        style={{
                          touchAction: "manipulation",
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="px-3 pb-3 pt-2 border-t border-slate-800/50 shrink-0">
                    {ticket?.status === "resolved" ||
                    ticket?.status === "closed" ? (
                      <div className="text-center py-2">
                        <p className="text-slate-500 text-xs">
                          This ticket is {ticket.status}.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTicket(null);
                            setStage("start");
                            setMessages([]);
                            try {
                              localStorage.removeItem(GUEST_KEY);
                            } catch {
                              /* ignore */
                            }
                          }}
                          className="text-emerald-400 text-xs hover:underline mt-1"
                          style={{
                            touchAction: "manipulation",
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          Open new ticket
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 rounded-xl text-slate-500 hover:text-emerald-400 hover:bg-slate-800/60 shrink-0"
                          style={{
                            ...tapStyle,
                            touchAction: "manipulation",
                            minHeight: "44px",
                            minWidth: "44px",
                          }}
                        >
                          {uploading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Paperclip size={16} />
                          )}
                        </button>
                        <textarea
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="Type a message..."
                          rows={1}
                          className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                          style={{ maxHeight: "80px" }}
                        />
                        <button
                          type="button"
                          onClick={sendMessage}
                          disabled={sending || (!text.trim() && !imageFile)}
                          className="p-2.5 rounded-xl disabled:opacity-40 shrink-0"
                          style={{
                            background:
                              "linear-gradient(135deg,#059669,#10b981)",
                            ...tapStyle,
                            touchAction: "manipulation",
                            minHeight: "44px",
                            minWidth: "44px",
                            pointerEvents: "auto",
                          }}
                        >
                          {sending ? (
                            <Loader2
                              size={15}
                              className="text-white animate-spin"
                            />
                          ) : (
                            <Send size={15} className="text-white" />
                          )}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageSelect}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tooltip */}
        {!open && (
          <div className="bg-slate-800 border border-slate-700 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-bounce pointer-events-none select-none">
            Need help? 💬
          </div>
        )}

        {/* Button — drag to move, tap to open/close */}
        <button
          type="button"
          className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95 cursor-grab active:cursor-grabbing"
          style={{
            background: open
              ? "#1e293b"
              : "linear-gradient(135deg,#059669,#10b981)",
            boxShadow: "0 8px 25px rgba(16,185,129,0.4)",
            ...tapStyle,
            WebkitUserSelect: "none",
            userSelect: "none",
            pointerEvents: "auto",
          }}
          onClick={(e) => {
            if (!didDrag.current) {
              setOpen(!open);
            }
          }}
          onMouseDown={(e) => handleDragStart(e)}
          onTouchStart={(e) => handleDragStart(e)}
        >
          {open ? (
            <X size={22} className="text-white" />
          ) : (
            <Headphones size={22} className="text-white" />
          )}
          {unreadCount > 0 && !open && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center pointer-events-none">
              <span className="text-white text-[9px] font-black">
                {unreadCount}
              </span>
            </div>
          )}
        </button>
      </div>
    </>
  );
}
