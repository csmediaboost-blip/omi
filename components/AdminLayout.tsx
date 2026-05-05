"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Users,
  CreditCard,
  Gift,
  ClipboardList,
  AlertCircle,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  RefreshCw,
  Lock,
  Mail,
  Bell,
  FileText,
  DollarSign,
  CheckSquare,
  UserCheck,
  Zap,
  Key,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/signin");
          return;
        }

        const { data: profile, error } = await supabase
          .from("users")
          .select("is_admin, role, email")
          .eq("id", user.id)
          .single();

        console.log("[v0] Admin check - User email:", user.email);
        console.log("[v0] Admin check - Profile:", profile);
        console.log("[v0] Admin check - Error:", error);

        if (profile?.is_admin === true || profile?.role === "admin") {
          console.log("[v0] Admin access granted");
          setIsAdmin(true);
        } else {
          console.log("[v0] Admin access denied - redirecting to dashboard");
          router.push("/dashboard");
        }
      } catch (error) {
        console.error("[v0] Admin check error:", error);
        router.push("/auth/signin");
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [router]);

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
          icon: Lock,
          label: "Licenses",
          href: "/admin/licenses",
          id: "licenses",
        },
      ],
    },
    {
      section: "Tasks & Work",
      items: [
        {
          icon: ClipboardList,
          label: "Task Management",
          href: "/admin/tasks",
          id: "tasks",
        },
        {
          icon: CheckSquare,
          label: "Task Submissions",
          href: "/admin/task-submissions",
          id: "task-submissions",
        },
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
        {
          icon: RefreshCw,
          label: "Payout Batches",
          href: "/admin/payout-batches",
          id: "payout-batches",
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
          icon: Mail,
          label: "Email Templates",
          href: "/admin/email-templates",
          id: "email",
        },
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
          icon: FileText,
          label: "Compliance",
          href: "/admin/compliance",
          id: "compliance",
        },
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
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-emerald-500 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 z-40 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:relative overflow-y-auto`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h1 className="font-bold text-lg text-gray-900">Admin Panel</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-6">
          {adminMenus.map((menu) => (
            <div key={menu.section}>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
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
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout Button */}
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
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between md:hidden">
          <h1 className="font-bold text-gray-900">Admin</h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-600"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-50 p-6">
          <div className="max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
