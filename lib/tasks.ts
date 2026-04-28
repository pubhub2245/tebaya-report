export type Task = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  assignee: string | null;
  due_date: string | null;
  priority: "high" | "normal" | "low";
  status: "pending" | "completed";
  completed_at: string | null;
  created_by: string | null;
  line_notified_created: boolean;
  line_notified_reminder: boolean;
  line_notified_completed: boolean;
  line_notified_overdue: boolean;
};

export type DueTone = "overdue" | "today" | "soon" | "week" | "later" | "none";

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00");
  const b = new Date(toIso + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

export function dueTone(due: string | null): DueTone {
  if (!due) return "none";
  const today = todayLocal();
  const diff = daysBetween(today, due);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  if (diff <= 7) return "week";
  return "later";
}

export function dueToneClasses(t: DueTone): { text: string; bg: string } {
  switch (t) {
    case "overdue":
      return { text: "text-red-800", bg: "bg-red-100" };
    case "today":
      return { text: "text-orange-700", bg: "bg-orange-100" };
    case "soon":
      return { text: "text-red-600", bg: "bg-red-50" };
    case "week":
      return { text: "text-yellow-700", bg: "bg-yellow-50" };
    case "later":
      return { text: "text-stone-600", bg: "bg-stone-100" };
    default:
      return { text: "text-stone-500", bg: "bg-stone-50" };
  }
}

export function dueLabel(due: string | null): string {
  if (!due) return "期限なし";
  const today = todayLocal();
  const diff = daysBetween(today, due);
  const [y, m, d] = due.split("-");
  const md = `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  if (diff < 0) return `${md}（${Math.abs(diff)}日超過）`;
  if (diff === 0) return `${md}（今日）`;
  if (diff === 1) return `${md}（明日）`;
  if (diff <= 7) return `${md}（あと${diff}日）`;
  return `${md}まで`;
}

export const PRIORITY_LABEL: Record<Task["priority"], string> = {
  high: "高",
  normal: "中",
  low: "低",
};

export function priorityClasses(p: Task["priority"]): string {
  switch (p) {
    case "high":
      return "bg-red-100 text-red-700 border-red-300";
    case "normal":
      return "bg-yellow-100 text-yellow-700 border-yellow-300";
    case "low":
      return "bg-blue-100 text-blue-700 border-blue-300";
  }
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    const aDue = a.due_date ?? "9999-12-31";
    const bDue = b.due_date ?? "9999-12-31";
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    const prio = { high: 0, normal: 1, low: 2 } as const;
    return prio[a.priority] - prio[b.priority];
  });
}
