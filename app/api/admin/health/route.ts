import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * ⑥ 監視: システム健康状態の集約API（管理画面のパネル用）。
 *
 * 「最終日報」「最終LINE投稿(設営後チェック)」「最終バックアップ」などを1回で返す。
 * これにより、機能が静かに止まっていても管理画面で気づける
 * （例: LINEボットが数週間止まっていたのに気づけなかった問題の再発防止）。
 * 読み取り専用。
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const REQUIRED = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "tebaya2026";

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

function anyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return {
    db: createClient(url, service || anon),
    hasService: !!service,
  };
}

async function lastDateOf(
  db: any,
  table: string,
  dateCol: string,
): Promise<{ value: string | null; error?: string }> {
  try {
    const { data, error } = await db
      .from(table)
      .select(dateCol)
      .order(dateCol, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { value: null, error: error.message };
    return { value: (data as any)?.[dateCol] ?? null };
  } catch (e: any) {
    return { value: null, error: e?.message || String(e) };
  }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  }
  const { db, hasService } = anyClient();

  const [lastReport, lastSetupCheck, lastInterim, lastAgenda] = await Promise.all([
    lastDateOf(db, "daily_reports", "date"),
    lastDateOf(db, "setup_checks", "created_at"),
    lastDateOf(db, "interim_reports", "created_at"),
    lastDateOf(db, "agenda_items", "created_at"),
  ]);

  // バックアップ状況（service_role が無いと table_snapshots は読めない）
  let backups: any[] = [];
  let backupError: string | null = null;
  if (hasService) {
    const { data, error } = await db
      .from("table_snapshots")
      .select("table_name, snapshot_date, row_count")
      .order("snapshot_date", { ascending: false });
    if (error) backupError = error.message;
    else {
      const latest = new Map<string, any>();
      for (const row of data ?? []) {
        if (!latest.has(row.table_name)) latest.set(row.table_name, row);
      }
      backups = Array.from(latest.values());
    }
  }

  return NextResponse.json({
    ok: true,
    service_role: hasService,
    last_report_date: lastReport.value,
    last_setup_check: lastSetupCheck.value,
    last_interim: lastInterim.value,
    last_agenda: lastAgenda.value,
    backups,
    backup_error: backupError,
  });
}
