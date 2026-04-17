"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { month: "Jan", earnings: 40 },
  { month: "Feb", earnings: 120 },
  { month: "Mar", earnings: 300 },
  { month: "Apr", earnings: 550 },
  { month: "May", earnings: 900 },
];

export default function EarningsChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="month" stroke="#64748b" />

          <YAxis stroke="#64748b" />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="earnings"
            stroke="#10b981"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
