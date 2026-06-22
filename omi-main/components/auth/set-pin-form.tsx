"use client";
// components/auth/set-pin-form.tsx
// FIXES:
// 1. Sets pin_verified cookie immediately after PIN saved — so user isn't asked again
// 2. Numeric PIN pad (no QWERTY)
// 3. Company-facing language (no "admin" references)
// 4. pin_set flag written to DB so verify-pin knows PIN exists

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Shield, Lock, CheckCircle } from "lucide-react";
import { PinPad } from "@/components/ui/pin-pad";

const PinSchema = z
  .object({
    pin: z
      .string()
      .min(4, "PIN must be at least 4 digits")
      .max(6, "PIN must be max 6 digits")
      .regex(/^\d+$/, "PIN must only contain numbers"),
    confirmPin: z.string(),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs do not match",
    path: ["confirmPin"],
  });

type PinFormData = z.infer<typeof PinSchema>;

async function hashPin(pin: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + userId);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function setPinVerifiedCookie(userId: string) {
  document.cookie = `pin_verified=${userId}; path=/; SameSite=Lax`;
}

export function SetPinForm() {
  const [loading, setLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session?.user) {
        setSessionError("Your session has expired. Please sign in again.");
      }
    };
    checkSession();
  }, []);

  function handlePinNext() {
    setPinError("");
    if (pin.length < 4) {
      setPinError("PIN must be at least 4 digits.");
      return;
    }
    setStep("confirm");
  }

  async function handleConfirm() {
    setPinError("");
    if (confirmPin !== pin) {
      setPinError("PINs do not match. Please try again.");
      setConfirmPin("");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (sessionErr || !session?.user)
        throw new Error("Session expired. Please sign in again.");

      const hashedPin = await hashPin(pin, session.user.id);

      const { error: updateError } = await supabase
        .from("users")
        .update({
          pin_hash: hashedPin,
          pin_set: true, // mark PIN as set so verify-pin knows
          pin_attempts: 0,
          pin_locked: false,
        })
        .eq("id", session.user.id);

      if (updateError) {
        if (
          updateError.message?.includes("infinite recursion") ||
          updateError.message?.includes("policy")
        ) {
          throw new Error(
            "A database configuration error occurred. Please contact our support team. (" +
              updateError.message +
              ")",
          );
        }
        throw updateError;
      }

      // FIX 1: Set verified cookie immediately — user won't be asked for PIN again this session
      setPinVerifiedCookie(session.user.id);

      toast.success("Security PIN created successfully!");
      router.refresh();
      router.replace("/dashboard");
    } catch (error: any) {
      console.error("PIN Error:", error);
      toast.error(error.message || "Failed to save PIN. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Dots display
  const currentVal = step === "enter" ? pin : confirmPin;
  const dots = Array.from({ length: 6 }, (_, i) => i < currentVal.length);

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
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.25)",
            }}
          >
            <Shield size={28} className="text-emerald-400" />
          </div>
          <h1 className="text-white font-black text-2xl">
            {step === "enter" ? "Create Security PIN" : "Confirm Your PIN"}
          </h1>
          <p className="text-slate-400 text-sm">
            {step === "enter"
              ? "Your PIN protects your account and is required for withdrawals"
              : "Re-enter your PIN to confirm it"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          <div
            className={`h-1.5 w-12 rounded-full transition-all ${step === "enter" ? "bg-emerald-500" : "bg-emerald-500"}`}
          />
          <div
            className={`h-1.5 w-12 rounded-full transition-all ${step === "confirm" ? "bg-emerald-500" : "bg-slate-700"}`}
          />
        </div>

        {/* Session error */}
        {sessionError && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 text-xs text-red-300 text-center">
            {sessionError}
          </div>
        )}

        {/* Card */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: "rgba(15,23,42,0.8)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Dot display */}
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

          {/* FIX 3: Numeric PIN pad */}
          {step === "enter" ? (
            <PinPad
              value={pin}
              onChange={(v) => {
                setPin(v);
                setPinError("");
              }}
              maxLength={6}
              disabled={loading}
            />
          ) : (
            <PinPad
              value={confirmPin}
              onChange={(v) => {
                setConfirmPin(v);
                setPinError("");
              }}
              maxLength={6}
              disabled={loading}
            />
          )}

          {/* Error */}
          {pinError && (
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              <p className="text-red-400 text-sm text-center">{pinError}</p>
            </div>
          )}

          {/* Action button */}
          {step === "enter" ? (
            <button
              type="button"
              onClick={handlePinNext}
              disabled={pin.length < 4 || loading || !!sessionError}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              Next →
            </button>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmPin.length < 4 || loading}
                className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    Confirm & Save PIN
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("enter");
                  setConfirmPin("");
                  setPinError("");
                }}
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-slate-400 text-sm border border-slate-700 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-40"
              >
                ← Change PIN
              </button>
            </div>
          )}
        </div>

        {/* FIX 2: Company language — no mention of "admin" */}
        <p className="text-center text-slate-600 text-xs">
          Your PIN is encrypted and stored securely by OmniTaskPro. It cannot be
          recovered — please memorise it or store it safely.
        </p>
      </div>
    </div>
  );
}

export default SetPinForm;
