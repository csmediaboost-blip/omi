"use client";
// hooks/usePWAInstall.tsx

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAContextType {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalling: boolean;
  canInstall: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  handleInstall: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType>({
  deferredPrompt: null,
  isInstalling: false,
  canInstall: false,
  isIOS: false,
  isAndroid: false,
  isStandalone: false,
  handleInstall: async () => {},
});

// ── Capture beforeinstallprompt at module level — BEFORE React mounts ──────
// This is the critical fix. The browser fires this event very early during
// page load. If we only listen inside useEffect it's always too late.
let _globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    console.log("[PWA] beforeinstallprompt captured at module level");
    e.preventDefault();
    _globalDeferredPrompt = e as BeforeInstallPromptEvent;
  });
}

// ── Provider ─────────────────────────────────────────────────────────────
export function PWAProvider({ children }: { children: ReactNode }) {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

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

    // Already installed — nothing to do
    if (standalone) {
      setCanInstall(false);
      return;
    }

    // Pick up the prompt captured before React mounted
    if (_globalDeferredPrompt) {
      console.log("[PWA] Using module-level deferred prompt in effect");
      promptRef.current = _globalDeferredPrompt;
      setCanInstall(true);
    }

    // Also listen for future firings (e.g. after dismissal + revisit)
    const onPrompt = (e: Event) => {
      console.log("[PWA] beforeinstallprompt received in useEffect");
      e.preventDefault();
      _globalDeferredPrompt = e as BeforeInstallPromptEvent;
      promptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const onInstalled = () => {
      console.log("[PWA] appinstalled fired");
      _globalDeferredPrompt = null;
      promptRef.current = null;
      setCanInstall(false);
      setIsInstalling(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS and Android browsers that never fire beforeinstallprompt
    // still need to show the Install button with manual instructions
    if (ios || android) {
      setCanInstall(true);
    }

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => console.log("[PWA] SW registered:", reg.scope))
        .catch((err) => console.warn("[PWA] SW registration failed:", err));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = promptRef.current ?? _globalDeferredPrompt;
    console.log(
      "[PWA] handleInstall called — prompt:",
      !!prompt,
      "iOS:",
      isIOS,
      "Android:",
      isAndroid,
    );

    if (isStandalone) {
      alert("OmniTask Pro is already installed on your device.");
      return;
    }

    setIsInstalling(true);

    try {
      // ── Path 1: Native browser install prompt ─────────────────────────
      // Works on Android Chrome, Edge, and desktop Chrome/Edge
      if (prompt) {
        console.log("[PWA] Triggering native install prompt");
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        console.log("[PWA] User choice:", outcome);

        if (outcome === "accepted") {
          _globalDeferredPrompt = null;
          promptRef.current = null;
          setCanInstall(false);
          setTimeout(() => setIsInstalling(false), 1500);
        } else {
          setIsInstalling(false);
        }
        return;
      }

      // ── Path 2: iOS Safari — open share sheet ─────────────────────────
      if (isIOS) {
        setIsInstalling(false);
        const isSafari =
          /Safari/.test(navigator.userAgent) &&
          !/CriOS|FxiOS|OPiOS|mercury/.test(navigator.userAgent);

        if (isSafari && navigator.share) {
          try {
            await navigator.share({
              title: "OmniTask Pro",
              text: "Add OmniTask Pro to your Home Screen",
              url: window.location.origin,
            });
          } catch {
            // User cancelled — that's fine
          }
        } else {
          alert(
            "To install OmniTask Pro on your iPhone:\n\n" +
              "1. Open this page in Safari\n" +
              "2. Tap the Share button (box with arrow ↑)\n" +
              '3. Tap "Add to Home Screen"\n' +
              '4. Tap "Add"',
          );
        }
        return;
      }

      // ── Path 3: Android — no native prompt available ───────────────────
      // (Samsung Internet, Firefox for Android, older Chrome)
      if (isAndroid) {
        setIsInstalling(false);
        const ua = navigator.userAgent;
        const isSamsungBrowser = /SamsungBrowser/.test(ua);
        const isFirefox = /Firefox/.test(ua);

        if (isSamsungBrowser) {
          alert(
            "To install OmniTask Pro:\n\n" +
              "1. Tap the menu icon (☰) at the bottom\n" +
              '2. Tap "Add page to"\n' +
              '3. Tap "Home screen"\n' +
              '4. Tap "Add"',
          );
        } else if (isFirefox) {
          alert(
            "To install OmniTask Pro:\n\n" +
              "1. Tap the menu icon (⋮) at the top right\n" +
              '2. Tap "Install"\n' +
              '3. Tap "Add to Home screen"',
          );
        } else {
          // Generic Android Chrome fallback
          alert(
            "To install OmniTask Pro:\n\n" +
              "1. Tap the menu icon (⋮) at the top right\n" +
              '2. Tap "Add to Home screen"\n' +
              '3. Tap "Add"\n\n' +
              "Tip: Make sure you are using Chrome for automatic install.",
          );
        }
        return;
      }

      // ── Path 4: Desktop — no native prompt ────────────────────────────
      setIsInstalling(false);
      alert(
        "To install OmniTask Pro on desktop:\n\n" +
          "Chrome / Edge: Click the install icon (⊕) in the address bar\n" +
          "Firefox: Click the install icon in the address bar\n" +
          "Safari (Mac): File → Add to Dock",
      );
    } catch (error) {
      console.error("[PWA] Install error:", error);
      setIsInstalling(false);
    }
  };

  return (
    <PWAContext.Provider
      value={{
        deferredPrompt: promptRef.current,
        isInstalling,
        canInstall,
        isIOS,
        isAndroid,
        isStandalone,
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
