"use client";
// components/AdminNotificationBell.tsx

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Bell,
  X,
  CheckCheck,
  ShieldCheck,
  CreditCard,
  MessageSquare,
  Wallet,
  FileText,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type NotifCategory =
  | "kyc"
  | "payment"
  | "support_ticket"
  | "withdrawal"
  | "support_message";

interface AdminNotif {
  id: string;
  category: NotifCategory;
  title: string;
  subtitle: string;
  timestamp: Date;
  read: boolean;
  href: string;
  // Ticket this notification relates to, if any. Used to clear the
  // notification once the admin replies to that ticket.
  ticketId?: string;
  // Generic record id (payment id, kyc document id, withdrawal id, etc.)
  // Used to clear the notification once the admin views/acts on that record.
  recordId?: string;
}

interface CategoryMeta {
  icon: React.ComponentType<{ size: number; className?: string }>;
  color: string;
  bg: string;
  label: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<NotifCategory, CategoryMeta> = {
  kyc: {
    icon: ShieldCheck,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    label: "KYC",
  },
  payment: {
    icon: CreditCard,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    label: "Payment",
  },
  support_ticket: {
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    label: "Support",
  },
  withdrawal: {
    icon: Wallet,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    label: "Withdrawal",
  },
  support_message: {
    icon: MessageSquare,
    color: "text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/20",
    label: "Message",
  },
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return date.toLocaleDateString();
}

let notifCounter = 0;
function makeId() {
  return `notif_${Date.now()}_${++notifCounter}`;
}

// Persist notifications so a page refresh doesn't wipe the bell. Entries are
// only removed when explicitly dismissed/cleared by the admin, or when the
// admin replies to the related ticket (see "admin-ticket-replied" listener).
const STORAGE_KEY = "admin_notifs_v1";
const MAX_STORED = 50;

function loadStoredNotifs(): AdminNotif[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<
      Omit<AdminNotif, "timestamp"> & { timestamp: string }
    >;
    return parsed.map((n) => ({ ...n, timestamp: new Date(n.timestamp) }));
  } catch (e) {
    console.error("[AdminNotificationBell] failed to load stored notifs:", e);
    return [];
  }
}

function saveNotifs(notifs: AdminNotif[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs));
  } catch (e) {
    console.error("[AdminNotificationBell] failed to save notifs:", e);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminNotificationBell() {
  const [notifs, setNotifs] = useState<AdminNotif[]>([]);
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  const unread = notifs.filter((n) => !n.read).length;

  // ── Hydrate from localStorage on mount ───────────────────────────────────
  useEffect(() => {
    const stored = loadStoredNotifs();
    if (stored.length) {
      setNotifs(stored);
    }
    hydrated.current = true;
  }, []);

  // ── Persist to localStorage whenever notifs change ───────────────────────
  useEffect(() => {
    if (!hydrated.current) return; // don't overwrite storage with [] before hydration runs
    saveNotifs(notifs.slice(0, MAX_STORED));
  }, [notifs]);

  // ── Push a new notification ──────────────────────────────────────────────
  const push = useCallback(
    (n: Omit<AdminNotif, "id" | "timestamp" | "read">) => {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 600);
      setNotifs((prev) => [
        { ...n, id: makeId(), timestamp: new Date(), read: false },
        ...prev.slice(0, MAX_STORED - 1),
      ]);
    },
    [],
  );

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Clear notifications for a ticket once admin replies ──────────────────
  // Dispatch this from your admin reply handler:
  //   window.dispatchEvent(new CustomEvent("admin-ticket-replied", { detail: { ticketId } }));
  useEffect(() => {
    function handleReplied(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { ticketId?: string }
        | undefined;
      const ticketId = detail?.ticketId;
      if (!ticketId) return;
      setNotifs((prev) =>
        prev.filter(
          (n) =>
            !(
              (n.category === "support_ticket" ||
                n.category === "support_message") &&
              n.ticketId === ticketId
            ),
        ),
      );
    }
    window.addEventListener("admin-ticket-replied", handleReplied);
    return () =>
      window.removeEventListener("admin-ticket-replied", handleReplied);
  }, []);

  // ── Clear a notification when admin views/acts on its record ─────────────
  // Dispatch this from pages like Payments / KYC / Withdrawals when the admin
  // opens the detail modal for a specific row:
  //   window.dispatchEvent(new CustomEvent("admin-record-viewed", {
  //     detail: { category: "kyc", recordId: doc.id }
  //   }));
  useEffect(() => {
    function handleRecordViewed(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { category?: NotifCategory; recordId?: string }
        | undefined;
      if (!detail?.category || !detail.recordId) return;
      setNotifs((prev) =>
        prev.filter(
          (n) =>
            !(n.category === detail.category && n.recordId === detail.recordId),
        ),
      );
    }
    window.addEventListener("admin-record-viewed", handleRecordViewed);
    return () =>
      window.removeEventListener("admin-record-viewed", handleRecordViewed);
  }, []);

  // ── Supabase real-time subscriptions ─────────────────────────────────────
  useEffect(() => {
    // 1. KYC submissions
    const kycChannel = supabase
      .channel("admin_notif_kyc")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "kyc_documents" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          push({
            category: "kyc",
            title: "New KYC Submission",
            subtitle: `${(row.full_name as string) || "A user"} submitted ${
              ((row.document_type as string) ?? "").replace(/_/g, " ") ||
              "a document"
            }`,
            href: "/admin/kyc",
            recordId: row.id as string,
          });
        },
      )
      .subscribe();

    // 2. New payments
    const paymentChannel = supabase
      .channel("admin_notif_payment")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "payment_transactions" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          push({
            category: "payment",
            title: "New Payment Received",
            subtitle: `$${((row.amount as number) || 0).toFixed(2)} via ${
              (row.gateway as string) || "unknown"
            } — status: ${(row.status as string) || ""}`,
            href: "/admin/payments",
            recordId: String(row.id),
          });
        },
      )
      .subscribe();

    // 3. New support tickets
    const ticketChannel = supabase
      .channel("admin_notif_ticket")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "support_tickets" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          const ticketId = row.id as string;
          push({
            category: "support_ticket",
            title: "New Support Ticket",
            subtitle: (row.subject as string) || "No subject",
            href: `/admin/support-tickets/${ticketId}`,
            ticketId,
          });
        },
      )
      .subscribe();

    // 4. New withdrawals
    const withdrawalChannel = supabase
      .channel("admin_notif_withdrawal")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "withdrawals" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          push({
            category: "withdrawal",
            title: "New Withdrawal Request",
            subtitle: `$${((row.amount as number) || 0).toFixed(2)} via ${
              (row.payout_method as string) || "unknown"
            }`,
            href: "/admin/withdrawals",
            recordId: String(row.id),
          });
        },
      )
      .subscribe();

    // 5. User replies on support messages (non-admin only)
    const msgChannel = supabase
      .channel("admin_notif_msg")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row.is_admin) {
            const ticketId = row.ticket_id as string;
            push({
              category: "support_message",
              title: "User Replied to Ticket",
              subtitle: row.body
                ? `"${(row.body as string).slice(0, 60)}…"`
                : "New message",
              href: `/admin/support-tickets/${ticketId}`,
              ticketId,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(kycChannel);
      supabase.removeChannel(paymentChannel);
      supabase.removeChannel(ticketChannel);
      supabase.removeChannel(withdrawalChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [push]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const markAllRead = () =>
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));

  const dismiss = (id: string) =>
    setNotifs((prev) => prev.filter((n) => n.id !== id));

  const handleOpen = () => setOpen((v) => !v);

  const handleNotifClick = (notif: AdminNotif) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
    );
    setOpen(false);
    window.location.href = notif.href;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className={`
          relative flex items-center justify-center w-10 h-10 rounded-xl
          transition-all duration-200
          ${
            open
              ? "bg-gray-100 text-gray-900"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          }
        `}
        aria-label="Notifications"
      >
        <Bell
          size={18}
          className={animating ? "animate-[wiggle_0.5s_ease-in-out]" : ""}
        />

        {/* Red badge */}
        {unread > 0 && (
          <span
            className={`
              absolute -top-0.5 -right-0.5
              min-w-[18px] h-[18px] px-1
              flex items-center justify-center
              rounded-full text-[10px] font-black text-white
              bg-red-500
              ${animating ? "scale-125" : "scale-100"}
              transition-transform duration-200
            `}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="
            absolute right-0 top-12 z-[200]
            w-[380px] max-h-[520px]
            bg-white border border-gray-200
            rounded-2xl shadow-2xl shadow-black/10
            flex flex-col overflow-hidden
            animate-in fade-in slide-in-from-top-2 duration-150
          "
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-gray-400" />
              <span className="text-sm font-bold text-gray-900">
                Notifications
              </span>
              {unread > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                  <Bell size={20} className="text-gray-300" />
                </div>
                <p className="text-sm text-gray-400 font-medium">
                  No notifications yet
                </p>
                <p className="text-xs text-gray-300 text-center max-w-[200px]">
                  Activity from users will appear here in real-time
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifs.map((notif) => {
                  const meta = CATEGORY_META[notif.category];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={notif.id}
                      className={`
                        group relative flex items-start gap-3 px-4 py-3
                        cursor-pointer transition-colors duration-100
                        ${
                          notif.read
                            ? "hover:bg-gray-50"
                            : "bg-blue-50/40 hover:bg-blue-50/70"
                        }
                      `}
                      onClick={() => handleNotifClick(notif)}
                    >
                      {/* Unread dot */}
                      {!notif.read && (
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}

                      {/* Icon */}
                      <div
                        className={`
                          shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center mt-0.5
                          ${meta.bg}
                        `}
                      >
                        <Icon size={14} className={meta.color} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-xs font-bold leading-tight ${
                              notif.read ? "text-gray-600" : "text-gray-900"
                            }`}
                          >
                            {notif.title}
                          </p>
                          <span className="text-[10px] text-gray-300 shrink-0 mt-0.5">
                            {timeAgo(notif.timestamp)}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed line-clamp-2">
                          {notif.subtitle}
                        </p>
                        <span
                          className={`
                            inline-block mt-1 text-[9px] font-black uppercase tracking-wider
                            px-1.5 py-0.5 rounded-full border
                            ${meta.bg} ${meta.color}
                          `}
                        >
                          {meta.label}
                        </span>
                      </div>

                      {/* Dismiss */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(notif.id);
                        }}
                        className="
                          shrink-0 opacity-0 group-hover:opacity-100
                          w-5 h-5 rounded-full flex items-center justify-center
                          text-gray-300 hover:text-gray-600 hover:bg-gray-100
                          transition-all duration-150 mt-0.5
                        "
                      >
                        <X size={10} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
              <span className="text-[11px] text-gray-300">
                {notifs.length} notification{notifs.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setNotifs([])}
                className="text-[11px] text-gray-400 hover:text-red-500 font-semibold transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Wiggle keyframe */}
      <style>{`
        @keyframes wiggle {
          0%,100% { transform: rotate(0deg); }
          20%      { transform: rotate(-15deg); }
          40%      { transform: rotate(15deg); }
          60%      { transform: rotate(-10deg); }
          80%      { transform: rotate(10deg); }
        }
      `}</style>
    </div>
  );
}
