"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Zap,
  DollarSign,
  LayoutGrid,
  MoreHorizontal,
  Users,
  BookOpen,
  Shield,
  Settings,
  X,
  BadgeCheck,
  Code2,
  FileText,
  HelpCircle,
  Receipt,
  Building2,
  Download,
} from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";

const PRIMARY_NAV = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "GPU Plans", href: "/dashboard/gpu-plans", icon: LayoutGrid },
  { label: "Tasks", href: "/dashboard/tasks", icon: Zap },
  { label: "Finance", href: "/dashboard/financials", icon: DollarSign },
];

const MORE_SECTIONS = [
  {
    title: "Identity & Access",
    items: [
      {
        label: "Contributor ID",
        href: "/dashboard/contributor-id",
        icon: BadgeCheck,
      },
      { label: "Verification", href: "/dashboard/verification", icon: Shield },
      { label: "API Access", href: "/dashboard/api-access", icon: Code2 },
    ],
  },
  {
    title: "Finance & Legal",
    items: [
      { label: "Tax Report", href: "/dashboard/tax", icon: Receipt },
      { label: "License", href: "/dashboard/license", icon: FileText },
      {
        label: "Company Disclosure",
        href: "/dashboard/company-disclosure",
        icon: Building2,
      },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Network", href: "/dashboard/network", icon: Users },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

// PWA Install section (mobile only)
const PWA_SECTION = {
  title: "Install App",
  items: [
    { label: "Add to Home Screen", id: "pwa-install", icon: Download },
  ],
};

const ALL_MORE_HREFS = MORE_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

const HIDDEN_ON = ["/dashboard/checkout", "/auth"];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showPWA, setShowPWA] = useState(false);

  // Check if mobile and capture install prompt
  useEffect(() => {
    const checkMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry/i.test(navigator.userAgent);
    setIsMobile(checkMobile);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowPWA(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallPWA = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      console.log("[v0] PWA install outcome:", outcome);
      setInstallEvent(null);
      setShowPWA(false);
      setMoreOpen(false);
    } catch (error) {
      console.error("[v0] PWA install error:", error);
    }
  };

  const shouldHide =
    !pathname.startsWith("/dashboard") ||
    HIDDEN_ON.some((p) => pathname.startsWith(p));

  if (shouldHide) return null;

  const isMoreActive = ALL_MORE_HREFS.some((href) => pathname.startsWith(href));

  return (
    <>
      {/* Backdrop — sits below the drawer but above page content */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden bg-black/65"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer — NO backdrop-blur on the container itself */}
      {moreOpen && (
        <div
          className="fixed left-2 right-2 z-50 md:hidden rounded-2xl overflow-hidden bg-slate-900 border border-white/10 shadow-2xl"
          style={{
            bottom: "calc(64px + env(safe-area-inset-bottom))",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/7">

            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              More
            </span>
            <button
              onClick={() => setMoreOpen(false)}
              className="text-slate-500 hover:text-white transition-colors p-1"
            >
              <X size={16} />
            </button>
          </div>

          {/* Sections — overflow-y-auto here, NOT on the parent */}
          <div className="p-3 space-y-4 overflow-y-auto" style={{ maxHeight: "65vh" }}>
            {/* PWA Install Section (Mobile Only) */}
            {isMobile && showPWA && installEvent && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest px-1 mb-2 text-slate-500">
                  {PWA_SECTION.title}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleInstallPWA}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/15">
                      <Image
                        src="/logo-main.png"
                        alt="OmniTask"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                    </div>
                    <span className="text-[10px] font-medium text-center leading-tight text-emerald-400">
                      Install App
                    </span>
                  </button>
                </div>
              </div>
            )}

            {MORE_SECTIONS.map(({ title, items }) => (
              <div key={title}>
                <p className="text-[9px] font-bold uppercase tracking-widest px-1 mb-2 text-slate-500">
                  {title}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {items.map(({ label, href, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all ${
                          active
                            ? "bg-emerald-500/10 border border-emerald-500/20"
                            : "bg-slate-800/50 border border-transparent"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            active
                              ? "bg-emerald-500/15"
                              : "bg-slate-700/60"
                          }`}
                        >
                          <Icon
                            size={17}
                            className={
                              active ? "text-emerald-400" : "text-slate-400"
                            }
                          />
                        </div>
                        <span
                          className={`text-[10px] font-medium text-center leading-tight ${
                            active ? "text-emerald-400" : "text-slate-300"
                          }`}
                        >
                          {label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-slate-950 border-t border-white/8" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>

        <div className="flex items-center justify-around h-16">
          {PRIMARY_NAV.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors"
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              >
                <div className="relative flex items-center justify-center">
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 1.8}
                    className={active ? "text-emerald-400" : "text-slate-500"}
                  />
                  {active && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium leading-none ${
                    active ? "text-emerald-400" : "text-slate-500"
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            type="button"
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <div className="relative flex items-center justify-center">
              <MoreHorizontal
                size={22}
                strokeWidth={isMoreActive || moreOpen ? 2.5 : 1.8}
                className={
                  isMoreActive || moreOpen
                    ? "text-emerald-400"
                    : "text-slate-500"
                }
              />
              {(isMoreActive || moreOpen) && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
              )}
            </div>
            <span
              className={`text-[10px] font-medium leading-none ${
                isMoreActive || moreOpen ? "text-emerald-400" : "text-slate-500"
              }`}
            >
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
