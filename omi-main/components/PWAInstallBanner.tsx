"use client";
// components/PWAInstallBanner.tsx
// THE ONLY PWA component — replaces both old files
// Delete: components/pwa-install-prompt.tsx if it exists
//
// This handles:
// 1. "Add to Home Screen" install prompt
// 2. Push notification permission
// 3. Saves push token to Supabase push_tokens table

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppLogo from "@/public/AppLogo";
import { usePWAInstall } from "@/hooks/usePWAInstall";

// ── Push token helper ──────────────────────────────────────────────────────
const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

async function savePushToken(token: string): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("push_tokens")
      .upsert(
        { user_id: user.id, token, platform: "web", active: true },
        { onConflict: "user_id,token" },
      );
  } catch (e) {
    console.warn("Failed to save push token:", e);
  }
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PWAInstallBanner() {
  const { canInstall, isInstalling, handleInstall } = usePWAInstall();
  const [showInstall, setShowInstall] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const [notifDone, setNotifDone] = useState(false);

  // ── Show install banner after user engagement ────────────────────────────
  useEffect(() => {
    // Don't show if already dismissed recently
    const dismissed = localStorage.getItem("pwa_install_dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86400000) return;

    if (canInstall) {
      // Wait 4 seconds before showing — Chrome requires engagement
      const timeout = setTimeout(() => setShowInstall(true), 4000);
      return () => clearTimeout(timeout);
    }
  }, [canInstall]);

  // ── Check notification status ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const notifDismissed = localStorage.getItem("notif_dismissed");
    if (notifDismissed) return;
    if (Notification.permission === "granted") return;
    // Show notif banner after 8 seconds
    setTimeout(() => setShowNotif(true), 8000);
  }, []);

  // ── Handle install ───────────────────────────────────────────────────────
  const handleInstallClick = async () => {
    await handleInstall();
    setInstallDone(true);
    setShowInstall(false);
  };

  const dismissInstall = () => {
    setShowInstall(false);
    setInstallDone(true);
    localStorage.setItem("pwa_install_dismissed", Date.now().toString());
  };

  // ── Handle notifications ─────────────────────────────────────────────────
  const handleEnableNotif = async () => {
    setNotifDone(true);
    setShowNotif(false);
    if (!("Notification" in window)) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (!VAPID_KEY) {
        console.warn("No VAPID key configured");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });
      await savePushToken(JSON.stringify(sub));
    } catch (err) {
      console.warn("Push subscription failed:", err);
    }
  };

  const dismissNotif = () => {
    setShowNotif(false);
    setNotifDone(true);
    localStorage.setItem("notif_dismissed", "1");
  };

  // Nothing to show
  if ((!showInstall || installDone) && (!showNotif || notifDone)) return null;

  return (
    <div className="fixed z-[9999] space-y-2 bottom-4 left-4 right-4">
      {/* ── Install banner ─────────────────────────────────────────────── */}
      {showInstall && !installDone && (
        <div className="bg-slate-900/98 border border-emerald-500/30 rounded-2xl p-4 flex gap-3 shadow-2xl">
          <div className="shrink-0">
            <AppLogo size={40} />
          </div>
          <div className="flex-1">
            <p className="text-white font-bold text-sm mb-0">
              Add to Home Screen
            </p>
            <p className="text-slate-300 text-xs mt-1">
              Install OmniTask Pro for faster access and offline support.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstallClick}
                disabled={isInstalling}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {isInstalling ? "Installing..." : "Install"}
              </button>
              <button
                onClick={dismissInstall}
                className="bg-transparent text-slate-400 text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={dismissInstall}
            className="text-slate-500 hover:text-white transition p-1 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Notification banner ────────────────────────────────────────── */}
      {showNotif && !notifDone && (
        <div className="bg-slate-900/98 border border-blue-500/30 rounded-2xl p-4 flex gap-3 shadow-2xl">
          <div className="shrink-0">
            <AppLogo size={40} />
          </div>
          <div className="flex-1">
            <p className="text-white font-bold text-sm mb-0">
              Enable Notifications
            </p>
            <p className="text-slate-300 text-xs mt-1">
              Get notified when tasks are approved, withdrawals are processed,
              and new tasks are available.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnableNotif}
                className="bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition"
              >
                Enable
              </button>
              <button
                onClick={dismissNotif}
                className="bg-transparent text-slate-400 text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition"
              >
                Skip
              </button>
            </div>
          </div>
          <button
            onClick={dismissNotif}
            className="text-slate-500 hover:text-white transition p-1 shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
