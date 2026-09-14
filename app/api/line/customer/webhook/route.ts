import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabaseServer";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { customerChannelSecretStatus } from "@/lib/line/customerClient";
import { handleCustomerWebhook } from "@/lib/line/customerWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/line/customer/webhook
 *
 * お客さん向け公式LINE（@276msmys）の Webhook 受け口。
 * スタッフ向けBot（/api/line/webhook）とは別チャンネル。あちらは触らない。
 *
 * 処理の中身は lib/line/customerWebhook.ts。ここは
 *   ・署名ヘッダーと本文を取り出す
 *   ・保存先（Supabase）と転送先（スタッフグループ）を渡す
 * だけの薄い入り口。
 */

/** GET = ヘルスチェック */
export async function GET() {
  return NextResponse.json({ status: "OK", channel: "customer" });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature");
  const bodyText = await req.text();

  const secret = customerChannelSecretStatus();
  if (!secret.ok && secret.reason !== "未設定") {
    console.error(
      `[顧客LINE Webhook] LINE_CUSTOMER_CHANNEL_SECRET が使えません（${secret.reason}）。Vercelの環境変数を貼り直してください。`,
    );
  }

  const supabase = serverClient();

  const result = await handleCustomerWebhook(
    { bodyText, signature },
    {
      channelSecret: secret.ok ? secret.key : undefined,
      saveMessage: async (row) => {
        const { error } = await supabase.from("customer_line_messages").insert(row);
        if (error) throw new Error(`保存失敗: ${error.message}`);
      },
      saveEvent: async (row) => {
        const { error } = await supabase.from("customer_line_events").insert(row);
        if (error) throw new Error(`記録失敗: ${error.message}`);
      },
      // 既存のスタッフ向け送信（LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID）をそのまま使う
      forwardToStaff: (text) => sendLineGroupMessage(text),
    },
  );

  return NextResponse.json(result.body, { status: result.status });
}
