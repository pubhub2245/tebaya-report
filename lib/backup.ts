/**
 * バックアップ（重要テーブルの控えを取る）の中身。
 *
 * ■ なぜこのファイルを作ったか
 *   バックアップの仕組みは前からあったのに、一度も動いていませんでした（控え0件）。
 *   原因は2つ：
 *     ① 実行の窓口が POST だけだったが、Vercelの自動実行（cron）は GET しか送らない
 *     ② そもそも自動実行の予定表に登録されていなかった
 *   処理をここに切り出して、手動実行（/api/admin/backup）と
 *   毎日の自動実行の両方から呼べるようにしました。
 *
 * ■ 何から守れるか
 *   「うっかり消した・上書きした」からの復旧です。
 *   倉庫（Supabase）ごと失われる事故には効きません（それは Supabase 側のバックアップの役目）。
 *
 * ■ 制限時間を必ず守ること（2026-08-28 に事故が起きた箇所）
 *   Vercel の処理には60秒の上限がある。日報にはレシート写真が埋め込まれていて18MBあり、
 *   これを丸ごとコピーしようとして時間を使い切り、**同じ枠で動いている毎日の集計処理まで
 *   道連れで止まった**（8/27の夜、達成率の計算が1日ぶん実行されなかった）。
 *   そのため、
 *     ・呼び出し側は「本来の処理を先に終わらせてから」バックアップを呼ぶ
 *     ・バックアップは残り時間を見て、間に合わない分は諦めて記録に残す
 *   の2点を必ず守る。写真を置き場へ移す（→ CLAUDE.md 4-7）と、この重さは無くなる。
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { serviceClientOrNull, serviceRoleKeyStatus } from "./supabaseServer";

/**
 * 控えを取る対象（消えると事業が止まる重要テーブル）。
 *
 * ★ 並び順に意味がある。時間切れになったとき、後ろのものから諦めるので、
 *   大事なものほど前に置く。日報は一番大事だが一番重いので先頭のまま。
 */
export const CRITICAL_TABLES = [
  "daily_reports",
  "cash_settings",
  "advance_expenses",
  "keiri_advance_expenses",
  "keiri_account_mapping",
  "sale_products",
  "staff_members",
  "locations",
  "setup_checks",
  "feedback_box",
  "feedback_replies",
  "agenda_items",
  "venue_inquiries",
  "monthly_limited_products",
];

/**
 * 何日ぶんの控えを残すか。
 *
 * 日報にはレシート写真がそのまま入っていて1日ぶんで約19MBあります。
 * 無制限に貯めると倉庫（上限500MB）が溢れるため、古いものから自動で消します。
 * ※ 写真を専用の置き場（Supabase Storage）に移せば、この制限は不要になります。
 */
export const SNAPSHOT_RETENTION_DAYS = 5;

export type BackupResult = {
  table: string;
  rows: number;
  ok: boolean;
  error?: string;
};

export type BackupSummary = {
  ok: boolean;
  backed_up: number;
  total: number;
  pruned: number;
  /** 時間切れで手を付けられなかったテーブル名 */
  skipped: string[];
  /** 時間切れで打ち切ったか */
  timedOut: boolean;
  results: BackupResult[];
};

/** 何も指定されなかったときに使う制限時間（ミリ秒） */
const DEFAULT_BUDGET_MS = 30_000;

/**
 * service_role キーを使うサーバー専用クライアント。
 * RLS（鍵）をすり抜けられるので、バックアップ先の table_snapshots に書ける。
 *
 * キーが未設定、または値が壊れている（全角が混ざっている等）ときは null を返す。
 * 判定は lib/supabaseServer.ts に集約している（→ 2026-08-28 の事故）。
 */
export function serviceClient(): SupabaseClient | null {
  return serviceClientOrNull();
}

/** キーが使えない理由。画面に出して原因が分かるようにする */
export function serviceKeyProblem(): string | null {
  const st = serviceRoleKeyStatus();
  return st.ok ? null : st.reason;
}

/**
 * 古い控えを消して、直近 SNAPSHOT_RETENTION_DAYS 日ぶんだけ残す。
 *
 * 消すのは「毎日の自動バックアップ」（CRITICAL_TABLES）の分だけ。
 * 作業前に手で取った控え（例：レシート写真の引っ越し前の控え）は、
 * 元に戻すための命綱なので自動では消さない。
 */
async function pruneOldSnapshots(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from("table_snapshots")
    .select("snapshot_date")
    .in("table_name", CRITICAL_TABLES)
    .order("snapshot_date", { ascending: false });
  if (error || !data) return 0;

  const dates = Array.from(
    new Set((data as { snapshot_date: string }[]).map((r) => r.snapshot_date)),
  ).sort((a, b) => (a < b ? 1 : -1));

  const tooOld = dates.slice(SNAPSHOT_RETENTION_DAYS);
  if (tooOld.length === 0) return 0;

  // 日付とテーブル名を明示して消す（条件なしの一括削除は絶対にしない）
  const { error: delErr } = await db
    .from("table_snapshots")
    .delete()
    .in("snapshot_date", tooOld)
    .in("table_name", CRITICAL_TABLES);
  return delErr ? 0 : tooOld.length;
}

/**
 * バックアップを実行する。1日1件・同じ日に何度走らせても上書き（増えない）。
 *
 * budgetMs は「この時間までに終わらせる」という制限時間。
 * 1つのテーブルを取りかかる前に残り時間を見て、足りなければそこで打ち切る。
 * 打ち切った分は skipped に名前を残すので、あとから何が取れていないか分かる。
 *
 * ★ 途中で打ち切るのは、**呼び出し元の処理を道連れにしないため**。
 *   Vercel の60秒制限を超えると、同じ枠で動いている他の処理ごと強制終了される。
 */
export async function runBackup(
  db: SupabaseClient,
  opts: { budgetMs?: number } = {},
): Promise<BackupSummary> {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  const remaining = () => budgetMs - (Date.now() - startedAt);

  const today = new Date().toISOString().slice(0, 10);
  const results: BackupResult[] = [];
  const skipped: string[] = [];
  let timedOut = false;

  for (const table of CRITICAL_TABLES) {
    // 残り時間が無ければ、ここで打ち切る（無理に始めない）
    if (remaining() <= 0) {
      timedOut = true;
      skipped.push(table);
      continue;
    }
    try {
      const { data, error } = await db.from(table).select("*");
      if (error) {
        results.push({ table, rows: 0, ok: false, error: error.message });
        continue;
      }
      const rows = data ?? [];
      const { error: upErr } = await db.from("table_snapshots").upsert(
        {
          table_name: table,
          snapshot_date: today,
          row_count: rows.length,
          data: rows,
        },
        { onConflict: "table_name,snapshot_date" },
      );
      if (upErr) {
        results.push({ table, rows: rows.length, ok: false, error: upErr.message });
      } else {
        results.push({ table, rows: rows.length, ok: true });
      }
    } catch (e: any) {
      results.push({ table, rows: 0, ok: false, error: e?.message || String(e) });
    }
  }

  // 古い控えの整理も、残り時間があるときだけ
  const pruned = remaining() > 0 ? await pruneOldSnapshots(db) : 0;
  const okCount = results.filter((r) => r.ok).length;

  return {
    ok: okCount === CRITICAL_TABLES.length,
    backed_up: okCount,
    total: CRITICAL_TABLES.length,
    pruned,
    skipped,
    timedOut,
    results,
  };
}
