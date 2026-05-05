export default function QuickActions() {
  const actions = [
    "Browse Tasks",
    "Withdraw Earnings",
    "Invite Friends",
    "Upgrade Tier",
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 md:p-6">
      <h2 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Quick Actions</h2>

      <div className="space-y-2 sm:space-y-3">
        {actions.map((a, i) => (
          <button
            key={i}
            className="w-full bg-slate-800 hover:bg-slate-700 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm transition-colors"
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}
