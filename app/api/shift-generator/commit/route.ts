import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { MonthlyShift } from "@/lib/shift-engine/types";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      year: number;
      month: number;
      data: MonthlyShift;
    };
    const { year, month, data } = body;

    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return NextResponse.json(
        { success: false, error: "year/month が不正です" },
        { status: 400 },
      );
    }
    if (!data || !Array.isArray(data.days)) {
      return NextResponse.json(
        { success: false, error: "data.days が不正です" },
        { status: 400 },
      );
    }

    const startDate = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${pad2(month)}-${pad2(lastDay)}`;

    // 1. INSERT 用レコード組み立て（事前にバリデーション）
    const records: Array<{
      date: string;
      location_id: number;
      rank: string | null;
      target: number | null;
      staff_name: string | null;
      note: string | null;
      status: string;
      planned_open_time: string | null;
      planned_close_time: string | null;
    }> = [];
    const skipped: string[] = [];

    for (const day of data.days) {
      for (const store of day.stores) {
        if (!store.locationId) {
          skipped.push(`${day.date}: ${store.storeName}（locations未解決）`);
          continue;
        }
        records.push({
          date: day.date,
          location_id: store.locationId,
          rank: store.rank,
          target: store.target,
          staff_name: store.staffName,
          note: store.note,
          status: "draft",
          planned_open_time: null,
          planned_close_time: null,
        });
      }
    }

    if (records.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "INSERT対象のレコードがありません",
          skipped,
        },
        { status: 400 },
      );
    }

    // 2. 既存draftを削除（条件: status=draft かつ 当該月）
    const { data: deletedRows, error: deleteError } = await supabase
      .from("shifts")
      .delete()
      .eq("status", "draft")
      .gte("date", startDate)
      .lte("date", endDate)
      .select();

    if (deleteError) {
      return NextResponse.json(
        {
          success: false,
          error: `既存draft削除失敗: ${deleteError.message}`,
        },
        { status: 500 },
      );
    }

    // 3. 新規 INSERT
    const { data: insertedRows, error: insertError } = await supabase
      .from("shifts")
      .insert(records)
      .select();

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: `INSERT失敗: ${insertError.message}`,
          deleted: deletedRows?.length ?? 0,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      inserted: insertedRows?.length ?? 0,
      deleted: deletedRows?.length ?? 0,
      skipped,
    });
  } catch (error) {
    console.error("[shift-generator/commit]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "DB登録に失敗しました",
      },
      { status: 500 },
    );
  }
}
