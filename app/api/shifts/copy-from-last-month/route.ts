import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const supabase = serverClient();

export async function POST(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { target_month } = await req.json();
    if (!target_month || !/^\d{4}-\d{2}$/.test(target_month)) {
      return NextResponse.json(
        { error: "target_month は YYYY-MM 形式で指定してください" },
        { status: 400 },
      );
    }

    const [yearStr, monthStr] = target_month.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    // 先月を計算
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    // 先月のシフトを取得
    const { data: prevShifts, error: fetchErr } = await supabase
      .from("shifts")
      .select("*")
      .gte("date", `${prevMonthStr}-01`)
      .lte(
        "date",
        `${prevMonthStr}-${new Date(prevYear, prevMonth, 0).getDate()}`,
      )
      .neq("status", "cancelled");

    if (fetchErr) throw fetchErr;
    if (!prevShifts || prevShifts.length === 0) {
      return NextResponse.json({
        success: true,
        copied: 0,
        message: `${prevYear}年${prevMonth}月にシフトデータがありません`,
      });
    }

    // 今月の既存シフトを取得（重複チェック用）
    const lastDay = new Date(year, month, 0).getDate();
    const { data: existingShifts } = await supabase
      .from("shifts")
      .select("date, location_id")
      .gte("date", `${target_month}-01`)
      .lte("date", `${target_month}-${lastDay}`);

    const existingSet = new Set(
      (existingShifts || []).map((s) => `${s.date}_${s.location_id}`),
    );

    // 先月の各シフトについて、同じ曜日の今月の日付にコピー
    const toInsert: any[] = [];

    for (const shift of prevShifts) {
      const prevDate = new Date(shift.date + "T00:00:00");
      const dayOfWeek = prevDate.getDay();
      const weekOfMonth = Math.ceil(prevDate.getDate() / 7);

      // 今月の同じ週・同じ曜日を計算
      const firstOfMonth = new Date(year, month - 1, 1);
      const firstDayOfWeek = firstOfMonth.getDay();

      let diff = dayOfWeek - firstDayOfWeek;
      if (diff < 0) diff += 7;
      let targetDay = 1 + diff + (weekOfMonth - 1) * 7;

      // 月の範囲外なら1週間前に
      if (targetDay > lastDay) {
        targetDay -= 7;
      }
      if (targetDay < 1) continue;

      const targetDateStr = `${target_month}-${String(targetDay).padStart(2, "0")}`;
      const key = `${targetDateStr}_${shift.location_id}`;

      if (existingSet.has(key)) continue;
      existingSet.add(key);

      toInsert.push({
        date: targetDateStr,
        location_id: shift.location_id,
        rank: shift.rank,
        target: shift.target,
        staff_name: shift.staff_name,
        note: null,
        status: "draft",
        planned_open_time: shift.planned_open_time || null,
        planned_close_time: shift.planned_close_time || null,
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        success: true,
        copied: 0,
        message: "コピー対象がありません（全て既に存在するか、対象外です）",
      });
    }

    const { error: insertErr } = await supabase
      .from("shifts")
      .insert(toInsert);
    if (insertErr) throw insertErr;

    return NextResponse.json({
      success: true,
      copied: toInsert.length,
      message: `${toInsert.length}件のシフトをコピーしました（status: draft）`,
    });
  } catch (e: any) {
    console.error("[copy-from-last-month] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
