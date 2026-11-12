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
      // ★「今月すでに使った数」は **2回 聞いて、多いほう（＝きつい側）** を採る
      //   （2026-11-12・f2-2）。2026-11-11 に、同じ版・同じ時刻の2つの窓口で
      //   LINE が 132 と 198 を返して分かれました。どちらが本当かはこちらでは
      //   決められないので、**残りがいちばん少なくなる側**で読みます。
      //   聞くだけなので、メッセージは1通も送りません（残りは減りません）。
      const quota = await client.getMessageQuota();
      const usedReadings: number[] = await readUsedTwice(client, token);
      const limited = quota.type === "limited";
      facts.quota = {
        limited,
        limit: limited ? (quota.value ?? null) : null,
        used: usedReadings.length > 0 ? Math.max(...usedReadings) : null,
        usedReadings,
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

/**
 * 「今月すでに使った数」を、**つなぎ方を変えて2回**聞く（2026-11-12・f2-2）。
 *
 * ■ 2026-11-12 に本番で分かったこと（ここが大事）
 *   同じ1回の中で2回 続けて聞いても、**2回とも同じ数**しか返りません
 *   （notifycheck は 132／132、診断は 198／198）。
 *   ＝ 11/11 に見えた「132 と 198」の分かれ方は、**窓口どうしの間**で起きています。
 *   住所が同じでも、つないだ先（LINE 側の控え）が窓口ごとに違うためと見られます
 *   （同じ1回の中では、同じつなぎ道を使い回すので同じ控えに当たり続けます）。
 *
 * ■ だから、どう聞くか
 *   1回目は いつもの道（SDK）、2回目は **別の道（素の fetch・つなぎっぱなしにしない）**で
 *   聞きます。別の控えに当たれば、**同じ窓口の中で 132 と 198 の両方が見えます**。
 *   答えに使うのは多いほう（＝残りがいちばん少なくなる側＝きつい側）です。
 *
 * ★どちらも「聞くだけ」で、メッセージは1通も送りません（今月の残りは減りません）。
 * ★合言葉は Authorization に付けるだけで、返事にも記録にも1文字も残しません。
 */
async function readUsedTwice(
  client: messagingApi.MessagingApiClient,
  token: string,
): Promise<number[]> {
  const readings: number[] = [];

  // ① いつもの道（SDK）
  try {
    const r = await client.getMessageQuotaConsumption();
    if (typeof r.totalUsage === "number") readings.push(r.totalUsage);
  } catch {
    // 1回 聞けなくても、もう1回ぶんで読む（両方だめなら「分かりません」）
  }

  // ② 別の道（素の fetch・つなぎっぱなしにしない）
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/quota/consumption", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Connection: "close" },
      cache: "no-store",
    });
    if (res.ok) {
      const j: any = await res.json();
      if (typeof j?.totalUsage === "number") readings.push(j.totalUsage);
    }
  } catch {
    // 別の道で聞けなくても、①の数で読む
  }

  return readings;
}
