"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  Zap,
  DollarSign,
  Users,
  BookOpen,
  Settings,
  Shield,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "GPU Plans", href: "/dashboard/gpu-plans", icon: LayoutGrid },
  { label: "Tasks", href: "/dashboard/tasks", icon: Zap },
  { label: "Financials", href: "/dashboard/financials", icon: DollarSign },
  { label: "Network", href: "/dashboard/network", icon: Users },
  {
    label: "company-disclosure",
    href: "/dashboard/company-disclosure",
    icon: BookOpen,
  },
  { label: "Verification", href: "/dashboard/verification", icon: Shield },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

// Matches dashboard palette
const BG = "#040812";
const BORDER = "#0e1d38";
const ACTIVE_BG = "#0a1f3d";
const ACTIVE_COLOR = "#10b981";
const TEXT = "#334155";
const TEXT_HI = "#94a3b8";

export default function DashboardNavigation() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="hidden md:flex flex-col min-h-screen transition-all duration-300 shrink-0 bg-slate-950 border-r border-slate-800"
      style={{
        width: collapsed ? 60 : 216,
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-800">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Image
              src="/logo.png"
              alt="OmniTask Pro"
              width={32}
              height={32}
              className="w-8 h-8"
              priority
            />
            <span className="font-black text-sm text-slate-100">
              OmniTask
            </span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 transition-colors ml-auto text-slate-400 hover:text-slate-200"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                active
                  ? "bg-slate-800 text-emerald-400 border border-emerald-500/10"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
              }`}
            >
              <Icon size={15} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-4 border-t border-slate-800">
          <p className="text-[9px] font-mono text-slate-700">
            OmniTask Pro v1.0
          </p>
        </div>
      )}
    </aside>
  );
}
