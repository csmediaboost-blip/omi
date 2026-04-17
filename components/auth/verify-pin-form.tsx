"use client";
// components/auth/verify-pin-form.tsx
// EXPORTS: named export VerifyPinForm + default export (both work)

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Lock, Shield } from "lucide-react";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 30;
const PIN_COOKIE = "pin_verified";

async function hashPin(pin: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + userId);
  const buf = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function setPinVerifiedCookie(userId: string) {
  document.cookie = `${PIN_COOKIE}=${userId}; path=/; SameSite=Lax`;
}

function clearPinCookie() {
  document.cookie = `${PIN_COOKIE}=; path=/; max-age=0`;
}

// ── Named export — imported as: import { VerifyPinForm } from "..."
export function VerifyPinForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [storedHash, setStoredHash] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!isLocked || !lockedUntil) return;
    const iv = setInterval(() => {
      if (new Date() >= lockedUntil) {
        setIsLocked(false);
        setLockedUntil(null);
        setAttempts(0);
        setError("");
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [isLocked, lockedUntil]);

  async function init() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/signin");
        return;
      }
      setUserId(user.id);

      const { data, error: dbErr } = await supabase
        .from("users")
        .select("pin_hash, pin_attempts, pin_locked, pin_locked_until")
        .eq("id", user.id)
        .single();

      if (dbErr || !data?.pin_hash) {
        setPinVerifiedCookie(user.id);
        window.location.replace("/dashboard");
        return;
      }

      setStoredHash(data.pin_hash);
      setAttempts(data.pin_attempts || 0);

      if (data.pin_locked) {
        const until = data.pin_locked_until
          ? new Date(data.pin_locked_until)
          : null;
        if (until && new Date() < until) {
          setIsLocked(true);
          setLockedUntil(until);
        }
      }

      setReady(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      router.replace("/auth/signin");
    }
  }

  async function handleVerify() {
    if (!pin || pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    if (!userId) {
      router.replace("/auth/signin");
      return;
    }
    if (!storedHash) {
      setPinVerifiedCookie(userId);
      window.location.replace("/dashboard");
      return;
    }
    if (isLocked) {
      setError(
        `Account locked. Try again after ${lockedUntil?.toLocaleTimeString()}.`,
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const isHashed = /^[a-f0-9]{64}$/.test(storedHash);
      let isCorrect = false;

      if (isHashed) {
        isCorrect = (await hashPin(pin, userId)) === storedHash;
      } else {
        isCorrect = pin === storedHash;
        if (isCorrect) {
          hashPin(pin, userId).then((hash) => {
            supabase
              .from("users")
              .update({ pin_hash: hash })
              .eq("id", userId)
              .then(() => {});
          });
        }
      }

      if (isCorrect) {
        supabase
          .from("users")
          .update({
            pin_attempts: 0,
            pin_locked: false,
            pin_locked_until: null,
            last_pin_attempt_at: new Date().toISOString(),
          })
          .eq("id", userId)
          .then(() => {});

        setPinVerifiedCookie(userId);
        window.location.replace("/dashboard");
      } else {
        const newAttempts = attempts + 1;
        const shouldLock = newAttempts >= MAX_ATTEMPTS;
        const lockDate = shouldLock
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null;

        setAttempts(newAttempts);
        if (shouldLock) {
          setIsLocked(true);
          setLockedUntil(lockDate!);
          setError(
            `Too many failed attempts. Locked for ${LOCK_MINUTES} minutes.`,
          );
        } else {
          setError(
            `Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""} remaining.`,
          );
        }
        setPin("");

        supabase
          .from("users")
          .update({
            pin_attempts: newAttempts,
            pin_locked: shouldLock,
            pin_locked_until: lockDate?.toISOString() ?? null,
            last_pin_attempt_at: new Date().toISOString(),
          })
          .eq("id", userId)
          .then(() => {});
      }
    } catch {
      setError("Verification error. Please try again.");
    }
    setLoading(false);
  }

  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#030712" }}
      >
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const minutesLeft = lockedUntil
    ? Math.ceil((lockedUntil.getTime() - Date.now()) / 60000)
    : 0;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#030712" }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{
              background: isLocked
                ? "rgba(239,68,68,0.1)"
                : "rgba(16,185,129,0.1)",
              border: isLocked
                ? "1px solid rgba(239,68,68,0.25)"
                : "1px solid rgba(16,185,129,0.25)",
            }}
          >
            {isLocked ? (
              <Lock size={28} className="text-red-400" />
            ) : (
              <Shield size={28} className="text-emerald-400" />
            )}
          </div>
          <h1 className="text-white font-black text-2xl">Verify PIN</h1>
          <p className="text-slate-400 text-sm">
            {isLocked
              ? "Account temporarily locked"
              : "Enter your security PIN to continue"}
          </p>
        </div>

        {isLocked ? (
          <div
            className="rounded-2xl p-6 text-center space-y-2"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <Lock size={24} className="text-red-400 mx-auto" />
            <p className="text-red-300 font-bold">Account Locked</p>
            <p className="text-red-400/70 text-sm">Too many failed attempts.</p>
            <p className="text-red-300 text-sm font-semibold">
              Try again in {minutesLeft} minute{minutesLeft !== 1 ? "s" : ""}
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="space-y-1.5">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                Security PIN
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ""));
                    setError("");
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !loading && handleVerify()
                  }
                  placeholder="••••"
                  className="w-full px-4 py-3.5 pr-11 rounded-xl text-white text-lg font-bold tracking-[0.5em] text-center bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                  style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
                >
                  {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {attempts > 0 && attempts < MAX_ATTEMPTS && (
              <div
                className="rounded-xl px-4 py-2.5 text-center"
                style={{
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.2)",
                }}
              >
                <p className="text-amber-400 text-xs font-semibold">
                  ⚠️ {MAX_ATTEMPTS - attempts} attempt
                  {MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} remaining
                </p>
              </div>
            )}

            {error && (
              <div
                className="rounded-xl px-4 py-3"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleVerify}
              disabled={loading || pin.length < 4}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
                  Verifying...
                </>
              ) : (
                "Login Account"
              )}
            </button>
          </div>
        )}

        <p className="text-center text-slate-500 text-sm">
          Forgot PIN?{" "}
          <a
            href="/auth/reset-pin"
            className="text-emerald-400 hover:underline font-semibold"
          >
            Reset here
          </a>
        </p>
      </div>
    </div>
  );
}

// Default export also provided so both import styles work
export default VerifyPinForm;
