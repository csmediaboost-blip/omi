"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <div className="w-64 bg-black text-white h-screen p-5">
      <h1 className="text-xl mb-8">Distributed Intelligence Network</h1>

      <ul className="space-y-4">
        <li>
          <Link href="/dashboard">Home</Link>
        </li>

        <li>
          <Link href="/tasks">Tasks</Link>
        </li>

        <li>
          <Link href="/financials">Financials</Link>
        </li>

        <li>
          <Link href="/network">Network</Link>
        </li>

        <li>
          <Link href="/academy">Academy</Link>
        </li>

        <li>
          <Link href="/settings">Settings</Link>
        </li>

        <li>
          <Link href="/logout">Logout</Link>
        </li>
      </ul>
    </div>
  );
}
