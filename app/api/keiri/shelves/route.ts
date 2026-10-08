import { NextResponse } from "next/server";

import { serverClient, serviceClientOrNull } from "@/lib/supabaseServer";
import {
  describeShelf,
  summarizeShelves,
  SHELF_STEPS,
  type ShelfProbe,
  type ShelfReport,
} from "@/lib/keiri/shelves";
import { CHECK_WINDOW_HEADERS } from "@/lib/keiri/checkWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/shelves
 *
 * 倉庫に流す「貼り紙」（/keiri/sql）が本番で流れたかを、**読むだけ**で確かめる窓口。
 *
 * ■ なぜ要るのか（2026-10-05・kp237）
 *   棚が無いせいで止まっている仕事が3つあり（金庫の突き合わせ・重なりの片付け・
 *   レシート写真の読み取り）、流せるのは倉庫の画面を開ける じゅんだけです。
 *   「流したかどうか」を人の記憶に頼ると、同じお願いが何度も立ちます。
 *   ここを開けば、こちら側から1回で分かります。
 *
 * ★ 1行も書き込みません。中身（金額・お店の名前・連絡先）は1文字も返しません。
 * ★ 鍵・合言葉の値は返しません。
 * ★ 手羽屋の日報・シフト・レジ・LINE には一切触れていません。
 */

/** その棚（または欄）が1行 読めるかだけを見る。中身は捨てる */
async function probe(table: string, column: string): Promise<ShelfProbe> {
  try {
    const db = serviceClientOrNull({ fresh: true }) ?? serverClient({ fresh: true });
    const { error } = await db.from(table).select(column).limit(1);
    if (!error) return { ok: true };
    return { ok: false, code: error.code ?? null, message: error.message ?? null };
  } catch {
    return { ok: false, code: null, message: "通信に失敗しました" };
  }
}

export async function GET() {
  const [cash, ignores, receiptFlag, advanceTenant, shiftsTenant] = await Promise.all([
    probe("keiri_cash_events", "id"),
    probe("keiri_expense_ignores", "id"),
    probe("keiri_reports", "receipt_count"),
    probe("advance_expenses", "tenant_id"),
    probe("shifts", "tenant_id"),
  ]);

  const probes: Record<string, ShelfProbe> = {
    cash_events: cash,
    expense_ignores: ignores,
    receipt_flag: receiptFlag,
    advance_tenant: advanceTenant,
    shifts_tenant: shiftsTenant,
  };

  const reports: ShelfReport[] = SHELF_STEPS.map((s) =>
    describeShelf(
      { step: s.step, name: s.name, benefit: s.benefit, check: s.check },
      probes[s.key] ?? { ok: false, message: "確かめていません" },
    ),
  );

  const summary = summarizeShelves(reports);

  return jsonWindow({
    ...summary,
    sheet: "/keiri/sql",
    file: "supabase/migrations/keiri_shelves_20261005.sql",
    shelves: reports,
    // 申し込みの控えの決まり（貼り紙の0番）は、ここではなく診断の窓口で分かる
    applications_policy: {
      where: "/api/keiri/diagnose",
      note: "申し込みの控えが残るかは records.applications に出ます（この窓口では見ません）",
    },
  });
}

/** 窓口の返事（保存させない・検索結果には載せない。lib/keiri/checkWindow.ts） */
function jsonWindow(body: unknown): NextResponse {
  return NextResponse.json(body, { status: 200, headers: CHECK_WINDOW_HEADERS });
}
