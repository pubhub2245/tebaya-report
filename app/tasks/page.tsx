"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { STAFF_OPTIONS } from "@/lib/formState";
import { Task, sortTasks } from "@/lib/tasks";
import TaskCard from "@/app/components/TaskCard";
import TaskFormModal from "@/app/components/TaskFormModal";

type StatusFilter = "pending" | "completed" | "all";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string>("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [showCompleted, setShowCompleted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
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
    try {
      const saved = localStorage.getItem("tasks-me");
      if (saved) setMe(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (me) localStorage.setItem("tasks-me", me);
    } catch {}
  }, [me]);

  const filtered = useMemo(() => {
    let xs = tasks;
    if (scope === "mine" && me) xs = xs.filter((t) => t.assignee === me);
    if (statusFilter !== "all")
      xs = xs.filter((t) => t.status === statusFilter);
    return sortTasks(xs);
  }, [tasks, scope, me, statusFilter]);

  const pending = filtered.filter((t) => t.status === "pending");
  const completed = filtered.filter((t) => t.status === "completed");

  const handleToggle = async (task: Task, next: Task["status"]) => {
    setBusyId(task.id);
    const patch =
      next === "completed"
        ? { status: "completed", completed_at: new Date().toISOString() }
        : { status: "pending", completed_at: null };
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, ...(patch as any) } : t))
    );
    try {
      const { error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", task.id);
      if (error) throw error;
    } catch (e: any) {
      alert("更新に失敗しました: " + (e?.message || e));
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-32">
      <header className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          🏠 トップ
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">✅ タスク管理</h1>
        <button
          onClick={() => setOpen(true)}
          aria-label="タスク追加"
          className="rounded-full bg-green-600 hover:bg-green-700 text-white w-10 h-10 text-2xl font-bold shadow flex items-center justify-center active:scale-90"
        >
          ＋
        </button>
      </header>

      <section className="card mb-4 space-y-3">
        <div>
          <label className="label">自分の担当</label>
          <select
            className="field"
            value={STAFF_OPTIONS.includes(me) || me === "" ? me : "__other__"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__other__") setMe(" ");
              else setMe(v);
            }}
          >
            <option value="">未設定</option>
            {STAFF_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {me && !STAFF_OPTIONS.includes(me) && me.trim() !== "" && (
              <option value={me}>{me}</option>
            )}
            <option value="__other__">その他（手入力）</option>
          </select>
          {me !== "" && !STAFF_OPTIONS.includes(me) && (
            <input
              className="field mt-2"
              placeholder="名前を入力"
              value={me.trim() === "" ? "" : me}
              onChange={(e) => setMe(e.target.value || " ")}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex rounded-lg border border-stone-300 overflow-hidden">
            <button
              onClick={() => setScope("all")}
              className={`flex-1 text-sm py-2 ${
                scope === "all"
                  ? "bg-brand text-white font-bold"
                  : "bg-white text-stone-600"
              }`}
            >
              全員
            </button>
            <button
              onClick={() => setScope("mine")}
              disabled={!me || me.trim() === ""}
              className={`flex-1 text-sm py-2 ${
                scope === "mine"
                  ? "bg-brand text-white font-bold"
                  : "bg-white text-stone-600"
              } disabled:opacity-40`}
            >
              自分のみ
            </button>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="field text-sm py-2"
          >
            <option value="pending">未完了のみ</option>
            <option value="completed">完了済みのみ</option>
            <option value="all">すべて</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
      {loading && <p className="text-center text-stone-500 py-8">読み込み中…</p>}

      {!loading && (
        <>
          {statusFilter === "completed" ? (
            <section className="space-y-2">
              {completed.length === 0 ? (
                <p className="text-center text-stone-500 py-8">
                  完了タスクはありません
                </p>
              ) : (
                completed.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    busy={busyId === t.id}
                    onToggle={(next) => handleToggle(t, next)}
                  />
                ))
              )}
            </section>
          ) : (
            <>
              <section className="space-y-2">
                {pending.length === 0 ? (
                  <p className="text-center text-stone-500 py-8">
                    未完了タスクはありません 🎉
                  </p>
                ) : (
                  pending.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      busy={busyId === t.id}
                      onToggle={(next) => handleToggle(t, next)}
                    />
                  ))
                )}
              </section>

              {statusFilter === "all" && completed.length > 0 && (
                <section className="mt-6">
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="w-full text-left text-sm font-bold text-stone-600 py-2 border-t border-stone-200"
                  >
                    {showCompleted ? "▼" : "▶"} 完了済み {completed.length}件
                  </button>
                  {showCompleted && (
                    <div className="space-y-2 mt-2">
                      {completed.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          busy={busyId === t.id}
                          onToggle={(next) => handleToggle(t, next)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      <TaskFormModal
        open={open}
        defaultAssignee={me && me.trim() !== "" ? me : undefined}
        onClose={() => setOpen(false)}
        onCreated={load}
      />
    </main>
  );
}
