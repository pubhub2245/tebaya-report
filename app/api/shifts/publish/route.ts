import { serverClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = serverClient();

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

// LINE 1通の上限は5000文字
const LINE_MAX_LENGTH = 4900;

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
    const lastDay = new Date(year, month, 0).getDate();

    // draftシフトをpublishedに更新
    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from("shifts")
      .update({
        status: "published",
        published_at: now,
        updated_at: now,
      })
      .eq("status", "draft")
      .gte("date", `${target_month}-01`)
      .lte("date", `${target_month}-${lastDay}`)
      .select();

    if (updateErr) throw updateErr;

    // 該当月の全publishedシフトを取得（通知用）
    const { data: allShifts, error: fetchErr } = await supabase
      .from("shifts")
      .select("*, locations(name)")
      .eq("status", "published")
      .gte("date", `${target_month}-01`)
      .lte("date", `${target_month}-${lastDay}`)
      .order("date", { ascending: true });

    if (fetchErr) throw fetchErr;

    if (!allShifts || allShifts.length === 0) {
      return NextResponse.json({
        success: true,
        published_count: 0,
        message: "確定対象のシフトがありません",
      });
    }

    // 月間サマリー
    const totalTarget = allShifts.reduce(
      (s, sh) => s + (sh.target || 0),
      0,
    );
    const uniqueDates = new Set(allShifts.map((s) => s.date));

    // 担当別出勤日数
    const staffDays = new Map<string, Set<string>>();
    for (const s of allShifts) {
      const name = s.staff_name || "未定";
      if (!staffDays.has(name)) staffDays.set(name, new Set());
      staffDays.get(name)!.add(s.date);
    }
    const staffSorted = Array.from(staffDays.entries())
      .map(([name, dates]) => ({ name, days: dates.size }))
      .sort((a, b) => b.days - a.days);

    // スケジュール（日付別）
    const byDate = new Map<string, typeof allShifts>();
    for (const s of allShifts) {
      const arr = byDate.get(s.date) || [];
      arr.push(s);
      byDate.set(s.date, arr);
    }

    // メッセージ生成
    const header = [
      `📋 ${year}年${month}月のシフトが確定しました`,
      "",
      "━━━━━━━━━━━━━━━━━",
      "■ 月間サマリー",
      `出店件数：${allShifts.length}件`,
      `出店日数：${uniqueDates.size}日`,
      `月間目標：¥${totalTarget.toLocaleString()}`,
      "",
      "■ 担当別出勤日数",
      ...staffSorted.map((s) => `・${s.name}：${s.days}日`),
      "━━━━━━━━━━━━━━━━━",
      "",
      "■ 出店スケジュール",
    ].join("\n");

    const footer = [
      "",
      "━━━━━━━━━━━━━━━━━",
      "詳細はアプリで確認してください！",
      "https://tebaya-report.vercel.app/admin/shifts",
    ].join("\n");

    // スケジュール部分を日付ごとに生成
    const scheduleLines: string[] = [];
    const sortedDates = Array.from(byDate.keys()).sort();
    for (const dateStr of sortedDates) {
      const d = new Date(dateStr + "T00:00:00");
      const dayName = DAY_NAMES[d.getDay()];
      const [, m2, d2] = dateStr.split("-");
      scheduleLines.push(`${parseInt(m2)}/${parseInt(d2)}（${dayName}）`);
      for (const s of byDate.get(dateStr)!) {
        const locName =
          (s.locations as any)?.name || `店舗ID:${s.location_id}`;
        scheduleLines.push(
          `・${locName}（${s.rank}）：${s.staff_name || "未定"}`,
        );
      }
    }

    // メッセージを分割送信
    const messages: string[] = [];
    let current = header + "\n";
    for (const line of scheduleLines) {
      if (current.length + line.length + footer.length + 2 > LINE_MAX_LENGTH) {
        messages.push(current + "\n（続く…）");
        current = `📋 ${year}年${month}月シフト（続き）\n\n`;
      }
      current += line + "\n";
    }
    current += footer;
    messages.push(current);

    // LINE送信
    let allSent = true;
    for (const msg of messages) {
      const sent = await sendLineGroupMessage(msg);
      if (!sent) allSent = false;
    }

    // 通知時刻を記録
    if (allSent) {
      await supabase
        .from("shifts")
        .update({ line_notified_at: now })
        .eq("status", "published")
        .gte("date", `${target_month}-01`)
        .lte("date", `${target_month}-${lastDay}`);
    }

    return NextResponse.json({
      success: allSent,
      published_count: (updated || []).length,
      total_shifts: allShifts.length,
      messages_sent: messages.length,
      error: allSent ? undefined : "一部のLINE送信に失敗しました",
    });
  } catch (e: any) {
    console.error("[shifts/publish] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
