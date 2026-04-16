"use client";

import {
  Task,
  dueLabel,
  dueTone,
  dueToneClasses,
  PRIORITY_LABEL,
  priorityClasses,
} from "@/lib/tasks";

type Props = {
  task: Task;
  onToggle: (next: Task["status"]) => void;
  busy?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
};

export default function TaskCard({
  task,
  onToggle,
  busy,
  onDelete,
  deleting,
}: Props) {
  const tone = dueToneClasses(dueTone(task.due_date));
  const isDone = task.status === "completed";

  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm bg-white ${
        isDone ? "opacity-60 border-stone-200" : "border-stone-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(isDone ? "pending" : "completed")}
          disabled={busy}
          aria-label={isDone ? "未完了に戻す" : "完了にする"}
          className={`mt-0.5 shrink-0 w-7 h-7 rounded-md border-2 flex items-center justify-center transition active:scale-90 ${
            isDone
              ? "bg-green-500 border-green-500 text-white"
              : "bg-white border-stone-400 text-transparent hover:border-brand"
          } disabled:opacity-50`}
        >
          {isDone ? "✓" : ""}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${priorityClasses(
                task.priority
              )}`}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>
            <h3
              className={`font-bold text-base ${
                isDone ? "line-through text-stone-500" : "text-brand-dark"
              }`}
            >
              {task.title}
            </h3>
          </div>

          {task.description && (
            <p
              className={`text-sm text-stone-600 mb-2 ${
                isDone ? "" : ""
              } line-clamp-2`}
            >
              {task.description}
            </p>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {task.assignee && (
                <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                  👤 {task.assignee}
                </span>
              )}
              <span
                className={`${tone.bg} ${tone.text} px-2 py-0.5 rounded-full font-semibold`}
              >
                ⏰ {dueLabel(task.due_date)}
              </span>
            </div>
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-red-600 hover:text-red-700 border border-red-300 rounded px-2 py-0.5 hover:bg-red-50 disabled:opacity-40"
              >
                {deleting ? "削除中" : "削除"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
