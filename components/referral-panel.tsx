"use client";

import { Card } from "@/components/ui/card";

export default function ReferralPanel() {
  const referralEarnings = 120.5;
  const totalReferrals = 8;

  return (
    <Card className="p-6 bg-slate-900 border-slate-800">
      <h3 className="font-bold mb-4">Referral Network</h3>

      <p className="text-sm text-slate-400">Total Referrals</p>

      <p className="text-xl font-bold mb-3">{totalReferrals}</p>

      <p className="text-sm text-slate-400">Referral Earnings</p>

      <p className="text-xl font-bold text-emerald-400">${referralEarnings}</p>
    </Card>
  );
}
