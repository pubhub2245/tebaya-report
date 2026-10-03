/**
 * 立替（たてかえ）を、月の経費に1つの数字として足すための部分。
 *
 * ■ なぜ必要か（2026-10-02・kp218）
 *   経理の月次は「レジのお金から出た経費」だけを数えていました。
 *   ところが立替（誰かが自分のお金で先に払った分）は金庫から出ていないので、
 *   月の経費が **2つの数字** に分かれていました。
 *     ・金庫から出た分だけ
 *     ・立替も含めた全部
 *   お店に渡す1枚の要約に書く数字が決まらないので、
 *   **「立替も含めた全部」を月の経費の正** と決めました（docs/keiri.md 5-4）。
 *
 * ■ このファイルがやること
 *   立替の棚は2つあり、列の名前も違います（CLAUDE.md 5-4 の「3つの箱」）。
 *     ・現場スタッフの立替 … keiri_advance_expenses（expense_date／source_type／memo）
 *     ・経営側の立替　　　 … advance_expenses（date／description／settled）
 *   どちらも同じ形（KeiriAdvance）に直してから集計に渡します。
 *   **通信はしません。**受け取った行を揃えるだけなので、検算で固定できます。
 *
 * ■ 科目の決め方
 *   ・現場の立替は「種類」を選ぶ形なので、**種類から科目を決めます**（文字より確か）。
 *   ・経営側の立替は自由入力の文字だけなので、**日報の経費とまったく同じ対応表**で当てます。
 *     当たらなければ雑費に置き、「要確認」の一覧に出します（勝手に決めません）。
 */

import type { ExpenseAccountKey } from "./accounts";
import type { AdvanceSource, KeiriAdvance } from "./types";

/**
 * 「業務委託の歩合報酬」を月の経費に数えない理由。
 *
 * 外注費（Alpha）は**売上高から自動で計算して**毎月1行足しています
 * （aggregate.ts の calcOutsourcing）。その支払いを立替としても数えると、
 * 同じお金を2回引くことになります。そこで数えずに、理由をつけて画面に出します。
 */
export const SKIP_OUTSOURCING =
  "外注費は売上高から自動で計算しているため、二重に数えないよう経費にも現金にも足していません。中身を確かめて、必要なら「払った記録」に入れてください";

/** 中身が分からない立替を数えない理由 */
export const SKIP_UNKNOWN_KIND =
  "「立替経費」は支払い方の指定で、何を買ったかが分かりません。種類を選び直してください";

/**
 * 現場の立替で選ぶ「種類」→ このアプリの科目。
 *
 * 左側は倉庫の対応表（keiri_account_mapping.source_type）の値です。
 * ★科目は増やしていません（accounts.ts の12個のまま）。
 * ★ここに無い種類は、メモの文字から当てます（当たらなければ雑費・要確認）。
 */
export const ADVANCE_KIND_ACCOUNT: Record<string, ExpenseAccountKey> = {
  purchase_chicken: "purchase",
  purchase_gyoza: "purchase",
  purchase_seasoning: "purchase",
  supplies: "supplies",
  booth_fee: "booth_fee",
  fuel_toll: "vehicle",
  // レジではなく自分のお金から出た当日払いの給与。人件費にまとめて出る
  payroll_parttime: "payroll_daily",
  tool_server: "communication",
};

/** 月の経費に数えない種類と、その理由 */
export const ADVANCE_KIND_SKIP: Record<string, string> = {
  outsourcing_commission: SKIP_OUTSOURCING,
  advance_expense: SKIP_UNKNOWN_KIND,
};

/**
 * 対応表がまだ無いお店向けの選択肢（advanceScope.ts の FALLBACK_ADVANCE_TYPES）は
 * `advance_<科目キー>` という形です。その形なら科目をそのまま取り出します。
 */
const FALLBACK_PREFIX = "advance_";

/** 「種類」から科目を決める。決められなければ null（＝メモの文字から当てる） */
export function accountForAdvanceKind(
  sourceType: string | null | undefined,
): ExpenseAccountKey | null {
  const key = (sourceType ?? "").trim();
  if (!key) return null;
  const direct = ADVANCE_KIND_ACCOUNT[key];
  if (direct) return direct;
  if (key.startsWith(FALLBACK_PREFIX) && !ADVANCE_KIND_SKIP[key]) {
    const rest = key.slice(FALLBACK_PREFIX.length);
    // accounts.ts にある科目名そのままのときだけ採用する（知らない名前は使わない）
    if (KNOWN_ACCOUNT_KEYS.has(rest)) {
      return rest as ExpenseAccountKey;
    }
  }
  return null;
}

/** `advance_<科目キー>` で使ってよい科目の名前（人件費・外注費・家賃は入れない） */
const KNOWN_ACCOUNT_KEYS = new Set<string>([
  "purchase",
  "booth_fee",
  "payroll_daily",
  "vehicle",
  "supplies",
  "lease",
  "communication",
  "misc",
]);

/** 現場の立替1行（keiri_advance_expenses）の、必要な列だけ */
export type FieldAdvanceRow = {
  expense_date?: string | null;
  amount?: number | null;
  payer?: string | null;
  source_type?: string | null;
  memo?: string | null;
};

/** 経営側の立替1行（advance_expenses）の、必要な列だけ */
export type OwnerAdvanceRow = {
  date?: string | null;
  amount?: number | null;
  payer?: string | null;
  description?: string | null;
  settled?: boolean | null;
  settled_date?: string | null;
};

/**
 * 現場の立替を揃える。
 *
 * ★精算（返金）の欄がこの棚にはまだ無いので、**まだ返していない扱い**にします
 *   （CLAUDE.md 5-4 の残課題）。返した記録が入る欄ができたらここを直します。
 */
export function normalizeFieldAdvance(row: FieldAdvanceRow): KeiriAdvance {
  const kind = (row.source_type ?? "").trim();
  const memo = (row.memo ?? "").trim();
  const skip = ADVANCE_KIND_SKIP[kind] ?? null;
  return {
    date: String(row.expense_date ?? ""),
    amount: Number(row.amount) || 0,
    // 科目が決まらなかったときに文字から当てるので、種類とメモの両方を渡す
    description: [memo, kind].filter(Boolean).join(" ") || "立替",
    payer: (row.payer ?? "").trim() || null,
    settled: false,
    settledDate: null,
    source: "field" as AdvanceSource,
    account: skip ? null : accountForAdvanceKind(kind),
    skipReason: skip,
  };
}

/** 経営側の立替を揃える（自由入力の文字から科目を当てる） */
export function normalizeOwnerAdvance(row: OwnerAdvanceRow): KeiriAdvance {
  return {
    date: String(row.date ?? ""),
    amount: Number(row.amount) || 0,
    description: (row.description ?? "").trim() || "立替",
    payer: (row.payer ?? "").trim() || null,
    settled: row.settled === true,
    settledDate: row.settled === true ? (row.settled_date ?? null) : null,
    source: "owner" as AdvanceSource,
    account: null,
    skipReason: null,
  };
}

/** 立替の説明に、立て替えた人の名前を添える（画面とCSVの摘要で使う） */
export function advanceNote(a: KeiriAdvance): string {
  const what = (a.description ?? "").trim() || "立替";
  const who = (a.payer ?? "").trim();
  return who ? `${what}（立替・${who}）` : `${what}（立替）`;
}
