import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { getCurrentCharacter, getCharacterByMonth } from "@/lib/characters";
import {
  generateMonthIntroMessage,
  generateMonthOutroMessage,
  type MonthlyTarget,
  type MonthlyResult,
} from "@/lib/formatters/characterAI";
import {
  getTeamStatsForPeriod,
  getShiftMonthlyTargetForPeriod,
  monthRange,
  currentYM,
} from "@/lib/teamStats";

const KNOWN_CANCELED_DAYS: Record<string, string[]> = {
  "2026-04": ["4/4 雨で中止", "4/16 強風で中止"],
};

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "tebaya2026";

async function fetchMonthlyTarget(ym: string): Promise<MonthlyTarget> {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${ym}-${String(lastDay).padStart(2, "0")}`;
  const { data } = await supabase
    .from("shifts")
    .select("target")
    .eq("status", "published")
    .gte("date", start)
    .lte("date", end);
  const list = data || [];
  return {
    shiftCount: list.length,
    totalSalesTarget: list.reduce((s, r: any) => s + (r.target || 0), 0),
  };
}

async function fetchMonthlyResult(ym: string): Promise<MonthlyResult> {
  const { start, end } = monthRange(ym);
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
  const avgPerReport = totalReports > 0 ? totalSales / totalReports : 0;
  const averageUnitPrice = Math.round(avgPerReport);
  const requiredMonthlyReports =
    avgPerReport > 0 && shiftMonthlyTarget > 0
      ? Math.ceil(shiftMonthlyTarget / avgPerReport)
      : 0;
  const monthlyScaleGap = Math.max(
    0,
    requiredMonthlyReports - totalReports,
  );
  const storeShortageMessage =
    avgPerReport > 0 && requiredMonthlyReports > 0
      ? `月間目標¥${shiftMonthlyTarget.toLocaleString()}達成のためには、平均単価¥${averageUnitPrice.toLocaleString()}/件を維持した上で月${requiredMonthlyReports}件規模の出店が必要。今月は${totalReports}件だったので、月間の総出店規模としては${monthlyScaleGap}件くらい増やしたい。出店日を増やすには仲間（働いてくれる人）を早く集めることが鍵。`
      : "出店数を増やせるよう、仲間（従業員）を早く集めよう。";
  return {
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
    averageUnitPrice,
    requiredMonthlyReports,
    monthlyScaleGap,
    canceledDays: KNOWN_CANCELED_DAYS[ym] || [],
    storeShortageMessage,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = body.password || req.headers.get("x-admin-password");
    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = body.type as "intro" | "outro";
    if (type !== "intro" && type !== "outro") {
      return NextResponse.json(
        { error: "type は 'intro' または 'outro'" },
        { status: 400 },
      );
    }
    const dryRun = body.dryRun !== false; // デフォルトtrue（送信しない）

    // monthOverride で任意の月のキャラをテスト可能（番号 1-12）
    const monthOverride =
      typeof body.month === "number" ? body.month : null;
    const character =
      monthOverride !== null
        ? getCharacterByMonth(monthOverride)
        : getCurrentCharacter();
    if (!character) {
      return NextResponse.json({
        error: `キャラが見つかりません (month=${monthOverride ?? "current"})`,
      });
    }

    const ym = body.ym || currentYM();

    let message: string;
    let inputData: any;

    if (type === "intro") {
      const target = await fetchMonthlyTarget(ym);
      inputData = target;
      message = await generateMonthIntroMessage(character, target);
    } else {
      const result = await fetchMonthlyResult(ym);
      inputData = result;
      message = await generateMonthOutroMessage(character, result);
    }

    let sent: boolean | null = null;
    if (!dryRun) {
      sent = await sendLineGroupMessage(message);
    }

    return NextResponse.json({
      success: true,
      type,
      dryRun,
      sent,
      character: {
        id: character.id,
        name: character.name,
        month: character.month,
      },
      ym,
      input: inputData,
      message,
    });
  } catch (e: any) {
    console.error("[test-monthly] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
