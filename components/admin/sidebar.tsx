"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileCheck,
  CreditCard,
  Zap,
  LogOut,
  ArrowUpRight,
} from "lucide-react";

const menuItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/kyc", label: "KYC Documents", icon: FileCheck },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/gpu-plans", label: "GPU Plans", icon: Zap },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpRight },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-sm text-slate-400">Management Dashboard</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2 rounded-lg transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          type="button"
          className="flex items-center gap-3 w-full px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
