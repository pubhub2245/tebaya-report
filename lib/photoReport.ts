/**
 * 写真だけの日報（/report/photo）の計算の本体。2026-11-07 追加。
 *
 * ■ なぜ作ったか（じゅん決定・2026-11-07）
 *   手羽屋はフランチャイズ型（加盟店＝ゆうやさん）に変わった。
 *   現場から「日報の入力が大変」という声があり、
 *   **日報に人間が数字を打つことをなくす**ことにした。
 *   現場がやるのは次の4つだけ：
 *     ① 出店場所をタップ ② 手書きの売上メモを撮る ③ レシートを撮る ④ OK
 *   いちばん上の原則：**裏側はいくら複雑でもよい。現場の手数は限りなくゼロにする。**
 *
 * ■ このファイルに置くもの（データベースに触らない純粋な計算だけ）
 *   - 売上メモを読む指示文と、読んだ結果を使える形に直す処理
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
/* 売上メモの読み取り                                                  */
/* ------------------------------------------------------------------ */

/**
 * 手書きの売上メモを読む指示文。★ここ1か所だけ
 *
 * 商品マスタの名前を渡し、**その名前にそろえて**返させる。
 * 手羽先の味（塩・タレ・のり塩）が分けて書かれていても、
 * マスタに味ごとの商品が無ければ手羽先にまとめて数える。
 */
export function buildMemoPrompt(productNames: string[]): string {
  const list = productNames.length
    ? productNames.map((n) => `- ${n}`).join("\n")
    : "- （商品一覧なし）";
  return `この写真は、屋台「手羽屋」の1日の売上を手書きでメモしたものです。
商品ごとの本数・個数と、売上の合計金額を読み取って、必ず次のJSON形式だけで返してください。説明文は不要です。

{
  "items": [
    {"name": "商品名", "count": 本数}
  ],
  "total": 売上の合計金額,
  "unreadable": "読めなかった所があれば短く書く（なければ空文字）"
}

【商品名のそろえ方 — 最重要】
- name は必ず次の一覧の中の名前をそのまま使ってください：
${list}
- 手羽先の味（塩・タレ・のり塩など）が分けて書かれていて、一覧に味ごとの商品が無い場合は、
  味をまとめて一覧の手羽先の名前で合計の本数を返してください。
- 一覧に無い商品が書かれていたら、書いてあるとおりの名前で返してください。

【数字のルール】
- count と total は数値だけ（¥・円・カンマ・「本」「個」は付けない）
- 正の字（正・一・丁など）で数えてあれば、数に直してください（正＝5）
- 合計金額が書かれていなければ total は 0 にしてください。
- 読めない数字を推測で埋めないでください。読めなかったら unreadable に書いてください。`;
}

export type MemoItem = { name: string; count: number };

export type MemoReadResult = {
  items: MemoItem[];
  /** メモに書かれていた売上の合計。読めなければ 0 */
  total: number;
  /** 読めなかった所のメモ（AIが返した言葉） */
  unreadable: string;
  raw: string;
};

function toCount(v: unknown): number {
  if (typeof v === "number") return Math.max(0, Math.round(v));
  const n = parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** AIが返した文字を使える形にする。読めなければ items が空 */
export function parseMemoText(raw: string): MemoReadResult {
  const empty: MemoReadResult = { items: [], total: 0, unreadable: "", raw };
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return empty;
    const parsed = JSON.parse(m[0]);
    const items: MemoItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .map((it: any) => ({
            name: String(it?.name ?? "").trim(),
            count: toCount(it?.count),
          }))
          .filter((it: MemoItem) => it.name !== "")
      : [];
    return {
      items,
      total: toCount(parsed.total),
      unreadable: String(parsed.unreadable ?? "").trim(),
      raw,
    };
  } catch {
    return empty;
  }
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
    if (!name && primary && /手羽先|^塩$|^たれ$|^タレ$|のり塩/.test(it.name.normalize("NFKC"))) {
      name = primary;
    }
    if (name) counts[name] = (counts[name] ?? 0) + it.count;
    else unmatched.push(it);
  }
  return { counts, unmatched };
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
  lines.push(`経費：${yen(d.expensesTotal)}`);
  lines.push(`差引：${yen(d.sales - d.expensesTotal)}`);
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
    handover: "",
    line_text: p.lineText,
    unit_number: null,
    cleanup_inventory: p.cleanupInventory,
    cleanup_tasks: p.cleanupTasks,
  };
}
