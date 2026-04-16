"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { todayLocal } from "@/lib/tasks";

export default function TaskSummary() {
  const [pending, setPending] = useState(0);
  const [dueToday, setDueToday] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayLocal();
      const [p, d, o] = await Promise.all([
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("due_date", today),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .lt("due_date", today),
      ]);
      if (cancelled) return;
      setPending(p.count || 0);
      setDueToday(d.count || 0);
      setOverdue(o.count || 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/tasks"
      className="block bg-white rounded-2xl shadow-sm ring-1 ring-stone-200 p-4 active:scale-[.99] transition"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <div className="text-sm text-stone-500">タスク状況</div>
            <div className="font-bold text-brand-dark">
              未完了タスク：{loading ? "…" : `${pending}件`}
            </div>
          </div>
        </div>
        <div className="text-right text-xs space-y-0.5">
          {overdue > 0 && (
            <div className="text-red-700 font-bold">
              ⚠️ 期限切れ {overdue}件
            </div>
          )}
          {dueToday > 0 && (
            <div className="text-orange-600 font-bold">
              今日が期限：{dueToday}件
            </div>
          )}
          <div className="text-stone-400">▶</div>
        </div>
      </div>
    </Link>
  );
}
