"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, Clock, CheckCircle, RefreshCw } from "lucide-react";

type LicenseStatus = {
  status:
    | "active"
    | "active_warning"
    | "expiring_soon"
    | "expired"
    | "no_license";
  days_remaining: number;
  expired: boolean;
  expiry_date: string | null;
  tier: string;
};

export default function LicenseStatusBadge({ userId }: { userId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .rpc("get_license_status", { p_user_id: userId })
      .then(({ data }) => setStatus(data));
  }, [userId]);

  if (!status) return null;

  // Active with plenty of time — show nothing (no clutter)
  if (status.status === "active") return null;

  const configs = {
    expired: {
      bg: "bg-red-900/20 border-red-800/40",
      icon: <AlertTriangle size={12} className="text-red-400" />,
      text: "text-red-300",
      label: "License Expired",
      sub: "Renew to restore task access",
      btn: "bg-red-600 hover:bg-red-500",
    },
    no_license: {
      bg: "bg-red-900/20 border-red-800/40",
      icon: <AlertTriangle size={12} className="text-red-400" />,
      text: "text-red-300",
      label: "No Active License",
      sub: "Activate to start earning",
      btn: "bg-red-600 hover:bg-red-500",
    },
    expiring_soon: {
      bg: "bg-amber-900/20 border-amber-800/40",
      icon: <Clock size={12} className="text-amber-400" />,
      text: "text-amber-300",
      label: `Expires in ${status.days_remaining}d`,
      sub: "Renew to avoid interruption",
      btn: "bg-amber-500 hover:bg-amber-400",
    },
    active_warning: {
      bg: "bg-blue-900/20 border-blue-800/40",
      icon: <Clock size={12} className="text-blue-400" />,
      text: "text-blue-300",
      label: `${status.days_remaining}d remaining`,
      sub: "Renew early to carry over days",
      btn: "bg-blue-600 hover:bg-blue-500",
    },
  };

  const cfg = configs[status.status as keyof typeof configs];
  if (!cfg) return null;

  return (
    <div
      className={`flex items-center gap-2 border rounded-xl px-3 py-2 ${cfg.bg}`}
    >
      {cfg.icon}
      <div className="hidden md:block">
        <p className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</p>
        <p className="text-slate-600 text-[9px]">{cfg.sub}</p>
      </div>
      <button
        onClick={() => router.push("/dashboard/license/renew")}
        className={`${cfg.btn} text-slate-950 text-[10px] font-black px-2.5 py-1 rounded-lg transition-all ml-1 flex items-center gap-1`}
      >
        <RefreshCw size={9} />
        {status.status === "expired" || status.status === "no_license"
          ? "Renew Now"
          : "Renew"}
      </button>
    </div>
  );
}
