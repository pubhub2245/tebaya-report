/**
 * 「この数字は、どのお店の日報から数えたのか」をはっきりさせるところ（2026-10-04・kp234・f1-5/f3-4）。
 *
 * ■ なぜ要るか（9月の実データで分かったこと）
 *   経理の数字は、日報を**全件**読んで数えています。ところが日報には
 *   お店の区分（daily_reports.shop ＝ 手羽屋／もも屋）があり、両方が混ざっていました。
 *     ・手羽屋だけ … 日報 12件・売上 554,700円
 *     ・いまの数え方（全部）… 日報 15件・売上 1,026,200円
 *   どちらが正しいかは**人が決めること**です（同じ会社の2つの屋号なので、
 *   会社の帳簿としては足すのが正しい場合があります）。
 *   ですから、ここでは**勝手にどちらかに決めません。**
 *   「いま何を数えているか」が画面と1枚の紙に**必ず出る**ようにするだけです。
 *
 * ■ 守ること
 *   ① 既定は**今までどおり「全部」**。黙って数字を変えない（過去の数字が人によって変わらないように）。
 *   ② お店の区分が空の日報を「手羽屋」と決めつけない（「区分なし」として別に数える）。
 *   ③ 立替（立て替えてもらった分）には、どのお店のものかの印がまだ無い。
 *      だからお店で絞っても立替は分けられない。**そのことを画面に必ず書く。**
 *   ④ ここは数えるだけ。お金の計算（lib/money.ts）と手羽屋の毎日の画面には触らない。
 */

import type { KeiriReport } from "./types";

/**
 * その日付がその月に入っているか。
 * ★aggregate.ts の inMonth と同じ考え方（YYYY-MM-DD の文字のまま比べる）ですが、
 *   aggregate.ts からこのファイルを読むため、**行って帰る形（循環）にしない**ように
 *   ここに同じ1行を置いています。
 */
function inMonthLocal(date: string | undefined, ym: string): boolean {
  return typeof date === "string" && date.slice(0, 7) === ym;
}

/** お店の区分が空のときの呼び名。★「手羽屋」と決めつけない */
export const UNSET_SHOP = "区分なし";

/** お店ごとの数え方1件ぶん */
export type ShopCount = {
  /** お店の区分（空だったものは UNSET_SHOP） */
  shop: string;
  /** その店の日報の件数 */
  reportCount: number;
  /** その店の売上 */
  sales: number;
};

/** 日報1件のお店の区分を取り出す（空なら「区分なし」） */
export function shopOf(report: KeiriReport): string {
  const s = String((report as { shop?: string | null }).shop ?? "").trim();
  return s === "" ? UNSET_SHOP : s;
}

/**
 * その月の日報を、お店の区分ごとに数える。
 * 並び順は「件数の多い順 → 名前順」。ただし**「区分なし」は必ずいちばん後ろ**
 * （お店の名前ではないので、本物のお店より前に出さない）。
 */
export function summarizeShopScope(
  reports: KeiriReport[],
  ym: string,
): { shops: ShopCount[]; reportCount: number; sales: number } {
  const map = new Map<string, ShopCount>();
  let reportCount = 0;
  let sales = 0;
  for (const r of reports) {
    if (!inMonthLocal(r.date, ym)) continue;
    const shop = shopOf(r);
    const amount = Number(r.sales_amount) || 0;
    const cur = map.get(shop) ?? { shop, reportCount: 0, sales: 0 };
    cur.reportCount += 1;
    cur.sales += amount;
    map.set(shop, cur);
    reportCount += 1;
    sales += amount;
  }
  const shops = Array.from(map.values()).sort((a, b) => {
    const aUnset = a.shop === UNSET_SHOP ? 1 : 0;
    const bUnset = b.shop === UNSET_SHOP ? 1 : 0;
    if (aUnset !== bUnset) return aUnset - bUnset;
    if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
    return a.shop < b.shop ? -1 : a.shop > b.shop ? 1 : 0;
  });
  return { shops, reportCount, sales };
}

/**
 * お店の区分でしぼる。`shop` が null／空なら**今までどおり全部**を返す。
 * ★既定が「全部」であることが大事（黙って数字を変えないため）。
 */
export function filterReportsByShop(
  reports: KeiriReport[],
  shop: string | null | undefined,
): KeiriReport[] {
  const want = String(shop ?? "").trim();
  if (want === "") return reports;
  return reports.filter((r) => shopOf(r) === want);
}

/** 「手羽屋 12件・もも屋 3件」のような並び */
export function shopCountsLabel(shops: ShopCount[]): string {
  return shops.map((s) => `${s.shop} ${s.reportCount}件`).join("・");
}

/**
 * 画面と1枚の紙に出す1行。
 * 例：「この数字は 手羽屋 12件・もも屋 3件 の日報 15件から数えています」
 */
export function shopScopeSentence(params: {
  shops: ShopCount[];
  reportCount: number;
}): string {
  const { shops, reportCount } = params;
  if (reportCount === 0) return "この月の日報はまだありません。";
  if (shops.length === 1) {
    return `この数字は ${shops[0].shop} の日報 ${reportCount}件から数えています。`;
  }
  return `この数字は ${shopCountsLabel(shops)} の日報 ${reportCount}件を足して数えています。`;
}

/**
 * 断り書き（無ければ空の配列）。黙って混ぜない・黙って分けないために出す。
 *
 * @param shopName  1枚の紙の見出しに出ているお店の名前（空のこともある）
 * @param shops     実際に数えたお店の区分
 * @param filtered  お店で絞っているか（絞っているなら立替の断りを出す）
 */
export function shopScopeNotes(params: {
  shopName?: string | null;
  shops: ShopCount[];
  filtered?: boolean;
}): string[] {
  const { shops } = params;
  const shopName = String(params.shopName ?? "").trim();
  const notes: string[] = [];

  if (shops.length > 1) {
    notes.push(
      `${shops.length}つのお店（${shops
        .map((s) => s.shop)
        .join("・")}）の日報を足して数えています。お店ごとに分けた1枚が必要なときは、「お店」で選んでください。`,
    );
  }

  // 見出しのお店と、数えている範囲がずれていたら必ず断る
  if (shopName !== "" && shops.length > 0) {
    const hit = shops.some((s) => sameShopName(shopName, s.shop));
    if (!hit) {
      notes.push(
        `この1枚の見出しは「${shopName}」ですが、数えているのは ${shops
          .map((s) => s.shop)
          .join("・")} の日報です。見出しと範囲がそろっていません。`,
      );
    } else if (shops.length > 1) {
      notes.push(
        `見出しは「${shopName}」ですが、ほかのお店（${shops
          .filter((s) => !sameShopName(shopName, s.shop))
          .map((s) => s.shop)
          .join("・")}）の日報も足しています。`,
      );
    }
  }

  if (params.filtered || shops.length > 1) {
    notes.push(
      "立て替えてもらった分には、どのお店のものかの印がまだありません。そのためお店で選んでも、立替はすべて入ったままになります。",
    );
  }

  return notes;
}

/**
 * 見出しのお店の名前と、日報のお店の区分が同じものを指しているか。
 * 「手羽屋」と「手羽屋（移動販売）」のような書き方のゆれを拾う。
 */
export function sameShopName(a: string, b: string): boolean {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (x === "" || y === "") return false;
  if (x === y) return true;
  return x.startsWith(y) || y.startsWith(x);
}
