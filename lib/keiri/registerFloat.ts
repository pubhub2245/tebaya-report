/**
 * 「レジに残してあるつり銭」を、日報の実測から数えるところ
 * （2026-10-12・kp250・f1-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   じゅんに「いま金庫にある現金を数えて入れてください」とお願いしています（kp245）。
 *   ところが**お金の置き場は金庫だけではありません**。閉店のとき、レジには
 *   翌日のつり銭が号車ごとに残してあります（日報の「閉店後のレジ金」がその実測値で、
 *   翌朝の設営後チェックと一致するはず＝CLAUDE.md 4-9）。
 *
 *   いっぽう画面の「計算上の現金」は、数え始めの日の残高に売上を足して
 *   経費を引いたものです。**その数え始めの残高が、金庫だけだったのか、
 *   レジのつり銭も入れた全部だったのかは、記録に残っていません**
 *   （経理の設定の覚え書きは「8/10起点からの突合で実残高に合わせた」とだけ）。
 *
 *   つまり じゅんが金庫だけを数えると、つり銭ぶん（号車ごとに数万円）だけ
 *   必ず食い違います。「合う」の線は1,000円 未満なので、**合っているのに
 *   『金庫のほうが少ないです。書き忘れた支払いを探してください』と出ます。**
 *   1分 数えてもらったのに、無い探し物をさせることになります。
 *
 * ■ どう直すか
 *   金額をこちらで直したり、推測で足したりはしません。
 *   **比べる相手に「レジのつり銭ぶんを別に置いた金額」も並べ、
 *   入れた金額がどれに合うかを画面が名指しします**（lib/keiri/cashVariant.ts）。
 *   kp250 の「2通りの数え方」と同じやり方です。合った側が、この先の答えになります。
 *
 * ■ どこの数字を使うか
 *   日報（daily_reports）の `register_total`＝閉店後にレジに残した金額。
 *   号車（`unit_number`）ごとに**いちばん新しい1件**だけを使って足します
 *   （レジは号車ごとに別・混ぜない＝CLAUDE.md 4-9）。
 *   日報に無ければ 0 件＝比べる相手は今までどおり増えません。
 */

import { normalizeUnit } from "../registerChain";

/** 閉店後のレジ金の1行（日報の1件ぶん） */
export type RegisterCloseRow = {
  /** 営業日（YYYY-MM-DD） */
  date: string;
  /** 号車（"1" / "2" など。空は捨てる） */
  unit: string;
  /** 閉店後にレジに残した金額 */
  amount: number;
};

/** 倉庫から来た行（date / unit_number / register_total）を、計算に使える形にそろえる */
export function normalizeRegisterCloses(rows: unknown[]): RegisterCloseRow[] {
  const out: RegisterCloseRow[] = [];
  for (const raw of rows ?? []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const date = String(r.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const unit = normalizeUnit(r.unit_number as string | number | null | undefined);
    if (!unit) continue;
    const amount = Number(r.register_total);
    if (!Number.isFinite(amount) || amount < 0) continue;
    out.push({ date, unit, amount: Math.round(amount) });
  }
  return out;
}

export type RegisterFloat = {
  /** 号車ごとの、いちばん新しい「閉店後のレジ金」 */
  units: { unit: string; date: string; amount: number }[];
  /** その合計（号車ぶんを足したもの） */
  total: number;
  /** いちばん新しい日（号車のうち最も新しいもの）。1件も無ければ null */
  latestOn: string | null;
};

/**
 * 号車ごとの「いちばん新しい閉店後のレジ金」を集めて足す。
 *
 * @param asOf その日までの日報だけを見る（渡さなければ全部）
 */
export function latestRegisterFloat(
  rows: RegisterCloseRow[],
  asOf?: string,
): RegisterFloat {
  const newest = new Map<string, { unit: string; date: string; amount: number }>();
  for (const r of rows) {
    if (asOf && r.date > asOf) continue;
    const cur = newest.get(r.unit);
    if (!cur || r.date > cur.date) newest.set(r.unit, { ...r });
  }
  const units = [...newest.values()].sort((a, b) => (a.unit < b.unit ? -1 : 1));
  const total = units.reduce((s, u) => s + u.amount, 0);
  const latestOn = units.reduce<string | null>(
    (acc, u) => (acc === null || u.date > acc ? u.date : acc),
    null,
  );
  return { units, total, latestOn };
}

/** 「◯月◯日」 */
function monthDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/** 円の書き方（画面と同じ3桁区切り） */
function yen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

/**
 * 「レジに残してあるつり銭」の明細を、人が読む行にする。
 * 1件も無ければ空（よけいな行を画面に出さない）。
 */
export function registerFloatLines(f: RegisterFloat): string[] {
  if (f.units.length === 0) return [];
  const lines = f.units.map(
    (u) => `${u.unit}号車のレジ　${yen(u.amount)}（${monthDay(u.date)}の閉店後）`,
  );
  if (f.units.length > 1) lines.push(`＝ レジに残してあるつり銭　${yen(f.total)}`);
  return lines;
}

/**
 * 外から確かめるための畳んだ答え（**金額は出しません**・2026-10-12・f1-4）。
 *
 * ■ なぜ要るのか
 *   じゅんの経理の画面は合言葉の内側なので、検査役（B2）も こちら（Claude）も
 *   「レジのつり銭の分を見分ける相手が並んでいるか」を目で見られません。
 *   そこで**号車の数・最後に数えた日・つり銭があるか**だけを返します。
 */
export type RegisterFloatWindow = {
  /** 日報を読めたか（読めないときは false。0件と取り違えないため） */
  readable: boolean;
  /** 閉店後のレジ金が読めた号車の数 */
  units: number;
  /** いちばん新しい「閉店後のレジ金」の日 */
  latestOn: string | null;
  /** レジにつり銭が残っているか（金額は返しません） */
  hasFloat: boolean;
  /** 金庫を数えたときに画面が並べる「比べる相手」の数 */
  variantTargets: number;
  /** 人が読む1行 */
  note: string;
};

/**
 * 外に出す形に畳む。
 *
 * @param float          号車ごとの実測をまとめたもの
 * @param readable       日報を読めたか
 * @param variantTargets 画面に並ぶ「比べる相手」の数（lib/keiri/cashVariant.ts が数えたもの）
 */
export function registerFloatWindow(params: {
  float: RegisterFloat;
  readable: boolean;
  variantTargets: number;
}): RegisterFloatWindow {
  const { float, readable, variantTargets } = params;
  if (!readable) {
    return {
      readable: false,
      units: 0,
      latestOn: null,
      hasFloat: false,
      variantTargets,
      note: "日報を読めなかったので、レジのつり銭は数えていません（0円と取り違えないこと）。",
    };
  }
  const hasFloat = float.total > 0;
  return {
    readable: true,
    units: float.units.length,
    latestOn: float.latestOn,
    hasFloat,
    variantTargets,
    note: hasFloat
      ? `閉店後にレジに残してあるつり銭が ${float.units.length} 号車ぶんあります（金庫の外のお金）。` +
        "金庫だけを数えたときも、画面がその分を見分けて名指しします（金額はここでは返しません）。"
      : "レジに残してあるつり銭はありません（日報の実測が0円か、号車の記録がありません）。",
  };
}
