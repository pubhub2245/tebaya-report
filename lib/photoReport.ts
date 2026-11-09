/**
 * 写真だけの日報（/report/photo）の計算の本体。2026-11-07 追加。
 *
 * ■ なぜ作ったか（じゅん決定・2026-11-07）
 *   手羽屋はフランチャイズ型（加盟店＝ゆうやさん）に変わった。
 *   現場から「日報の入力が大変」という声があり、
 *   **日報に人間が数字を打つことをなくす**ことにした。
 *   現場がやるのは次の4つだけ：
 *     ① 出店場所をタップ ② その日の伝票（お会計票）を全部撮る ③ レシートを撮る ④ OK
 *   いちばん上の原則：**裏側はいくら複雑でもよい。現場の手数は限りなくゼロにする。**
 *
 * ■ このファイルに置くもの（データベースに触らない純粋な計算だけ）
 *   - お会計票（伝票）を読む指示文、読んだ結果を使える形に直す処理、累計での答え合わせ
 *   - 読んだ本数を商品マスタの名前にそろえる処理
 *   - 日報1件ぶんの保存内容を組み立てる処理
 *   - LINE に流す短い文
 *   `tests/photoReport.test.ts` で固定。
 *
 * ■ 既存の決まりはそのまま使う
 *   - 売上の内訳（単価×本数）は `lib/salesBreakdown.ts`
 *   - 場代は `lib/money.ts` の `calcBoothFee()`（出店場所マスタが正 → CLAUDE.md 4-15）
 *   - レシートは税込（→ CLAUDE.md 4-12）。読み取りは `/api/ocr` をそのまま使う
 */

import { canonicalLocationName, isEventLocation } from "./locationName";
import { BOOTH_FEE_LABEL, calcBoothFee, sumExpenses, type BoothFeeRule } from "./money";
import {
  computeSalesBreakdown,
  priceSnapshot,
  type SaleProduct,
  type SalesBreakdown,
} from "./salesBreakdown";

/** 加盟店の担当（いまはゆうやさんだけ。人が増えたら選ぶボタンを足す） */
export const FRANCHISE_STAFF_NAME = "ゆうや";

/** 写真日報で作った日報の印（LINE本文と保存する本文の先頭に入れる） */
export const PHOTO_REPORT_MARK = "【写真日報】";

/* ------------------------------------------------------------------ */
/* お会計票（伝票）の読み取り                                          */
/* ------------------------------------------------------------------ */

/**
 * 手書きのお会計票（伝票）を読む指示文。★ここ1か所だけ（2026-11-09）
 *
 * 現場は1日に何枚も伝票を書き、**伝票の一番下にその日の売上の累計**を書く。
 * 累計は売上ではないので、合計（total）とは別の欄（cumulative）に分けて返させる。
 * 累計は「答え合わせ」にだけ使う（→ checkSlips）。
 *
 * 手羽先は味（しお・タレ・のり）ごとに書かれるので、名前は商品一覧の手羽先にそろえ、
 * 味は flavor に入れさせる。オールスターの下の小さいメモ（味のメモ）は品物に数えない。
 */
export function buildSlipPrompt(productNames: string[]): string {
  const list = productNames.length
    ? productNames.map((n) => `- ${n}`).join("\n")
    : "- （商品一覧なし）";
  return `この写真は、屋台「手羽屋」の手書きのお会計票（伝票）です。1枚の写真に伝票が1枚、または数枚写っています。
伝票ごとに、品物・本数（個数）・金額、その伝票の合計、一番下に書かれた「その日の売上の累計」を読み取り、必ず次のJSON形式だけで返してください。説明文は不要です。

{
  "slips": [
    {
      "items": [
        {"name": "商品名", "flavor": "味（手羽先のときだけ。なければ空文字）", "count": 本数, "amount": 金額}
      ],
      "total": その伝票の合計金額,
      "cumulative": 一番下に書かれたその日の累計金額,
      "unreadable": "読めなかった所があれば短く書く（なければ空文字）"
    }
  ]
}

【いちばん大事なこと】
- 伝票の一番下の数字は「その日の売上の累計」です。**売上ではありません。** 必ず cumulative に入れ、items や total に入れないでください。
- 累計が書かれていなければ cumulative は 0 にしてください。

【商品名のそろえ方】
- name は必ず次の一覧の中の名前をそのまま使ってください：
${list}
- 手羽先は「しお」「タレ」「のり」など味ごとに書かれています。name は一覧の手羽先の名前にして、味を flavor に入れてください（味ごとに1行）。
- オールスターの下などに小さく書かれた味のメモ（「しお・バター」など）は、品物として数えないでください。
- 一覧に無い商品が書かれていたら、書いてあるとおりの名前で返してください。

【数字のルール】
- count・amount・total・cumulative は数値だけ（¥・円・カンマ・「本」「個」は付けない）
- 正の字（正・一・丁など）で数えてあれば数に直してください（正＝5）
- 金額が書かれていない行は amount を 0 にしてください。
- 読めない数字を推測で埋めないでください。読めなかったら unreadable に書いてください。`;
}

export type SlipItem = { name: string; flavor: string; count: number; amount: number };

/** お会計票1枚ぶん */
export type Slip = {
  items: SlipItem[];
  /** その伝票の合計。読めなければ 0 */
  total: number;
  /** 一番下に書かれたその日の累計。**売上ではない**。書かれていなければ 0 */
  cumulative: number;
  unreadable: string;
};

function toCount(v: unknown): number {
  if (typeof v === "number") return Math.max(0, Math.round(v));
  const n = parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** AIが返した文字を伝票の一覧にする。読めなければ空の配列（数字を作らない） */
export function parseSlipText(raw: string): Slip[] {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    const list: any[] = Array.isArray(parsed.slips) ? parsed.slips : [parsed];
    return list
      .map((sl) => ({
        items: Array.isArray(sl?.items)
          ? sl.items
              .map((it: any) => ({
                name: String(it?.name ?? "").trim(),
                flavor: String(it?.flavor ?? "").trim(),
                count: toCount(it?.count),
                amount: toCount(it?.amount),
              }))
              .filter((it: SlipItem) => it.name !== "")
          : [],
        total: toCount(sl?.total),
        cumulative: toCount(sl?.cumulative),
        unreadable: String(sl?.unreadable ?? "").trim(),
      }))
      .filter((sl) => sl.items.length > 0 || sl.total > 0 || sl.cumulative > 0);
  } catch {
    return [];
  }
}

export type MemoItem = { name: string; count: number };

/** 1日ぶんの伝票をまとめた結果（日報の下書きの材料） */
export type MemoReadResult = {
  items: MemoItem[];
  /** 1日の売上＝伝票の合計の足し算（累計は足さない） */
  total: number;
  /** 手羽先の味ごとの本数（例：{ しお: 30, タレ: 43, のり: 11 }）。表示用 */
  flavors: Record<string, number>;
  /** 答え合わせで合わなかった所（空なら全部合っている） */
  warnings: string[];
  /** 一番大きい累計（＝その日の最後の累計）。無ければ 0 */
  lastCumulative: number;
  unreadable: string;
  raw: string;
};

const yenOf = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

/** 伝票1枚の合計。合計欄が読めなければ行の金額の足し算 */
export function slipTotal(sl: Slip, priceOf: (name: string) => number): number {
  if (sl.total > 0) return sl.total;
  return sl.items.reduce((s, it) => s + (it.amount || it.count * priceOf(it.name)), 0);
}

/**
 * 伝票の答え合わせ（2026-11-09 じゅんさんと決めた3つ → 同日、本番で試して直した）。
 *
 * ■ いちばん大事なのは「最後の累計 ＝ 伝票の合計の足し算」の1つだけ
 *   これが合えば、その日の売上は確定。途中の累計の読み違い（23,400 を 23,800 と読む等）や、
 *   1枚目に累計が書かれていないことは売上に関係ないので、**知らせを出さない**。
 *   （最初の版はここで知らせを出してしまい、本番の1件目で3つも黄色が出た）
 *
 * ■ 合わないときだけ、どこがあやしいかを探して言葉で返す
 *   - 累計の小さい順に並べ、「前の累計＋合計＝今回の累計」が崩れる所を伝える（撮った順はばらばらでよい）
 *   - 累計が書かれていない伝票は、並びに入れない（1枚目に多い）
 *   - 1枚の中で 行の合計≠合計欄 の伝票も伝える
 * **金額は直さない**（どれが正しいかは人が決める）。累計が1つも無ければ確かめない。
 */
export function checkSlips(slips: Slip[], priceOf: (name: string) => number): string[] {
  const sum = slips.reduce((s, sl) => s + slipTotal(sl, priceOf), 0);
  const last = slips.reduce((m, sl) => Math.max(m, sl.cumulative), 0);
  if (last <= 0) return [];
  if (last === sum) return [];

  const diff = last - sum;
  const warnings: string[] = [
    diff > 0
      ? `最後の累計 ${yenOf(last)} より、伝票の合計の足し算 ${yenOf(sum)} が ${yenOf(diff)} 少ないです（撮り忘れの伝票はありませんか）`
      : `伝票の合計の足し算 ${yenOf(sum)} が、最後の累計 ${yenOf(last)} より ${yenOf(-diff)} 多いです（同じ伝票を2回撮っていませんか）`,
  ];

  slips.forEach((sl, i) => {
    if (sl.total <= 0) return;
    const rows = sl.items.reduce((s, it) => s + (it.amount || it.count * priceOf(it.name)), 0);
    if (rows > 0 && rows !== sl.total) {
      warnings.push(`${i + 1}枚目の伝票：行の合計 ${yenOf(rows)} と合計欄 ${yenOf(sl.total)} が合いません`);
    }
  });

  const chain = slips
    .map((sl) => ({ total: slipTotal(sl, priceOf), cum: sl.cumulative }))
    .filter((x) => x.cum > 0)
    .sort((a, b) => a.cum - b.cum);
  for (let k = 1; k < chain.length; k++) {
    if (chain[k - 1].cum + chain[k].total !== chain[k].cum) {
      warnings.push(`累計 ${yenOf(chain[k - 1].cum)} と ${yenOf(chain[k].cum)} のあいだの伝票があやしいです`);
    }
  }
  return warnings;
}

/** 伝票を何枚か読んだものを、1日ぶんにまとめる */
export function combineSlips(
  slips: Slip[],
  products: Pick<SaleProduct, "name" | "price" | "kind">[],
): MemoReadResult {
  const price = new Map(products.map((p) => [p.name, p.price]));
  const primary = products.find((p) => p.kind === "primary")?.name ?? null;
  const priceOf = (name: string) =>
    price.get(name) ?? (primary && isTebasakiName(name) ? price.get(primary) ?? 0 : 0);

  const items: MemoItem[] = [];
  const flavors: Record<string, number> = {};
  for (const sl of slips) {
    for (const it of sl.items) {
      items.push({ name: it.name, count: it.count });
      const isTeba = (primary && it.name === primary) || isTebasakiName(it.name);
      if (isTeba) {
        const f = it.flavor || "味不明";
        flavors[f] = (flavors[f] ?? 0) + it.count;
      }
    }
  }
  return {
    items,
    total: slips.reduce((s, sl) => s + slipTotal(sl, priceOf), 0),
    flavors,
    warnings: checkSlips(slips, priceOf),
    lastCumulative: slips.reduce((m, sl) => Math.max(m, sl.cumulative), 0),
    unreadable: slips.map((sl) => sl.unreadable).filter(Boolean).join("／"),
    raw: "",
  };
}

function isTebasakiName(name: string): boolean {
  return /手羽先|^しお$|^塩$|^たれ$|^タレ$|^のり$|のり塩/.test(name.normalize("NFKC"));
}

/* ------------------------------------------------------------------ */
/* 商品マスタの名前にそろえる                                          */
/* ------------------------------------------------------------------ */

function norm(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export type MatchedCounts = {
  /** 商品マスタの名前 → 本数 */
  counts: Record<string, number>;
  /** マスタに当てはまらなかった名前（画面に出して人に見てもらう） */
  unmatched: MemoItem[];
};

/**
 * 読んだ本数を商品マスタの名前にそろえる。
 * 同じ商品が2行に分かれていたら足す。マスタに無いものは unmatched に残す
 * （勝手に別の商品へ振らない＝金額を作らない）。
 */
export function matchMemoToProducts(
  items: MemoItem[],
  products: Pick<SaleProduct, "name" | "kind">[],
): MatchedCounts {
  const byNorm = new Map(products.map((p) => [norm(p.name), p.name]));
  const primary = products.find((p) => p.kind === "primary")?.name ?? null;
  const counts: Record<string, number> = {};
  const unmatched: MemoItem[] = [];

  for (const it of items) {
    const key = norm(it.name);
    let name = byNorm.get(key) ?? null;
    // 「手羽先(塩)」「塩」などはマスタに味ごとの商品が無ければ主力商品へ
    if (!name && primary && isTebasakiName(it.name)) {
      name = primary;
    }
    if (name) counts[name] = (counts[name] ?? 0) + it.count;
    else unmatched.push(it);
  }
  return { counts, unmatched };
}

/* ------------------------------------------------------------------ */
/* 新しい出店先（選択肢に無い場所を現場が打つ）2026-11-09                */
/* ------------------------------------------------------------------ */

export type NewPlace = {
  /** 日報に入れる名前（正式名にそろえたもの） */
  name: string;
  /** 出店場所マスタにまだ無い＝新しく登録する */
  isNew: boolean;
  /** マスタに足すときの中身（isNew のときだけ使う） */
  masterRow: { name: string; is_active: boolean; rank_locked: boolean } | null;
};

/**
 * 現場が打った場所の名前を決める。
 * - 名寄せのルール（lib/locationName.ts）で正式名にそろえる。「ながやま 鷹尾店」→「ながやま鷹尾」
 * - すでにマスタにある場所なら、それを使う（同じ場所を2つ作らない → CLAUDE.md 4-4）
 * - 無ければ新しくマスタに足す。場代の決まりは「未登録（none）」＝場代の行は作らない（→ 4-15）。
 *   お祭り・朝市などはランクの自動判定から外す（→ 4-13）
 * 空なら null（先へ進ませない）。
 */
export function resolveNewPlace(input: string, existing: string[]): NewPlace | null {
  const name = canonicalLocationName(input);
  if (!name) return null;
  const hit = existing.find((e) => canonicalLocationName(e) === name);
  if (hit) return { name: hit, isNew: false, masterRow: null };
  return {
    name,
    isNew: true,
    masterRow: { name, is_active: true, rank_locked: isEventLocation(name) },
  };
}

/* ------------------------------------------------------------------ */
/* レシート（経費）                                                    */
/* ------------------------------------------------------------------ */

export type PhotoExpense = {
  description: string;
  amount: number;
  receipt_image_url: string | null;
  no_receipt_reason: string | null;
  booth_fee?: boolean;
  booth_fee_edited?: boolean;
  /** 立て替えた人（加盟店はゆうやさん） */
  paid_by?: string;
};

/** /api/ocr の返事1件ぶんを、経費の行に直す（同じ写真を全部の行に付ける → 4-12） */
export function receiptToExpenses(
  ocr: { items?: { name: string; amount: number }[]; amount?: number },
  photo: string,
  paidBy: string = FRANCHISE_STAFF_NAME,
): PhotoExpense[] {
  const items = (ocr.items ?? []).filter((i) => (Number(i.amount) || 0) > 0);
  if (items.length > 0) {
    return items.map((i) => ({
      description: i.name || "商品名？",
      amount: Math.round(Number(i.amount) || 0),
      receipt_image_url: photo,
      no_receipt_reason: null,
      paid_by: paidBy,
    }));
  }
  const amount = Math.round(Number(ocr.amount) || 0);
  return [
    {
      description: "レシート（品名読めず）",
      amount,
      receipt_image_url: photo,
      no_receipt_reason: null,
      paid_by: paidBy,
    },
  ];
}

/** 場代の行（マスタの決まりから自動。決まりが無ければ行を作らない → 4-15） */
export function boothFeeExpense(rule: BoothFeeRule, sales: number): PhotoExpense | null {
  const amount = calcBoothFee(rule, sales);
  if (amount === null) return null;
  return {
    description: BOOTH_FEE_LABEL,
    amount,
    receipt_image_url: null,
    no_receipt_reason: null,
    booth_fee: true,
    booth_fee_edited: false,
  };
}

/* ------------------------------------------------------------------ */
/* 日報1件の組み立て                                                   */
/* ------------------------------------------------------------------ */

export type PhotoReportInput = {
  date: string;
  location: string;
  staffName?: string;
  products: SaleProduct[];
  memo: MemoReadResult;
  receiptExpenses: PhotoExpense[];
  boothFeeRule: BoothFeeRule;
  cumulativeBefore: number;
};

export type PhotoReportDraft = {
  sales: number;
  counts: Record<string, number>;
  unmatched: MemoItem[];
  breakdown: SalesBreakdown;
  expenses: PhotoExpense[];
  expensesTotal: number;
  /** 売上が決められなかった（メモの合計も本数も読めなかった） */
  salesMissing: boolean;
  /** メモの合計と「単価×本数」が食い違っているときの説明（合っていれば null） */
  mismatch: string | null;
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

/**
 * 写真から読んだものを1件の日報の下書きにする。
 *
 * 売上の決め方：メモに合計が書いてあれば**それが売上**（実際に受け取ったお金）。
 * 合計が読めなかったときだけ「単価×本数」の合計を売上にする。
 * 両方あって食い違えば mismatch に説明を入れる（金額は直さない）。
 */
export function buildPhotoReportDraft(input: PhotoReportInput): PhotoReportDraft {
  const { counts, unmatched } = matchMemoToProducts(input.memo.items, input.products);
  const fromCounts = computeSalesBreakdown({
    sales: 0,
    products: input.products,
    counts,
  }).total;
  const sales = input.memo.total > 0 ? input.memo.total : fromCounts;
  const breakdown = computeSalesBreakdown({ sales, products: input.products, counts });

  let mismatch: string | null = null;
  if (input.memo.total > 0 && fromCounts > 0 && breakdown.diff !== 0) {
    mismatch =
      breakdown.diff > 0
        ? `メモの合計が、本数から計算した金額より ${yen(breakdown.diff)} 多いです`
        : `本数から計算した金額が、メモの合計より ${yen(-breakdown.diff)} 多いです`;
  }
  if (input.memo.warnings?.length) {
    mismatch = [mismatch, ...input.memo.warnings].filter(Boolean).join("／");
  }
  if (unmatched.length > 0) {
    const names = unmatched.map((u) => `${u.name}×${u.count}`).join("、");
    mismatch = [mismatch, `商品一覧に無い名前があります：${names}`].filter(Boolean).join("／");
  }

  const booth = boothFeeExpense(input.boothFeeRule, sales);
  const expenses = [...(booth ? [booth] : []), ...input.receiptExpenses];

  return {
    sales,
    counts,
    unmatched,
    breakdown,
    expenses,
    expensesTotal: sumExpenses(expenses),
    salesMissing: sales <= 0,
    mismatch,
  };
}

/** LINE に流す短い文（日報完成のお知らせ） */
export function photoReportLineText(p: {
  date: string;
  location: string;
  staffName: string;
  draft: PhotoReportDraft;
  flavors?: Record<string, number>;
  /** 今日はじめて登録した出店先（場代はまだ決まっていない） */
  newPlace?: boolean;
}): string {
  const d = p.draft;
  const lines = [
    `${PHOTO_REPORT_MARK}${p.date.replace(/-/g, "/")} ${p.location}（${p.staffName}）`,
    `売上：${yen(d.sales)}`,
  ];
  const sold = Object.entries(d.counts)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${name} ${n}`)
    .join("／");
  if (sold) lines.push(`内訳：${sold}`);
  const fl = Object.entries(p.flavors ?? {})
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `${f}${n}`)
    .join("・");
  if (fl) lines.push(`手羽先の味：${fl}`);
  lines.push(`経費：${yen(d.expensesTotal)}`);
  lines.push(`差引：${yen(d.sales - d.expensesTotal)}`);
  if (p.newPlace) lines.push("🆕 新しい出店先です（場代は未登録。管理者ページの出店場所で決めてください）");
  if (d.mismatch) lines.push(`⚠ ${d.mismatch}`);
  return lines.join("\n");
}

/**
 * daily_reports に入れる1行を組み立てる。
 *
 * - 加盟店なので日当（labor）は 0。釣り銭・レジ締めの欄は使わない
 * - 既存の列はすべて埋める（集計・経理層・ランク判定が今までどおり読めるように）
 * - 主力商品などの本数は既存の互換カラムにも入れる（→ app/report/page.tsx と同じ）
 */
export function buildDailyReportRow(p: {
  date: string;
  location: string;
  staffName: string;
  draft: PhotoReportDraft;
  products: SaleProduct[];
  cumulativeBefore: number;
  expensesForSave: PhotoExpense[];
  lineText: string;
  cleanupInventory: unknown;
  cleanupTasks: unknown;
  /**
   * 撮った伝票の写真の住所（置き場のURL）。
   * 専用の列は作らず、既存の引き継ぎ欄（handover）に1行ずつ残す（倉庫の形を変えないため）。
   */
  slipImages?: string[];
}) {
  const d = p.draft;
  const primary = p.products.find((x) => x.kind === "primary")?.name;
  const c = d.counts;
  return {
    tenant_id: null,
    date: p.date,
    shop: "手羽屋",
    location: p.location,
    staff_name: p.staffName,
    sales_amount: d.sales,
    cumulative_sales: p.cumulativeBefore + d.sales,
    register_total: 0,
    register_ok: true,
    register_diff: 0,
    labor: 0,
    remaining_tebasaki: primary ? c[primary] || 0 : 0,
    remaining_gyoza: c["手羽餃子"] || 0,
    remaining_potato: c["ポテト"] || 0,
    remaining_tornado: 0,
    remaining_negishio: 0,
    limited_product_name: null,
    limited_product_count: null,
    allstar_count: c["オールスター"] || 0,
    customer_groups: 0,
    alcohol_count: c["お酒"] || 0,
    product_counts: { ...c },
    product_prices: priceSnapshot(d.breakdown),
    breakdown_total: d.breakdown.total,
    breakdown_diff: d.breakdown.diff,
    breakdown_diff_reason: d.breakdown.matched ? null : "other",
    breakdown_diff_note: d.breakdown.matched
      ? null
      : `写真日報（AI読み取り）${d.mismatch ? "：" + d.mismatch : ""}`,
    expenses: p.expensesForSave,
    handover: (p.slipImages ?? []).length
      ? `伝票の写真（${(p.slipImages ?? []).length}枚）：\n${(p.slipImages ?? [])
          .map((u) => (u.startsWith("data:") ? "（置き場に入れられず埋め込み）" : u))
          .join("\n")}`
      : "",
    line_text: p.lineText,
    unit_number: null,
    cleanup_inventory: p.cleanupInventory,
    cleanup_tasks: p.cleanupTasks,
  };
}
