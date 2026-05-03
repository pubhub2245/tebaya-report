import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateCashTotal } from "@/lib/setupCheck/cashCalculator";
import { generateLineText } from "@/lib/setupCheck/lineTextGenerator";
import { inferTeamUnit } from "@/lib/setupCheck/teamUnit";
import type {
  CashCoinCounts,
  SetupCheckRecord,
} from "@/lib/setupCheck/types";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface CreateBody {
  date: string;
  location: string;
  location_id: number | null;
  staff_name: string;
  team_unit?: 1 | 2;
  register_coins: CashCoinCounts;
  sales_target: number | null;
  sns_posted: boolean;
  note?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    // バリデーション
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json(
        { success: false, error: "date は YYYY-MM-DD で必須" },
        { status: 400 },
      );
    }
    if (!body.location || !body.staff_name) {
      return NextResponse.json(
        { success: false, error: "location / staff_name は必須" },
        { status: 400 },
      );
    }
    if (!body.register_coins || typeof body.register_coins !== "object") {
      return NextResponse.json(
        { success: false, error: "register_coins が不正" },
        { status: 400 },
      );
    }

    // 重複登録防止: (date, location, staff_name) で既存レコードがあれば 409
    const { data: existing, error: checkError } = await supabase
      .from("setup_checks")
      .select("id")
      .eq("date", body.date)
      .eq("location", body.location)
      .eq("staff_name", body.staff_name)
      .maybeSingle();

    if (checkError) {
      console.error("[setup-check/create] 重複チェック失敗:", checkError);
      return NextResponse.json(
        { success: false, error: "重複チェック中にエラーが発生しました" },
        { status: 500 },
      );
    }

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "DUPLICATE",
          message:
            "この日・この店舗・このスタッフの設営チェックは既に登録されています。",
        },
        { status: 409 },
      );
    }

    const team_unit: 1 | 2 = body.team_unit ?? inferTeamUnit(body.staff_name);
    const register_total = calculateCashTotal(body.register_coins);

    // 同部隊・指定日より前の前回 setup_check
    const { data: lastCheck } = await supabase
      .from("setup_checks")
      .select("register_total, date")
      .eq("team_unit", team_unit)
      .lt("date", body.date)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previous_register_total = lastCheck?.register_total ?? null;
    const cash_diff =
      previous_register_total !== null
        ? register_total - previous_register_total
        : null;

    // INSERT 用レコード（型計算用）
    const baseRecord: SetupCheckRecord = {
      date: body.date,
      location: body.location,
      location_id: body.location_id ?? null,
      staff_name: body.staff_name,
      team_unit,
      register_coins: body.register_coins,
      register_total,
      previous_register_total,
      previous_check_date: lastCheck?.date ?? null,
      cash_diff,
      sales_target: body.sales_target ?? null,
      sns_posted: !!body.sns_posted,
      note: (body.note ?? "").trim(),
      line_posted_at: null,
      line_text: null,
    };

    const line_text = generateLineText(baseRecord);

    const { data, error } = await supabase
      .from("setup_checks")
      .insert({ ...baseRecord, line_text })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[setup-check/create]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "作成に失敗しました",
      },
      { status: 500 },
    );
  }
}
