/**
 * 意見箱（feedback_box）のステータスに関する共通ヘルパー。
 *
 * status カラムの値：
 *   pending     未着手
 *   reviewing   検討中
 *   in_progress 実装中
 *   completed   完了
 *   rejected    却下
 */

export type FeedbackStatus =
  | "pending"
  | "reviewing"
  | "in_progress"
  | "completed"
  | "rejected";

export const STATUS_OPTIONS: ReadonlyArray<{
  value: FeedbackStatus;
  label: string;
  /** Tailwind の bg-* クラス（バッジ背景） */
  badgeBg: string;
  /** Tailwind の text-* クラス */
  badgeText: string;
}> = [
  {
    value: "pending",
    label: "未着手",
    badgeBg: "bg-stone-300",
    badgeText: "text-stone-800",
  },
  {
    value: "reviewing",
    label: "検討中",
    badgeBg: "bg-sky-200",
    badgeText: "text-sky-900",
  },
  {
    value: "in_progress",
    label: "実装中",
    badgeBg: "bg-amber-200",
    badgeText: "text-amber-900",
  },
  {
    value: "completed",
    label: "完了",
    badgeBg: "bg-emerald-200",
    badgeText: "text-emerald-900",
  },
  {
    value: "rejected",
    label: "却下",
    badgeBg: "bg-rose-200",
    badgeText: "text-rose-900",
  },
];

/** ステータス値 → 日本語ラベル */
export function getStatusLabel(status: string): string {
  const found = STATUS_OPTIONS.find((s) => s.value === status);
  return found?.label ?? status;
}

/** ステータス値 → Tailwind バッジクラス（背景＋文字色） */
export function getStatusColor(status: string): string {
  const found = STATUS_OPTIONS.find((s) => s.value === status);
  if (!found) return "bg-stone-200 text-stone-700";
  return `${found.badgeBg} ${found.badgeText}`;
}

/** 管理画面で「進行中」を上、「終了」を下にソートするためのソートキー */
export function sortKeyForAdmin(status: string): number {
  switch (status) {
    case "in_progress":
      return 0;
    case "reviewing":
      return 1;
    case "pending":
      return 2;
    case "completed":
      return 3;
    case "rejected":
      return 4;
    default:
      return 5;
  }
}
