/**
 * レシートの「消費税ぶんの取りこぼし」を直すための計算。
 *
 * ■ 何が起きていたか（2026-09 に発覚）
 *   レシートの写真から金額を自動で読み取るとき、**品物の値段だけ**を拾っていました。
 *   ところがスーパーや業務用のお店のレシートは、
 *
 *       火乃国 片栗粉 1kg  4コ×単398   1,592
 *       ...
 *       小計                          10,000
 *       消費税                           800   ← ここを拾っていなかった
 *       合計                          10,800
 *
 *   のように、**品物の値段が税抜（本体価格）**で、消費税は下にまとめて出ます。
 *   そのため経費が毎回 8〜10% 少なく記録されていました。
 *   （実データで確認：単価が書いてある7件すべてが「単価×個数」ちょうどで、
 *     消費税が1円も乗っていませんでした）
 *
 *   経費が少なく記録されると、利益が実際より多く見え、
 *   「今の現金」も実際より多く出てしまいます。
 *
 * ■ どう直すか
 *   読み取りのときに「レシートの支払合計（税込）」も一緒に読ませて、
 *   品物の合計がそれより少なければ、**足りない分（＝消費税）を品物に割り振ります。**
 *   1円のズレも出ないように、割り振ったあとの合計はぴったり支払合計になります。
 *
 *   たとえるなら、レジ袋に入った品物の値札を足したら10,000円だったが、
 *   レシートの支払額は10,800円だった。差の800円は消費税なので、
 *   高い品物には多めに、安い品物には少なめに、800円を配り直す、というイメージです。
 *
 * ■ やりすぎないための歯止め
 *   差が大きすぎる（消費税では説明がつかない）ときは、**何も直しません**。
 *   代わりに「合っていません」と画面に出して、人に確かめてもらいます。
 *   勝手に金額を作らないためです。
 */

/** 読み取った品物1件 */
export type ReceiptItem = {
  name: string;
  amount: number;
};

/**
 * 消費税として説明がつく上限の比率。
 * 10%（＝1.10）に端数まるめのぶんの余裕を少し足してある。
 * これを超える差は「消費税ではない何か」なので直さない。
 */
export const MAX_TAX_RATIO = 1.12;

export type ReconcileReason =
  /** 品物の合計とレシートの合計が最初から合っていた（読み取りが税込だった） */
  | "ok"
  /** 足りない分を消費税として品物に割り振った */
  | "adjusted"
  /** レシートの合計が読み取れなかった */
  | "no_total"
  /** 合計と品物の合計が合わない（消費税では説明がつかない差） */
  | "mismatch";

export type ReconcileResult = {
  /** 直したあとの品物（直していないときは元のまま） */
  items: ReceiptItem[];
  /** レシートの支払合計（税込）。読めなければ 0 */
  total: number;
  /** 直す前の品物の合計 */
  itemsSum: number;
  /** 直したあとの品物の合計 */
  adjustedSum: number;
  /** 消費税ぶんを割り振ったか */
  adjusted: boolean;
  /** レシートの合計と品物の合計が合っているか */
  matched: boolean;
  reason: ReconcileReason;
};

/** 数値として読めない値は0にする（壊れたデータで画面が落ちないように） */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** 品物の合計 */
export function sumItems(items: ReceiptItem[]): number {
  return items.reduce((s, it) => s + num(it.amount), 0);
}

/**
 * 足りない分（消費税）を品物に割り振る。
 *
 * 金額の大きい品物ほど多く受け取る（比例配分）。
 * 1円未満は切り捨てたうえで、余った1円ずつを
 * 「切り捨てで損した順」に配る（最大剰余法）。
 * こうすると割り振ったあとの合計がぴったり target になる。
 *
 * 金額が0の行には配らない（0円の品物に消費税は付かないため）。
 */
export function distributeToTotal(
  items: ReceiptItem[],
  target: number,
): ReceiptItem[] {
  const base = items.map((it) => num(it.amount));
  const sum = base.reduce((s, v) => s + v, 0);
  if (sum <= 0) return items;

  // 配る対象（金額が0より大きい行）
  const idxs = base.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);

  const exact = base.map((v) => (v * target) / sum);
  const out = base.map((v, i) => (v > 0 ? Math.floor(exact[i]) : v));
  let rest = target - out.reduce((s, v) => s + v, 0);

  // 端数の大きい順に1円ずつ配る
  const order = idxs
    .slice()
    .sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])));
  let k = 0;
  while (rest > 0 && order.length > 0) {
    out[order[k % order.length]] += 1;
    rest -= 1;
    k += 1;
  }
  // 万一 target のほうが小さくて配りすぎていたら、大きい行から1円ずつ戻す
  while (rest < 0 && order.length > 0) {
    const i = order[k % order.length];
    if (out[i] > 0) {
      out[i] -= 1;
      rest += 1;
    }
    k += 1;
    if (k > order.length * 1000) break; // 念のための保険
  }

  return items.map((it, i) => ({ ...it, amount: out[i] }));
}

/**
 * 読み取った品物を、レシートの支払合計（税込）に合わせる。
 *
 * - 合計が読めなかった → 何もしない（画面で「確かめてください」と出す）
 * - もともと合っている → 何もしない
 * - 足りない分が消費税で説明できる（合計 ÷ 品物合計 が 1.12 以下） → 割り振って税込にする
 * - それ以外（差が大きい・合計のほうが小さい） → 何もしない。画面で警告する
 */
export function reconcileItemsToTotal(
  rawItems: ReceiptItem[],
  rawTotal: unknown,
): ReconcileResult {
  const items = rawItems.map((it) => ({ ...it, amount: num(it.amount) }));
  const total = Math.max(0, num(rawTotal));
  const itemsSum = sumItems(items);

  if (total <= 0) {
    return {
      items,
      total: 0,
      itemsSum,
      adjustedSum: itemsSum,
      adjusted: false,
      matched: false,
      reason: "no_total",
    };
  }

  if (itemsSum === total) {
    return {
      items,
      total,
      itemsSum,
      adjustedSum: itemsSum,
      adjusted: false,
      matched: true,
      reason: "ok",
    };
  }

  const ratio = itemsSum > 0 ? total / itemsSum : 0;
  const looksLikeTax = itemsSum > 0 && ratio > 1 && ratio <= MAX_TAX_RATIO;

  if (looksLikeTax) {
    const fixed = distributeToTotal(items, total);
    return {
      items: fixed,
      total,
      itemsSum,
      adjustedSum: sumItems(fixed),
      adjusted: true,
      matched: true,
      reason: "adjusted",
    };
  }

  return {
    items,
    total,
    itemsSum,
    adjustedSum: itemsSum,
    adjusted: false,
    matched: false,
    reason: "mismatch",
  };
}

/**
 * 画面に出す一言。専門用語は使わない。
 */
export function reconcileMessage(r: ReconcileResult): string {
  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
  switch (r.reason) {
    case "ok":
      return `✅ レシートの合計 ${yen(r.total)} と、入れた品物の合計が合っています。`;
    case "adjusted":
      return `🧾 読み取った品物の値段が税抜（${yen(
        r.itemsSum,
      )}）だったので、消費税ぶん ${yen(
        r.total - r.itemsSum,
      )} を足して、レシートの合計 ${yen(r.total)} に合わせました。`;
    case "no_total":
      return `⚠️ レシートの合計が読み取れませんでした。入れた品物の合計 ${yen(
        r.itemsSum,
      )} が、レシートの支払額と合っているか確かめてください（消費税が抜けていないか特に注意）。`;
    case "mismatch":
      return `⚠️ レシートの合計 ${yen(r.total)} と、入れた品物の合計 ${yen(
        r.itemsSum,
      )} が ${yen(
        Math.abs(r.total - r.itemsSum),
      )} ちがいます。金額を手で直してください。`;
  }
}
