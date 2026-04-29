import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { getCurrentCharacter } from "@/lib/characters";
import {
  generateMonthIntroMessage,
  type MonthlyTarget,
} from "@/lib/formatters/characterAI";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** JST基準のYYYY-MM-DDと月初判定 */
function jstToday(): { date: string; isFirstDay: boolean; ym: string } {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return {
    date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    isFirstDay: d === 1,
    ym: `${y}-${String(m).padStart(2, "0")}`,
  };
}

async function fetchMonthlyTarget(ym: string): Promise<MonthlyTarget> {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${ym}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("shifts")
    .select("target")
    .eq("status", "published")
    .gte("date", start)
    .lte("date", end);

  if (error) {
    console.error("[monthly-greeting] shift取得エラー:", error);
    return { shiftCount: 0, totalSalesTarget: 0 };
  }

  const list = data || [];
  const totalSalesTarget = list.reduce(
    (s, r: any) => s + (r.target || 0),
    0,
  );
  return { shiftCount: list.length, totalSalesTarget };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = jstToday();
    if (!today.isFirstDay) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "今日は月初（1日）ではありません",
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

    const target = await fetchMonthlyTarget(today.ym);
    const message = await generateMonthIntroMessage(character, target);
    const sent = await sendLineGroupMessage(message);

    return NextResponse.json({
      success: sent,
      character: { id: character.id, name: character.name, month: character.month },
      target,
      message_preview: message.slice(0, 80),
      error: sent ? undefined : "LINE送信に失敗しました",
    });
  } catch (e: any) {
    console.error("[monthly-greeting] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
