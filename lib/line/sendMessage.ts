import { messagingApi } from "@line/bot-sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * LINE グループにテキストメッセージを送信する
 *
 * 1. 環境変数 LINE_GROUP_ID があればそれを使用
 * 2. なければ Supabase の line_groups テーブルから最新のアクティブグループを取得
 */
export async function sendLineGroupMessage(text: string): Promise<boolean> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.error("[LINE送信] LINE_CHANNEL_ACCESS_TOKEN が未設定");
    return false;
  }

  // グループID取得
  let groupId = process.env.LINE_GROUP_ID;

  if (!groupId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase
      .from("line_groups")
      .select("group_id")
      .eq("is_active", true)
      .order("joined_at", { ascending: false })
      .limit(1)
      .single();

    groupId = data?.group_id;
  }

  if (!groupId) {
    console.error(
      "[LINE送信] グループIDが見つかりません（環境変数もDBもなし）",
    );
    return false;
  }

  try {
    const client = new messagingApi.MessagingApiClient({ channelAccessToken });
    await client.pushMessage({
      to: groupId,
      messages: [{ type: "text", text }],
    });
    console.log("[LINE送信] 送信成功");
    return true;
  } catch (err: any) {
    console.error("[LINE送信] 送信失敗:", err?.message || err);
    return false;
  }
}
