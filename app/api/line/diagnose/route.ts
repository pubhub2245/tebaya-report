import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { messagingApi } from "@line/bot-sdk";

export const runtime = "nodejs";

/**
 * GET /api/line/diagnose
 *
 * LINE自動送信がなぜ失敗するのかを切り分けるための診断エンドポイント。
 * - トークン（LINE_CHANNEL_ACCESS_TOKEN）が設定されているか
 * - 送信先グループIDが取得できるか（環境変数 or DB）
 * - トークンが有効か（getBotInfo で確認）
 *
 * ?send=1 を付けるとグループへ実際にテストメッセージを1通送る。
 */
export async function GET(req: NextRequest) {
  const wantSend = req.nextUrl.searchParams.get("send") === "1";
  const result: {
    ok: boolean;
    token_set: boolean;
    group_id_found: boolean;
    group_id_source: string | null;
    token_valid: boolean;
    bot_name: string | null;
    sent: boolean | null;
    errors: string[];
  } = {
    ok: false,
    token_set: false,
    group_id_found: false,
    group_id_source: null,
    token_valid: false,
    bot_name: null,
    sent: null,
    errors: [],
  };

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  result.token_set = !!token;
  if (!token) {
    result.errors.push(
      "LINE_CHANNEL_ACCESS_TOKEN が未設定です（Vercelの環境変数を確認してください）",
    );
    return NextResponse.json(result);
  }

  // 送信先グループID
  let groupId = process.env.LINE_GROUP_ID;
  if (groupId) {
    result.group_id_source = "環境変数（LINE_GROUP_ID）";
  } else {
    try {
      const supabase = serverClient();
      const { data } = await supabase
        .from("line_groups")
        .select("group_id")
        .eq("is_active", true)
        .order("joined_at", { ascending: false })
        .limit(1)
        .single();
      if (data?.group_id) {
        groupId = data.group_id;
        result.group_id_source = "データベース（line_groups）";
      }
    } catch (e: any) {
      result.errors.push("グループID取得エラー: " + (e?.message || e));
    }
  }
  result.group_id_found = !!groupId;
  if (!groupId) {
    result.errors.push(
      "送信先のLINEグループIDが見つかりません（ボットをグループに再度招待するか、LINE_GROUP_ID を設定してください）",
    );
  }

  // トークンの有効性を getBotInfo で確認
  try {
    const client = new messagingApi.MessagingApiClient({
      channelAccessToken: token,
    });
    const info = await client.getBotInfo();
    result.token_valid = true;
    result.bot_name = info.displayName || null;

    if (wantSend && groupId) {
      try {
        await client.pushMessage({
          to: groupId,
          messages: [
            {
              type: "text",
              text: "【接続テスト】このメッセージが届けば、LINE自動送信は正常です ✅",
            },
          ],
        });
        result.sent = true;
      } catch (e: any) {
        result.sent = false;
        result.errors.push("テスト送信に失敗: " + (e?.message || e));
      }
    }
  } catch (e: any) {
    result.token_valid = false;
    result.errors.push(
      "トークンが無効か期限切れの可能性があります: " + (e?.message || e),
    );
  }

  result.ok =
    result.token_set &&
    result.group_id_found &&
    result.token_valid &&
    (wantSend ? result.sent === true : true);

  return NextResponse.json(result);
}
