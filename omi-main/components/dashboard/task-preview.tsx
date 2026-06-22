export default function TaskPreview() {
  const tasks = [
    { title: "Image Labeling", reward: "$2.50" },
    { title: "Video Tagging", reward: "$3.10" },
    { title: "AI Chat Review", reward: "$5.00" },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="font-semibold mb-4">Available Tasks</h2>

      <div className="space-y-4">
        {tasks.map((t, i) => (
          <div
            key={i}
            className="flex justify-between bg-slate-800 p-4 rounded-lg"
          >
            <span>{t.title}</span>

            <span className="text-emerald-400">{t.reward}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
