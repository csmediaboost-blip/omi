"use client";

import { Bell, Search } from "lucide-react";

export default function Header() {
  return (
    <header className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950">
      <div className="flex items-center gap-3">
        <Search size={18} />

        <input
          placeholder="Search tasks..."
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm outline-none"
        />
      </div>

      <div className="flex items-center gap-6">
        <Bell size={20} />

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black font-bold">
            U
          </div>

          <span className="text-sm">User</span>
        </div>
      </div>
    </header>
  );
}
