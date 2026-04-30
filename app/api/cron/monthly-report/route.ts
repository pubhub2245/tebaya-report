import { NextRequest, NextResponse } from "next/server";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { getCurrentCharacter } from "@/lib/characters";
import {
  generateMonthOutroMessage,
  type MonthlyResult,
} from "@/lib/formatters/characterAI";
import {
  getTeamStatsForPeriod,
  getShiftMonthlyTargetForPeriod,
  monthRange,
} from "@/lib/teamStats";

// 4月（ハニー月）の中止・特殊事情をハードコードで渡す。
// 5月以降は月ごとに別途追加可能。
const KNOWN_CANCELED_DAYS: Record<string, string[]> = {
  "2026-04": ["4/4 雨で中止", "4/16 強風で中止"],
};

export const runtime = "nodejs";
export const maxDuration = 60;

/** JST基準で「今日が月末日か」判定 */
function jstToday(): {
  date: string;
  isLastDay: boolean;
  ym: string;
  y: number;
  m: number;
  d: number;
} {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  // 当月の末日 = (翌月の0日目) の日付
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  return {
    date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    isLastDay: d === lastDayOfMonth,
    ym: `${y}-${String(m).padStart(2, "0")}`,
    y,
    m,
    d,
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = jstToday();
    if (!today.isLastDay) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "今日は月末日ではありません",
        date: today.date,
      });
    }

    const character = getCurrentCharacter();
    if (!character) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `${today.ym} の担当キャラが未設定です`,
      });
    }

    const { start, end } = monthRange(today.ym);
    const [stats, shiftTargetInfo] = await Promise.all([
      getTeamStatsForPeriod(start, end),
      getShiftMonthlyTargetForPeriod(start, end),
    ]);

    const team1 = stats.find((s) => s.unit === 1)!;
    const team2 = stats.find((s) => s.unit === 2)!;
    const other = stats.find((s) => s.unit === null)!;

    const totalSales =
      team1.totalSales + team2.totalSales + other.totalSales;
    const totalReports =
      team1.reportCount + team2.reportCount + other.reportCount;
    const totalTarget =
      team1.totalTarget + team2.totalTarget + other.totalTarget;
    const achievementRate =
      totalTarget > 0
        ? Math.round((totalSales / totalTarget) * 1000) / 10
        : 0;

    const shiftMonthlyTarget = shiftTargetInfo.totalTarget;
    const shortfallAmount = Math.max(0, shiftMonthlyTarget - totalSales);
    const shiftAchievementRate =
      shiftMonthlyTarget > 0
        ? Math.round((totalSales / shiftMonthlyTarget) * 1000) / 10
        : 0;

    // 出店数不足メッセージを動的に生成
    const avgPerReport = totalReports > 0 ? totalSales / totalReports : 0;
    const shortReports =
      avgPerReport > 0 && shortfallAmount > 0
        ? Math.ceil(shortfallAmount / avgPerReport)
        : 0;
    const storeShortageMessage =
      shortfallAmount > 0 && shortReports > 0
        ? `平均単価（¥${Math.round(avgPerReport).toLocaleString()}/件）で計算すると、月間目標達成にはあと約${shortReports}件の出店が必要だった。出店数を増やすには仲間（従業員）を早く集めることが鍵。`
        : "出店数を増やせるよう、仲間（従業員）を早く集めよう。";

    const result: MonthlyResult = {
      totalSales,
      totalReports,
      totalTarget,
      achievementRate,
      team1Sales: team1.totalSales,
      team1Reports: team1.reportCount,
      team2Sales: team2.totalSales,
      team2Reports: team2.reportCount,
      otherSales: other.totalSales,
      otherReports: other.reportCount,
      shiftMonthlyTarget,
      shiftAchievementRate,
      shortfallAmount,
      canceledDays: KNOWN_CANCELED_DAYS[today.ym] || [],
      storeShortageMessage,
    };

    const message = await generateMonthOutroMessage(character, result);
    const sent = await sendLineGroupMessage(message);

    return NextResponse.json({
      success: sent,
      character: { id: character.id, name: character.name, month: character.month },
      result,
      message_preview: message.slice(0, 80),
      error: sent ? undefined : "LINE送信に失敗しました",
    });
  } catch (e: any) {
    console.error("[monthly-report] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
