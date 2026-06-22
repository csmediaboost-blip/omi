"use client";

export function LoadingSkeleton() {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        {/* Minimal spinner */}
        <div className="relative w-6 h-6">
          <div className="absolute inset-0 rounded-full border border-slate-700" />
          <div className="absolute inset-0 rounded-full border border-transparent border-t-emerald-500 animate-spin" />
        </div>
        {/* Minimal text */}
        <p className="text-xs text-slate-500">Loading</p>
      </div>
    </div>
  );
}
