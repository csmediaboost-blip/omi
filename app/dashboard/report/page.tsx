"use client";
// app/dashboard/reports/page.tsx
import { useEffect, useState, useCallback } from "react";
import { cacheService } from "@/lib/cache-service";
import DashboardNavigation from "@/components/dashboard-navigation";
import KYCGate from "@/components/KYCGate";
import {
  BarChart2,
  Download,
  FileText,
  Shield,
  Cpu,
  CheckCircle,
  Loader2,
  RefreshCw,
  Calendar,
  Star,
  Clock,
} from "lucide-react";

type Report = {
  id: string;
  week_number: number;
  year: number;
  generated_at: string;
  report_data: {
    teraflops?: number;
    tasks_done?: number;
    earnings?: number;
    uptime?: number;
  };
};

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(
    ((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7,
  );
}

function WeekGrid({
  current,
  generated,
  selected,
  onSelect,
}: {
  current: number;
  generated: Set<number>;
  selected: number;
  onSelect: (w: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 28 }, (_, i) => {
        const w = i + 1;
        const done = generated.has(w);
        const cur = w === current;
        const sel = w === selected;
        return (
          <button
            key={w}
            onClick={() => onSelect(w)}
            className={`aspect-square rounded-xl border text-xs font-bold transition-all flex items-center justify-center relative ${
              sel
                ? "border-cyan-500 bg-cyan-900/30 text-cyan-300 shadow-lg shadow-cyan-500/10"
                : done
                  ? "border-emerald-800/60 bg-emerald-900/20 text-emerald-400"
                  : cur
                    ? "border-amber-700/60 bg-amber-900/20 text-amber-400"
                    : "border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-600"
            }`}
          >
            {w}
            {done && !sel && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-950" />
            )}
            {cur && !sel && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border border-slate-950 animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ReportsContent() {
  const [reports, setReports] = useState<Report[]>([]);
  const [currentWk, setCurrentWk] = useState(getWeekNumber());
  const [selectedWk, setSelectedWk] = useState(getWeekNumber());
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 5000);
  }

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports/generate");
      const json = await res.json();
      setReports(json.reports || []);
      setCurrentWk(json.current_week || getWeekNumber());
      setSelectedWk(json.current_week || getWeekNumber());
    } catch {
      showToast("Failed to load reports", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const generatedWeeks = new Set(reports.map((r) => r.week_number));
  const selectedReport = reports.find((r) => r.week_number === selectedWk);

  async function generateReport(weekOverride?: number) {
    const week = weekOverride ?? selectedWk;
    setGenerating(true);
    showToast("Generating your PDF report…");
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_number: week }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = `compute_report_week${week}_2025.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Week ${week} report downloaded!`);
      loadReports();
    } catch (e: any) {
      showToast(e.message || "Generation failed", false);
    } finally {
      setGenerating(false);
    }
  }

  if (loading)
    return (
      <div className="flex min-h-screen bg-slate-950">
        <DashboardNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
    );

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl max-w-sm flex items-center gap-2 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <Cpu size={14} />}{" "}
          {toast.text}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
                <BarChart2 size={22} className="text-cyan-400" /> Compute
                Contribution Reports
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Generate your personalized weekly proof-of-work PDF with real
                node metrics, charts, and a signed certificate.
              </p>
            </div>
            <button
              onClick={loadReports}
              className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs px-3 py-2 border border-slate-800 rounded-lg transition-all"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                icon: <FileText size={16} className="text-cyan-400" />,
                l: "Generated",
                v: reports.length,
                c: "text-cyan-400",
              },
              {
                icon: <Calendar size={16} className="text-emerald-400" />,
                l: "Current Week",
                v: `Week ${currentWk}`,
                c: "text-emerald-400",
              },
              {
                icon: <Star size={16} className="text-amber-400" />,
                l: "Total Weeks",
                v: "28 available",
                c: "text-amber-400",
              },
            ].map(({ icon, l, v, c }) => (
              <div
                key={l}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                  {icon}
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase tracking-wide">
                    {l}
                  </p>
                  <p className={`font-black text-lg ${c}`}>{v}</p>
                </div>
              </div>
            ))}
          </div>

          {/* What's inside */}
          <div className="grid md:grid-cols-3 gap-3">
            {[
              {
                icon: <BarChart2 size={15} className="text-cyan-400" />,
                t: "Performance Charts",
                d: "Daily teraflop output, earnings trend, uptime bar charts",
              },
              {
                icon: <Cpu size={15} className="text-emerald-400" />,
                t: "Allocation Log",
                d: "Full history of client assignments, earnings, failure events",
              },
              {
                icon: <Shield size={15} className="text-amber-400" />,
                t: "Signed Certificate",
                d: "3 seals, operator ID, node reference, weekly achievement summary",
              },
            ].map(({ icon, t, d }) => (
              <div
                key={t}
                className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-start gap-3"
              >
                <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                  {icon}
                </div>
                <div>
                  <p className="text-white font-bold text-xs">{t}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5 leading-relaxed">
                    {d}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Generator panel */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-950/30 to-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-black text-base">
                  Select Week & Generate PDF
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Click a week ·{" "}
                  <span className="text-emerald-400">green dot</span> =
                  generated · <span className="text-amber-400">amber</span> =
                  current week
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-cyan-400 font-black text-lg">
                  Week {selectedWk}
                </p>
                <p className="text-slate-500 text-[10px]">selected</p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <WeekGrid
                current={currentWk}
                generated={generatedWeeks}
                selected={selectedWk}
                onSelect={setSelectedWk}
              />

              {selectedReport ? (
                <div className="bg-emerald-900/10 border border-emerald-800/30 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-emerald-400 font-bold text-sm">
                      Week {selectedWk} already generated
                    </p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {new Date(selectedReport.generated_at).toLocaleString()}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs">
                      {selectedReport.report_data.teraflops != null && (
                        <span className="text-cyan-400 font-bold">
                          {selectedReport.report_data.teraflops?.toFixed(1)} TF
                        </span>
                      )}
                      {selectedReport.report_data.tasks_done != null && (
                        <span className="text-emerald-400 font-bold">
                          {selectedReport.report_data.tasks_done} tasks
                        </span>
                      )}
                      {selectedReport.report_data.earnings != null && (
                        <span className="text-amber-400 font-bold">
                          ${selectedReport.report_data.earnings?.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </div>
                  <CheckCircle
                    size={18}
                    className="text-emerald-400 shrink-0"
                  />
                </div>
              ) : (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 text-xs text-slate-400">
                  <p className="font-semibold text-slate-300 mb-1">
                    Week {selectedWk} — Not yet generated
                  </p>
                  <p>
                    Your report will include real node metrics, GPU allocation
                    history, daily earnings charts, and a signed 3-page
                    certificate PDF.
                  </p>
                </div>
              )}

              <button
                onClick={() => generateReport()}
                disabled={generating}
                className={`w-full font-black text-sm py-4 rounded-xl transition-all flex items-center justify-center gap-3 ${
                  generating
                    ? "bg-cyan-900/30 border border-cyan-800/40 text-cyan-400 cursor-not-allowed"
                    : "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                }`}
              >
                {generating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <div className="text-left">
                      <p>Generating your PDF report…</p>
                      <p className="text-[10px] font-normal opacity-70">
                        Fetching metrics · Building charts · Rendering
                        certificate
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    <div className="text-left">
                      <p>Generate & Download Week {selectedWk} Report</p>
                      <p className="text-[10px] font-normal opacity-70">
                        3-page PDF · real data · signed certificate
                      </p>
                    </div>
                  </>
                )}
              </button>

              <p className="text-slate-600 text-[10px] text-center">
                Each report is generated from your actual node activity and is
                unique to your operator account.
              </p>
            </div>
          </div>

          {/* Previous reports */}
          {reports.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-white font-bold text-sm flex items-center gap-2">
                <Clock size={14} className="text-slate-400" /> Previously
                Generated ({reports.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-3">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText
                            size={13}
                            className="text-cyan-400 shrink-0"
                          />
                          <p className="text-white font-bold text-sm">
                            Week {r.week_number} — {r.year}
                          </p>
                        </div>
                        <p className="text-slate-500 text-[10px]">
                          {new Date(r.generated_at).toLocaleString()}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
                          {r.report_data.teraflops != null && (
                            <span className="text-cyan-400 font-bold">
                              {r.report_data.teraflops.toFixed(1)} TF
                            </span>
                          )}
                          {r.report_data.tasks_done != null && (
                            <span className="text-emerald-400 font-bold">
                              {r.report_data.tasks_done} tasks
                            </span>
                          )}
                          {r.report_data.earnings != null && (
                            <span className="text-amber-400 font-bold">
                              ${r.report_data.earnings.toFixed(3)}
                            </span>
                          )}
                          {r.report_data.uptime != null && (
                            <span className="text-violet-400 font-bold">
                              {r.report_data.uptime.toFixed(1)}% uptime
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => generateReport(r.week_number)}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-400 bg-cyan-900/20 border border-cyan-800/30 px-3 py-2 rounded-lg hover:bg-cyan-900/40 transition-all shrink-0"
                      >
                        <Download size={11} /> Re-download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <KYCGate>
      <ReportsContent />
    </KYCGate>
  );
}
