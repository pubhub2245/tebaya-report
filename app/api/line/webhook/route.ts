import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { validateSignature, messagingApi } from "@line/bot-sdk";
import {
  handleGroupEvents,
  type GroupWebhookDeps,
  type LineGroupMessageRow,
  type LineGroupReplyRow,
  type LineGroupRow,
} from "@/lib/line/groupWebhook";

export const runtime = "nodejs";

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

const supabase = serverClient();

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

  // 2. 本文を読む
  const body = JSON.parse(bodyText || "{}");
  const events: any[] = Array.isArray(body?.events) ? body.events : [];
  console.log(`[LINE Webhook] ${events.length}件のイベント受信`);

  // 3. グループ向けイベントだけをまとめて新しい処理系に流す
  //    返信は replyToken だけを使い push は絶対に呼ばない（無料枠を消費しないため）
  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  const groupEvents = events.filter((e) => e?.source?.type === "group");
  const otherEvents = events.filter((e) => e?.source?.type !== "group");

  if (groupEvents.length > 0) {
    const deps: GroupWebhookDeps = {
      getGroup: async (groupId) => {
        const { data } = await supabase
          .from("line_groups")
          .select("group_id, label, is_active")
          .eq("group_id", groupId)
          .maybeSingle();
        return (data ?? null) as LineGroupRow | null;
      },
      insertGroup: async (groupId) => {
        const { error } = await supabase.from("line_groups").upsert(
          {
            group_id: groupId,
            is_active: true,
            joined_at: new Date().toISOString(),
          },
          { onConflict: "group_id" },
        );
        if (error) {
          console.error("[LINE Webhook] グループ登録失敗:", error.message);
        }
      },
      deactivateGroup: async (groupId) => {
        const { error } = await supabase
          .from("line_groups")
          .update({ is_active: false })
          .eq("group_id", groupId);
        if (error) {
          console.error("[LINE Webhook] グループ無効化失敗:", error.message);
        }
      },
      saveMessage: async (row: LineGroupMessageRow) => {
        const { error } = await supabase.from("line_group_messages").insert(row);
        if (!error) return { saved: true };
        // line_message_id の unique 違反は二重保存防止なので正常系として扱う
        const code = (error as any)?.code;
        if (code === "23505") {
          return { saved: false };
        }
        console.error("[LINE Webhook] メッセージ保存失敗:", error.message);
        throw new Error(`保存失敗: ${error.message}`);
      },
      listActiveReplies: async (groupId) => {
        const { data, error } = await supabase
          .from("line_group_replies")
          .select("group_id, keyword, reply_text, sort_order")
          .eq("is_active", true)
          .or(`group_id.is.null,group_id.eq.${groupId}`)
          .order("sort_order", { ascending: true });
        if (error) {
          console.error("[LINE Webhook] キーワード取得失敗:", error.message);
          return [];
        }
        return (data ?? []) as LineGroupReplyRow[];
      },
      getDisplayName: async (groupId, userId) => {
        try {
          const profile = await client.getGroupMemberProfile(groupId, userId);
          return profile.displayName ?? null;
        } catch {
          return null;
        }
      },
      replyText: async (replyToken, text) => {
        try {
          await client.replyMessage({
            replyToken,
            messages: [{ type: "text", text }],
          });
          return true;
        } catch (err: any) {
          console.error("[LINE Webhook] reply 失敗:", err?.message || err);
          return false;
        }
      },
    };
    try {
      await handleGroupEvents(groupEvents, deps);
    } catch (err: any) {
      console.error("[LINE Webhook] グループ処理エラー:", err?.message || err);
    }
  }

  // 4. 1対1などのイベントは、これまでどおりログだけ（既存の挙動を変えない）
  for (const event of otherEvents) {
    try {
      console.log(
        `[LINE Webhook] type=${event.type}, source=${JSON.stringify(event.source)}`,
      );
      if (event.type === "message") {
        const text =
          event.message?.type === "text" ? event.message.text : "(非テキスト)";
        console.log(
          `[LINE Webhook] メッセージ: from=${event.source?.userId || "unknown"}, text=${text}`,
        );
      } else {
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
