"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Bell,
  CheckCircle,
  DollarSign,
  Zap,
  AlertCircle,
  X,
} from "lucide-react";

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  data: Record<string, any>;
};

const TYPE_ICONS: Record<string, any> = {
  task_approved: {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  task_rejected: {
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  task_available: { icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10" },
  withdrawal_queued: {
    icon: DollarSign,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  withdrawal_completed: {
    icon: DollarSign,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  commission_credited: {
    icon: DollarSign,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  system: { icon: Bell, color: "text-slate-400", bg: "bg-slate-500/10" },
};

function timeAgo(date: string): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        loadNotifications(user.id);
      }
    });
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) =>
            [payload.new as Notification, ...prev].slice(0, 20),
          );
          setUnread((prev) => prev + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function loadNotifications(uid: string) {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data || []);
    setUnread((data || []).filter((n) => !n.read).length);
  }

  async function markAllRead() {
    if (!userId) return;
    await supabase.rpc("mark_notifications_read", { p_user_id: userId });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unread > 0) markAllRead();
        }}
        className="relative w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 text-slate-950 text-[9px] font-black rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800">
              <span className="text-white font-bold text-sm">
                Notifications
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <Bell size={20} className="mx-auto mb-2 opacity-50" />
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => {
                  const meta = TYPE_ICONS[n.type] || TYPE_ICONS.system;
                  const Icon = meta.icon;
                  return (
                    <div
                      key={n.id}
                      className={`flex gap-3 p-3 border-b border-slate-800/60 last:border-0 ${!n.read ? "bg-slate-800/30" : ""}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${meta.bg}`}
                      >
                        <Icon size={13} className={meta.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-semibold">
                          {n.title}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5 leading-relaxed line-clamp-2">
                          {n.body}
                        </p>
                        <p className="text-slate-600 text-[10px] mt-1">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {!n.read && (
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0 mt-1.5" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-800">
                <button
                  onClick={markAllRead}
                  className="text-emerald-400 text-xs font-semibold hover:text-emerald-300 transition-colors"
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
