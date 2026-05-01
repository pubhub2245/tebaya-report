import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { transformWithCurrentCharacter } from "@/lib/formatters/characterTransform";
import {
  CANCELLATION_REASON_LABEL,
  type CancellationReasonKey,
} from "./constants";

const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(yyyymmdd: string): string {
  const [, m, d] = yyyymmdd.split("-");
  const date = new Date(`${yyyymmdd}T00:00:00Z`);
  return `${parseInt(m, 10)}/${parseInt(d, 10)}（${DAYS_JA[date.getUTCDay()]}）`;
}

function formatTimeJST(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatReasonLabels(
  keys: CancellationReasonKey[],
  reasonOther?: string | null,
): string {
  return keys
    .map((k) => {
      if (k === "other" && reasonOther) return `その他（${reasonOther}）`;
      return CANCELLATION_REASON_LABEL[k];
    })
    .join("、");
}

export type CancellationNotificationInput = {
  business_date: string;
  location: string;
  staff_name_raw: string;
  cancellation_reasons: CancellationReasonKey[];
  reason_other?: string | null;
  canceled_by?: string | null;
  created_at?: string | null;
};

export type CancellationNotifyOptions = {
  dryRun?: boolean;
};

export function buildCancellationMessage(
  input: CancellationNotificationInput,
): string {
  const dateLabel = formatDateLabel(input.business_date);
  const reasons = formatReasonLabels(
    input.cancellation_reasons,
    input.reason_other,
  );
  const time = formatTimeJST(input.created_at);
  return [
    "⚠️ 出店中止",
    `📅 ${dateLabel}`,
    `📍 ${input.location}`,
    `👤 担当：${input.staff_name_raw}`,
    `📝 中止理由：${reasons}`,
    `押した人：${input.canceled_by || "（未入力）"}`,
    `記録時刻：${time}`,
  ].join("\n");
}

/**
 * LINE業務グループに「出店中止」を即時通知する。
 * dryRun=true なら console.log するだけで実送信しない。
 */
export async function sendCancellationNotification(
  input: CancellationNotificationInput,
  opts: CancellationNotifyOptions = {},
): Promise<{ sent: boolean; message: string }> {
  const baseMessage = buildCancellationMessage(input);
  const decorated = transformWithCurrentCharacter(baseMessage, {
    context: "cancel",
  });

  if (opts.dryRun) {
    console.log("[cancellation-notify] === dryRun ===");
    console.log(decorated);
    console.log("[cancellation-notify] === /dryRun ===");
    return { sent: true, message: decorated };
  }

  const sent = await sendLineGroupMessage(decorated);
  return { sent, message: decorated };
}
