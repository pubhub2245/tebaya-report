/**
 * お客さん向け公式LINE の Webhook（LINE から届く通知）を処理する本体。
 *
 * app/api/line/customer/webhook/route.ts から呼ばれる。
 * 倉庫（Supabase）への保存やスタッフグループへの転送は「外から渡す」作りにして、
 * テストでは本物の通信なしに動きを確かめられるようにしてある。
 *
 * ■ 第1段階でやること
 *   (a) 届いたメッセージを customer_line_messages に保存する
 *   (b) スタッフのLINEグループへ転送する（返信は公式LINEアプリの「チャット」から）
 *   お客さんへの返信はしない（LINE側の応答メッセージと二重になるため）。
 *
 * ■ 必ず 200 を返す
 *   LINE は 200 以外だと同じ通知を何度も送り直してくる。
 *   処理に失敗しても記録（console.error）に残して 200 を返す。
 *   例外は署名が合わないとき（401）と、合言葉が未設定のとき（500）だけ。
 */

import { verifyCustomerSignature } from "./customerClient";

/** customer_line_messages に入れる1行 */
export type CustomerLineMessageRow = {
  line_user_id: string;
  message_type: string;
  message_text: string | null;
  received_at: string;
  raw: unknown;
  status: "new";
};

/** customer_line_events に入れる1行（友だち追加・ブロックなど） */
export type CustomerLineEventRow = {
  line_user_id: string | null;
  event_type: string;
  occurred_at: string;
  raw: unknown;
};

export type CustomerWebhookDeps = {
  /** チャンネルシークレット（未設定なら undefined） */
  channelSecret: string | undefined;
  saveMessage: (row: CustomerLineMessageRow) => Promise<void>;
  saveEvent: (row: CustomerLineEventRow) => Promise<void>;
  /** スタッフグループへ転送。成否を返す（失敗しても例外は投げない） */
  forwardToStaff: (text: string) => Promise<boolean>;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
};

export type CustomerWebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * テキスト以外のメッセージを、一覧やグループで分かる短い言葉にする。
 * 例：画像 → "[画像]"
 */
export function summarizeCustomerMessage(message: any): string {
  const type = String(message?.type ?? "");
  switch (type) {
    case "text":
      return String(message.text ?? "");
    case "image":
      return "[画像]";
    case "sticker":
      return "[スタンプ]";
    case "video":
      return "[動画]";
    case "audio":
      return "[音声]";
    case "file":
      return `[ファイル${message.fileName ? "：" + message.fileName : ""}]`;
    case "location": {
      const where = message.address || message.title;
      return `[位置情報${where ? "：" + where : ""}]`;
    }
    default:
      return `[${type || "不明"}]`;
  }
}

/** LINE の userId（U + 32文字）の末尾4桁。誰の発言か見分ける手がかりに使う */
export function userIdTail(lineUserId: string | null | undefined): string {
  const id = lineUserId ?? "";
  return id.length >= 4 ? id.slice(-4) : id || "????";
}

/** スタッフグループへ流す文面 */
export function formatStaffForward(
  text: string,
  lineUserId: string | null | undefined,
): string {
  return [
    "【お客さんからLINE】",
    text,
    `（送信者ID末尾4桁：${userIdTail(lineUserId)}）`,
    "※返信は公式LINEアプリの「チャット」から",
  ].join("\n");
}

/** LINE の timestamp（ミリ秒）を ISO 文字列に。無ければ今 */
function toIso(timestamp: unknown): string {
  const n = typeof timestamp === "number" ? timestamp : Number(timestamp);
  if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
  return new Date().toISOString();
}

export async function handleCustomerWebhook(
  input: { bodyText: string; signature: string | null },
  deps: CustomerWebhookDeps,
): Promise<CustomerWebhookResult> {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;

  // 1. 合言葉が無ければ、そもそも本物かどうか確かめられない
  if (!deps.channelSecret) {
    logError("[顧客LINE Webhook] LINE_CUSTOMER_CHANNEL_SECRET が未設定");
    return { status: 500, body: { error: "Server misconfigured" } };
  }

  // 2. 署名検証（LINE 以外からの偽物を弾く）
  if (!verifyCustomerSignature(input.bodyText, deps.channelSecret, input.signature)) {
    logError("[顧客LINE Webhook] 署名検証失敗");
    return { status: 401, body: { error: "Invalid signature" } };
  }

  // 3. 本文を読む。LINE の「検証」ボタンは events が空の POST を送ってくる
  let body: any;
  try {
    body = JSON.parse(input.bodyText || "{}");
  } catch {
    logError("[顧客LINE Webhook] JSON として読めない本文");
    return { status: 200, body: { received: true, processed: 0 } };
  }
  const events: any[] = Array.isArray(body?.events) ? body.events : [];
  log(`[顧客LINE Webhook] ${events.length}件のイベント受信`);

  let processed = 0;
  for (const event of events) {
    try {
      await handleOneEvent(event, deps);
      processed++;
    } catch (err: any) {
      // 1件の失敗で残りを止めない。記録だけ残す
      logError(
        `[顧客LINE Webhook] イベント処理エラー (${event?.type}):`,
        err?.message || err,
      );
    }
  }

  return { status: 200, body: { received: true, processed } };
}

async function handleOneEvent(event: any, deps: CustomerWebhookDeps) {
  const type = String(event?.type ?? "");
  const lineUserId: string | null = event?.source?.userId ?? null;

  switch (type) {
    case "message": {
      const message = event.message ?? {};
      const messageType = String(message.type ?? "unknown");
      const text = summarizeCustomerMessage(message);

      // (a) 保存。ここが本命なので先にやる
      await deps.saveMessage({
        line_user_id: lineUserId ?? "unknown",
        message_type: messageType,
        message_text: text,
        received_at: toIso(event.timestamp),
        raw: event,
        status: "new",
      });

      // (b) 転送。失敗しても保存は成功のまま
      const ok = await deps.forwardToStaff(formatStaffForward(text, lineUserId));
      if (!ok) {
        (deps.logError ?? console.error)(
          "[顧客LINE Webhook] スタッフグループへの転送に失敗（保存は完了）",
        );
      }
      break;
    }

    case "follow":
    case "unfollow": {
      // 友だち追加・ブロック。記録だけ（返信も通知もしない）
      await deps.saveEvent({
        line_user_id: lineUserId,
        event_type: type,
        occurred_at: toIso(event.timestamp),
        raw: event,
      });
      break;
    }

    default:
      // それ以外（postback・join など）は今は無視
      (deps.log ?? console.log)(`[顧客LINE Webhook] 未処理イベント: ${type}`);
  }
}
