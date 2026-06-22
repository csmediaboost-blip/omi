"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export default function TaskSubmit({
  taskId,
  userId,
}: {
  taskId: number;
  userId: string;
}) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submitTask = async () => {
    setLoading(true);

    await supabase.from("task_submissions").insert({
      user_id: userId,
      task_id: taskId,
      notes,
      status: "pending",
    });

    setLoading(false);

    alert("Task submitted for review");
  };

  return (
    <div className="space-y-3">
      <textarea
        placeholder="Explain what you did..."
        className="w-full bg-slate-900 border border-slate-800 p-2 rounded"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <Button onClick={submitTask} disabled={loading}>
        Submit Task
      </Button>
    </div>
  );
}
