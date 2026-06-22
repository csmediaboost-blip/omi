"use client";
// components/admin-layout.tsx

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Users,
  CreditCard,
  Gift,
  AlertCircle,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  RefreshCw,
  Bell,
  DollarSign,
  UserCheck,
  Zap,
  Key,
  ShieldCheck,
  MessageSquare,
  Wallet,
  FileText,
  CheckCheck,
  Server,
  Trophy,
  Landmark,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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
}

interface KycDocumentRow {
  full_name?: string;
  document_type?: string;
}
interface PaymentTransactionRow {
  amount?: number;
  gateway?: string;
  status?: string;
}
interface SupportTicketRow {
  subject?: string;
}
interface WithdrawalRow {
  amount?: number;
  payout_method?: string;
}
interface SupportMessageRow {
  is_admin?: boolean;
  body?: string;
}
interface RealtimePayload<T> {
  new: T;
  old: Partial<T>;
  eventType: string;
  schema: string;
  table: string;
  commit_timestamp: string;
}

interface CategoryMeta {
  icon: React.ComponentType<{ size: number; className?: string }>;
  color: string;
  bg: string;
  dot: string;
  label: string;
}

const CATEGORY_META: Record<NotifCategory, CategoryMeta> = {
  kyc: {
    icon: ShieldCheck,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    label: "KYC",
  },
  payment: {
    icon: CreditCard,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    label: "Payment",
  },
  support_ticket: {
    icon: FileText,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    dot: "bg-blue-500",
    label: "Support",
  },
  withdrawal: {
    icon: Wallet,
    color: "text-violet-600",
    bg: "bg-violet-50 border-violet-200",
    dot: "bg-violet-500",
    label: "Withdrawal",
  },
  support_message: {
    icon: MessageSquare,
    color: "text-sky-600",
    bg: "bg-sky-50 border-sky-200",
    dot: "bg-sky-500",
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

function AdminNotificationBell() {
  const [notifs, setNotifs] = useState<AdminNotif[]>([]);
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const unread = notifs.filter((n) => !n.read).length;

  const push = useCallback(
    (n: Omit<AdminNotif, "id" | "timestamp" | "read">) => {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 600);
      setNotifs((prev) => [
        { ...n, id: makeId(), timestamp: new Date(), read: false },
        ...prev.slice(0, 49),
      ]);
    },
    [],
  );

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

  useEffect(() => {
    const kycChannel = supabase
      .channel("admin_notif_kyc")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "kyc_documents" },
        (p: RealtimePayload<KycDocumentRow>) => {
          push({
            category: "kyc",
            title: "New KYC Submission",
            subtitle: `${p.new.full_name ?? "A user"} submitted ${p.new.document_type?.replace(/_/g, " ") ?? "a document"}`,
            href: "/admin/kyc",
          });
        },
      )
      .subscribe();

    const paymentChannel = supabase
      .channel("admin_notif_payment")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "payment_transactions" },
        (p: RealtimePayload<PaymentTransactionRow>) => {
          push({
            category: "payment",
            title: "New Payment Received",
            subtitle: `$${(p.new.amount ?? 0).toFixed(2)} via ${p.new.gateway ?? "unknown"} — ${p.new.status ?? ""}`,
            href: "/admin/payments",
          });
        },
      )
      .subscribe();

    const ticketChannel = supabase
      .channel("admin_notif_ticket")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "support_tickets" },
        (p: RealtimePayload<SupportTicketRow>) => {
          push({
            category: "support_ticket",
            title: "New Support Ticket",
            subtitle: p.new.subject ?? "No subject",
            href: "/admin/support-tickets",
          });
        },
      )
      .subscribe();

    const withdrawalChannel = supabase
      .channel("admin_notif_withdrawal")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "withdrawals" },
        (p: RealtimePayload<WithdrawalRow>) => {
          push({
            category: "withdrawal",
            title: "New Withdrawal Request",
            subtitle: `$${(p.new.amount ?? 0).toFixed(2)} via ${p.new.payout_method ?? "unknown"}`,
            href: "/admin/withdrawals",
          });
        },
      )
      .subscribe();

    const msgChannel = supabase
      .channel("admin_notif_msg")
      .on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "support_messages" },
        (p: RealtimePayload<SupportMessageRow>) => {
          if (!p.new.is_admin) {
            push({
              category: "support_message",
              title: "User Replied to Ticket",
              subtitle: p.new.body
                ? `"${p.new.body.slice(0, 60)}…"`
                : "New message",
              href: "/admin/support-tickets",
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

  const markAllRead = () =>
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  const dismiss = (id: string) =>
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  const handleNotifClick = (notif: AdminNotif) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
    );
    setOpen(false);
    window.location.href = notif.href;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 ${
          open
            ? "bg-emerald-50 text-emerald-600"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        }`}
        aria-label="Notifications"
      >
        <Bell
          size={18}
          className={animating ? "animate-[wiggle_0.5s_ease-in-out]" : ""}
        />
        {unread > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-black text-white bg-red-500 transition-transform duration-200 ${animating ? "scale-125" : "scale-100"}`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[200] w-[370px] max-h-[500px] bg-white border border-gray-200 rounded-2xl shadow-2xl shadow-black/10 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-gray-400" />
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
                <CheckCheck size={11} /> Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-11 h-11 rounded-full bg-gray-50 flex items-center justify-center">
                  <Bell size={18} className="text-gray-300" />
                </div>
                <p className="text-sm text-gray-400 font-medium">
                  No notifications yet
                </p>
                <p className="text-xs text-gray-300 text-center max-w-[180px]">
                  User activity will appear here in real-time
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
                      className={`group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors duration-100 ${notif.read ? "hover:bg-gray-50" : "bg-blue-50/50 hover:bg-blue-50"}`}
                      onClick={() => handleNotifClick(notif)}
                    >
                      {!notif.read && (
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}
                      <div
                        className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center mt-0.5 ${meta.bg}`}
                      >
                        <Icon size={14} className={meta.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-xs font-bold leading-tight ${notif.read ? "text-gray-500" : "text-gray-900"}`}
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
                          className={`inline-block mt-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(notif.id);
                        }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150 mt-0.5"
                      >
                        <X size={10} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {notifs.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between shrink-0">
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

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

  const fetchPendingWithdrawals = useCallback(async () => {
    const { count } = await supabase
      .from("withdrawals")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "flagged"]);
    setPendingWithdrawals(count ?? 0);
  }, []);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/signin");
          return;
        }
        const { data: profile } = await supabase
          .from("users")
          .select("is_admin, role, email")
          .eq("id", user.id)
          .single();
        const p = profile as {
          is_admin?: boolean;
          role?: string;
          email?: string;
        } | null;
        if (p?.is_admin === true || p?.role === "admin") {
          setIsAdmin(true);
          fetchPendingWithdrawals();
        } else {
          router.push("/dashboard");
        }
      } catch (error) {
        console.error("[Admin] Access check error:", error);
        router.push("/auth/signin");
      } finally {
        setLoading(false);
      }
    };
    checkAdminAccess();
  }, [router, fetchPendingWithdrawals]);

  // Realtime: refresh badge whenever withdrawals table changes
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel("admin_pending_withdrawals")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "withdrawals" },
        () => fetchPendingWithdrawals(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isAdmin, fetchPendingWithdrawals]);

  const adminMenus = [
    {
      section: "Overview",
      items: [
        { icon: Home, label: "Dashboard", href: "/admin", id: "dashboard" },
        {
          icon: BarChart3,
          label: "Analytics",
          href: "/admin/analytics",
          id: "analytics",
        },
      ],
    },
    {
      section: "Management",
      items: [
        { icon: Users, label: "Users", href: "/admin/users", id: "users" },
        {
          icon: UserCheck,
          label: "KYC Verification",
          href: "/admin/kyc",
          id: "kyc",
        },
        {
          icon: Gift,
          label: "Referrals",
          href: "/admin/referrals",
          id: "referrals",
        },
        {
          icon: Trophy,
          label: "Prize Winners",
          href: "/admin/prize-winners",
          id: "prize-winners",
        },
      ],
    },
    {
      section: "Tasks & Work",
      items: [
        {
          icon: Zap,
          label: "RLHF Questions",
          href: "/admin/rlhf-questions",
          id: "rlhf",
        },
      ],
    },
    {
      section: "Financial",
      items: [
        {
          icon: DollarSign,
          label: "Withdrawals",
          href: "/admin/withdrawals",
          id: "withdrawals",
        },
        {
          icon: CreditCard,
          label: "Payments",
          href: "/admin/payments",
          id: "payments",
        },
        {
          icon: Key,
          label: "Payment Gateway Config",
          href: "/admin/payment-config",
          id: "payment-config",
        },
        // ── KoraPay multi-account management ──────────────────────────────
        {
          icon: Landmark,
          label: "KoraPay Accounts",
          href: "/admin/korapay-accounts",
          id: "korapay-accounts",
        },
        {
          icon: RefreshCw,
          label: "Payout Batches",
          href: "/admin/payout-batches",
          id: "payout-batches",
        },
        {
          icon: Server,
          label: "GPU Node Plans",
          href: "/admin/gpu-plans",
          id: "gpu-plans",
        },
      ],
    },
    {
      section: "Security & Support",
      items: [
        {
          icon: AlertCircle,
          label: "Fraud Detection",
          href: "/admin/fraud-detection",
          id: "fraud",
        },
        {
          icon: LogOut,
          label: "Support Tickets",
          href: "/admin/support-tickets",
          id: "support",
        },
      ],
    },
    {
      section: "Communications",
      items: [
        {
          icon: Bell,
          label: "Announcements",
          href: "/admin/announcements",
          id: "announcements",
        },
      ],
    },
    {
      section: "Administration",
      items: [
        {
          icon: Settings,
          label: "System Logs",
          href: "/admin/system-logs",
          id: "logs",
        },
      ],
    },
  ];

  const isActive = (href: string) => pathname === href;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/signin");
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-emerald-500 rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="flex h-screen bg-white">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 z-40 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:relative overflow-y-auto`}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h1 className="font-bold text-lg text-gray-900">Admin Panel</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-600 hover:text-gray-900"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-6">
          {adminMenus.map((menu) => (
            <div key={menu.section}>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                {menu.section}
              </h3>
              <div className="space-y-1">
                {menu.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>

                      {/* Pending withdrawals badge */}
                      {item.id === "withdrawals" && pendingWithdrawals > 0 && (
                        <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                          {pendingWithdrawals}
                        </span>
                      )}

                      {/* Prize winners NEW badge */}
                      {item.id === "prize-winners" && (
                        <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 border border-amber-200">
                          NEW
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sticky bottom-0 bg-gradient-to-t from-white via-white p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden text-gray-600 hover:text-gray-900"
            >
              <Menu size={22} />
            </button>
            <span className="font-semibold text-gray-800 text-sm hidden md:block">
              Welcome back, Admin
            </span>
            <span className="font-bold text-gray-900 md:hidden">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <AdminNotificationBell />
          </div>
        </div>

        <main className="flex-1 overflow-auto bg-gray-50 p-6">
          <div className="max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;