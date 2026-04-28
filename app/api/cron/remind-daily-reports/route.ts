import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** 日本時間の「今日」をYYYY-MM-DD形式で返す */
function todayJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** 日付を加算 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type MissingEntry = {
  staff_name: string;
  location_name: string;
};

/**
 * 指定日のシフトと日報を照合し、未提出リストを返す
 */
async function getMissingReports(
  targetDate: string,
): Promise<{ missing: MissingEntry[]; total: number; submitted: number }> {
  // 当日のpublishedシフトを取得
  const { data: shifts } = await supabase
    .from("shifts")
    .select("staff_name, locations(name)")
    .eq("date", targetDate)
    .eq("status", "published");

  if (!shifts || shifts.length === 0) {
    return { missing: [], total: 0, submitted: 0 };
  }

  // 当日の日報を取得
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("staff_name")
    .eq("date", targetDate);

  const reportedStaff = new Set(
    (reports || []).map((r) => r.staff_name),
  );

  // 未提出リスト作成
  const missing: MissingEntry[] = [];
  for (const s of shifts) {
    const staffName = s.staff_name || "未定";
    const locName = (s.locations as any)?.name || "不明";

    // 連名チェック: 「かずき&なぎさ」→ かずき と なぎさ それぞれチェック
    if (staffName.includes("&") || staffName.includes("・")) {
      const individuals = staffName
        .split(/[&・]/)
        .map((n: string) => n.trim())
        .filter(Boolean);
      const allSubmitted = individuals.every((name: string) =>
        reportedStaff.has(name),
      );
      if (!allSubmitted) {
        const unsubmitted = individuals.filter(
          (name: string) => !reportedStaff.has(name),
        );
        missing.push({
          staff_name: unsubmitted.join("・"),
          location_name: locName,
        });
      }
    } else {
      if (!reportedStaff.has(staffName)) {
        missing.push({ staff_name: staffName, location_name: locName });
      }
    }
  }

  return {
    missing,
    total: shifts.length,
    submitted: shifts.length - missing.length,
  };
}

export async function GET(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get("mode") || "tonight";

  try {
    if (mode === "yesterday") {
      // ── 管理者向け：昨日の未提出一覧 ──
      const today = todayJST();
      const yesterday = addDays(today, -1);
      const { missing, total, submitted } =
        await getMissingReports(yesterday);

      const [, m, d] = yesterday.split("-");
      const dateLabel = `${parseInt(m)}/${parseInt(d)}`;

      if (total === 0) {
        return NextResponse.json({
          success: true,
          missing_count: 0,
          total,
          submitted,
          message: `${dateLabel} はシフト予定がありません`,
        });
      }

      if (missing.length === 0) {
        const msg = `✅ 昨日（${dateLabel}）の日報：全${total}件提出済みです！`;
        await sendLineGroupMessage(msg);
        return NextResponse.json({
          success: true,
          missing_count: 0,
          total,
          submitted,
          message: "全員提出済み",
        });
      }

      const lines = missing.map(
        (e) => `・${e.staff_name}（${e.location_name}）`,
      );
      const message = [
        `📋 昨日（${dateLabel}）の日報状況`,
        "",
        `提出済み：${submitted}件 / 全${total}件`,
        "",
        "【未提出】",
        ...lines,
        "",
        "確認をお願いします。",
      ].join("\n");

      const sent = await sendLineGroupMessage(message);

      return NextResponse.json({
        success: sent,
        missing_count: missing.length,
        total,
        submitted,
        error: sent ? undefined : "LINE送信に失敗しました",
      });
    } else {
      // ── スタッフ向け：当日の未提出リマインダー ──
      const today = todayJST();
      const { missing, total } = await getMissingReports(today);

      if (total === 0) {
        return NextResponse.json({
          success: true,
          missing_count: 0,
          message: "本日はシフト予定がありません",
        });
      }

      if (missing.length === 0) {
        return NextResponse.json({
          success: true,
          missing_count: 0,
          message: "全員提出済みです",
        });
      }

      const lines = missing.map(
        (e) => `・${e.staff_name}（${e.location_name}）`,
      );
      const message = [
        "⏰ 本日の日報リマインダー",
        "",
        "以下のスタッフはまだ日報が未提出です：",
        "",
        ...lines,
        "",
        "本日中の提出をお願いします！",
      ].join("\n");

      const sent = await sendLineGroupMessage(message);

      return NextResponse.json({
        success: sent,
        missing_count: missing.length,
        total,
        error: sent ? undefined : "LINE送信に失敗しました",
      });
    }
  } catch (e: any) {
    console.error("[remind-daily-reports] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
