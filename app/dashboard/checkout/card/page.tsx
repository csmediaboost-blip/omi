"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowLeft, CheckCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function formatCardNumber(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function formatExpiry(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : d;
}

function detectCardType(n: string): "visa" | "mc" | "unsupported" {
  const d = n.replace(/\s/g, "");
  if (/^4/.test(d)) return "visa";
  if (/^5[1-5]|^2[2-7]/.test(d)) return "mc";
  return "unsupported";
}

function validateCardNumber(num: string): boolean {
  const digits = num.replace(/\s/g, "").replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0,
    isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

function VisaLogo() {
  return (
    <svg viewBox="0 0 60 20" className="h-4 w-auto" fill="none">
      <text
        x="0"
        y="16"
        fontFamily="Arial"
        fontWeight="900"
        fontSize="18"
        fill="#1a1f71"
      >
        VISA
      </text>
    </svg>
  );
}

function MCLogo() {
  return (
    <svg viewBox="0 0 38 24" className="h-5 w-auto">
      <circle cx="15" cy="12" r="11" fill="#eb001b" />
      <circle cx="23" cy="12" r="11" fill="#f79e1b" />
      <path d="M19 4.8a11 11 0 0 1 0 14.4A11 11 0 0 1 19 4.8z" fill="#ff5f00" />
    </svg>
  );
}

export default function CardDetailsPage() {
  const router = useRouter();
  const cvvRef = useRef<HTMLInputElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [card, setCard] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
  });

  const [cardPhoneNumber, setCardPhoneNumber] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof card>>({});
  const [cardType, setCardType] = useState<"visa" | "mc" | "unsupported">(
    "unsupported",
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  function validateCard() {
    const e: Partial<typeof card> = {};
    if (card.number.replace(/\s/g, "").length < 15)
      e.number = "Invalid card number";
    if (!card.name.trim()) e.name = "Name required";
    const [mm, yy] = card.expiry.split("/");
    if (!mm || !yy || parseInt(mm) > 12 || parseInt(yy) < 25)
      e.expiry = "Invalid expiry";
    if (card.cvv.length < 3) e.cvv = "Invalid CVV";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function isValidCard(cardData: typeof card): boolean {
    if (!cardData.number.replace(/\s/g, "")) return false;
    if (!validateCardNumber(cardData.number)) return false;
    if (detectCardType(cardData.number) === "unsupported") return false;
    if (!cardData.name || cardData.name.length < 3) return false;
    const [month, year] = cardData.expiry.split("/");
    const expireDate = new Date(
      parseInt(year ? "20" + year : "2000"),
      parseInt(month || "01") - 1,
    );
    if (expireDate < new Date()) return false;
    if (!cardData.cvv || cardData.cvv.length < 3) return false;
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateCard() || !isMounted) return;

    setLoading(true);

    try {
      const cardData = {
        number: card.number,
        name: card.name,
        expiry: card.expiry,
        cvv: card.cvv,
        phoneNumber: cardPhoneNumber,
        saveCard,
        cardType: detectCardType(card.number),
      };

      sessionStorage.setItem("pendingCardData", JSON.stringify(cardData));

      const checkoutUrl = new URL(
        "/dashboard/checkout",
        window.location.origin,
      );
      const currentParams = new URLSearchParams(window.location.search);

      currentParams.forEach((value, key) => {
        checkoutUrl.searchParams.set(key, value);
      });

      checkoutUrl.searchParams.set("step", "details");

      router.push(checkoutUrl.pathname + checkoutUrl.search);
    } catch (err) {
      console.error("[v0] Card submission error:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setCard({ ...card, number: formatted });
    const type = detectCardType(formatted);
    setCardType(type);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-slate-950">
      <div className="max-w-[560px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm mb-6"
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-4">
              <Lock size={28} className="text-emerald-400" />
            </div>
            <h1 className="text-3xl font-black text-white mb-2">
              Card Details
            </h1>
            <p className="text-slate-400 text-sm">
              Enter your card information securely
            </p>
          </div>
        </div>

        {/* Card Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl p-6 bg-slate-900/80 border border-white/8 space-y-4">
            {/* Card Number */}
            <div>
              <label className="block text-white text-sm font-bold mb-2">
                Card Number
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="1234 5678 9012 3456"
                  value={card.number}
                  onChange={handleCardNumberChange}
                  className={`w-full px-4 py-3 bg-black/30 rounded-lg text-white placeholder-slate-500 font-mono focus:outline-none transition-all ${
                    cardType === "unsupported" && card.number
                      ? "border-2 border-red-500"
                      : "border border-slate-700 focus:border-slate-500"
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {cardType === "visa" && <VisaLogo />}
                  {cardType === "mc" && <MCLogo />}
                </div>
              </div>
              {cardType === "unsupported" && card.number && (
                <p className="text-red-400 text-xs mt-1">
                  Only Visa and Mastercard accepted
                </p>
              )}
              {errors.number && (
                <p className="text-red-400 text-xs mt-1">{errors.number}</p>
              )}
            </div>

            {/* Cardholder Name */}
            <div>
              <label className="block text-white text-sm font-bold mb-2">
                Cardholder Name
              </label>
              <input
                type="text"
                placeholder="John Doe"
                value={card.name}
                onChange={(e) => setCard({ ...card, name: e.target.value })}
                className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"
              />
              {errors.name && (
                <p className="text-red-400 text-xs mt-1">{errors.name}</p>
              )}
            </div>

            {/* Expiry & CVV */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white text-sm font-bold mb-2">
                  Expiry
                </label>
                <input
                  type="text"
                  placeholder="MM/YY"
                  value={card.expiry}
                  onChange={(e) =>
                    setCard({
                      ...card,
                      expiry: formatExpiry(e.target.value),
                    })
                  }
                  className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white font-mono focus:outline-none"
                />
                {errors.expiry && (
                  <p className="text-red-400 text-xs mt-1">{errors.expiry}</p>
                )}
              </div>
              <div>
                <label className="block text-white text-sm font-bold mb-2">
                  CVV
                </label>
                <input
                  type="text"
                  placeholder="123"
                  value={card.cvv}
                  onChange={(e) =>
                    setCard({
                      ...card,
                      cvv: e.target.value.replace(/\D/g, "").slice(0, 4),
                    })
                  }
                  className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white font-mono focus:outline-none"
                />
                {errors.cvv && (
                  <p className="text-red-400 text-xs mt-1">{errors.cvv}</p>
                )}
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-white text-sm font-bold mb-2">
                Phone Number (Linked to Card)
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={cardPhoneNumber}
                onChange={(e) =>
                  setCardPhoneNumber(
                    e.target.value.replace(/[^\d+\-\s()]/g, ""),
                  )
                }
                className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"
              />
              <p className="text-slate-400 text-xs mt-1">
                We&apos;ll send an OTP to this number
              </p>
            </div>

            {/* Save Card Checkbox */}
            <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={saveCard}
                onChange={(e) => setSaveCard(e.target.checked)}
                className="rounded"
              />
              Save card for future purchases
            </label>
          </div>

          {/* Security Notice */}
          <div className="rounded-lg p-4 bg-emerald-500/10 border border-emerald-500/30">
            <p className="text-emerald-300 text-xs flex gap-2 items-start">
              <Lock size={14} className="shrink-0 mt-0.5" />
              <span>
                Your card information is encrypted and never stored. You&apos;ll
                receive an OTP for secure verification.
              </span>
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !isValidCard(card)}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
              loading || !isValidCard(card)
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Continue to Verification
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
