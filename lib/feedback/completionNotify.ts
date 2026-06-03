/**
 * 意見箱の要望が「完了」になったとき LINE 業務グループに送る通知文の組み立て。
 *
 * キャラ整形は本ファイル内で完結する自前ロジック。語尾（endings）を本文の
 * 最終行末に連結することで「〜ですね」が独立行にならないようにしている。
 * 全通知共通の transformWithCurrentCharacter とは意図的に分離（他通知に影響させない）。
 */

import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { getCurrentCharacter } from "@/lib/characters";

const pickRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

export type FeedbackCompletionInput = {
  title: string;
  submitter: string;
};

/** 通知のベース文（キャラ整形前のプレーンテキスト） */
export function buildFeedbackCompletionMessage(
  input: FeedbackCompletionInput,
): string {
  const lines: string[] = [
    "✅ 意見箱の要望が反映されました！",
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
  const decorated = decorateWithCharacter(baseMessage);

  if (opts.dryRun) {
    console.log("[feedback-completion-notify] === dryRun ===");
    console.log(decorated);
    console.log("[feedback-completion-notify] === /dryRun ===");
    return { sent: true, message: decorated };
  }

  const sent = await sendLineGroupMessage(decorated);
  return { sent, message: decorated };
}

/**
 * 完了通知専用のキャラ整形。
 * 共通フォーマッタ（characterTransform）は ending を本文と \n\n で離して
 * 独立段落にする仕様だが、完了通知では「ありがとう、これからもどんどん
 * 意見お待ちしてます〜ですね」のように本文末尾と連結したいため自前で処理する。
 * キャラが取得できない時は baseMessage をそのまま返す。
 */
function decorateWithCharacter(baseMessage: string): string {
  const character = getCurrentCharacter();
  if (!character) return baseMessage;

  const greeting = pickRandom(character.greetings);
  const ending = pickRandom(character.endings);

  const bodyLines = baseMessage.split("\n");
  const lastIdx = bodyLines.length - 1;
  bodyLines[lastIdx] = bodyLines[lastIdx].replace(/[。！!]$/, "") + ending;
  const bodyWithEnding = bodyLines.join("\n");

  return `${character.displaySignature}\n\n${greeting}！\n${bodyWithEnding}`;
}
