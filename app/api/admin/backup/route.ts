import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "tebaya2026";

/** バックアップ対象（お金・売上・記録など、消えると困る重要テーブル） */
const CRITICAL_TABLES = [
  "daily_reports",
  "cash_settings",
  "advance_expenses",
  "sale_products",
  "feedback_box",
  "feedback_replies",
  "agenda_items",
  "venue_inquiries",
  "monthly_limited_products",
];

function isAdmin(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/, "")
    .trim();
  if (!token) return false;
  return (
    token === REQUIRED ||
    token === process.env.ADMIN_PASSWORD ||
    (!!process.env.CRON_SECRET && token === process.env.CRON_SECRET)
  );
}

/** service_role 優先のサーバー用クライアント（RLSバイパス）。無ければ null。 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

  const results: { table: string; rows: number; ok: boolean; error?: string }[] =
    [];
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
          snapshot_date: new Date().toISOString().slice(0, 10),
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

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: okCount === CRITICAL_TABLES.length,
    backed_up: okCount,
    total: CRITICAL_TABLES.length,
    results,
  });
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
