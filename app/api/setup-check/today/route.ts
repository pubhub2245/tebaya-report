import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { inferTeamUnit } from "@/lib/setupCheck/teamUnit";
import type { TodaySetupContext, TodayShiftEntry } from "@/lib/setupCheck/types";

export const runtime = "nodejs";

const supabase = serverClient();

/** JST 当日（YYYY-MM-DD） */
function getTodayJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date") ?? getTodayJST();

  // 1. 当日のシフト取得（中止以外）
  const { data: shifts, error: shiftError } = await supabase
    .from("shifts")
    .select(
      "date, location_id, staff_name, target, rank, status, locations(id, name, target)",
    )
    .eq("date", dateStr)
    .neq("status", "cancelled");

  if (shiftError) {
    return NextResponse.json(
      { error: shiftError.message, date: dateStr, shifts: [] },
      { status: 500 },
    );
  }

  // 2. 各シフトについて部隊判定 + 同部隊前回 setup_check を取得
  const results = await Promise.all(
    (shifts ?? []).map(async (shift: any) => {
      const staffName: string = shift.staff_name ?? "";
      const teamUnit = inferTeamUnit(staffName);

      const { data: lastCheck } = await supabase
        .from("setup_checks")
        .select("register_total, date")
        .eq("team_unit", teamUnit)
        .lt("date", dateStr)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const entry: TodayShiftEntry = {
        date: dateStr,
        location: shift.locations?.name ?? "",
        location_id: shift.location_id ?? null,
        staff_name: staffName,
        team_unit: teamUnit,
        sales_target: shift.target ?? shift.locations?.target ?? null,
        previous_register_total: lastCheck?.register_total ?? null,
        previous_check_date: lastCheck?.date ?? null,
      };
      return entry;
    }),
  );

  const response: TodaySetupContext = { date: dateStr, shifts: results };
  return NextResponse.json(response);
}
