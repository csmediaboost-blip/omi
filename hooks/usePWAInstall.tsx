"use client";
// hooks/usePWAInstall.tsx
// Global PWA install state management
// Used by both PWAInstallBanner and mobile-bottom-nav components

import {
  createContext,
  useContext,
  useEffect,
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
  handleInstall: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType>({
  deferredPrompt: null,
  isInstalling: false,
  canInstall: false,
  isIOS: false,
  handleInstall: async () => {},
});

export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Capture beforeinstallprompt event globally
  useEffect(() => {
    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      console.log("[PWA] beforeinstallprompt event fired globally");
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      console.log("[PWA] App installed successfully");
      setDeferredPrompt(null);
      setCanInstall(false);
    };

    // Add listeners at the earliest possible moment
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Check if app is already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      console.log("[PWA] App is running in standalone mode");
      setCanInstall(false);
      setDeferredPrompt(null);
    }

    // On desktop or if no beforeinstallprompt in 3 seconds, allow install via other means
    const timer = setTimeout(() => {
      if (
        !deferredPrompt &&
        !window.matchMedia("(display-mode: standalone)").matches
      ) {
        // Even without beforeinstallprompt, user can install PWA
        console.log("[PWA] No  detected, enabling fallback install");
        setCanInstall(true);
      }
    }, 3000);

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[PWA] Service Worker registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    console.log(
      "[PWA] Install handler called, has deferred prompt:",
      !!deferredPrompt,
    );

    try {
      setIsInstalling(true);

      // Android/Chrome: Auto-trigger beforeinstallprompt
      if (deferredPrompt) {
        console.log("[PWA] Auto-triggering beforeinstallprompt for Android");
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        console.log("[PWA] Install prompt outcome:", outcome);

        if (outcome === "accepted") {
          console.log("[PWA] User accepted installation");
          setDeferredPrompt(null);
          setCanInstall(false);
          // Keep the installing state briefly to show success
          setTimeout(() => {
            setIsInstalling(false);
          }, 1500);
        } else {
          setIsInstalling(false);
        }
      }
      // iOS: Open App Store or direct safari install
      else if (isIOS) {
        console.log("[PWA] iOS detected, initiating home screen add");
        const userAgent = navigator.userAgent.toLowerCase();
        const isSafari =
          /safari/.test(userAgent) && !/chrome|crios|firefox/.test(userAgent);

        if (isSafari) {
          // For Safari on iOS, trigger the share sheet
          try {
            if (navigator.share) {
              setIsInstalling(false);
              await navigator.share({
                title: "OmniTask Pro",
                text: "Install OmniTask Pro",
                url: window.location.href,
              });
              // After share, assume user will add to home screen
              setTimeout(() => setCanInstall(false), 1500);
            } else {
              // Fallback: show direct instructions
              alert(
                "To install OmniTask Pro on iOS:\n\n1. Tap Share (box with arrow)\n2. Tap 'Add to Home Screen'\n3. Tap 'Add'",
              );
              setIsInstalling(false);
            }
          } catch (err) {
            console.log("[PWA] Share failed or cancelled");
            setIsInstalling(false);
          }
        } else {
          // Chrome/Firefox on iOS - show native instructions
          alert(
            "To install OmniTask Pro on iOS:\n\n1. Tap the browser menu (⋮)\n2. Select 'Add to Home Screen'\n3. Tap 'Add'",
          );
          setIsInstalling(false);
        }
      }
      // Desktop: Trigger browser's native install UI
      else {
        console.log("[PWA] Desktop mode detected - attempting native install");
        // On desktop Chrome/Edge, wait for beforeinstallprompt
        // If no prompt within 3 seconds, user can look for manual install icon
        const desktopTimeout = setTimeout(() => {
          alert(
            "To install OmniTask Pro:\n\n" +
              "Chrome/Edge: Click the install icon in the address bar\n" +
              "Firefox: Click the install icon in the address bar\n" +
              "Safari: File → Add to Dock",
          );
          setIsInstalling(false);
        }, 2500);

        // Clean up timeout if prompt comes through
        return () => clearTimeout(desktopTimeout);
      }
    } catch (error) {
      console.error("[PWA] Installation error:", error);
      setIsInstalling(false);
    }
  };

  return (
    <PWAContext.Provider
      value={{ deferredPrompt, isInstalling, canInstall, isIOS, handleInstall }}
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
