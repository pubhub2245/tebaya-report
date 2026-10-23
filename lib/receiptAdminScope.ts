/**
 * 「昔のレシートを直す」管理用の2つの処理を、手羽屋の日報だけに当てるための決まり。
 *
 * ■ どの2つか
 *   ① 写真の引っ越し（lib/receiptMigration.ts・/api/admin/migrate-receipts）
 *   ② 税抜のまま入っている金額の読み直し（/api/admin/reocr-receipts）
 *
 * ■ 何が起きていたか（f3-4）
 *   どちらも日報の棚を「お店で絞らずに」読んでいた。お店が2軒になると、
 *   手羽屋の管理画面のボタン1つで
 *     ・よその店の経費の金額が、読み取りの結果で書き換わる（②。しかも1枚ごとに費用がかかる）
 *     ・よその店のレシート写真が、手羽屋の置き場へ移される（①）
 *   という形になる。どちらも「帳簿の金額を書き換える」所なので、いちばん危ない。
 *
 * ■ 直し方
 *   読む所に「印が空のものだけ」（＝手羽屋）の絞り込みを足す。
 *   いまある日報は178行ぜんぶ印が空なので、**手羽屋の見え方・直る枚数は1行も変わらない**。
 *
 * ■ 絞り込めなかったときは、直さずに止まる
 *   ここは「人のお金の記録を書き換える」処理なので、
 *   どのお店の行か分からないまま書き換えるより、何もしないほうが安全。
 *   （読むだけの画面が「0件」を「0円」と取り違えないのと同じ考え方）
 */

import {
  applyTenantScope,
  rowsInScope,
  TEBAYA_SCOPE,
  type TenantScope,
} from "@/lib/tenantScope";

/** 日報の行のうち、絞り込みに要る所だけ */
export type ScopableReportRow = { id: string; tenant_id?: string | null };

/**
 * 読んだ日報の行から、このお店のぶんだけを残す。
 * 手羽屋（印が空）のときは、印が空の行だけが残る。
 */
export function receiptRowsInScope<R extends ScopableReportRow>(
  rows: R[],
  scope: TenantScope = TEBAYA_SCOPE,
): R[] {
  return rowsInScope(rows, scope);
}

/**
 * 一覧（RPC）が返した番号のうち、このお店の日報だった番号だけを残す。
 * `allowed` は、同じ番号を棚に絞り込んで聞き直した答え。
 */
export function keepIdsInScope<T extends { id: string }>(
  index: T[],
  allowed: Iterable<string>,
): T[] {
  const ok = new Set(allowed);
  return index.filter((r) => ok.has(r.id));
}

export type ScopeCheckVerdict = {
  /** 書き換えに進んでよいか */
  proceed: boolean;
  /** 進めないときに画面へ出す1行（やさしい日本語。英語のエラーは出さない） */
  message: string | null;
};

/**
 * 「どの店の行か」を確かめられたかどうかの判定。
 *
 * - 確かめられた → 進む
 * - 聞けなかった（棚が答えない・印の欄がない等）→ **進まない**
 *   （よその店の帳簿を書き換えてしまうため。1行も触らずに止まる）
 */
export function decideReceiptScopeCheck(params: {
  errorMessage?: string | null;
  what: string;
}): ScopeCheckVerdict {
  const err = (params.errorMessage ?? "").toString().trim();
  if (!err) return { proceed: true, message: null };
  return {
    proceed: false,
    message:
      `${params.what}を、どのお店の日報かを確かめられなかったので中止しました。` +
      `記録は1行も変えていません（確かめられなかった理由：${err}）。`,
  };
}

/** 番号をいくつか渡すと、「このお店の日報だった番号」だけを返す */
export type ScopedIdsResult = { ids: string[]; errorMessage: string | null };

/**
 * 日報の番号を棚に聞き直して、このお店のぶんだけを残す。
 * 1回の問い合わせで済むよう、番号をまとめて渡す。
 */
export async function reportIdsInScope(
  db: {
    from(table: string): any;
  },
  ids: string[],
  scope: TenantScope = TEBAYA_SCOPE,
): Promise<ScopedIdsResult> {
  if (ids.length === 0) return { ids: [], errorMessage: null };
  const { data, error } = (await applyTenantScope<any>(
    db.from("daily_reports").select("id").in("id", ids),
    scope,
  )) as { data: { id: string }[] | null; error: { message?: string } | null };
  if (error) return { ids: [], errorMessage: error.message ?? String(error) };
  return {
    ids: ((data as { id: string }[] | null) ?? []).map((r) => r.id),
    errorMessage: null,
  };
}
