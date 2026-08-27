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
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** 控えを取る対象（消えると事業が止まる重要テーブル） */
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
  results: BackupResult[];
};

/**
 * service_role キーを使うサーバー専用クライアント。
 * RLS（鍵）をすり抜けられるので、バックアップ先の table_snapshots に書ける。
 * キーが未設定なら null を返す（＝バックアップできない）。
 */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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
 */
export async function runBackup(db: SupabaseClient): Promise<BackupSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const results: BackupResult[] = [];

  for (const table of CRITICAL_TABLES) {
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

  const pruned = await pruneOldSnapshots(db);
  const okCount = results.filter((r) => r.ok).length;

  return {
    ok: okCount === CRITICAL_TABLES.length,
    backed_up: okCount,
    total: CRITICAL_TABLES.length,
    pruned,
    results,
  };
}
