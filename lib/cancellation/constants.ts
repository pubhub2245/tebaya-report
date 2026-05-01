export const CANCELLATION_REASONS = [
  { key: "wind", label: "強風" },
  { key: "rain", label: "雨" },
  { key: "storm", label: "台風" },
  { key: "thunder", label: "雷雨警報" },
  { key: "staff_health", label: "スタッフ体調不良" },
  { key: "venue", label: "物件側都合（販売会中止等）" },
  { key: "vehicle", label: "車両トラブル" },
  { key: "other", label: "その他" },
] as const;

export type CancellationReasonKey = (typeof CANCELLATION_REASONS)[number]["key"];

export const CANCELLATION_REASON_LABEL: Record<CancellationReasonKey, string> =
  CANCELLATION_REASONS.reduce(
    (acc, r) => {
      acc[r.key] = r.label;
      return acc;
    },
    {} as Record<CancellationReasonKey, string>,
  );

export function formatReasons(
  keys: CancellationReasonKey[],
  reasonOther?: string | null,
): string {
  const labels = keys.map((k) => {
    if (k === "other" && reasonOther) {
      return `その他（${reasonOther}）`;
    }
    return CANCELLATION_REASON_LABEL[k];
  });
  return labels.join("・");
}
