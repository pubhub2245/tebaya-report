"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Task,
  dueLabel,
  dueTone,
  dueToneClasses,
  PRIORITY_LABEL,
  priorityClasses,
  sortTasks,
  todayLocal,
} from "@/lib/tasks";

export default function TaskAdminDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      setTasks((data as Task[]) || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const today = todayLocal();

  const overdue = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === "pending" && t.due_date && t.due_date < today
      ),
    [tasks, today]
  );

  const byAssignee = useMemo(() => {
    const m = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const key = t.assignee || "（未割当）";
      const arr = m.get(key) || [];
      arr.push(t);
      m.set(key, arr);
    });
    return Array.from(m.entries())
      .map(([name, ts]) => {
        const total = ts.length;
        const done = ts.filter((t) => t.status === "completed").length;
        const overdueN = ts.filter(
          (t) => t.status === "pending" && t.due_date && t.due_date < today
        ).length;
        return {
          name,
          tasks: sortTasks(ts),
          total,
          done,
          overdue: overdueN,
          rate: total > 0 ? Math.round((done / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [tasks, today]);

  const overall = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "completed").length;
    const pending = total - done;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pending, rate };
  }, [tasks]);

  const handleDelete = async (t: Task) => {
    if (!confirm(`削除しますか？\n「${t.title}」`)) return;
    setDeletingId(t.id);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", t.id);
      if (error) throw error;
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: any) {
      alert("削除失敗: " + (e?.message || e));
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-brand-dark">✅ タスク管理</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-brand-dark">全体完了率</span>
          <span className="text-sm text-stone-600">
            {overall.done}/{overall.total} 件（残 {overall.pending}）
          </span>
        </div>
        <div className="h-4 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${overall.rate}%` }}
          />
        </div>
        <div className="text-right text-xs text-stone-600 mt-1">
          {overall.rate}%
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="border-2 border-red-400 bg-red-50 rounded-xl p-4 text-red-800">
          <div className="font-bold text-lg mb-2">
            ⚠️ 期限切れタスク {overdue.length}件
          </div>
          <ul className="space-y-1 text-sm">
            {overdue.map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span className="font-semibold">{t.title}</span>
                <span className="text-xs whitespace-nowrap">
                  {t.assignee || "（未割当）"} / {dueLabel(t.due_date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="font-bold text-brand-dark mb-3">担当者別</h3>
        {loading ? (
          <p className="text-sm text-stone-500">読み込み中…</p>
        ) : byAssignee.length === 0 ? (
          <p className="text-sm text-stone-500">タスクがありません</p>
        ) : (
          <div className="space-y-3">
            {byAssignee.map((g) => (
              <div
                key={g.name}
                className="border border-stone-200 rounded-xl p-3"
              >
                <button
                  onClick={() => toggleExpand(g.name)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {expanded.has(g.name) ? "▼" : "▶"}
                    </span>
                    <span className="font-bold">{g.name}</span>
                    {g.overdue > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                        期限切れ {g.overdue}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-xs text-stone-600">
                    <div>
                      {g.done}/{g.total} 件 ({g.rate}%)
                    </div>
                  </div>
                </button>
                <div className="mt-2 h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${g.rate}%` }}
                  />
                </div>
                {expanded.has(g.name) && (
                  <div className="mt-3 space-y-2">
                    {g.tasks.map((t) => {
                      const tone = dueToneClasses(dueTone(t.due_date));
                      const done = t.status === "completed";
                      return (
                        <div
                          key={t.id}
                          className="flex items-start justify-between gap-2 text-sm border-t border-stone-100 pt-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${priorityClasses(
                                  t.priority
                                )}`}
                              >
                                {PRIORITY_LABEL[t.priority]}
                              </span>
                              <span
                                className={`font-semibold ${
                                  done ? "line-through text-stone-400" : ""
                                }`}
                              >
                                {t.title}
                              </span>
                            </div>
                            <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                              <span
                                className={`${tone.bg} ${tone.text} px-1.5 py-0.5 rounded font-semibold`}
                              >
                                {dueLabel(t.due_date)}
                              </span>
                              {done && (
                                <span className="text-green-600 font-semibold">
                                  ✓ 完了
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDelete(t)}
                            disabled={deletingId === t.id}
                            className="text-xs text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-40"
                          >
                            {deletingId === t.id ? "削除中" : "削除"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
