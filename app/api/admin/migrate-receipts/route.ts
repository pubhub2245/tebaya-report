import { NextRequest, NextResponse } from "next/server";
import { serviceClient, serviceKeyProblem } from "@/lib/backup";
import { migrateReceipts } from "@/lib/receiptMigration";

/**
 * 昔の日報に埋め込まれたレシート写真を、写真の置き場（Storage）へ引っ越す窓口。
 *
 * - GET  : 下見だけ。何件・何枚・何MBが対象かを返す。何も書き換えない。
 * - POST : 実際に引っ越す。1回で limit 件（既定5件）ずつ。
 *
 * 書き換える前に必ず「引っ越し前の控え」を残す（残せなければ中止する）。
 * 何度実行しても、すでに引っ越し済みの写真には手を触れない。
 *
 * このAPIは service_role キーを使う（写真の置き場に書き込むために必要）。
 * 未設定のときは何もせずその旨を返す。
 */

export const runtime = "nodejs";
export const maxDuration = 60;

function isAdmin(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/, "")
    .trim();
  if (!token) return false;
  const required = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
  return (
    (!!required && token === required) ||
    (!!process.env.ADMIN_PASSWORD && token === process.env.ADMIN_PASSWORD) ||
    (!!process.env.CRON_SECRET && token === process.env.CRON_SECRET)
  );
}

function noServiceKey() {
  return NextResponse.json(
    {
      ok: false,
      error:
        `SUPABASE_SERVICE_ROLE_KEY が${serviceKeyProblem()}ため実行できません（Vercelの環境変数を確認してください）`,
    },
    { status: 500 },
  );
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  }
  const db = serviceClient();
  if (!db) return noServiceKey();
  return NextResponse.json(await migrateReceipts(db, { dryRun: true }));
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  }
  const db = serviceClient();
  if (!db) return noServiceKey();

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 5;

  return NextResponse.json(await migrateReceipts(db, { limit }));
}
