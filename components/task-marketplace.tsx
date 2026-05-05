"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { checkDailyLimit } from "@/lib/taskLimits";
import { checkTaskSlots } from "@/lib/taskSlots";
import { enforceCooldown } from "@/lib/taskCooldown";

type User = {
  id: string;
  tier?: string;
};

type Task = {
  id: number;
  title: string;
  reward: number;
  slots: number;
  tier_required: string;
};

export default function TaskMarketplace({ tier }: { tier: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]); // ✅ moved inside component with type
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // ✅ Fetch auth user
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // ✅ Fetch tasks from API
  useEffect(() => {
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => setTasks(data));
  }, []);

  const submitTask = async (taskId: number) => {
    if (!user) return;

    try {
      setSubmitting(taskId);
      setMessage(null);

      await checkDailyLimit(user.id, user.tier ?? tier);
      await checkTaskSlots(taskId);
      await enforceCooldown(user.id);

      const { error } = await supabase.from("task_submissions").insert({
        user_id: user.id,
        task_id: taskId,
        status: "pending",
      });

      if (error) throw error;

      setMessage("✅ Task submitted successfully!");
    } catch (err: any) {
      console.error(err);
      setMessage(`❌ ${err?.message || "Failed to submit task."}`);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Card className="p-6 bg-slate-900 border-slate-800">
      <h2 className="text-xl font-bold mb-6">Available Tasks</h2>

      {message && (
        <p className="mb-4 text-sm text-center text-slate-300">{message}</p>
      )}

      {tasks.length === 0 && (
        <p className="text-slate-400 text-sm">No tasks available.</p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {tasks.map((task) => {
          const locked = tier !== task.tier_required;

          return (
            <div key={task.id} className="bg-slate-800 p-4 rounded-lg">
              <h3 className="font-semibold">{task.title}</h3>
              <p className="text-sm text-slate-400 mt-1">
                Reward: ${task.reward}
              </p>
              <p className="text-sm text-slate-400">Slots left: {task.slots}</p>

              <Button
                disabled={locked || submitting === task.id}
                className="w-full mt-3"
                onClick={() => submitTask(task.id)}
              >
                {locked
                  ? `Requires ${task.tier_required}`
                  : submitting === task.id
                    ? "Submitting..."
                    : "Start Task"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
