import { NextRequest, NextResponse } from "next/server";
import { runBackup, serviceClient } from "@/lib/backup";

/**
 * ① 復旧: 重要テーブルのバックアップ（スナップショット）。
 *
 * - POST: 重要テーブルの現在の中身を table_snapshots に保存する（1日1件・同日は上書き）。
 * - GET : 各テーブルの最新バックアップ状況を返す（健康状態パネル用）。
 *
 * table_snapshots は RLS 有効・ポリシー無しのため、匿名キーからは触れない。
 * このAPIは service_role キーを使う（RLSをバイパス）＝バックアップ自体を守れる。
 * service_role キーが未設定の場合はバックアップできないので、その旨を返す。
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;


function isAdmin(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/, "")
    .trim();
  if (!token) return false;
  return (
    (!!REQUIRED && token === REQUIRED) ||
    token === process.env.ADMIN_PASSWORD ||
    (!!process.env.CRON_SECRET && token === process.env.CRON_SECRET)
  );
}


export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  }
  const db = serviceClient();
  if (!db) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY が未設定のためバックアップできません（Vercelの環境変数に設定してください）",
      },
      { status: 500 },
    );
  }

  // 手動実行はこの処理だけなので、60秒の上限に対して50秒まで使ってよい
  return NextResponse.json(await runBackup(db, { budgetMs: 50_000 }));
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  }
  const db = serviceClient();
  if (!db) {
    return NextResponse.json({
      ok: false,
      service_role: false,
      error: "SUPABASE_SERVICE_ROLE_KEY 未設定",
      snapshots: [],
    });
  }
  const { data, error } = await db
    .from("table_snapshots")
    .select("table_name, snapshot_date, row_count, created_at")
    .order("snapshot_date", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, service_role: true, error: error.message, snapshots: [] });
  }
  // テーブルごとに最新1件だけに絞る
  const latest = new Map<string, any>();
  for (const row of data ?? []) {
    if (!latest.has(row.table_name)) latest.set(row.table_name, row);
  }
  return NextResponse.json({
    ok: true,
    service_role: true,
    snapshots: Array.from(latest.values()),
  });
}
