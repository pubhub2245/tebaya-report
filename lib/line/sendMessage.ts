import { serverClient } from "@/lib/supabaseServer";
import { messagingApi } from "@line/bot-sdk";

/**
 * LINE グループへの送信が「なぜ」できなかったかを、外から読める短い言葉にしたもの。
 *
 * ■ なぜ要るか（2026-09-28・司令室 kp198）
 *   9/28 13:46 に本番でお申し込みを1件通したところ、控えは残ったのに
 *   **スタッフの LINE への知らせだけが届きませんでした。**
 *   ところが理由は `console.error` にしか出ておらず、外からは分かりません。
 *   そのため「今月の送信数を使い切ったのだろう」と見立てるしかありませんでした。
 *   （18:36 に本番の診断を読むと、今月はまだ 5 通 残っています＝別の理由です。）
 *   **理由が分からないままだと、直しようがありません。**
 *
 * ★ 合言葉（トークン）・送り先のグループID そのものは絶対に含めません。
 * ★ ここに入るのは「どこで止まったか」の印だけで、LINE から返ってきた文章は入れません
 *   （相手の文章に、あとから何が混ざるか分からないため）。
 */
export type LineSendFailure =
  /** 合言葉（LINE_CHANNEL_ACCESS_TOKEN）が設定されていない */
  | "token_missing"
  /** 送り先のグループが分からない（環境変数にも置き場にも無い） */
  | "group_missing"
  /** 送ろうとしたが LINE に断られた（合言葉が古い・グループから外れている・今月の数を使い切った など） */
  | "push_failed";

export type LineSendResult =
  | { ok: true; failure: null; status: null }
  | { ok: false; failure: LineSendFailure; status: number | null };

/** 失敗の印を、人の言葉に直す（画面や診断に出す用。ここでも値そのものは出さない） */
export function describeLineFailure(f: LineSendFailure, status: number | null): string {
  if (f === "token_missing") {
    return "スタッフの LINE の合言葉が設定されていません（Vercel の LINE_CHANNEL_ACCESS_TOKEN）";
  }
  if (f === "group_missing") {
    return "送り先の LINE グループが分かりません（LINE_GROUP_ID も、置き場の記録も見つかりません）";
  }
  if (status === 429) {
    return "今月ぶんの送信できる数を使い切っています（毎月1日に戻ります）";
  }
  if (status === 403) {
    return "送り先のグループに送れませんでした（ボットがそのグループから外れている可能性があります）";
  }
  if (status === 401) {
    return "スタッフの LINE の合言葉が、いま通りません（古いか、間違っている可能性があります）";
  }
  if (status === 400) {
    return "送り先か本文を LINE に受け取ってもらえませんでした（送り先のIDが古い可能性があります）";
  }
  return status === null
    ? "LINE への送信が失敗しました（理由は返ってきませんでした）"
    : `LINE への送信が失敗しました（LINE からの返事：${status}）`;
}

/**
 * LINE グループにテキストメッセージを送信し、**失敗したときは理由も返す**。
 *
 * 1. 環境変数 LINE_GROUP_ID があればそれを使用
 * 2. なければ Supabase の line_groups テーブルから最新のアクティブグループを取得
 *
 * ★ 送り方そのもの（順番・送る中身・呼ぶ相手）は1行も変えていません。
 *   これまでの `sendLineGroupMessage` は、この関数の ok だけを返す薄い包みになりました。
 *   ＝ **手羽屋の日報・設営後チェック・リマインダーの送られ方は、今までどおりです。**
 */
export async function sendLineGroupMessageDetailed(text: string): Promise<LineSendResult> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.error("[LINE送信] LINE_CHANNEL_ACCESS_TOKEN が未設定");
    return { ok: false, failure: "token_missing", status: null };
  }

  // グループID取得
  let groupId = process.env.LINE_GROUP_ID;

  if (!groupId) {
    const supabase = serverClient();
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
    return { ok: false, failure: "group_missing", status: null };
  }

  try {
    const client = new messagingApi.MessagingApiClient({ channelAccessToken });
    await client.pushMessage({
      to: groupId,
      messages: [{ type: "text", text }],
    });
    console.log("[LINE送信] 送信成功");
    return { ok: true, failure: null, status: null };
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : null;
    console.error("[LINE送信] 送信失敗:", status ?? "", err?.message || err);
    return { ok: false, failure: "push_failed", status };
  }
}

/**
 * LINE グループにテキストメッセージを送信する（これまでどおりの入り口）。
 *
 * 返すのは「送れたかどうか」だけです。**呼び方も戻り値の形も変わっていません。**
 */
export async function sendLineGroupMessage(text: string): Promise<boolean> {
  const r = await sendLineGroupMessageDetailed(text);
  return r.ok;
}
