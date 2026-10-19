/**
 * 「この番号のお店の名前は何か」を答える窓口の、考える部分（f3-4・kp253／2026-10-18）。
 *
 * ■ 何が起きていたか（やさしい説明）
 *   申し込んだお店の画面には、そのお店の名前を出しています
 *   （日報の上の「〇〇の日報として保存します」など）。名前は毎回、倉庫の
 *   お店の棚（keiri_tenants）に聞いていました。
 *   ところがこの棚は **鍵がかかっていて、読む決まりが1本も無い**形です
 *   （2026-10-18 に A が倉庫の台帳を直接 数えて確かめました）。
 *   公開の鍵で聞くと **エラーではなく「0件」** で返るので、窓口は
 *   「そのお店はありません（404）」と答えていました。
 *   ＝ **本当は在るのに「無い」と答える**形で、画面は黙って名前を出せません。
 *
 * ■ どう直すか（PR #260・#261 と同じ考え方）
 *   ① まずサーバー側の合鍵で聞く（鍵が直っていればこれで名前が出ます）
 *   ② 合鍵が使えないときは、公開の鍵で聞いた「0件」を
 *      **「無い」と言い切らない**（＝ いま確かめられない、と正直に答える）
 *   画面は、入室したときに控えておいた名前を先に出すので、
 *   この窓口が答えられなくても名前は出ます（lib/tenantScope.ts）。
 *
 * ★ここでは通信をしません。返ってきた行と「どちらの鍵で聞いたか」から答えを決めるだけです。
 */

/** 窓口の答え */
export type ShopNameAnswer =
  | { ok: true; status: 200; shopName: string | null }
  | { ok: false; status: 404 | 503; unchecked: boolean; message: string };

export type ShopNameLookup = {
  /** 引けた行（0件なら空） */
  rows: Array<{ shop_name?: unknown }> | null;
  /** 棚を引くときに出た不具合（無ければ null） */
  error: { message?: string } | null;
  /** サーバー側の合鍵で聞いたか（false ＝ 公開の鍵で聞いた） */
  usedServiceKey: boolean;
};

/** 確かめられないときに返す言葉。「無い」とは言わない */
export const SHOP_NAME_UNCHECKED_MESSAGE =
  "いまお店の名前を確かめられません（サーバー側の合鍵が使えないため）。画面の表示だけの話で、日報や数字には影響しません。";

/**
 * 答えを1つに決める。
 *
 * ・行が引けた … 名前を返す（名前が空のお店もあるので null を許す）
 * ・合鍵で聞いて0件 … ほんとうに無い（404）
 * ・公開の鍵で聞いて0件／不具合 … 確かめられない（503）。「無い」と言い切らない
 */
export function decideShopNameAnswer(lookup: ShopNameLookup): ShopNameAnswer {
  const row = lookup.rows?.[0];
  if (row && !lookup.error) {
    const raw = row.shop_name;
    const name = String(raw ?? "").trim();
    return { ok: true, status: 200, shopName: name ? name.slice(0, 60) : null };
  }
  if (lookup.usedServiceKey && !lookup.error) {
    return { ok: false, status: 404, unchecked: false, message: "そのお店はありません。" };
  }
  return {
    ok: false,
    status: 503,
    unchecked: true,
    message: SHOP_NAME_UNCHECKED_MESSAGE,
  };
}
