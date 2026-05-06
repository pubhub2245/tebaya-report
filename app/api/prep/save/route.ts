import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface SaveBody {
  date: string;
  staff_name: string;
  sessions: Array<{
    session_label: string | null;
    start_time: string;
    end_time: string;
    items: Array<{ product_id: string; quantity: number }>;
  }>;
  field_work_minutes: number;
  procurement_minutes: number;
  ordering_minutes: number;
  setup_minutes: number;
  other_minutes: number;
  other_description: string;
  memo: string;
  carryovers: Array<{ product_id: string; quantity: number }>;
}

function nonNeg(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeTime(t: string): string {
  // HH:MM or HH:MM:SS → HH:MM:SS
  if (!t) return "00:00:00";
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return "00:00:00";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "リクエストボディが不正です" },
      { status: 400 },
    );
  }

  // バリデーション
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json(
      { success: false, error: "date は YYYY-MM-DD で必須" },
      { status: 400 },
    );
  }
  if (!body.staff_name || !body.staff_name.trim()) {
    return NextResponse.json(
      { success: false, error: "staff_name は必須" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.sessions) || body.sessions.length === 0) {
    return NextResponse.json(
      { success: false, error: "sessions は最低1件必要" },
      { status: 400 },
    );
  }
  for (let i = 0; i < body.sessions.length; i++) {
    const s = body.sessions[i];
    if (!s.start_time || !s.end_time) {
      return NextResponse.json(
        {
          success: false,
          error: `session #${i + 1}: start_time / end_time は必須`,
        },
        { status: 400 },
      );
    }
    if (normalizeTime(s.start_time) >= normalizeTime(s.end_time)) {
      return NextResponse.json(
        {
          success: false,
          error: `session #${i + 1}: 開始時刻は終了時刻より前にしてください`,
        },
        { status: 400 },
      );
    }
    if (!Array.isArray(s.items) || s.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `session #${i + 1}: 仕込み品目を1件以上入力してください`,
        },
        { status: 400 },
      );
    }
    for (const it of s.items) {
      if (!it.product_id) {
        return NextResponse.json(
          { success: false, error: `session #${i + 1}: 商品が未選択の品目があります` },
          { status: 400 },
        );
      }
      if (nonNeg(it.quantity) < 0) {
        return NextResponse.json(
          { success: false, error: `session #${i + 1}: 数量は0以上の整数` },
          { status: 400 },
        );
      }
    }
  }

  const reportPayload = {
    date: body.date,
    staff_name: body.staff_name.trim(),
    field_work_minutes: nonNeg(body.field_work_minutes),
    procurement_minutes: nonNeg(body.procurement_minutes),
    ordering_minutes: nonNeg(body.ordering_minutes),
    setup_minutes: nonNeg(body.setup_minutes),
    other_minutes: nonNeg(body.other_minutes),
    other_description: (body.other_description ?? "").trim() || null,
    memo: (body.memo ?? "").trim() || null,
  };

  // 1. prep_reports UPSERT
  const { data: reportRow, error: reportErr } = await supabase
    .from("prep_reports")
    .upsert(reportPayload, { onConflict: "date,staff_name" })
    .select("id")
    .single();
  if (reportErr || !reportRow) {
    return NextResponse.json(
      {
        success: false,
        error: `prep_reports UPSERT 失敗: ${reportErr?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }
  const reportId = reportRow.id as string;

  // 2. 既存 sessions を削除（CASCADE で session_items も消える）
  const { error: delErr } = await supabase
    .from("prep_sessions")
    .delete()
    .eq("prep_report_id", reportId);
  if (delErr) {
    return NextResponse.json(
      {
        success: false,
        error: `既存 sessions 削除失敗: ${delErr.message}`,
      },
      { status: 500 },
    );
  }

  // 3. sessions 一括 INSERT
  const sessionPayload = body.sessions.map((s, idx) => ({
    prep_report_id: reportId,
    session_label: (s.session_label ?? "").trim() || null,
    start_time: normalizeTime(s.start_time),
    end_time: normalizeTime(s.end_time),
    display_order: idx,
  }));
  const { data: insertedSessions, error: sessInsErr } = await supabase
    .from("prep_sessions")
    .insert(sessionPayload)
    .select("id, display_order");
  if (sessInsErr || !insertedSessions) {
    return NextResponse.json(
      {
        success: false,
        error: `sessions INSERT 失敗: ${sessInsErr?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }

  // display_order → id のマップを作る（INSERT 順序保証されない場合があるため）
  const sessionByOrder = new Map<number, string>();
  for (const r of insertedSessions as Array<{ id: string; display_order: number }>) {
    sessionByOrder.set(r.display_order, r.id);
  }

  // 4. session_items 一括 INSERT
  const itemPayload: Array<{
    prep_session_id: string;
    product_id: string;
    quantity: number;
  }> = [];
  for (let idx = 0; idx < body.sessions.length; idx++) {
    const sid = sessionByOrder.get(idx);
    if (!sid) continue;
    for (const it of body.sessions[idx].items) {
      itemPayload.push({
        prep_session_id: sid,
        product_id: it.product_id,
        quantity: nonNeg(it.quantity),
      });
    }
  }
  if (itemPayload.length > 0) {
    const { error: itemErr } = await supabase
      .from("prep_session_items")
      .insert(itemPayload);
    if (itemErr) {
      return NextResponse.json(
        {
          success: false,
          error: `session_items INSERT 失敗: ${itemErr.message}`,
        },
        { status: 500 },
      );
    }
  }

  // 5. carryovers UPSERT
  if (Array.isArray(body.carryovers) && body.carryovers.length > 0) {
    const carryoverPayload = body.carryovers
      .filter((c) => c.product_id)
      .map((c) => ({
        date: body.date,
        product_id: c.product_id,
        quantity: nonNeg(c.quantity),
      }));
    if (carryoverPayload.length > 0) {
      const { error: coErr } = await supabase
        .from("prep_carryovers")
        .upsert(carryoverPayload, { onConflict: "date,product_id" });
      if (coErr) {
        return NextResponse.json(
          {
            success: false,
            error: `carryovers UPSERT 失敗: ${coErr.message}`,
          },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    report_id: reportId,
    sessions_count: sessionPayload.length,
    items_count: itemPayload.length,
  });
}
