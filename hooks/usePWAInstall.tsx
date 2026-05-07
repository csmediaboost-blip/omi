"use client";
// hooks/usePWAInstall.tsx
//
// Strategy:
// 1. Capture beforeinstallprompt at module level (before React mounts)
// 2. If Chrome Android but no prompt yet → open chrome://flags workaround
//    or guide user to install via Chrome's native mini-infobar
// 3. iOS Safari → Web Share API to trigger share sheet
// 4. Always show something useful, never just "look in the menu"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAContextType {
  isInstalling: boolean;
  canInstall: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  promptAvailable: boolean;
  handleInstall: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType>({
  isInstalling: false,
  canInstall: false,
  isIOS: false,
  isAndroid: false,
  isStandalone: false,
  promptAvailable: false,
  handleInstall: async () => {},
});

// ─────────────────────────────────────────────────────────────────────────────
// Capture beforeinstallprompt at MODULE LEVEL — runs before any React render
// This is the ONLY reliable way to capture this event
// ─────────────────────────────────────────────────────────────────────────────
let _deferredPrompt: BeforeInstallPromptEvent | null = null;
let _promptListeners: Array<() => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault();
      _deferredPrompt = e as BeforeInstallPromptEvent;
      console.log("[PWA] ✅ beforeinstallprompt captured");
      // Notify any React components that are already mounted
      _promptListeners.forEach((fn) => fn());
    },
    { capture: true },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export function PWAProvider({ children }: { children: ReactNode }) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const android = /Android/.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    setIsIOS(ios);
    setIsAndroid(android);
    setIsStandalone(standalone);

    // Already running as installed PWA
    if (standalone) {
      setCanInstall(false);
      return;
    }

    // Check if we already captured the prompt before mount
    if (_deferredPrompt) {
      console.log("[PWA] Prompt already available at mount");
      setPromptAvailable(true);
      setCanInstall(true);
    }

    // Listen for future prompts (e.g. after engagement threshold met)
    const onPromptReady = () => {
      setPromptAvailable(true);
      setCanInstall(true);
    };
    _promptListeners.push(onPromptReady);

    // For iOS and Android — always show install option even without prompt
    if (ios || android) {
      setCanInstall(true);
    }

    // Listen for successful install
    const onInstalled = () => {
      _deferredPrompt = null;
      setPromptAvailable(false);
      setCanInstall(false);
      setIsInstalling(false);
      console.log("[PWA] App installed successfully");
    };
    window.addEventListener("appinstalled", onInstalled);

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[PWA] SW registered:", reg.scope);
          // Force update check
          reg.update();
        })
        .catch((err) => console.warn("[PWA] SW failed:", err));
    }

    return () => {
      _promptListeners = _promptListeners.filter((fn) => fn !== onPromptReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    console.log(
      "[PWA] handleInstall — prompt:",
      !!_deferredPrompt,
      "iOS:",
      isIOS,
      "Android:",
      isAndroid,
    );

    if (isStandalone) {
      alert("OmniTask Pro is already installed on your device!");
      return;
    }

    setIsInstalling(true);

    try {
      // ── BEST CASE: Native browser install prompt available ──────────────
      if (_deferredPrompt) {
        console.log("[PWA] 🎉 Triggering native install prompt");
        await _deferredPrompt.prompt();
        const { outcome } = await _deferredPrompt.userChoice;
        console.log("[PWA] Outcome:", outcome);

        if (outcome === "accepted") {
          _deferredPrompt = null;
          setPromptAvailable(false);
          setCanInstall(false);
          setTimeout(() => setIsInstalling(false), 2000);
        } else {
          setIsInstalling(false);
        }
        return;
      }

      // ── iOS Safari ──────────────────────────────────────────────────────
      if (isIOS) {
        setIsInstalling(false);
        // Try Web Share API first — opens native share sheet on Safari
        if (navigator.share) {
          try {
            await navigator.share({
              title: "OmniTask Pro",
              text: 'Tap "Add to Home Screen" to install OmniTask Pro',
              url: window.location.origin,
            });
            return;
          } catch {
            // user cancelled share, fall through to alert
          }
        }
        // Safari without share API
        alert(
          "Install OmniTask Pro on iPhone:\n\n" +
            "1. Tap the Share button (⬆) at the bottom\n" +
            '2. Scroll down and tap "Add to Home Screen"\n' +
            '3. Tap "Add"',
        );
        return;
      }

      // ── Android Chrome — prompt not yet fired ───────────────────────────
      // This means Chrome hasn't met engagement criteria yet OR
      // the manifest/SW has an issue Chrome didn't tell us about.
      // Best approach: try to trigger install via a programmatic navigation
      // that forces Chrome to re-evaluate installability.
      if (isAndroid) {
        setIsInstalling(false);

        const ua = navigator.userAgent;
        const isChrome = /Chrome/.test(ua) && !/Edge|Edg|OPR/.test(ua);
        const isSamsung = /SamsungBrowser/.test(ua);
        const isFirefox = /Firefox/.test(ua);
        const isEdge = /Edge|Edg/.test(ua);

        if (isChrome || isEdge) {
          // Chrome/Edge on Android: the install option is in the browser menu
          // Open a custom modal with a clear visual guide instead of alert()
          // For now show a clean alert — upgrade to modal if needed
          alert(
            "📲 Install OmniTask Pro\n\n" +
              "Chrome shows an install banner automatically.\n" +
              "If you don't see it:\n\n" +
              "1. Tap ⋮ (menu) in Chrome\n" +
              '2. Tap "Add to Home screen"\n' +
              '3. Tap "Install"\n\n' +
              "Tip: Use the site for 30+ seconds and Chrome will prompt automatically.",
          );
        } else if (isSamsung) {
          alert(
            "📲 Install OmniTask Pro\n\n" +
              "1. Tap ☰ at the bottom\n" +
              '2. Tap "Add page to"\n' +
              '3. Tap "Home screen"',
          );
        } else if (isFirefox) {
          alert(
            "📲 Install OmniTask Pro\n\n" +
              "1. Tap ⋮ at the top right\n" +
              '2. Tap "Install"\n' +
              '3. Tap "Add to Home screen"',
          );
        } else {
          alert(
            "📲 Install OmniTask Pro\n\n" +
              "Open your browser menu and tap\n" +
              '"Add to Home screen" or "Install".',
          );
        }
        return;
      }

      // ── Desktop ─────────────────────────────────────────────────────────
      setIsInstalling(false);
      alert(
        "📲 Install OmniTask Pro\n\n" +
          "Chrome / Edge: Click ⊕ in the address bar\n" +
          "Firefox: Click the install icon\n" +
          "Safari (Mac): File → Add to Dock",
      );
    } catch (err) {
      console.error("[PWA] Install error:", err);
      setIsInstalling(false);
    }
  }, [isIOS, isAndroid, isStandalone]);

  return (
    <PWAContext.Provider
      value={{
        isInstalling,
        canInstall,
        isIOS,
        isAndroid,
        isStandalone,
        promptAvailable,
        handleInstall,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

export function usePWAInstall() {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error("usePWAInstall must be used within PWAProvider");
  }
  return context;
}
