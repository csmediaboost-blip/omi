export default function ActivityFeed() {
  const items = [
    "User 44**9 completed Image Labeling",
    "User 33**1 earned $5.25",
    "User 21**4 upgraded to Gold",
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="font-semibold mb-4">Live Activity</h2>

      <div className="space-y-3 text-sm text-slate-400">
        {items.map((i, k) => (
          <p key={k}>{i}</p>
        ))}
      </div>
    </div>
  );
}
