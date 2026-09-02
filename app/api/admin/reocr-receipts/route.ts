/**
 * 昔のレシート写真を読み直して、税抜のまま入っている金額を税込に直す窓口。
 *
 * - GET  : 下見だけ。何枚残っているかを返す。**お金はかからない**（読み取りをしない）。
 * - POST : 実際に読み直す。1回で limit 枚（既定5枚）ずつ。**1枚ごとに費用がかかる**。
 *
 * ■ 安全のしくみ
 *   - 書き換える前に必ず控えを残す（残せなければ中止）。
 *   - すでに直した行（`tax_fixed_at` がある）には**触らない**
 *     → 何度押しても二重に増えない。途中で止まっても続きから進む。
 *   - 名前が対応づかない・差が消費税で説明できないときは**直さず**「要確認」に返す。
 *   - 写真の無い行には一切触らない（「不明」の扱い。docs/keiri.md 11-5）。
 *
 * 設計は docs/keiri.md 11章。判定は lib/receiptReocr.ts。
 */

import { NextRequest, NextResponse } from "next/server";

import { serviceClient, serviceKeyProblem } from "@/lib/backup";
import { readReceipt, type ReceiptMedia } from "@/lib/receiptOcr";
import { decideReocrFix } from "@/lib/receiptReocr";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 1回で読み直す枚数の上限。1枚あたり数秒かかるので控えめにしてある */
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

/** 控えの名前（table_snapshots）。毎日の自動削除の対象外 */
const SNAPSHOT_NAME = "tax_reocr_backup";

type ExpenseItem = {
  description?: string | null;
  amount?: number | null;
  receipt_image_url?: string | null;
  [k: string]: unknown;
};

type ReportRow = { id: string; date: string; location: string | null; expenses: ExpenseItem[] };

function isAdmin(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/, "")
    .trim();
  if (!token) return false;
  return (
    (!!process.env.NEXT_PUBLIC_ADMIN_PASSWORD &&
      token === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) ||
    (!!process.env.ADMIN_PASSWORD && token === process.env.ADMIN_PASSWORD) ||
    (!!process.env.CRON_SECRET && token === process.env.CRON_SECRET)
  );
}

function noServiceKey() {
  return NextResponse.json(
    {
      ok: false,
      error: `SUPABASE_SERVICE_ROLE_KEY が${serviceKeyProblem()}ため実行できません（Vercelの環境変数を確認してください）`,
    },
    { status: 500 },
  );
}

/** まだ読み直していない写真つきの行があるか */
function pendingPhotoItems(expenses: ExpenseItem[]): number[] {
  const out: number[] = [];
  expenses.forEach((e, i) => {
    const url = (e?.receipt_image_url ?? "").toString().trim();
    if (url && !("tax_fixed_at" in (e ?? {}))) out.push(i);
  });
  return out;
}

/** data:image/xxx;base64,... から画像の種類を読み取る */
function mediaTypeOf(url: string): ReceiptMedia {
  const m = url.match(/^data:(image\/(jpeg|png|webp|gif))/);
  return (m?.[1] as ReceiptMedia) ?? "image/jpeg";
}

async function loadTargets(db: any) {
  const { data, error } = await db
    .from("daily_reports")
    .select("id, date, location, expenses")
    .order("date");
  if (error) throw new Error(error.message);
  const rows = ((data as ReportRow[]) ?? []).filter((r) => Array.isArray(r.expenses));
  const targets = rows
    .map((r) => ({ report: r, idxs: pendingPhotoItems(r.expenses) }))
    .filter((t) => t.idxs.length > 0);
  return targets;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req))
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  const db = serviceClient();
  if (!db) return noServiceKey();

  try {
    const targets = await loadTargets(db);
    const photos = targets.reduce((s, t) => s + t.idxs.length, 0);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      remainingPhotos: photos,
      remainingReports: targets.length,
      perRun: DEFAULT_LIMIT,
      note: "下見です。読み取りをしていないので費用はかかりません。",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req))
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY が未設定のため読み取りできません" },
      { status: 500 },
    );

  const db = serviceClient();
  if (!db) return noServiceKey();

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body?.limit) || DEFAULT_LIMIT));
  const today = new Date().toISOString().slice(0, 10);

  const fixed: { date: string; description: string; from: number; to: number }[] = [];
  const needsCheck: { date: string; description: string; amount: number; reason: string }[] = [];
  const errors: string[] = [];

  try {
    const targets = await loadTargets(db);
    if (targets.length === 0)
      return NextResponse.json({
        ok: true,
        dryRun: false,
        message: "読み直す写真はもうありません",
        fixedPhotos: 0,
        needsCheck: [],
        remainingPhotos: 0,
      });

    // ---- 1. 控えを残す（残せなければ中止） -------------------------------
    const batch: typeof targets = [];
    let picked = 0;
    for (const t of targets) {
      if (picked >= limit) break;
      batch.push(t);
      picked += t.idxs.length;
    }

    const { error: snapErr } = await db.from("table_snapshots").upsert(
      {
        table_name: SNAPSHOT_NAME,
        snapshot_date: today,
        payload: batch.map((t) => t.report),
      },
      { onConflict: "table_name,snapshot_date" },
    );
    if (snapErr)
      return NextResponse.json(
        { ok: false, error: `控えを残せなかったので中止しました：${snapErr.message}` },
        { status: 500 },
      );

    // ---- 2. 1枚ずつ読み直して直す ---------------------------------------
    for (const t of batch) {
      const expenses = t.report.expenses.map((e) => ({ ...e }));
      let changed = false;

      for (const i of t.idxs) {
        const item = expenses[i];
        const url = (item.receipt_image_url ?? "").toString().trim();
        const label = (item.description ?? "").toString().trim() || "（説明なし）";
        try {
          const ocr = await readReceipt(url, mediaTypeOf(url));
          const decision = decideReocrFix(item.description, Number(item.amount) || 0, ocr);
          if (decision.action === "fix" && decision.newAmount != null) {
            expenses[i] = {
              ...item,
              amount: decision.newAmount,
              tax_fixed_at: today,
              tax_fixed_from: Number(item.amount) || 0,
              tax_fixed_rate: null,
              tax_fixed_source: "reocr",
            };
            fixed.push({
              date: t.report.date,
              description: label,
              from: Number(item.amount) || 0,
              to: decision.newAmount,
            });
            changed = true;
          } else {
            needsCheck.push({
              date: t.report.date,
              description: label,
              amount: Number(item.amount) || 0,
              reason: decision.reason,
            });
          }
        } catch (e: any) {
          errors.push(`${t.report.date} ${label}：${e?.message || e}`);
        }
      }

      if (!changed) continue;

      const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const { error: upErr } = await db
        .from("daily_reports")
        .update({ expenses, expenses_total: total })
        .eq("id", t.report.id);
      if (upErr) errors.push(`${t.report.date} の保存に失敗：${upErr.message}`);
    }

    const after = await loadTargets(db);
    return NextResponse.json({
      ok: true,
      dryRun: false,
      backupSaved: true,
      backupName: SNAPSHOT_NAME,
      fixedPhotos: fixed.length,
      fixedDiff: fixed.reduce((s, f) => s + (f.to - f.from), 0),
      fixed,
      needsCheck,
      remainingPhotos: after.reduce((s, t) => s + t.idxs.length, 0),
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e), fixed, needsCheck, errors },
      { status: 500 },
    );
  }
}
