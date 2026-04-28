"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  FileText,
  Download,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Calendar,
  Printer,
  Shield,
} from "lucide-react";

type TaxSummary = {
  year: number;
  totalEarned: number;
  totalFees: number;
  netEarnings: number;
  totalWithdrawn: number;
  transactionCount: number;
};

type TxRow = {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
};

const TX_TYPE_LABELS: Record<string, string> = {
  allocation_reward: "GPU Allocation Reward",
  bonus: "Bonus Credit",
  adjustment: "Balance Adjustment",
  license_purchase: "License Purchase (Deductible)",
  license_renewal: "License Renewal (Deductible)",
  monthly_surcharge: "Infrastructure Surcharge (Deductible)",
  inactivity_tax: "Inactivity Penalty",
  withdrawal: "Withdrawal",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TaxPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    full_name: string;
    email: string;
    country: string | null;
  } | null>(null);
  const [summaries, setSummaries] = useState<TaxSummary[]>([]);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth/signin");
      return;
    }
    setUserId(user.id);

    const { data: userData } = await supabase
      .from("users")
      .select("full_name, email, country")
      .eq("id", user.id)
      .single();
    setProfile(userData);

    const { data: txs } = await supabase
      .from("transactions")
      .select("id, type, amount, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const allTxs: TxRow[] = txs || [];
    setTransactions(allTxs);

    // Group by year
    const years = new Set(
      allTxs.map((t) => new Date(t.created_at).getFullYear()),
    );
    const currentYear = new Date().getFullYear();
    years.add(currentYear);

    const yearSummaries: TaxSummary[] = Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => {
        const yearTxs = allTxs.filter(
          (t) => new Date(t.created_at).getFullYear() === year,
        );
        const earned = yearTxs
          .filter((t) => t.amount > 0 && t.type !== "adjustment")
          .reduce((s, t) => s + t.amount, 0);
        const fees = yearTxs
          .filter((t) => t.amount < 0)
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        const withdrawn = yearTxs
          .filter((t) => t.type === "withdrawal")
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        return {
          year,
          totalEarned: earned,
          totalFees: fees,
          netEarnings: earned - fees,
          totalWithdrawn: withdrawn,
          transactionCount: yearTxs.length,
        };
      });
    setSummaries(yearSummaries);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentSummary = summaries.find((s) => s.year === selectedYear);
  const yearTxs = transactions.filter(
    (t) => new Date(t.created_at).getFullYear() === selectedYear,
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />

      <div className="flex-1 overflow-y-auto">
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: black !important; }
            @page { size: A4; margin: 15mm; }
          }
        `}</style>

        <div className="max-w-4xl mx-auto px-4 md:px-6 pt-6 pb-32 md:pb-12 space-y-6">
          <div className="no-print flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1">
              <h1 className="text-white font-black text-2xl">
                Tax & Earnings Report
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Annual summary of GPU compute earnings for tax purposes
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="no-print flex items-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-sm px-4 py-2 rounded-xl transition-all"
            >
              <Printer size={14} /> Print / PDF
            </button>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-800/40 rounded-xl p-4">
            <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 font-bold text-sm">
                Important Tax Disclaimer
              </p>
              <p className="text-amber-400/80 text-xs mt-0.5 leading-relaxed">
                This report is provided for informational purposes only and does
                not constitute professional tax advice. GPU compute earnings may
                be subject to income tax, self-employment tax, or capital gains
                tax depending on your jurisdiction. Consult a qualified tax
                professional or accountant regarding your specific obligations.
                OmniTask Pro does not file taxes on your behalf.
              </p>
            </div>
          </div>

          {/* Year selector */}
          <div className="no-print flex items-center gap-3">
            <Calendar size={15} className="text-slate-400" />
            <span className="text-slate-400 text-sm">Tax year:</span>
            <div className="flex gap-2">
              {summaries.map((s) => (
                <button
                  key={s.year}
                  onClick={() => setSelectedYear(s.year)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all ${selectedYear === s.year ? "bg-emerald-600 border-emerald-500 text-white" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                >
                  {s.year}
                </button>
              ))}
            </div>
          </div>

          {/* Print header */}
          <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
            <h1 className="text-2xl font-black text-black">
              OmniTask Pro — Tax Report {selectedYear}
            </h1>
            <p className="text-gray-600 text-sm">
              Generated: {new Date().toLocaleDateString()}
            </p>
            {profile && (
              <p className="text-gray-600 text-sm">
                Contributor: {profile.full_name} · {profile.email}
              </p>
            )}
          </div>

          {currentSummary ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Gross Earnings",
                    value: `$${currentSummary.totalEarned.toFixed(2)}`,
                    color: "text-emerald-400",
                    icon: TrendingUp,
                    note: "Taxable income",
                  },
                  {
                    label: "Deductible Fees",
                    value: `$${currentSummary.totalFees.toFixed(2)}`,
                    color: "text-red-400",
                    icon: DollarSign,
                    note: "Potentially deductible",
                  },
                  {
                    label: "Net Earnings",
                    value: `$${currentSummary.netEarnings.toFixed(2)}`,
                    color: "text-white",
                    icon: FileText,
                    note: "Gross minus fees",
                  },
                  {
                    label: "Total Withdrawn",
                    value: `$${currentSummary.totalWithdrawn.toFixed(2)}`,
                    color: "text-blue-400",
                    icon: Download,
                    note: "Realized payouts",
                  },
                ].map(({ label, value, color, icon: Icon, note }) => (
                  <div
                    key={label}
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4"
                  >
                    <div
                      className={`w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center mb-2 ${color}`}
                    >
                      <Icon size={15} />
                    </div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wide">
                      {label}
                    </p>
                    <p className={`font-black text-xl ${color}`}>{value}</p>
                    <p className="text-slate-600 text-[9px] mt-0.5">{note}</p>
                  </div>
                ))}
              </div>

              {/* Annual tax statement */}
              <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <Shield size={16} className="text-emerald-400" />
                    <div>
                      <h2 className="text-white font-black text-base">
                        Annual Earnings Statement — {selectedYear}
                      </h2>
                      <p className="text-slate-500 text-xs">
                        OmniTask Pro GPU Compute Network
                      </p>
                    </div>
                  </div>
                  <span className="text-emerald-400 text-xs font-black border border-emerald-800/40 bg-emerald-900/20 px-2.5 py-1 rounded-full">
                    Official
                  </span>
                </div>

                <div className="p-5 space-y-3">
                  {profile && (
                    <div className="grid grid-cols-2 gap-3 pb-4 border-b border-slate-800">
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                          Contributor
                        </p>
                        <p className="text-white font-semibold text-sm">
                          {profile.full_name || "—"}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {profile.email}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                          Jurisdiction
                        </p>
                        <p className="text-white font-semibold text-sm">
                          {profile.country || "Not specified"}
                        </p>
                        <p className="text-slate-400 text-xs">
                          Tax Year {selectedYear}
                        </p>
                      </div>
                    </div>
                  )}

                  {[
                    {
                      label: "Gross GPU Compute Earnings",
                      amount: currentSummary.totalEarned,
                      color: "text-emerald-400",
                      note: "All allocation rewards, bonuses, and task completions",
                    },
                    {
                      label: "License & Infrastructure Fees",
                      amount: -currentSummary.totalFees,
                      color: "text-red-400",
                      note: "Operator license, surcharges, inactivity penalties",
                    },
                    {
                      label: "NET TAXABLE EARNINGS",
                      amount: currentSummary.netEarnings,
                      color: "text-white",
                      note: "Consult your tax advisor for applicable deductions",
                      bold: true,
                    },
                  ].map(({ label, amount, color, note, bold }) => (
                    <div
                      key={label}
                      className={`flex items-start justify-between py-2 ${bold ? "border-t-2 border-slate-700 mt-2 pt-3" : ""}`}
                    >
                      <div>
                        <p
                          className={`text-sm ${bold ? "font-black text-white" : "font-semibold text-slate-300"}`}
                        >
                          {label}
                        </p>
                        <p className="text-slate-500 text-[10px] mt-0.5">
                          {note}
                        </p>
                      </div>
                      <p
                        className={`font-black text-base shrink-0 ml-4 ${color}`}
                      >
                        {amount >= 0 ? "+" : ""}${Math.abs(amount).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="bg-slate-800/40 px-5 py-3 border-t border-slate-800">
                  <p className="text-slate-500 text-[10px] leading-relaxed">
                    This statement is generated from your transaction history on
                    the OmniTask Pro platform. Total transactions recorded:{" "}
                    {currentSummary.transactionCount}. Generated on{" "}
                    {new Date().toLocaleDateString()}.
                  </p>
                </div>
              </div>

              {/* Transaction log for the year */}
              <div>
                <h3 className="text-white font-bold text-base mb-3">
                  Transaction Log — {selectedYear}
                </h3>
                {yearTxs.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl text-slate-600">
                    No transactions for {selectedYear}
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60">
                          <th className="text-left text-slate-500 font-semibold px-4 py-3">
                            Date
                          </th>
                          <th className="text-left text-slate-500 font-semibold px-4 py-3">
                            Type
                          </th>
                          <th className="text-left text-slate-500 font-semibold px-4 py-3 hidden md:table-cell">
                            Description
                          </th>
                          <th className="text-right text-slate-500 font-semibold px-4 py-3">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearTxs.map((tx) => {
                          const isDebit = tx.amount < 0;
                          return (
                            <tr
                              key={tx.id}
                              className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/20 transition-colors"
                            >
                              <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                                {fmt(tx.created_at)}
                              </td>
                              <td className="px-4 py-2.5 text-slate-300">
                                {TX_TYPE_LABELS[tx.type] || tx.type}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500 hidden md:table-cell truncate max-w-xs">
                                {tx.description}
                              </td>
                              <td
                                className={`px-4 py-2.5 text-right font-bold ${isDebit ? "text-red-400" : "text-emerald-400"}`}
                              >
                                {isDebit ? "−" : "+"}$
                                {Math.abs(tx.amount).toFixed(4)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-700 bg-slate-900/60">
                          <td
                            colSpan={3}
                            className="px-4 py-3 text-white font-black text-sm"
                          >
                            Total Net for {selectedYear}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-black text-sm ${currentSummary.netEarnings >= 0 ? "text-emerald-400" : "text-red-400"}`}
                          >
                            ${currentSummary.netEarnings.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
              <FileText size={32} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">
                No earnings data for {selectedYear}
              </p>
              <p className="text-slate-600 text-xs mt-1">
                Complete GPU tasks to generate earnings history
              </p>
            </div>
          )}

          {/* Footer note */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <CheckCircle
                size={14}
                className="text-emerald-400 shrink-0 mt-0.5"
              />
              <div>
                <p className="text-white font-bold text-sm">
                  How to use this report
                </p>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  Use "Print / PDF" to save this report. Share your gross
                  earnings figure with your tax professional. License fees,
                  infrastructure surcharges, and other operational costs may be
                  deductible as business expenses depending on your local tax
                  laws. Keep records of all platform transactions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
