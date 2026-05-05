export default function StatsCards() {
  const stats = [
    { label: "Tier", value: "Bronze" },
    { label: "Total Earnings", value: "$0.00" },
    { label: "Withdrawn", value: "$0.00" },
    { label: "Tasks Completed", value: "0" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
      {stats.map((s, i) => (
        <div
          key={i}
          className="bg-slate-900 border border-slate-800 p-4 sm:p-5 md:p-6 rounded-xl"
        >
          <p className="text-xs sm:text-sm text-slate-400">{s.label}</p>

          <p className="text-lg sm:text-xl md:text-2xl font-bold mt-2 md:mt-3">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
