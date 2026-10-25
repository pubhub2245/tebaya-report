/**
 * スタッフの LINE へ「申し込みが入りました」を届けられる状態か、**読むだけ**で調べる所。
 *
 * ■ なぜ1か所に出したか（2026-10-25・f2-2）
 *   この調べ方は これまで診断の窓口（/api/keiri/diagnose）の中にだけ書かれていました。
 *   その窓口は検索エンジンに「読まないで」とことわってある住所なので、
 *   **検査役（B2）が開けません**。そのため「申し込みが入った時に、じゅんに知らせが届くか」
 *   （仕上げチェック表 f2-2）の裏付けが、10/4 に B が1通 試した結果のまま
 *   **3週間ずっと取り直せていません**。
 *   そこで調べ方をこのファイル1つに出し、**読むだけの窓口**
 *   （/api/keiri/notifycheck）からも同じ答えが読めるようにしました。
 *   診断の窓口も、これと同じ関数を呼びます（同じ答えが2通りに分かれないため）。
 *
 * ★メッセージは1通も送りません（送って確かめると、その1通ぶん今月の残りが減るため）。
 * ★合言葉・送り先のID・お店の名前は1文字も返しません（設定済み／未設定だけ）。
 * ★手羽屋の LINE の送り方（lib/line/sendMessage.ts）は1行も変えていません。
 */

import { messagingApi } from "@line/bot-sdk";

import { serverClient } from "@/lib/supabaseServer";
import { type NotifyFacts } from "@/lib/keiri/notifyHealth";

/**
 * スタッフの LINE へ「申し込みが入りました」を届けられる状態か、**読むだけ**で確かめる。
 *
 * ★メッセージは1通も送りません。送って確かめると、その1通ぶん今月の残りが減るため。
 * ★合言葉の値そのものは返しません。
 * ★手羽屋の LINE の送り方（lib/line/sendMessage.ts）は1行も変えていません。
 */
export async function probeNotify(): Promise<NotifyFacts> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const facts: NotifyFacts = {
    tokenSet: !!token,
    tokenValid: false,
    groupFound: false,
    groupReachable: null,
    quota: null,
  };
  if (!token) return facts;

  // 送り先。環境変数が無ければ、いつもの置き場（line_groups）から探す
  let groupId = process.env.LINE_GROUP_ID;
  if (!groupId) {
    try {
      const { data } = await serverClient({ fresh: true })
        .from("line_groups")
        .select("group_id")
        .eq("is_active", true)
        .order("joined_at", { ascending: false })
        .limit(1)
        .single();
      groupId = data?.group_id ?? undefined;
    } catch {
      groupId = undefined;
    }
  }
  facts.groupFound = !!groupId;

  try {
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
    await client.getBotInfo();
    facts.tokenValid = true;
    // ★送り先に **本当に届くか** を確かめる（2026-09-28・kp198）。
    //   これまでは「IDが手元にある」だけで緑にしていたが、9/28 13:46 に
    //   診断が緑のまま実際の送信が失敗した。様子を聞くだけなので、
    //   **LINE のメッセージは1通も送りません**（残りの通数も減りません）。
    //   グループ以外の宛先（R… の部屋・U… の個人）には この聞き方が使えないので、
    //   そのときは確かめずに null のままにする（＝判定を悪い方に倒さない）。
    if (groupId && groupId.startsWith("C")) {
      try {
        await client.getGroupSummary(groupId);
        facts.groupReachable = true;
      } catch {
        facts.groupReachable = false;
      }
    }
    try {
      const [quota, used] = await Promise.all([
        client.getMessageQuota(),
        client.getMessageQuotaConsumption(),
      ]);
      const limited = quota.type === "limited";
      facts.quota = {
        limited,
        limit: limited ? (quota.value ?? null) : null,
        used: typeof used.totalUsage === "number" ? used.totalUsage : null,
      };
    } catch {
      // 残りの数が分からないだけ。届くかどうかの判定は続けられる
      facts.quota = null;
    }
  } catch {
    facts.tokenValid = false;
  }
  return facts;
}

