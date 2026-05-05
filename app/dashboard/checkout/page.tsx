"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cacheService } from "@/lib/cache-service";
import {
  Lock,
  CheckCircle,
  ChevronRight,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Clock,
  Download,
  Globe,
  Shield,
  Cpu,
  Brain,
  Server,
  Copy,
  Check,
} from "lucide-react";

type CheckoutStep =
  | "country"
  | "details"
  | "processing"
  | "success"
  | "failed"
  | "pending_crypto"
  | "declined";
type PayMethod = "card" | "bank_transfer" | "crypto_wallet";
type PurchaseType = "gpu_plan" | "license" | "task";

const KORAPAY_COUNTRIES = new Set(["KE", "GH", "CM", "CI", "EG", "TZ", "NG"]);

const getPaymentMethodsForCountry = (
  countryCode: string,
  amount: number,
): PayMethod[] => {
  const methods: PayMethod[] = [];
  
  // Bank transfer available for supported countries (up to $10k limit)
  if (KORAPAY_COUNTRIES.has(countryCode) && amount <= 10000) {
    methods.push("bank_transfer");
  }
  
  // Crypto wallet and card always available
  methods.push("crypto_wallet");
  methods.push("card");
  
  return methods;
};

const COUNTRIES = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CM", name: "Cameroon (XAF)" },
  { code: "CI", name: "Côte d'Ivoire (XOF)" },
  { code: "EG", name: "Egypt (EGP)" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana (GHS)" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KE", name: "Kenya (KES)" },
  { code: "KW", name: "Kuwait" },
  { code: "LB", name: "Lebanon" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "MA", name: "Morocco" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PK", name: "Pakistan" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TZ", name: "Tanzania (TZS)" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
].sort((a, b) => a.name.localeCompare(b.name));

const LICENSE_CONFIGS: Record<
  string,
  { label: string; icon: any; color: string; features: string[] }
> = {
  thermal_optimization: {
    label: "Thermal & Neural Operator License",
    icon: Cpu,
    color: "#3b82f6",
    features: [
      "Daily Thermal Calibration — $0.50/day",
      "Neural Weight Re-alignment — $0.50/day",
      "7-day streak bonus multiplier",
      "Valid 4 years from activation",
    ],
  },
  rlhf_validation: {
    label: "RLHF Validation Operator License",
    icon: Brain,
    color: "#8b5cf6",
    features: [
      "Unlimited RLHF task access",
      "$0.10 per validated AI response",
      "Confidence-weighted rewards",
      "Valid 4 years from activation",
    ],
  },
  gpu_allocation: {
    label: "GPU Allocation Operator License",
    icon: Server,
    color: "#10b981",
    features: [
      "Live GPU client allocation",
      "Hourly compute revenue share",
      "5 enterprise client tiers",
      "Valid 4 years from activation",
    ],
  },
  operator_license: {
    label: "Certified AI Operator License",
    icon: Shield,
    color: "#f59e0b",
    features: [
      "Daily Thermal Calibration — $0.50/day",
      "RLHF Validation — $0.10/task",
      "GPU Client Allocation — hourly revenue",
      "Valid 4 years · Renewable",
    ],
  },
};

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

const PROCESSING_STEPS = [
  { id: 1, label: "Verifying payment details", ms: 1400 },
  { id: 2, label: "Securing payment channel", ms: 1800 },
  { id: 3, label: "Routing through payment network", ms: 2200 },
  { id: 4, label: "Completing your order", ms: 1600 },
  { id: 5, label: "Activating your access", ms: 1400 },
];

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

function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=1a1f2e&color=ffffff&margin=12`}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-xl"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-white/10"
    >
      {copied ? (
        <Check size={14} className="text-emerald-400" />
      ) : (
        <Copy size={14} className="text-slate-400" />
      )}
    </button>
  );
}

function Receipt({
  data,
  onClose,
}: {
  data: {
    txId: string;
    purchaseType: PurchaseType;
    nodeName: string;
    amount: number;
    daily: number;
    gpu: string;
    vram: string;
    payMethod: string;
    country: string;
    date: string;
    paymentModel: string;
    contractLabel: string;
    contractMinPct: number;
    contractMaxPct: number;
    contractMonths: number;
    licenseType: string;
    discounted?: boolean;
    originalAmount?: number;
    walletAddress?: string;
  };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isContract = data.paymentModel === "contract";
  const DAILY_PCT = 0.0013;
  const licConfig =
    LICENSE_CONFIGS[data.licenseType] || LICENSE_CONFIGS.operator_license;
  const contractDurationLabel =
    data.contractMonths === 6
      ? "6 months"
      : data.contractMonths === 12
        ? "12 months"
        : data.contractMonths === 24
          ? "2 years"
          : `${data.contractMonths} months`;
  function download() {
    if (!ref.current) return;
    const blob = new Blob([ref.current.innerText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `OmniTask-Receipt-${data.txId}.txt`;
    a.click();
  }
  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-2xl overflow-hidden"
        style={{
          background: "rgb(10,16,28)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={ref}>
          <div
            className="p-6 text-center"
            style={{
              background:
                "linear-gradient(135deg,rgba(16,185,129,0.15),rgba(6,12,24,0.9))",
            }}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={22} className="text-emerald-400" />
            </div>
            <h3 className="text-white font-black text-lg">Payment Receipt</h3>
            <p className="text-slate-400 text-xs mt-1">
              OmniTask Pro ·{" "}
              {data.purchaseType === "license"
                ? "Operator License"
                : "GPU Node Allocation"}
            </p>
          </div>
          <div className="px-6">
            <div className="border-t border-dashed border-slate-700" />
          </div>
          <div className="px-6 py-5 space-y-3 text-sm">
            {(data.purchaseType === "license"
              ? [
                  ["Transaction ID", data.txId],
                  ["Date & Time", data.date],
                  ["License Type", licConfig.label],
                  ["Validity", "4 years from activation"],
                  [
                    "Amount Paid",
                    `$${data.amount.toFixed(2)}${data.discounted ? " ✨ Crypto discount" : ""}`,
                  ],
                  ["Payment Method", data.payMethod],
                  ...(data.walletAddress
                    ? [["Wallet Address (Sender)", data.walletAddress]]
                    : []),
                  ["Country", data.country],
                  ["Status", "✅ License Activated"],
                ]
              : [
                  ["Transaction ID", data.txId],
                  ["Date & Time", data.date],
                  ["Node Allocated", data.nodeName],
                  ["GPU Model", data.gpu],
                  ["VRAM", data.vram],
                  [
                    "Payment Model",
                    isContract
                      ? `Contract — ${contractDurationLabel}`
                      : "Pay-as-you-go (Flexible)",
                  ],
                  ...(isContract
                    ? [
                        [
                          "Est. Return Range",
                          `${data.contractMinPct}% – ${data.contractMaxPct}%`,
                        ],
                      ]
                    : [
                        [
                          "Daily Earnings",
                          `~$${(data.amount * DAILY_PCT).toFixed(4)} / day`,
                        ],
                      ]),
                  [
                    "Amount Paid",
                    `$${data.amount.toFixed(2)}${data.discounted ? " ✨ Crypto discount" : ""}`,
                  ],
                  ["Payment Method", data.payMethod],
                  ...(data.walletAddress
                    ? [["Wallet Address (Sender)", data.walletAddress]]
                    : []),
                  ["Country", data.country],
                  ["Status", "✅ Confirmed"],
                ]
            ).map(([l, v]) => (
              <div key={l} className="flex justify-between items-start">
                <span className="text-slate-500 shrink-0 mr-4">{l}</span>
                <span className="text-white font-semibold text-right break-all">
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="px-6">
            <div className="border-t border-dashed border-slate-700" />
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-slate-600 text-[11px] leading-relaxed">
              {data.purchaseType === "license"
                ? "Your license is activated."
                : isContract
                  ? "Earnings accrue daily and unlock at contract maturity."
                  : "Earnings begin immediately. Withdraw anytime (min $10)."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={download}
            className="flex-1 flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            <Download size={13} /> Save Receipt
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderSummary({
  purchaseType,
  nodeName,
  gpu,
  vram,
  itype,
  paymentModel,
  contractLabel,
  contractMinPct,
  contractMaxPct,
  contractMonths,
  price,
  dailyEarning,
  hourlyEarning,
  licenseType,
  effectivePrice,
  cryptoDiscount,
  payMethod,
}: {
  purchaseType: PurchaseType;
  nodeName: string;
  gpu: string;
  vram: string;
  itype: string;
  paymentModel: string;
  contractLabel: string;
  contractMinPct: number;
  contractMaxPct: number;
  contractMonths: number;
  price: number;
  dailyEarning: number;
  hourlyEarning: number;
  licenseType: string;
  effectivePrice: number;
  cryptoDiscount: number;
  payMethod: PayMethod;
}) {
  const isContract = paymentModel === "contract";
  const contractDurationLabel =
    contractMonths === 6
      ? "6 months"
      : contractMonths === 12
        ? "12 months"
        : contractMonths === 24
          ? "2 years"
          : `${contractMonths} months`;
  const contractEarnMin = +((price * contractMinPct) / 100).toFixed(2);
  const contractEarnMax = +((price * contractMaxPct) / 100).toFixed(2);
  const licConfig =
    LICENSE_CONFIGS[licenseType] || LICENSE_CONFIGS.operator_license;
  const LicIcon = licConfig.icon;
  return (
    <div>
      <div className="text-2xl font-black text-white mb-6">Order Summary</div>
      {purchaseType === "gpu_plan" && (
        <>
          <div
            className="rounded-2xl p-6 mb-4"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="space-y-4">
              {[
                ["Plan", nodeName],
                ["GPU", gpu],
                ["VRAM", vram],
                [
                  "Payment Model",
                  isContract ? "📋 Contract-Based" : "⚡ Pay-as-you-go",
                ],
                ...(isContract
                  ? [
                      ["Contract Term", contractDurationLabel],
                      [
                        "Estimated Return Range",
                        `${contractMinPct}% – ${contractMaxPct}%`,
                      ],
                    ]
                  : [
                      ["Daily Earnings", `~$${dailyEarning.toFixed(4)} / day`],
                      [
                        "Hourly Earnings",
                        `~$${hourlyEarning.toFixed(5)} / hour`,
                      ],
                      ["Flexibility", "Withdraw anytime (min $10)"],
                    ]),
                ["Instance Type", itype.replace(/_/g, " ")],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between items-start">
                  <span className="text-slate-400 text-sm">{l}</span>
                  <span className="text-white font-semibold text-right max-w-[55%] text-sm">
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-700 my-4" />
            {payMethod === "trustwallet" && (
              <div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                <p className="text-violet-200 text-sm">
                  ✨ <strong>Crypto Discount:</strong> {cryptoDiscount}% off
                </p>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Mining Amount</span>
              <span className="text-2xl font-black text-emerald-400">
                ${effectivePrice.toFixed(2)}
              </span>
            </div>
          </div>
          {isContract ? (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <p className="text-amber-400 text-xs font-bold mb-1.5">
                ⚠ Mining Notice
              </p>
              <p className="text-amber-400/80 text-xs leading-relaxed">
                Capital of{" "}
                <strong className="text-amber-300">${price.toFixed(2)}</strong>{" "}
                locked for{" "}
                <strong className="text-amber-300">
                  {contractDurationLabel}
                </strong>
                . Estimated returns:{" "}
                <strong className="text-amber-300">
                  ${contractEarnMin}–${contractEarnMax}
                </strong>
                . <strong className="text-white">Not guaranteed.</strong>
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: "rgba(16,185,129,0.05)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <p className="text-emerald-400 text-xs font-bold mb-1.5">
                ⚡ Pay-as-you-go Terms
              </p>
              <p className="text-emerald-400/70 text-xs">
                0.13%/day — withdraw anytime. Returns not guaranteed.
              </p>
            </div>
          )}
        </>
      )}
      {purchaseType === "license" && (
        <>
          <div
            className="rounded-2xl p-6 mb-4"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-start gap-4 mb-5 pb-5 border-b border-slate-700">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: `${licConfig.color}18`,
                  border: `1px solid ${licConfig.color}40`,
                }}
              >
                <LicIcon size={22} style={{ color: licConfig.color }} />
              </div>
              <div>
                <p className="text-white font-black text-sm">
                  {licConfig.label}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  Certified AI Operator Program
                </p>
              </div>
            </div>
            <div className="space-y-2.5 mb-5">
              {licConfig.features.map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <CheckCircle
                    size={13}
                    style={{ color: licConfig.color }}
                    className="shrink-0"
                  />
                  <span className="text-slate-300 text-sm">{f}</span>
                </div>
              ))}
            </div>
            <div className="space-y-3 mb-4">
              {[
                ["License Fee (one-time)", `$${price.toFixed(2)}`],
                ["Validity", "4 years from activation"],
                ["Monthly Infrastructure", "$5.00 / month (auto-deducted)"],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between items-start">
                  <span className="text-slate-400 text-sm">{l}</span>
                  <span className="text-white font-semibold text-right text-sm">
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-700 my-4" />
            {payMethod === "trustwallet" && (
              <div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                <p className="text-violet-200 text-sm">
                  ✨ <strong>Crypto Discount:</strong> {cryptoDiscount}% off
                </p>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Due Today</span>
              <span className="text-2xl font-black text-amber-400">
                ${effectivePrice.toFixed(2)}
              </span>
            </div>
          </div>
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.2)",
            }}
          >
            <p className="text-amber-400 text-xs font-bold mb-1">
              ⚠ License Terms
            </p>
            <p className="text-amber-400/70 text-xs leading-relaxed">
              One-time fee of{" "}
              <strong className="text-amber-300">${price.toFixed(2)}</strong>.
              Monthly $5.00 infrastructure charge. All sales final once
              activated.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN INNER COMPONENT (uses useSearchParams) ──────────────
function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<CheckoutStep>("country");
  const [userId, setUserId] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [cryptoDiscount, setCryptoDiscount] = useState(5);
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("TRC-20 (TRON)");
  const [cryptoQrImageUrl, setCryptoQrImageUrl] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [countrySearch, setCountrySearch] = useState("");
  const [card, setCard] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
  });
  const [errors, setErrors] = useState<Partial<typeof card>>({});
  const [saveCard, setSaveCard] = useState(false);
  const cvvRef = useRef<HTMLInputElement>(null);
  const cardType = detectCardType(card.number);
  const [cardPhoneNumber, setCardPhoneNumber] = useState("");
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpAttempts, setOtpAttempts] = useState(0);
  const cardPaymentRequiresOtp = payMethod === "card";
  const [kpPhone, setKpPhone] = useState("");
  const [kpLoading, setKpLoading] = useState(false);
  const [twSenderAddress, setTwSenderAddress] = useState("");
  const [twConfirmed, setTwConfirmed] = useState(false);

  const rawPurchaseType = params.get("purchaseType");
  const nodeKey = params.get("node") || "foundation";
  const purchaseType: PurchaseType = rawPurchaseType
    ? (rawPurchaseType as PurchaseType)
    : nodeKey === "operator_license" ||
        nodeKey.includes("license") ||
        nodeKey.includes("optimization") ||
        nodeKey.includes("rlhf") ||
        nodeKey.includes("allocation")
      ? "license"
      : "gpu_plan";
  const nodeName = params.get("name") || "Foundation Node";
  const price = parseFloat(params.get("price") || "5");
  const itype = params.get("itype") || "on_demand";
  const gpu = params.get("gpu") || "Shared Pool (NVIDIA T4)";
  const vram = params.get("vram") || "16 GB GDDR6";
  const paymentModel = (params.get("paymentModel") || "flexible") as
    | "flexible"
    | "contract";
  const isContract = paymentModel === "contract";
  const contractMonths = parseInt(params.get("contractMonths") || "6");
  const contractLabel = params.get("contractLabel") || "6 Months";
  const contractMinPct = parseFloat(params.get("contractMinPct") || "52");
  const contractMaxPct = parseFloat(params.get("contractMaxPct") || "93");
  const lockInMonths = parseInt(params.get("lockInMonths") || "0");
  const lockInLabel =
    params.get("lockInLabel") || (isContract ? contractLabel : "Flexible");
  const lockInMultiplier = parseFloat(params.get("lockInMultiplier") || "1");
  const licenseType =
    params.get("licenseType") ||
    params.get("type") ||
    nodeKey ||
    "operator_license";
  const licConfig =
    LICENSE_CONFIGS[licenseType] || LICENSE_CONFIGS.operator_license;
  const DAILY_PCT = 0.0013;
  const dailyEarning = price * DAILY_PCT;
  const hourlyEarning = price * 0.0001;
  const discountedPrice = +(price * (1 - cryptoDiscount / 100)).toFixed(2);
  const isBankTransferAvailable = KORAPAY_COUNTRIES.has(countryCode);
  const effectivePrice = payMethod === "crypto_wallet" ? discountedPrice : price;

  useEffect(() => {
    const s = params.get("status");
    const r = params.get("reference");
    if (s === "success" && r) {
      setTransactionId(r);
      setStep("success");
      window.history.replaceState({}, "", "/dashboard/checkout");
    } else if (s === "declined" && r) {
      setTransactionId(r);
      setStep("declined");
      window.history.replaceState({}, "", "/dashboard/checkout");
    }
  }, [params]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("payment_config")
        .select("key,value");
      if (data) {
        const get = (k: string) => data.find((d) => d.key === k)?.value || "";
        const disc = get("crypto_discount_percent");
        const wallet = get("crypto_wallet_usdt_trc20");
        const network = get("crypto_network_label");
        const qr = get("crypto_qr_image_url");
        if (disc && !isNaN(parseFloat(disc)))
          setCryptoDiscount(parseFloat(disc));
        if (wallet && wallet !== "EMPTY" && wallet !== "")
          setCryptoWalletAddress(wallet);
        if (network && network !== "EMPTY" && network !== "")
          setCryptoNetwork(network);
        if (qr && qr !== "EMPTY" && qr !== "") setCryptoQrImageUrl(qr);
      }
      setConfigLoaded(true);
    };
    load();
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth/signin");
        return;
      }
      setUserId(user.id);
    });
  }, [router]);

  useEffect(() => {
    // Retrieve card data from sessionStorage if user came back from card page
    const pendingCardData = sessionStorage.getItem("pendingCardData");
    if (pendingCardData) {
      try {
        const cardData = JSON.parse(pendingCardData);
        setCard({
          number: cardData.number,
          name: cardData.name,
          expiry: cardData.expiry,
          cvv: cardData.cvv,
        });
        setCardPhoneNumber(cardData.phoneNumber);
        setSaveCard(cardData.saveCard);
        setPayMethod("card");
        sessionStorage.removeItem("pendingCardData");
      } catch (e) {
        console.error("Failed to parse card data", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!countryCode) return;
    setPayMethod(isBankTransferAvailable ? "bank_transfer" : "card");
  }, [countryCode, isBankTransferAvailable]);

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

  async function handleKoraPaySubmit() {
    if (!userId) {
      alert("User session not loaded. Please refresh the page.");
      return;
    }
    
    setKpLoading(true);
    
    try {
      // Get exchange rate for currency conversion
      let convertedPrice = price;
      let localCurrency = "USD";
      
      if (countryCode === "NG") {
        localCurrency = "NGN";
        convertedPrice = parseFloat((price * 766).toFixed(2)); // ~766 NGN per USD
      } else if (countryCode === "KE") {
        localCurrency = "KES";
        convertedPrice = parseFloat((price * 130).toFixed(2)); // ~130 KES per USD
      } else if (countryCode === "ZA") {
        localCurrency = "ZAR";
        convertedPrice = parseFloat((price * 18).toFixed(2)); // ~18 ZAR per USD
      } else if (countryCode === "GH") {
        localCurrency = "GHS";
        convertedPrice = parseFloat((price * 12.5).toFixed(2)); // ~12.5 GHS per USD
      } else if (countryCode === "CM") {
        localCurrency = "XAF";
        convertedPrice = parseFloat((price * 600).toFixed(2)); // ~600 XAF per USD
      } else if (countryCode === "CI") {
        localCurrency = "XOF";
        convertedPrice = parseFloat((price * 600).toFixed(2)); // ~600 XOF per USD
      } else if (countryCode === "EG") {
        localCurrency = "EGP";
        convertedPrice = parseFloat((price * 30).toFixed(2)); // ~30 EGP per USD
      } else if (countryCode === "TZ") {
        localCurrency = "TZS";
        convertedPrice = parseFloat((price * 2500).toFixed(2)); // ~2500 TZS per USD
      }

      const res = await fetch("/api/korapay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          phone: kpPhone.trim() || (userId ? userId.slice(0, 16).replace(/-/g, "") : ""), // Use user ID as fallback
          nodeKey,
          nodeName,
          price: convertedPrice, // Send converted price to Korapay
          originalPrice: price, // Keep original USD price for records
          currency: localCurrency,
          daily: dailyEarning,
          itype,
          gpu,
          vram,
          purchaseType,
          licenseType,
          paymentModel,
          contractMonths,
          contractLabel,
          contractMinPct,
          contractMaxPct,
          lockInMonths: isContract ? contractMonths : lockInMonths,
          lockInMultiplier,
          lockInLabel: isContract ? contractLabel : lockInLabel,
          countryCode,
          countryName,
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        console.error("[v0] Payment initiation error:", err);
        alert(`Payment error: ${err.error || "Failed to initialize payment"}`);
        setKpLoading(false);
        return;
      }
      
      const data = await res.json();
      console.log("[v0] KoraPay checkout URL received, redirecting...", data.checkoutUrl);
      
      // Redirect to KoraPay checkout
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert("Failed to get checkout URL. Please try again.");
        setKpLoading(false);
      }
    } catch (err: any) {
      console.error("[v0] Korapay submit error:", err);
      alert(`Error: ${err.message || "Failed to connect to payment gateway"}`);
      setKpLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (payMethod === "bank_transfer") {
  // Don't leave the page - keep user on checkout while KoraPay loads
  // The handleKoraPaySubmit function will handle the payment flow
  await handleKoraPaySubmit();
  // After successful KoraPay redirect, user will be taken to payment processor
  // Don't return early - let the async function handle the flow
  }
  if (payMethod === "card" && !validateCard()) return;
    if (payMethod === "crypto_wallet") {
      if (!twConfirmed) {
        alert("Please confirm you will send the payment.");
        return;
      }
      if (!cryptoWalletAddress) {
        alert("Payment wallet not configured.");
        return;
      }
    }
    setStep("processing");
    setProcessingStep(0);
    if (payMethod === "crypto_wallet") {
      setProcessingStep(1);
      await new Promise((r) => setTimeout(r, 1200));
      setProcessingStep(2);
      await new Promise((r) => setTimeout(r, 800));
      try {
        const txId = `CRYPTO-${Date.now()}`;
        if (userId) {
          await supabase
            .from("payment_transactions")
            .insert({
              user_id: userId,
              node_key: nodeKey,
              amount: discountedPrice,
              currency: "USDT",
              gateway: "crypto_wallet",
              status: "pending",
              gateway_reference: txId,
              receiving_wallet: cryptoWalletAddress,
              crypto_wallet: twSenderAddress || null,
              crypto_network: cryptoNetwork,
              crypto_currency: "USDT",
              verified_by_admin: false,
              metadata: JSON.stringify({
                purchaseType,
                licenseType,
                nodeName,
                gpu,
                vram,
                originalAmount: price,
                discountPercent: cryptoDiscount,
                daily: dailyEarning,
                paymentModel,
                contractMonths,
                contractLabel,
                contractMinPct,
                contractMaxPct,
                lockInMonths: isContract ? contractMonths : lockInMonths,
                lockInLabel: isContract ? contractLabel : lockInLabel,
                countryCode,
                countryName,
              }),
            });
        }
        setTransactionId(txId);
        setStep("pending_crypto");
      } catch (err: any) {
        setErrorMsg(err.message || "Failed.");
        setStep("failed");
      }
      return;
    }
    let cur = 0;
    for (const ps of PROCESSING_STEPS) {
      setProcessingStep(cur);
      await new Promise((r) => setTimeout(r, ps.ms));
      cur++;
    }
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          nodeKey,
          amount: price,
          currency: "USD",
          itype,
          payMethod,
          countryCode,
          gateway: "moonpay",
          purchaseType,
          licenseType,
          paymentModel,
          contractMonths,
          contractLabel,
          contractMinPct,
          contractMaxPct,
          lockInMonths: isContract ? contractMonths : lockInMonths,
          lockInMultiplier,
          lockInLabel: isContract ? contractLabel : lockInLabel,
          cardLast4: card.number ? card.number.replace(/\s/g, "").slice(-4) : "",
          cardType: card.number ? detectCardType(card.number) : "unknown",
          cardName: card.name || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      setTransactionId(data.transactionId || `TXN-${Date.now()}`);
      setStep("success");
    } catch (err: any) {
      setErrorMsg(err.message || "Payment could not be processed.");
      setStep("failed");
    }
  }

  const receiptData = {
    txId: transactionId,
    purchaseType,
    nodeName,
    amount: effectivePrice,
    daily: dailyEarning,
    gpu,
    vram,
    paymentModel,
    contractLabel,
    contractMinPct,
    contractMaxPct,
    contractMonths,
    licenseType,
    payMethod:
      payMethod === "bank_transfer"
        ? "Bank Transfer"
        : payMethod === "crypto_wallet"
          ? "Crypto Wallet (USDT)"
          : "Credit/Debit Card",
    country: countryName,
    date: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
    discounted: payMethod === "crypto_wallet",
    originalAmount: price,
    walletAddress: payMethod === "crypto_wallet" ? twSenderAddress : undefined,
  };
  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()),
  );

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: "#0d1117" }}>
      {showReceipt && (
        <Receipt data={receiptData} onClose={() => setShowReceipt(false)} />
      )}

      <div className="max-w-[960px] mx-auto mb-6">
        <button
          onClick={() =>
            step === "details" ? setStep("country") : router.back()
          }
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      {/* PENDING CRYPTO */}
      {step === "pending_crypto" && (
        <div className="max-w-[560px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(139,92,246,0.3)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-violet-500/15 border-2 border-violet-500/40 flex items-center justify-center mx-auto mb-5">
              <Clock size={28} className="text-violet-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              Payment Details Submitted
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6 leading-relaxed">
              Now send your USDT to the wallet address below. Our team will
              verify and{" "}
              <strong className="text-violet-300">
                activate your account within 30 minutes
              </strong>
              .
            </p>
            <div
              className="rounded-2xl p-5 mb-5 space-y-4"
              style={{
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              <p className="text-violet-300 text-xs font-black uppercase tracking-widest text-center">
                Send Payment To This Address
              </p>
              <div className="flex justify-center">
                {cryptoQrImageUrl ? (
                  <img
                    src={cryptoQrImageUrl}
                    alt="Payment QR"
                    className="w-40 h-40 rounded-xl object-contain"
                    style={{ background: "white", padding: "8px" }}
                  />
                ) : (
                  cryptoWalletAddress && (
                    <QRCode value={cryptoWalletAddress} size={160} />
                  )
                )}
              </div>
              <div
                className="rounded-xl p-3"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center gap-2">
                  <p className="text-white font-mono text-xs break-all flex-1 select-all">
                    {cryptoWalletAddress || "Loading..."}
                  </p>
                  {cryptoWalletAddress && (
                    <CopyButton text={cryptoWalletAddress} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ["Amount to Send", `${discountedPrice.toFixed(2)} USDT`],
                  ["Network", cryptoNetwork],
                  ["Currency", "USDT (Tether)"],
                  ["Transaction Ref", transactionId.slice(-12) + "..."],
                ].map(([l, v]) => (
                  <div
                    key={l}
                    className="rounded-lg p-2.5"
                    style={{ background: "rgba(0,0,0,0.3)" }}
                  >
                    <p className="text-slate-500 text-[10px] mb-0.5">{l}</p>
                    <p className="text-white font-bold text-xs break-all">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div
              className="rounded-xl p-3 mb-5"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <p className="text-amber-400 text-xs leading-relaxed">
                ⚠ <strong>Important:</strong> Send exactly{" "}
                <strong>{discountedPrice.toFixed(2)} USDT</strong> on the{" "}
                <strong>{cryptoNetwork}</strong> network only.
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-xl transition-all"
            >
              I've Sent the Payment — Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* DECLINED */}
      {step === "declined" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-5">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              Payment Declined
            </h2>
            <p className="text-slate-400 text-sm text-center mb-5">
              Your payment was declined or cancelled. Please try again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("details")}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg"
              >
                Try Again
              </button>
              <button
                onClick={() => router.back()}
                className="flex-1 border border-slate-700 text-slate-300 font-bold py-3 rounded-lg"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COUNTRY SELECTION */}
      {step === "country" && (
        <div className="max-w-[960px] mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2">
              Select Your Country
            </h1>
            <p className="text-slate-400">
              This determines your available payment methods
            </p>
          </div>
          <div
            className="rounded-2xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="mb-6 relative">
              <Globe
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search countries..."
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
              {filteredCountries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => {
                    setCountryCode(c.code);
                    setCountryName(c.name);
                  }}
                  className={`p-3 rounded-lg text-left transition-all border ${countryCode === c.code ? "bg-emerald-600/20 border-emerald-500 text-emerald-100" : "bg-black/20 border-slate-700 text-slate-300 hover:border-slate-600"}`}
                >
                  <div className="font-semibold text-sm">{c.name}</div>
                  <div className="text-xs opacity-70">{c.code}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => countryCode && setStep("details")}
              disabled={!countryCode}
              className={`w-full mt-6 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${countryCode ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-slate-700 text-slate-400 cursor-not-allowed"}`}
            >
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* PAYMENT DETAILS */}
      {step === "details" && (
        <div className="max-w-[960px] mx-auto">
          <div className="grid lg:grid-cols-[1fr_400px] gap-8">
            <OrderSummary
              purchaseType={purchaseType}
              nodeName={nodeName}
              gpu={gpu}
              vram={vram}
              itype={itype}
              paymentModel={paymentModel}
              contractLabel={contractLabel}
              contractMinPct={contractMinPct}
              contractMaxPct={contractMaxPct}
              contractMonths={contractMonths}
              price={price}
              dailyEarning={dailyEarning}
              hourlyEarning={hourlyEarning}
              licenseType={licenseType}
              effectivePrice={effectivePrice}
              cryptoDiscount={cryptoDiscount}
              payMethod={payMethod}
            />
            <div>
              <div className="text-xl font-bold text-white mb-2">
                Choose Payment Method
              </div>
              <p className="text-slate-400 text-xs mb-4">
                Crypto offers faster processing & exclusive discounts
              </p>
              {(() => {
                const availableMethods = getPaymentMethodsForCountry(
                  countryCode,
                  price,
                );
                return (
                  <div className="space-y-3 mb-6">
                    <button
                      onClick={() => setPayMethod("crypto_wallet")}
                      className={`w-full p-4 rounded-xl transition-all border-2 relative overflow-hidden ${payMethod === "crypto_wallet" ? "bg-gradient-to-r from-violet-600/40 to-purple-600/40 border-violet-400" : "bg-slate-800/50 border-slate-600 hover:border-violet-400/50"}`}
                    >
                      <div className="absolute top-2 right-2 bg-violet-500 text-white text-[10px] font-black px-2 py-1 rounded">
                        ✨ RECOMMENDED
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">₿</div>
                        <div className="text-left flex-1">
                          <div className="text-white font-bold text-sm">
                            Crypto Payment
                          </div>
                          <div className="text-slate-400 text-xs">
                            {cryptoDiscount}% discount • Instant • Secure
                          </div>
                        </div>
                        <div className="text-emerald-400 font-bold text-sm">
                          ${(price * (1 - cryptoDiscount / 100)).toFixed(2)}
                        </div>
                      </div>
                    </button>
                    {availableMethods.includes("card") && (
                      <button
                        onClick={() => router.push("/dashboard/checkout/card")}
                        className={`w-full p-4 rounded-xl transition-all border-2 bg-slate-800/30 border-slate-700 hover:border-slate-500`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-xl">💳</div>
                          <div className="text-left flex-1">
                            <div className="text-slate-300 font-bold text-sm">
                              Credit/Debit Card
                            </div>
                            <div className="text-slate-500 text-xs">
                              OTP Required • Verify with your bank
                            </div>
                          </div>
                          <div className="text-slate-400 font-bold text-sm">
                            ${price.toFixed(2)}
                          </div>
                        </div>
                      </button>
                    )}
                    {availableMethods.includes("bank_transfer") && (
                      <button
                        onClick={() => setPayMethod("bank_transfer")}
                        className={`w-full p-4 rounded-xl transition-all border-2 ${payMethod === "bank_transfer" ? "bg-blue-700/20 border-blue-400" : "bg-slate-800/30 border-slate-700 hover:border-blue-500/50"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-xl">🏦</div>
                          <div className="text-left flex-1">
                            <div className="text-slate-300 font-bold text-sm">
                              Local Transfer
                            </div>
                            <div className="text-slate-500 text-xs">
                              Bank • Card • Mobile Money
                            </div>
                          </div>
                          <div className="text-slate-400 font-bold text-sm">
                            ${price.toFixed(2)}
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                );
              })()}
              <form onSubmit={handleSubmit}>
                {payMethod === "bank_transfer" && (
                  <div
                    className="rounded-2xl p-6"
                    style={{
                      background: "rgba(22,28,36,0.95)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-blue-200 text-xs">
                        💬 Proceed to Local Transfer payment
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={kpLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                    >
                      {kpLoading && (
                        <Loader2 size={16} className="animate-spin" />
                      )}
                      {kpLoading ? "Redirecting..." : "Proceed to Payment"}
                    </button>
                  </div>
                )}
                {payMethod === "crypto_wallet" && (
                  <div
                    className="rounded-2xl p-6 space-y-5"
                    style={{
                      background: "rgba(22,28,36,0.95)",
                      border: "1px solid rgba(139,92,246,0.25)",
                    }}
                  >
                    <div>
                      <p className="text-violet-300 font-black text-sm mb-1">
                        ₿ Pay with USDT
                      </p>
                      <p className="text-slate-500 text-xs">
                        Open your wallet → scan QR or copy address → send exact
                        amount
                      </p>
                    </div>
                    {!configLoaded ? (
                      <div className="flex justify-center py-4">
                        <Loader2
                          size={24}
                          className="text-violet-400 animate-spin"
                        />
                      </div>
                    ) : !cryptoWalletAddress ? (
                      <div
                        className="rounded-xl p-4 text-center"
                        style={{
                          background: "rgba(244,63,94,0.08)",
                          border: "1px solid rgba(244,63,94,0.2)",
                        }}
                      >
                        <p className="text-rose-400 text-xs font-bold">
                          ⚠ Crypto payment not configured
                        </p>
                        <p className="text-rose-400/70 text-xs mt-1">
                          Please use card payment or contact support.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="rounded-xl p-4 space-y-4"
                        style={{
                          background: "rgba(139,92,246,0.06)",
                          border: "1px solid rgba(139,92,246,0.2)",
                        }}
                      >
                        <div className="flex justify-center">
                          {cryptoQrImageUrl ? (
                            <img
                              src={cryptoQrImageUrl}
                              alt="Payment QR Code"
                              className="w-36 h-36 rounded-xl object-contain"
                              style={{ background: "white", padding: "6px" }}
                            />
                          ) : (
                            <QRCode value={cryptoWalletAddress} size={144} />
                          )}
                        </div>
                        <p className="text-center text-slate-400 text-xs">
                          Scan with TrustWallet
                        </p>
                        <div>
                          <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5 font-bold">
                            Send To This Wallet Address
                          </p>
                          <div
                            className="flex items-center gap-2 rounded-lg p-3"
                            style={{
                              background: "rgba(0,0,0,0.4)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            <p className="text-white font-mono text-xs break-all flex-1 select-all">
                              {cryptoWalletAddress}
                            </p>
                            <CopyButton text={cryptoWalletAddress} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div
                            className="rounded-lg p-2.5"
                            style={{ background: "rgba(0,0,0,0.3)" }}
                          >
                            <p className="text-slate-500 text-[10px] mb-0.5">
                              Exact Amount
                            </p>
                            <p className="text-emerald-400 font-black">
                              {discountedPrice.toFixed(2)} USDT
                            </p>
                          </div>
                          <div
                            className="rounded-lg p-2.5"
                            style={{ background: "rgba(0,0,0,0.3)" }}
                          >
                            <p className="text-slate-500 text-[10px] mb-0.5">
                              Network
                            </p>
                            <p className="text-white font-bold">
                              {cryptoNetwork}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-white text-sm font-bold mb-1.5">
                        Your TrustWallet Address{" "}
                        <span className="text-slate-500 font-normal text-xs">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        placeholder="Paste your sending wallet address"
                        value={twSenderAddress}
                        onChange={(e) => setTwSenderAddress(e.target.value)}
                        className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <div
                        onClick={() => setTwConfirmed((v) => !v)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 cursor-pointer ${twConfirmed ? "bg-violet-500 border-violet-500" : "border-slate-600"}`}
                      >
                        {twConfirmed && (
                          <Check size={12} className="text-white" />
                        )}
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed">
                        I understand I must send exactly{" "}
                        <strong className="text-white">
                          {discountedPrice.toFixed(2)} USDT
                        </strong>{" "}
                        on the{" "}
                        <strong className="text-white">{cryptoNetwork}</strong>{" "}
                        network to the address above.
                      </p>
                    </label>
                    <button
                      type="submit"
                      disabled={!twConfirmed || !cryptoWalletAddress}
                      className="w-full py-3 rounded-lg font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white"
                      style={{
                        background:
                          twConfirmed && cryptoWalletAddress
                            ? "linear-gradient(135deg,#8b5cf6,#6d28d9)"
                            : undefined,
                      }}
                    >
                      I've Reviewed — Submit Payment Details
                    </button>
                  </div>
                )}
                {payMethod === "card" && card.number && (
                  <div className="rounded-2xl p-6 bg-slate-900/80 border border-white/8 space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-slate-700">
                        <span className="text-slate-400 text-sm">Card Number</span>
                        <span className="text-white font-mono text-sm">
                          •••• {card.number.replace(/\s/g, "").slice(-4)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-700">
                        <span className="text-slate-400 text-sm">Cardholder</span>
                        <span className="text-white text-sm">{card.name}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-slate-400 text-sm">Expiry</span>
                        <span className="text-white text-sm">{card.expiry}</span>
                      </div>
                    </div>
                    <div className="rounded-lg p-4 bg-emerald-500/10 border border-emerald-500/30">
                      <p className="text-emerald-300 text-xs flex gap-2 items-start">
                        <Lock size={14} className="shrink-0 mt-0.5" />
                        <span>
                          Your card details are encrypted. You'll receive an OTP
                          for secure verification.
                        </span>
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={!card.number || !card.name || !card.expiry || !card.cvv}
                      className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Lock size={16} />
                      Complete Payment
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PROCESSING */}
      {step === "processing" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8 text-center"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Loader2
              size={32}
              className="text-emerald-400 mx-auto mb-4 animate-spin"
            />
            <h2 className="text-white font-black text-2xl mb-2">
              Processing Payment
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              {PROCESSING_STEPS[processingStep]?.label || "Completing..."}
            </p>
            <div className="space-y-3">
              {PROCESSING_STEPS.map((ps, idx) => (
                <div
                  key={ps.id}
                  className={`flex items-center gap-3 text-sm ${idx <= processingStep ? "text-emerald-300" : "text-slate-600"}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${idx < processingStep ? "bg-emerald-500 border-emerald-500" : idx === processingStep ? "border-emerald-500 animate-pulse" : "border-slate-600"}`}
                  >
                    {idx < processingStep && (
                      <CheckCircle size={14} className="text-white" />
                    )}
                  </div>
                  <span>{ps.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {step === "success" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              {purchaseType === "license"
                ? "License Activated!"
                : "Payment Successful!"}
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6">
              {purchaseType === "license"
                ? "Your operator license is now active."
                : isContract
                  ? "Your GPU node contract is active."
                  : "Your GPU node is live and earning."}
            </p>
            <div
              className="rounded-xl p-4 mb-6 space-y-3 text-sm"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {[
                ["Transaction ID", transactionId],
                ["Amount Paid", `$${effectivePrice.toFixed(2)}`],
                ["Country", countryName],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between">
                  <span className="text-slate-500">{l}</span>
                  <span className="text-white font-semibold">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowReceipt(true)}
                className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-bold py-3 rounded-lg"
              >
                View Receipt
              </button>
              <button
                onClick={() =>
                  router.push(
                    purchaseType === "license"
                      ? "/dashboard/tasks"
                      : "/dashboard/gpu-plans",
                  )
                }
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg"
              >
                {purchaseType === "license" ? "Go to Tasks" : "View Portfolio"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAILED */}
      {step === "failed" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-5">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              Payment Failed
            </h2>
            <p className="text-slate-400 text-sm text-center mb-4">
              {errorMsg}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("details")}
                className="flex-1 border border-slate-700 text-slate-300 font-bold py-3 rounded-lg"
              >
                Try Again
              </button>
              <button
                onClick={() => router.back()}
                className="flex-1 bg-slate-700 text-white font-bold py-3 rounded-lg"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXPORT: wraps CheckoutInner in Suspense for Next.js static build ──────���──
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#0d1117" }}
        >
          <div className="w-10 h-10 border-2 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
