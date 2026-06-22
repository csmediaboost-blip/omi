"use client";
// components/auth/verify-pin-form.tsx
// FIXES:
// 1. PIN cookie verified properly — no redirect loop when already verified
// 2. Numeric PIN pad (no QWERTY/ABC keyboard shown)
// 3. "Admin" language replaced with company-facing copy
// 4. Hidden input uses readOnly + inputMode="none" to suppress ALL keyboards

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lock, Shield, Eye, EyeOff } from "lucide-react";
import { PinPad } from "@/components/ui/pin-pad";

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
  // Session-level cookie — cleared when browser closes
  document.cookie = `${PIN_COOKIE}=${userId}; path=/; SameSite=Lax`;
}

function getPinCookieUserId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${PIN_COOKIE}=`));
  return match ? match.split("=")[1] : null;
}

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

  // FIX 1: Check if PIN cookie already valid — skip verify screen entirely
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

      // FIX 1: If cookie matches this user, skip PIN screen
      const cookieUid = getPinCookieUserId();
      if (cookieUid === user.id) {
        window.location.replace("/dashboard");
        return;
      }

      setUserId(user.id);

      const { data, error: dbErr } = await supabase
        .from("users")
        .select("pin_hash, pin_attempts, pin_locked, pin_locked_until, pin_set")
        .eq("id", user.id)
        .single();

      // If no PIN set yet, let them through
      if (dbErr || !data?.pin_hash || !data?.pin_set) {
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
    } catch {
      router.replace("/auth/signin");
    }
  }

  async function handleVerify() {
    if (!pin || pin.length < 4) {
      setError("Please enter your full PIN.");
      return;
    }
    if (!userId || !storedHash) return;
    if (isLocked) {
      setError(
        `Account locked. Try again after ${lockedUntil?.toLocaleTimeString()}.`,
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Support both hashed and legacy plain-text PINs
      const isHashed = /^[a-f0-9]{64}$/.test(storedHash);
      let isCorrect = false;

      if (isHashed) {
        isCorrect = (await hashPin(pin, userId)) === storedHash;
      } else {
        // Legacy plain PIN — verify then silently upgrade to hashed
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
        // Reset attempts, set verified cookie, redirect
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
            `Too many failed attempts. Your account is locked for ${LOCK_MINUTES} minutes.`,
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
      setError("Verification failed. Please try again.");
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

  // PIN display — dots
  const dots = Array.from({ length: 6 }, (_, i) => i < pin.length);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#030712" }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
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
          <h1 className="text-white font-black text-2xl">
            {isLocked ? "Account Locked" : "Enter Your PIN"}
          </h1>
          <p className="text-slate-400 text-sm">
            {isLocked
              ? `Too many incorrect attempts — locked for ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}`
              : "Enter your security PIN to access your account"}
          </p>
        </div>

        {isLocked ? (
          <div
            className="rounded-2xl p-6 text-center space-y-3"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <Lock size={32} className="text-red-400 mx-auto" />
            <p className="text-red-300 font-bold text-lg">Temporarily Locked</p>
            <p className="text-red-400/70 text-sm">
              For your account security, access has been paused after too many
              failed attempts.
            </p>
            <p className="text-red-300 font-semibold">
              Try again in {minutesLeft} minute{minutesLeft !== 1 ? "s" : ""}
            </p>
            <p className="text-slate-500 text-xs mt-2">
              If you&apos;ve forgotten your PIN, you can reset it below.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* PIN dot display */}
            <div className="flex justify-center gap-3">
              {dots.map((filled, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    filled
                      ? "bg-emerald-400 border-emerald-400 scale-110"
                      : "border-slate-600 bg-transparent"
                  }`}
                />
              ))}
            </div>

            {/* FIX 3: Numeric PIN pad — no QWERTY keyboard */}
            <PinPad
              value={pin}
              onChange={(v) => {
                setPin(v);
                setError("");
              }}
              maxLength={6}
              disabled={loading}
            />

            {/* Attempt warning */}
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
                  {MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} remaining before
                  account lock
                </p>
              </div>
            )}

            {/* Error */}
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

            {/* Submit */}
            <button
              onClick={handleVerify}
              disabled={loading || pin.length < 4}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Confirm PIN
                </>
              )}
            </button>
          </div>
        )}

        {/* FIX 2: Company language — no "admin" */}
        <p className="text-center text-slate-500 text-sm">
          Forgot your PIN?{" "}
          <a
            href="/auth/reset-pin"
            className="text-emerald-400 hover:underline font-semibold"
          >
            Reset via email →
          </a>
        </p>
      </div>
    </div>
  );
}

export default VerifyPinForm;
