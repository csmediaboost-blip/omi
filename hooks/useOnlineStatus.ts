// hooks/useOnlineStatus.ts
import { useState, useEffect } from "react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true); // default optimistic

  useEffect(() => {
    // Only mark offline after browser confirms it
    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => setIsOnline(true);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Check actual connectivity via Supabase health
    const checkSupabase = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,
          { method: "HEAD", signal: AbortSignal.timeout(5000) },
        );
        setIsOnline(res.ok || res.status === 401); // 401 = reachable but unauthed
      } catch {
        setIsOnline(false);
      }
    };

    checkSupabase();

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return isOnline;
}
