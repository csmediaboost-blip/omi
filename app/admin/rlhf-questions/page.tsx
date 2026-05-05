"use client";
// app/admin/rlhf-questions/page.tsx

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import AdminLayout from "@/components/AdminLayout";
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  CheckCircle,
  RefreshCw,
  MessageSquare,
} from "lucide-react";

type Question = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  category: string;
  reward: number;
  is_active: boolean;
  created_at: string;
  answer_count?: number;
};

const C = "#10b981";
const SURFACE = "#f5f5f5";
const BORDER = "#e0e0e0";

const InputCls =
  "w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}

export default function AdminRLHFPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState({
    question: "",
    option_a: "",
    option_b: "",
    category: "ai_basics",
    reward: "0.10",
  });
  const [editForm, setEditForm] = useState<Partial<Question>>({});

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  }

  async function load() {
    setLoading(true);
    const { data } = await getSupabase()
      .from("rlhf_questions")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: counts } = await getSupabase()
      .from("rlhf_answers")
      .select("question_id");
    const countMap: Record<string, number> = {};
    counts?.forEach((c) => {
      countMap[c.question_id] = (countMap[c.question_id] || 0) + 1;
    });
    setQuestions(
      (data || []).map((q) => ({ ...q, answer_count: countMap[q.id] || 0 })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createQuestion() {
    if (
      !form.question.trim() ||
      !form.option_a.trim() ||
      !form.option_b.trim()
    ) {
      flash("Fill all fields", false);
      return;
    }
    setSaving(true);
    const { error } = await getSupabase().from("rlhf_questions").insert({
      question: form.question.trim(),
      option_a: form.option_a.trim(),
      option_b: form.option_b.trim(),
      category: form.category,
      reward: parseFloat(form.reward) || 0.1,
      is_active: true,
    });
    if (error) flash(error.message, false);
    else {
      flash("Question created!");
      setCreating(false);
      setForm({
        question: "",
        option_a: "",
        option_b: "",
        category: "ai_basics",
        reward: "0.10",
      });
      load();
    }
    setSaving(false);
  }

  async function updateQuestion(id: string) {
    setSaving(true);
    const { error } = await getSupabase()
      .from("rlhf_questions")
      .update({
        question: editForm.question,
        option_a: editForm.option_a,
        option_b: editForm.option_b,
        category: editForm.category,
        reward: editForm.reward,
      })
      .eq("id", id);
    if (error) flash(error.message, false);
    else {
      flash("Saved!");
      setEditing(null);
      load();
    }
    setSaving(false);
  }

  async function toggleActive(id: string, current: boolean) {
    await getSupabase()
      .from("rlhf_questions")
      .update({ is_active: !current })
      .eq("id", id);
    load();
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Delete this question? All answers will be lost.")) return;
    await getSupabase().from("rlhf_questions").delete().eq("id", id);
    flash("Deleted");
    load();
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                RLHF Questions
              </h1>
              <p className="text-gray-600 text-sm mt-1">
                {questions.length} questions ·{" "}
                {questions.filter((q) => q.is_active).length} active
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={load}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-gray-600"
              >
                <RefreshCw size={12} /> Refresh
              </button>
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 text-xs font-black px-4 py-2 rounded-xl text-white"
                style={{ background: C }}
              >
                <Plus size={12} /> New Question
              </button>
            </div>
          </div>

          {/* Flash message */}
          {msg && (
            <div
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 ${msg.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
            >
              {msg.ok ? <CheckCircle size={14} /> : <X size={14} />}
              {msg.text}
            </div>
          )}

          {/* Create form */}
          {creating && (
            <div
              className="rounded-2xl p-5 space-y-4 bg-slate-900"
              style={{ border: `1px solid ${C}40` }}
            >
              <p className="text-white font-black text-sm">New RLHF Question</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">
                    Question
                  </label>
                  <textarea
                    value={form.question}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, question: e.target.value }))
                    }
                    rows={2}
                    className={InputCls}
                    placeholder="Which AI response better answers..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">
                      Response A (usually better)
                    </label>
                    <textarea
                      value={form.option_a}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, option_a: e.target.value }))
                      }
                      rows={3}
                      className={InputCls}
                      placeholder="Detailed, accurate response..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">
                      Response B (usually worse)
                    </label>
                    <textarea
                      value={form.option_b}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, option_b: e.target.value }))
                      }
                      rows={3}
                      className={InputCls}
                      placeholder="Vague or inaccurate response..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">
                      Category
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, category: e.target.value }))
                      }
                      className={InputCls}
                    >
                      <option value="ai_basics">AI Basics</option>
                      <option value="programming">Programming</option>
                      <option value="security">Security</option>
                      <option value="technology">Technology</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">
                      Reward ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.reward}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, reward: e.target.value }))
                      }
                      className={InputCls}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createQuestion}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs font-black px-4 py-2 rounded-xl text-slate-950 disabled:opacity-50"
                  style={{ background: C }}
                >
                  {saving ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}{" "}
                  Create
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="text-slate-400 text-xs px-3 py-2 rounded-xl border border-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Questions list */}
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={20} className="animate-spin text-emerald-500" />
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-2xl p-5 bg-slate-900"
                  style={{
                    border: `1px solid ${q.is_active ? BORDER + "40" : "#ef444430"}`,
                  }}
                >
                  {editing === q.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editForm.question}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            question: e.target.value,
                          }))
                        }
                        rows={2}
                        className={InputCls}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <textarea
                          value={editForm.option_a}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              option_a: e.target.value,
                            }))
                          }
                          rows={3}
                          className={InputCls}
                          placeholder="Response A..."
                        />
                        <textarea
                          value={editForm.option_b}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              option_b: e.target.value,
                            }))
                          }
                          rows={3}
                          className={InputCls}
                          placeholder="Response B..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={editForm.category}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              category: e.target.value,
                            }))
                          }
                          className={InputCls}
                        >
                          <option value="ai_basics">AI Basics</option>
                          <option value="programming">Programming</option>
                          <option value="security">Security</option>
                          <option value="technology">Technology</option>
                          <option value="general">General</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.reward}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              reward: parseFloat(e.target.value),
                            }))
                          }
                          className={InputCls}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateQuestion(q.id)}
                          disabled={saving}
                          className="flex items-center gap-1.5 text-xs font-black px-4 py-2 rounded-xl text-slate-950 disabled:opacity-50"
                          style={{ background: C }}
                        >
                          {saving ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <Save size={12} />
                          )}{" "}
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-slate-400 text-xs px-3 py-2 rounded-xl border border-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-blue-800/40 bg-blue-900/20 text-blue-400">
                              {q.category}
                            </span>
                            <span
                              className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                color: C,
                                background: `${C}15`,
                                border: `1px solid ${C}30`,
                              }}
                            >
                              ${q.reward} reward
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-700 text-slate-500">
                              {q.answer_count} answers
                            </span>
                            {!q.is_active && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-red-700/40 bg-red-900/20 text-red-400">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-white font-bold text-sm">
                            {q.question}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setEditing(q.id);
                              setEditForm(q);
                            }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center border border-slate-700 text-slate-500 hover:text-white transition-all"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => toggleActive(q.id, q.is_active)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center border transition-all"
                            style={{
                              borderColor: q.is_active ? "#ef444440" : `${C}40`,
                              color: q.is_active ? "#ef4444" : C,
                            }}
                          >
                            {q.is_active ? (
                              <X size={11} />
                            ) : (
                              <CheckCircle size={11} />
                            )}
                          </button>
                          <button
                            onClick={() => deleteQuestion(q.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center border border-red-700/40 text-red-500 hover:bg-red-900/20 transition-all"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div
                          className="rounded-xl p-3"
                          style={{
                            background: "rgba(16,185,129,0.06)",
                            border: "1px solid rgba(16,185,129,0.15)",
                          }}
                        >
                          <p className="text-[9px] font-bold text-emerald-400 mb-1">
                            RESPONSE A
                          </p>
                          <p className="text-slate-300 text-xs leading-relaxed">
                            {q.option_a}
                          </p>
                        </div>
                        <div
                          className="rounded-xl p-3"
                          style={{
                            background: "rgba(100,116,139,0.06)",
                            border: "1px solid rgba(100,116,139,0.15)",
                          }}
                        >
                          <p className="text-[9px] font-bold text-slate-400 mb-1">
                            RESPONSE B
                          </p>
                          <p className="text-slate-300 text-xs leading-relaxed">
                            {q.option_b}
                          </p>
                        </div>
                      </div>
                      <p className="text-slate-700 text-[10px] mt-2">
                        Created {new Date(q.created_at).toLocaleDateString()}
                      </p>
                    </>
                  )}
                </div>
              ))}
              {questions.length === 0 && (
                <div
                  className="text-center py-16 rounded-2xl"
                  style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <MessageSquare
                    size={32}
                    className="mx-auto mb-3 text-slate-400"
                  />
                  <p className="text-slate-500">
                    No questions yet. Create your first RLHF question above.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
