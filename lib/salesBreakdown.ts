/**
 * 売上の内訳計算。
 *
 * 考え方はレシートと同じです。
 *   商品ごとの「単価 × 本数」を全部たした金額 = その日の売上
 * になっているはずなので、レジで数えた売上と突き合わせます。
 *
 * 【なぜ作ったか】
 * 以前は手羽先の本数を入力せず、
 *   手羽先本数 =(売上 − ほかの商品の売上)÷ 単価  ※小数は切り捨て
 * と逆算していました。この方法だと内訳は売上から作った数字なので、
 * 合計が売上と食い違うことが原理的にありません＝検算になっていませんでした。
 * さらに切り捨てのぶん（0〜199円）が毎回どこかへ消え、
 * 手羽先が毎日0〜1本ぶん少なく記録されていました。
 *
 * いまは全部の商品の本数を入力してもらい、合計と売上を突き合わせます。
 */

export type SaleProductKind = "primary" | "normal" | "count_only";

export type SaleProduct = {
  id: number;
  shop: string;
  name: string;
  price: number;
  kind: SaleProductKind;
  is_active: boolean;
  sort_order: number;
};

export type BreakdownLine = {
  name: string;
  price: number;
  count: number;
  /** 単価 × 本数 */
  subtotal: number;
  /** 売上の合計に足す行かどうか（お酒など「記録のみ」は false） */
  counted: boolean;
  /** 限定商品の行だけ true */
  isLimited: boolean;
};

export type SalesBreakdown = {
  lines: BreakdownLine[];
  /** 内訳の合計金額 */
  total: number;
  /** 日報に入力された売上 */
  sales: number;
  /** 売上 − 内訳合計。プラスなら売上のほうが多い（数え漏れの可能性） */
  diff: number;
  /** ぴったり合っているか */
  matched: boolean;
  /** 本数は入っているのに単価が0円のままの商品名 */
  unpricedNames: string[];
};

export type LimitedInput = {
  name: string;
  count: number;
  price: number;
} | null;

function toInt(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? v : 0;
}

function nonNegative(n: unknown): number {
  return Math.max(0, toInt(n));
}

/**
 * 内訳を組み立てて、売上と突き合わせる。
 *
 * - `count_only`（お酒など）は本数だけ数え、金額には入れない
 * - 限定商品はマスタに無いので、名前・本数・単価を別に受け取って1行足す
 * - 限定商品の名前がマスタの商品と同じときは二重計上しないよう足さない
 */
export function computeSalesBreakdown(input: {
  sales: number;
  products: SaleProduct[];
  counts: Record<string, number>;
  limited?: LimitedInput;
}): SalesBreakdown {
  const sales = nonNegative(input.sales);
  const counts = input.counts || {};

  const active = (input.products || [])
    .filter((p) => p.is_active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const lines: BreakdownLine[] = active.map((p) => {
    const count = nonNegative(counts[p.name]);
    const price = nonNegative(p.price);
    const counted = p.kind !== "count_only";
    return {
      name: p.name,
      price,
      count,
      subtotal: counted ? price * count : 0,
      counted,
      isLimited: false,
    };
  });

  const limited = input.limited;
  const limitedName = (limited?.name ?? "").trim();
  const alreadyInMaster = active.some((p) => p.name === limitedName);
  if (limitedName !== "" && !alreadyInMaster) {
    const count = nonNegative(limited?.count);
    const price = nonNegative(limited?.price);
    lines.push({
      name: limitedName,
      price,
      count,
      subtotal: price * count,
      counted: true,
      isLimited: true,
    });
  }

  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  const unpricedNames = lines
    .filter((l) => l.counted && l.count > 0 && l.price <= 0)
    .map((l) => l.name);

  return {
    lines,
    total,
    sales,
    diff: sales - total,
    matched: sales - total === 0,
    unpricedNames,
  };
}

/** 日報に残す単価の控え。あとで値上げしても過去の日報が読めるようにする。 */
export function priceSnapshot(breakdown: SalesBreakdown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of breakdown.lines) {
    if (l.counted) out[l.name] = l.price;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 合わなかったときの理由                                              */
/* ------------------------------------------------------------------ */

export const DIFF_REASONS = [
  { key: "discount", label: "値引き・サービスした" },
  { key: "freebie", label: "おまけ・試食で渡した" },
  { key: "register_error", label: "レジの打ちまちがい" },
  { key: "count_unsure", label: "本数を数えきれなかった" },
  { key: "other", label: "その他（下に書く）" },
] as const;

export type DiffReasonKey = (typeof DIFF_REASONS)[number]["key"];

export function diffReasonLabel(key: string | null | undefined): string {
  const hit = DIFF_REASONS.find((r) => r.key === key);
  return hit ? hit.label : "";
}

/**
 * 先に進んでよいか。
 * ぴったり合っていれば OK。合っていないときは理由が要る。
 * 「その他」を選んだときは、なにがあったかを書いてもらう。
 */
export function isBreakdownResolved(
  breakdown: SalesBreakdown,
  reason: string,
  note: string,
): boolean {
  if (breakdown.matched) return true;
  if (!DIFF_REASONS.some((r) => r.key === reason)) return false;
  if (reason === "other") return (note ?? "").trim().length > 0;
  return true;
}

/** 差額の説明文（画面とLINE本文で使う） */
export function diffMessage(breakdown: SalesBreakdown): string {
  const d = breakdown.diff;
  if (d === 0) return "内訳と売上がぴったり合っています";
  const yen = `¥${Math.abs(d).toLocaleString("ja-JP")}`;
  return d > 0
    ? `売上のほうが ${yen} 多いです。数え忘れた商品があるかもしれません`
    : `内訳のほうが ${yen} 多いです。本数を多く入れていないか確認してください`;
}
