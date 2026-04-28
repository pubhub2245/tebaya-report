import { NextRequest, NextResponse } from "next/server";
import { validateSignature, messagingApi } from "@line/bot-sdk";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** GET = ヘルスチェック */
export async function GET() {
  return NextResponse.json({ status: "OK" });
}

/** POST = LINE Webhook */
export async function POST(req: NextRequest) {
  // 1. 署名検証
  const signature = req.headers.get("x-line-signature") || "";
  const bodyText = await req.text();

  if (!channelSecret) {
    console.error("[LINE Webhook] LINE_CHANNEL_SECRET が未設定");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  if (!validateSignature(bodyText, channelSecret, signature)) {
    console.warn("[LINE Webhook] 署名検証失敗");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // 2. イベント処理
  const body = JSON.parse(bodyText);
  const events: any[] = body.events || [];
  console.log(`[LINE Webhook] ${events.length}件のイベント受信`);

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });

  for (const event of events) {
    console.log(
      `[LINE Webhook] type=${event.type}, source=${JSON.stringify(event.source)}`,
    );

    try {
      switch (event.type) {
        case "join": {
          // Bot がグループに招待された
          const groupId = event.source?.groupId;
          if (!groupId) break;

          console.log(`[LINE Webhook] グループ参加: ${groupId}`);

          // Supabase に保存
          const { error } = await supabase.from("line_groups").upsert(
            {
              group_id: groupId,
              joined_at: new Date().toISOString(),
              is_active: true,
            },
            { onConflict: "group_id" },
          );
          if (error) {
            console.error("[LINE Webhook] グループ保存失敗:", error);
          } else {
            console.log("[LINE Webhook] グループID保存完了:", groupId);
          }

          // 参加メッセージ送信
          await client.pushMessage({
            to: groupId,
            messages: [
              {
                type: "text",
                text: "手羽屋業務連絡Botが参加しました 🍗\nこのグループに日報・業務連絡を送信します。",
              },
            ],
          });
          break;
        }

        case "leave": {
          // Bot がグループから退出させられた
          const groupId = event.source?.groupId;
          if (!groupId) break;

          console.log(`[LINE Webhook] グループ退出: ${groupId}`);
          await supabase
            .from("line_groups")
            .update({ is_active: false })
            .eq("group_id", groupId);
          break;
        }

        case "message": {
          // メッセージ受信 → ログのみ
          const text =
            event.message?.type === "text" ? event.message.text : "(非テキスト)";
          console.log(
            `[LINE Webhook] メッセージ: from=${event.source?.userId || "unknown"}, text=${text}`,
          );
          break;
        }

        default:
          console.log(`[LINE Webhook] 未処理イベント: ${event.type}`);
      }
    } catch (err: any) {
      console.error(
        `[LINE Webhook] イベント処理エラー (${event.type}):`,
        err?.message || err,
      );
    }
  }

  // LINE は 200 を返さないとリトライしてくるので必ず 200
  return NextResponse.json({ received: true });
}
