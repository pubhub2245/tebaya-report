import { NextResponse } from "next/server";
import {
  customerChannelSecretStatus,
  customerChannelTokenStatus,
  getCustomerBotInfo,
} from "@/lib/line/customerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/line/customer/diagnose
 *
 * お客さん向け公式LINE（@276msmys）の設定が正しいかを確かめる診断。
 * /api/line/diagnose（スタッフ向けBot）と同じ作り。
 * - LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN が設定されているか・壊れていないか
 * - LINE_CUSTOMER_CHANNEL_SECRET が設定されているか・壊れていないか
 * - トークンが有効か（getBotInfo で確認）、Bot名は何か
 *
 * ★ トークンやシークレットの値そのものは絶対に返さない。
 * ★ お客さんへの送信テストは付けない（第1段階では送らない方針のため）。
 */
export async function GET() {
  const result: {
    ok: boolean;
    channel: "customer";
    token_set: boolean;
    token_usable: boolean;
    secret_set: boolean;
    secret_usable: boolean;
    token_valid: boolean;
    bot_name: string | null;
    bot_basic_id: string | null;
    errors: string[];
  } = {
    ok: false,
    channel: "customer",
    token_set: false,
    token_usable: false,
    secret_set: false,
    secret_usable: false,
    token_valid: false,
    bot_name: null,
    bot_basic_id: null,
    errors: [],
  };

  const token = customerChannelTokenStatus();
  result.token_set = !(!token.ok && token.reason === "未設定");
  result.token_usable = token.ok;
  if (!token.ok) {
    result.errors.push(
      token.reason === "未設定"
        ? "LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN が未設定です（Vercelの環境変数を確認してください）"
        : "LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN に全角などの使えない文字が入っています（貼り直してください）",
    );
  }

  const secret = customerChannelSecretStatus();
  result.secret_set = !(!secret.ok && secret.reason === "未設定");
  result.secret_usable = secret.ok;
  if (!secret.ok) {
    result.errors.push(
      secret.reason === "未設定"
        ? "LINE_CUSTOMER_CHANNEL_SECRET が未設定です（Webhookの署名検証ができません）"
        : "LINE_CUSTOMER_CHANNEL_SECRET に全角などの使えない文字が入っています（貼り直してください）",
    );
  }

  if (token.ok) {
    try {
      const info = await getCustomerBotInfo();
      result.token_valid = true;
      result.bot_name = info.displayName;
      result.bot_basic_id = info.basicId;
    } catch (e: any) {
      result.token_valid = false;
      result.errors.push(
        "トークンが無効か期限切れの可能性があります: " + (e?.message || e),
      );
    }
  }

  result.ok = result.token_usable && result.secret_usable && result.token_valid;
  return NextResponse.json(result);
}
