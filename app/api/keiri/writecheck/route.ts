import { NextResponse } from "next/server";

import { CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { cashCountPathOf, pressesNeeded } from "@/lib/keiri/cashCountPress";
import {
  cashWriteProbeNotMeasurable,
  decideCashWriteProbe,
} from "@/lib/keiri/cashWriteProbe";
import { probeWarehouseAlive } from "@/lib/keiri/warehouseAlive";
import { anonClient } from "@/lib/supabaseServer";
import { applyTenantScope, TEBAYA_SCOPE } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/writecheck
 *
 * 「じゅんが金庫を数えて押したとき、その1回は本当に残せるか」を、
 * **押してもらう前に**外から1回で確かめる窓口（f1-4・kp245）。
 *
 * ■ 但し書き（checkWindow.ts の「読むだけ」の決まりの例外・/api/keiri/diagnose と同じ筋）
 *   ここは **GET** ですが、1か所だけ書き込みます。
 *   **いま入っているおまけ欄を読み、まったく同じ中身をそのまま書き戻すだけ**です。
 *   ・中身は1文字も変わりません（行も増えません）
 *   ・金額は1円も作らず、1円も直しません
 *   ・返すのは ○× と「変わった行の数」だけで、
 *     おまけ欄の中身・本物の金額・お店の名前・鍵の値は**1文字も返しません**
 *
 * ■ なぜブラウザと同じ鍵で聞くのか
 *   じゅんが押すのは**ブラウザ**です。サーバー側の鍵で確かめると、
 *   鍵の決まりを飛び越えて「残せます」と答えてしまいます。
 *   ここは必ず anonClient（表に出ている鍵）だけを使います。
 *
 * ■ 絞り方は画面より1段きつくしています（わざと）
 *   画面の書き込みは業態コードだけで絞りますが、ここは印（tenant_id が空＝手羽屋）でも
 *   絞ります。＝ ここで「残せます」と出たなら、画面の書き込みは必ず通ります
 *   （逆に、ここが0行で画面が通る形は、手羽屋の行に印が付いているときだけで、
 *   それ自体が先に直すべきことです）。
 */
export async function GET() {
  try {
    const db = anonClient({ fresh: true });

    // ⓪ 対照：そもそも倉庫が読めているか（眠っている日に「残せません」と言わないため）
    const warehouse = await probeWarehouseAlive(db as never);
    if (!warehouse.alive) {
      return json({
        ...cashWriteProbeNotMeasurable(warehouse.reason),
        warehouse: { alive: false, state: warehouse.state, reason: warehouse.reason },
      });
    }

    // ① いま入っているおまけ欄を読む（**中身は返しません**）
    const settings = () => (db as any).from("keiri_settings");
    const readQuery = settings().select("memo").eq("business_type_code", CASE_BUSINESS_CODE);
    const { data: row, error: readError } = await applyTenantScope<any>(
      readQuery,
      TEBAYA_SCOPE,
    ).maybeSingle();

    if (readError) {
      return json({
        ...cashWriteProbeNotMeasurable("経理の設定を読めませんでした"),
        warehouse: { alive: true, state: warehouse.state, reason: warehouse.reason },
      });
    }

    const rowFound = !!row;
    let errorMessage: string | null = null;
    let changedRows: number | null = null;

    if (rowFound) {
      // ② **まったく同じ中身**を書き戻す（1文字も変わりません）
      const same = (row as { memo?: string | null })?.memo ?? null;
      const writeQuery = settings()
        .update({ memo: same })
        .eq("business_type_code", CASE_BUSINESS_CODE);
      const { data: changed, error } = await applyTenantScope<any>(
        writeQuery,
        TEBAYA_SCOPE,
      ).select("business_type_code");
      errorMessage = error ? error.message : null;
      changedRows = Array.isArray(changed) ? changed.length : null;
    }

    const probe = decideCashWriteProbe({ rowFound, errorMessage, changedRows });
    const place = cashCountPathOf(true);

    return json({
      ...probe,
      warehouse: { alive: true, state: warehouse.state, reason: warehouse.reason },
      place,
      presses: pressesNeeded(true),
      next: probe.safeToPress
        ? "/keiri の「🔐 金庫を数えて、合っているか見る」に、いま金庫にある現金を1回 入れてください（1分・押すのは1回だけ）"
        : "じゅんに押してもらう前に、こちら側で残せない原因を直します",
    });
  } catch (e) {
    return json(
      cashWriteProbeNotMeasurable(
        e instanceof Error ? "下見のとちゅうで止まりました" : "下見のとちゅうで止まりました",
      ),
    );
  }
}

function json(body: Record<string, unknown>) {
  return NextResponse.json(
    stampCheckWindow({
      check: "f1-4",
      what:
        "じゅんが金庫を数えて押したとき、その1回が本当に控えに残せるか（押す前の下見）",
      ...body,
      note:
        "いま入っているのと**同じ中身をそのまま書き戻す**だけの下見です" +
        "（中身は1文字も変わらず、行も増えません）。" +
        "おまけ欄の中身・本物の金額・お店の名前・鍵の値は1文字も返しません。" +
        "ブラウザに配られている鍵だけで聞いているので、じゅんが押すときと同じ答えです。",
    }),
    { headers: CHECK_WINDOW_HEADERS },
  );
}
