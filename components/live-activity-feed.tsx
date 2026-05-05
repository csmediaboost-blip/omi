"use client";

import { useEffect, useState, useRef } from "react";
import normalPool from "@/data/activity-normal.json";
import fridayPool from "@/data/activity-friday.json";

type ActivityEvent = {
  id: string;
  user: string;
  country?: string;
  event: string;
  type?: string;
  timestamp: Date;
};

function getPool(): typeof normalPool {
  const today = new Date().getDay();
  return today === 5 ? (fridayPool as any) : normalPool;
}

function getRandomActivity(): ActivityEvent {
  const pool = getPool();
  const item = pool[Math.floor(Math.random() * pool.length)] as any;
  return {
    id: `${Date.now()}-${Math.random()}`,
    user: item.user,
    country: item.country,
    event: item.event,
    type: item.type || "task",
    timestamp: new Date(),
  };
}

function formatTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function isFriday(): boolean {
  return new Date().getDay() === 5;
}

// Dot color by event type
function getDot(type?: string): string {
  if (type === "payout") return "bg-emerald-400";
  return "bg-blue-400";
}

// Label prefix color
function getLabelColor(user: string): string {
  if (user.startsWith("analyst")) return "text-violet-400";
  if (user.startsWith("reviewer")) return "text-blue-400";
  if (user.startsWith("node")) return "text-amber-400";
  return "text-emerald-400";
}

export default function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeRef = useRef<NodeJS.Timeout | null>(null);

  // Seed initial activities
  useEffect(() => {
    const initial: ActivityEvent[] = [];
    for (let i = 0; i < 7; i++) {
      const a = getRandomActivity();
      a.timestamp = new Date(Date.now() - (7 - i) * 8000);
      initial.push(a);
    }
    setActivities(initial);
  }, []);

  // Auto-add new activity every 3–5 seconds
  useEffect(() => {
    function schedule() {
      const delay = 3000 + Math.random() * 2000; // 3–5s
      intervalRef.current = setTimeout(() => {
        const newActivity = getRandomActivity();
        setActivities((prev) => [newActivity, ...prev.slice(0, 6)]);
        schedule();
      }, delay);
    }
    schedule();
    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, []);

  // Update relative timestamps every 10 seconds
  useEffect(() => {
    timeRef.current = setInterval(() => {
      setTimes((prev) => {
        const updated: Record<string, string> = {};
        activities.forEach((a) => {
          updated[a.id] = formatTime(a.timestamp);
        });
        return updated;
      });
    }, 10_000);
    return () => {
      if (timeRef.current) clearInterval(timeRef.current);
    };
  }, [activities]);

  const friday = isFriday();

  return (
    <div className="p-5 bg-slate-900/50 rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            <div className="w-2 h-2 bg-emerald-400 rounded-full absolute inset-0 animate-ping opacity-75" />
          </div>
          <h2 className="text-white font-bold text-sm">Live Activity</h2>
          {friday && (
            <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider">
              PAYOUT DAY
            </span>
          )}
        </div>
        <span className="text-slate-600 text-[10px] tracking-wide uppercase">
          Global Network
        </span>
      </div>

      {/* Activity list */}
      <div className="space-y-2.5">
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            className={`flex items-start gap-3 py-2.5 border-b border-slate-800/50 last:border-0 transition-all duration-500 ${
              index === 0 ? "opacity-100" : "opacity-90"
            }`}
            style={{
              animation: index === 0 ? "slideIn 0.4s ease-out" : undefined,
            }}
          >
            {/* Status dot */}
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${getDot(activity.type)}`}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-slate-300 text-xs leading-relaxed">
                <span className={`font-bold ${getLabelColor(activity.user)}`}>
                  {activity.user}
                </span>
                {activity.country && (
                  <span className="text-slate-500">
                    {" "}
                    from {activity.country}
                  </span>
                )}{" "}
                <span
                  className={
                    activity.type === "payout"
                      ? "text-emerald-300 font-semibold"
                      : "text-slate-300"
                  }
                >
                  {activity.event}
                </span>
              </p>
            </div>

            {/* Time */}
            <span className="text-slate-600 text-[10px] shrink-0 mt-0.5 whitespace-nowrap">
              {times[activity.id] || formatTime(activity.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center">
        <span className="text-slate-600 text-[10px]">
          {friday
            ? "Weekly payout cycle active"
            : "AI contributor network — live"}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-emerald-600 text-[10px] font-semibold">
            LIVE
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
