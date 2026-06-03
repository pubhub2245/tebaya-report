/**
 * 意見箱の要望が「完了」になったとき LINE 業務グループに送る通知文の組み立て。
 *
 * 既存パターン（lib/cancellation/notify.ts）に合わせ、ベース文字列を作る関数と
 * 実際に送信する関数を分ける。送信側はキャラ整形（transformWithCurrentCharacter）
 * を通してから sendLineGroupMessage に渡す。
 */

import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { transformWithCurrentCharacter } from "@/lib/formatters/characterTransform";

export type FeedbackCompletionInput = {
  title: string;
  submitter: string;
};

/** 通知のベース文（キャラ整形前のプレーンテキスト） */
export function buildFeedbackCompletionMessage(
  input: FeedbackCompletionInput,
): string {
  const lines: string[] = [
    "📢 意見箱の要望が反映されました！",
    "",
    `『${input.title}』`,
    `提案：${input.submitter}さん`,
    "",
    "詳しい内容は意見箱のスレッドをチェックしてね！",
    "提案ありがとう、これからもどんどん意見お待ちしてます。",
  ];

  return lines.join("\n");
}

export type FeedbackCompletionNotifyOptions = {
  /** true なら実送信せず生成メッセージだけ返す（テスト・確認用） */
  dryRun?: boolean;
};

/**
 * LINE 業務グループへ「要望反映」通知を送る。
 * 失敗しても呼び出し元の処理は止めない想定（caller が success フラグを見る）。
 */
export async function sendFeedbackCompletionNotification(
  input: FeedbackCompletionInput,
  opts: FeedbackCompletionNotifyOptions = {},
): Promise<{ sent: boolean; message: string }> {
  const baseMessage = buildFeedbackCompletionMessage(input);
  const decorated = transformWithCurrentCharacter(baseMessage, {
    context: "generic",
  });

  if (opts.dryRun) {
    console.log("[feedback-completion-notify] === dryRun ===");
    console.log(decorated);
    console.log("[feedback-completion-notify] === /dryRun ===");
    return { sent: true, message: decorated };
  }

  const sent = await sendLineGroupMessage(decorated);
  return { sent, message: decorated };
}
