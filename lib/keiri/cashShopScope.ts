/**
 * 「金庫の計算は、どの屋号の日報から数えているのか」を1行で言うところ
 * （2026-11-04・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   このアプリには **手羽屋** と **もも屋** の日報が同じ棚に入っています
 *   （日報の「お店の区分」＝ daily_reports.shop）。
 *   金庫の計算（lib/keiri/cashCheck.ts の決まり①）は、**金庫を1つとして数えます**
 *   ＝ 屋号で分けません。同じ会社の2つの屋号で、お金の置き場（金庫）が1つだからです。
 *   ですから「計算上の現金」には、**両方の屋号の売上が入っていて、
 *   両方の屋号の経費・立替が引かれています**。
 *
 *   ところが画面には、そのことがどこにも書いてありませんでした。
 *   ＝ 読んだ人が「この金額は手羽屋だけのものだ」と取り違えると、
 *   金庫を数えたときの差が**もも屋ぶんの大きさで出ている**ように見えて、
 *   本当は合っているのに原因を探し始めてしまいます。
 *
 *   実際に 2026-11-04 に、同じ倉庫を読んでいる司令室の係が
 *   「売上はもも屋を除いて数えているのに、立替は除けないので食い違う」と見立てました。
 *   コードを読むと**売上も立替も両方の屋号ぶんを数えており、食い違いません**。
 *   人（と機械）が実際に取り違えた所なので、画面に書いておきます。
 *
 * ■ ここでしないこと（大事）
 *   ① **金額を直しません。** 「計算上の現金」も、月の経費・利益・1枚の要約・
 *      会計ソフト向けCSV・試算表も **1円も変えません**。出すのは説明の1行だけです。
 *   ② **屋号で分けません。** 分けるかどうかは金庫の数え方そのものを変える話なので、
 *      こちらでは決めません（lib/keiri/cashCheck.ts の決まり①・docs/keiri.md）。
 *   ③ 立替には「どの屋号のものか」の印がまだありません（lib/keiri/shopScope.ts の決まり③）。
 *      ですから「立替は分けられない」ことも、同じ1行に必ず書きます。
 *
 * ■ 読めなかったときは「1つの屋号だけ」と言いません
 *   日報が読めないことがあります（よそのお店として開いている・倉庫が落ちている）。
 *   読めたかどうかを必ず持ち、読めていなければ1行も出しません。
 */

import {
  noShopDivision,
  shopCountsLabel,
  shopOf,
  UNSET_SHOP,
  type ShopCount,
} from "./shopScope";
import type { KeiriReport } from "./types";

export type CashShopScope = {
  /** 日報を読めたか（**「屋号は1つ」と取り違えないため**） */
  readable: boolean;
  /** 屋号ごとの件数（並びは件数の多い順 → 名前順。「区分なし」は必ず最後） */
  shops: ShopCount[];
  /** 金庫の計算に入っている日報の件数 */
  reports: number;
  /** 2つ以上の屋号が混ざっているか */
  multi: boolean;
};

export const EMPTY_CASH_SHOP_SCOPE: CashShopScope = {
  readable: false,
  shops: [],
  reports: 0,
  multi: false,
};

/** その文字列が YYYY-MM-DD の形をしているか */
function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 金庫の計算に入っている日報を、屋号ごとに数える。
 *
 * ★数える範囲は、金庫の計算とまったく同じにします
 *   （lib/keiri/aggregate.ts の calcCashPosition ＝ 数え始めの日から、数えた日まで）。
 *   範囲を変えると、画面の1行が画面の金額と合わなくなります。
 *
 * @param reports     読めている日報（屋号が混ざっていてよい）
 * @param unreadable  日報が読めなかったか（読めていないなら「屋号は1つ」と言わない）
 * @param openingDate 経理の数え始めの日
 * @param asOf        数えた日（まだ数えていなければ今日）
 */
export function measureCashShopScope(params: {
  reports: readonly KeiriReport[] | null | undefined;
  unreadable?: boolean;
  openingDate: string;
  asOf: string;
}): CashShopScope {
  if (params.unreadable || !params.reports) return { ...EMPTY_CASH_SHOP_SCOPE };
  const from = String(params.openingDate ?? "").slice(0, 10);
  const asOf = String(params.asOf ?? "").slice(0, 10);

  const map = new Map<string, ShopCount>();
  let reports = 0;
  for (const r of params.reports) {
    if (!r) continue;
    const date = typeof r.date === "string" ? r.date.slice(0, 10) : "";
    if (!isYmd(date)) continue;
    if (isYmd(from) && date < from) continue;
    if (isYmd(asOf) && date > asOf) continue;
    const shop = shopOf(r);
    const cur = map.get(shop) ?? { shop, reportCount: 0, sales: 0 };
    cur.reportCount += 1;
    cur.sales += Number(r.sales_amount) || 0;
    map.set(shop, cur);
    reports += 1;
  }
  const shops = Array.from(map.values()).sort((a, b) => {
    // 「区分なし」はお店の名前ではないので、本物の屋号より前に出さない
    const aUnset = a.shop === UNSET_SHOP ? 1 : 0;
    const bUnset = b.shop === UNSET_SHOP ? 1 : 0;
    if (aUnset !== bUnset) return aUnset - bUnset;
    if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
    return a.shop < b.shop ? -1 : a.shop > b.shop ? 1 : 0;
  });
  return { readable: true, shops, reports, multi: shops.length > 1 };
}

/** 立替に屋号の印が無いことの断り（lib/keiri/shopScope.ts の決まり③） */
const ADVANCE_NOTE =
  "立替には、どの屋号のものかの印がまだ無いので、立替だけを分けることもできません。";

/**
 * 画面に出す1行（当てはまらなければ空）。
 *
 * ★屋号が1つしか入っていない月は、取り違えようがないので出しません
 *   （行を増やすほど、読む所が増えて1分が長くなります）。
 */
export function cashShopScopeLine(scope: CashShopScope): string {
  if (!scope.readable || scope.reports === 0) return "";
  if (noShopDivision(scope.shops)) return "";
  if (!scope.multi) return "";
  return (
    `この「計算上の現金」は、${shopCountsLabel(scope.shops)} の日報 ${scope.reports}件を` +
    `足して数えています（金庫は1つとして数えるので、屋号では分けていません）。` +
    ADVANCE_NOTE
  );
}

/**
 * 外から確かめる窓口に返す形（2026-11-04・f1-4）。
 * **金額は1円も返しません。屋号の名前も返しません**
 * （lib/keiri/checkWindow.ts の決まり②③）。
 * 返すのは「読めたか・屋号がいくつか・日報が何件か・1行が出るか」だけです。
 */
export type CashShopScopeWindow = {
  readable: boolean;
  /** 金庫の計算に入っている屋号の数（「区分なし」も1つとして数える） */
  shops: number;
  /** 金庫の計算に入っている日報の件数 */
  reports: number;
  /** 2つ以上の屋号が混ざっているか */
  multi: boolean;
  /** 画面に1行が出るか */
  shown: boolean;
  note: string;
};

export function buildCashShopScopeWindow(scope: CashShopScope): CashShopScopeWindow {
  const line = cashShopScopeLine(scope);
  // ★屋号の「数」を使うこと。`scope.shops` は並び（屋号ごとの件数）なので、
  //   そのまま文に入れると「[object Object]つの屋号」になります（2026-11-04 に本番で出しました）。
  const shops = scope.shops.length;
  return {
    readable: scope.readable,
    shops,
    reports: scope.reports,
    multi: scope.multi,
    shown: line !== "",
    note: !scope.readable
      ? "日報を読めていません（屋号が1つという意味ではありません。この行は出ません）。"
      : scope.reports === 0
        ? "数え始めの日から数えた日までに、日報が1件も入っていません（この行は出ません）。"
        : scope.multi
          ? `金庫の計算には ${shops}つの屋号の日報 ${scope.reports}件ぜんぶが入っています` +
            "（売上も経費も立替も、屋号で分けずに足し引きしています）。画面にその1行が出ます。"
          : `金庫の計算に入っているのは1つの屋号の日報 ${scope.reports}件だけです` +
            "（取り違えようがないので、この行は出ません）。",
  };
}
