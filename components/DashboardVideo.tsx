"use client";
// components/DashboardVideo.tsx
//
// HOW TO SET THE VIDEO URL (admin):
//   In Supabase → Table Editor → app_config table
//   Insert or update a row:  key = "datacenter_video_url"  |  value = "https://…/your-video.mp4"
//
//   Optional poster image:   key = "datacenter_poster_url" |  value = "https://…/poster.jpg"
//
//   The video autoplays muted and loops. No sound. Works with any direct .mp4 link,
//   Cloudflare Stream, Bunny.net, or an S3 presigned URL.
//   If no URL is configured, a stylised placeholder is shown.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardVideo() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [tick, setTick] = useState("");
  const [loading, setLoading] = useState(true);

  // Clock tick
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString("en-US", { hour12: false });
    setTick(fmt());
    const iv = setInterval(() => setTick(fmt()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Load config from Supabase
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", ["datacenter_video_url", "datacenter_poster_url"]);
      if (data) {
        data.forEach((row: any) => {
          if (row.key === "datacenter_video_url")
            setVideoUrl(row.value || null);
          if (row.key === "datacenter_poster_url")
            setPosterUrl(row.value || null);
        });
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(12,18,28,0.8)",
        border: "1px solid rgba(255,255,255,0.055)",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <p className="text-white font-bold text-[13px]">
            Live Datacenter Feed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-[9px] font-bold text-red-400"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
            LIVE
          </span>
          <span className="font-mono text-[9px]" style={{ color: "#1f2937" }}>
            {tick} UTC
          </span>
        </div>
      </div>

      {/* Video area */}
      <div className="relative" style={{ height: 220, background: "#020609" }}>
        {loading ? (
          /* Loading skeleton */
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border border-slate-800 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : videoUrl ? (
          <>
            <video
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.82 }}
              autoPlay
              muted
              loop
              playsInline
              poster={posterUrl || undefined}
              key={videoUrl}
            >
              <source src={videoUrl} type="video/mp4" />
            </video>

            {/* Scanlines overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.45) 2px,rgba(0,0,0,0.45) 3px)",
                opacity: 0.12,
              }}
            />

            {/* Vignette */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.65) 100%)",
              }}
            />

            {/* HUD — top */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <div
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-[8px] font-mono font-bold tracking-wider">
                  CAM-01 · RACK-FLOOR-A
                </span>
              </div>
              <div
                className="rounded-md px-2.5 py-1"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span className="text-[8px] font-mono font-bold text-slate-400">
                  REC
                </span>
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              </div>
            </div>

            {/* HUD — bottom */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <div
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-[8px] font-mono">
                  99.97% UPTIME
                </span>
              </div>
              <div
                className="rounded-md px-2.5 py-1"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span className="text-emerald-400 text-[8px] font-mono tabular-nums">
                  {tick} UTC
                </span>
              </div>
            </div>
          </>
        ) : (
          /* No video configured — admin placeholder */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="space-y-1 text-center">
              <p className="text-slate-600 text-[11px] font-semibold">
                No video configured
              </p>
              <p className="text-slate-700 text-[10px] max-w-xs leading-relaxed">
                Admin: add a row in{" "}
                <span className="text-slate-500 font-mono">app_config</span>{" "}
                with key{" "}
                <span className="text-slate-500 font-mono">
                  datacenter_video_url
                </span>{" "}
                and your .mp4 URL as the value.
              </p>
            </div>

            {/* Animated placeholder grid */}
            <div className="grid grid-cols-6 gap-1 opacity-20">
              {Array.from({ length: 18 }).map((_, i) => (
                <div
                  key={i}
                  className="w-6 h-2 rounded-sm bg-slate-700 animate-pulse"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer row */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono" style={{ color: "#1f2937" }}>
            DATACENTER-RACK-A · NODE-01
          </span>
          <span className="text-[9px] font-mono text-emerald-800">SECURED</span>
        </div>
        <span className="text-[9px] font-mono text-emerald-800">
          TLS 1.3 · AES-256
        </span>
      </div>
    </div>
  );
}
