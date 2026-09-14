/**
 * お客さん向け公式LINE（@276msmys）のチャンネル用クライアント。
 *
 * ■ スタッフ向けBot（「手羽屋業務連絡」）とは別チャンネル
 *   スタッフ向け : LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET / LINE_GROUP_ID
 *   お客さん向け : LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN / LINE_CUSTOMER_CHANNEL_SECRET
 *   取り違えると、お客さんの発言がスタッフのBotに届かない／逆にスタッフ宛の
 *   通知がお客さんに飛ぶ、といった事故になる。関数名にも必ず customer を入れる。
 *
 * ■ 鍵の扱いは lib/supabaseServer.ts の checkKey と同じ考え方
 *   全角文字が混ざった値をそのまま通信の合言葉（HTTPヘッダー）に入れると
 *   処理が丸ごと止まる（2026-08-28 の事故）。ここでも同じ判定で弾く。
 *
 * ■ 第1段階（2026-09）では、お客さんへ送る処理は呼ばない
 *   LINE側の「応答メッセージ」が自動返信しているので、ここから返すと二重返信になる。
 *   reply/push の薄いラッパーは第2段階のために用意だけしてある。
 */

import { createHmac, timingSafeEqual } from "crypto";
import { messagingApi } from "@line/bot-sdk";
import { checkKey, type KeyCheck } from "@/lib/supabaseServer";

/** チャンネルシークレット（署名検証に使う合言葉）の状態 */
export function customerChannelSecretStatus(): KeyCheck {
  return checkKey(process.env.LINE_CUSTOMER_CHANNEL_SECRET);
}

/** チャンネルアクセストークン（送信・Bot情報取得に使う鍵）の状態 */
export function customerChannelTokenStatus(): KeyCheck {
  return checkKey(process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN);
}

/**
 * LINE からの Webhook の署名を検証する。
 *
 * LINE は「本文をチャンネルシークレットで HMAC-SHA256 した値の base64」を
 * `x-line-signature` ヘッダーに付けてくる。同じ計算をして一致するか比べる。
 * 一致しなければ、LINE 以外の誰かが送ってきた偽物として扱う。
 *
 * ※ 比較は timingSafeEqual（時間差から中身を推測されない比べ方）で行う。
 */
export function verifyCustomerSignature(
  bodyText: string,
  channelSecret: string,
  signature: string | null | undefined,
): boolean {
  if (!channelSecret || !signature) return false;
  const expected = createHmac("sha256", channelSecret)
    .update(bodyText)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 顧客チャンネルの送信用クライアント。鍵が使えないときは null */
export function customerMessagingClient(): messagingApi.MessagingApiClient | null {
  const token = customerChannelTokenStatus();
  if (!token.ok) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: token.key });
}

/** 顧客チャンネルの Bot 情報（表示名など）。トークンの有効性確認に使う */
export async function getCustomerBotInfo(): Promise<{
  displayName: string | null;
  basicId: string | null;
}> {
  const client = customerMessagingClient();
  if (!client) throw new Error("LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN が使えません");
  const info = await client.getBotInfo();
  return {
    displayName: info.displayName ?? null,
    basicId: info.basicId ?? null,
  };
}

/**
 * お客さんへ返信する（replyToken を使う。受信から約1分以内のみ有効）。
 * ★ 第1段階では呼ばない。第2段階（受ける／断るの返信）で使う。
 */
export async function customerReply(
  replyToken: string,
  text: string,
): Promise<boolean> {
  const client = customerMessagingClient();
  if (!client) {
    console.error("[顧客LINE] トークンが使えないため返信できません");
    return false;
  }
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
    return true;
  } catch (err: any) {
    console.error("[顧客LINE] 返信失敗:", err?.message || err);
    return false;
  }
}

/**
 * お客さんへ後から送る（push。replyToken の期限が切れたあとでも送れる）。
 * ★ 第1段階では呼ばない。push は無料枠の通数を消費するので、使うときは注意。
 */
export async function customerPush(
  lineUserId: string,
  text: string,
): Promise<boolean> {
  const client = customerMessagingClient();
  if (!client) {
    console.error("[顧客LINE] トークンが使えないため送信できません");
    return false;
  }
  try {
    await client.pushMessage({
      to: lineUserId,
      messages: [{ type: "text", text }],
    });
    return true;
  } catch (err: any) {
    console.error("[顧客LINE] 送信失敗:", err?.message || err);
    return false;
  }
}
