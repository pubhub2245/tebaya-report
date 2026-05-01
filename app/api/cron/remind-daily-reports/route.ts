import { NextRequest, NextResponse } from "next/server";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { transformWithCurrentCharacter } from "@/lib/formatters/characterTransform";
import { getMissingReportLocations } from "@/lib/reportMissingLocations";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      const { missing, total, submitted, cancelled } =
        await getMissingReportLocations(yesterday);

      const [, m, d] = yesterday.split("-");
      const dateLabel = `${parseInt(m)}/${parseInt(d)}`;

      if (total === 0) {
        return NextResponse.json({
          success: true,
          missing_count: 0,
          total,
          submitted,
          cancelled,
          message: `${dateLabel} はシフト予定がありません`,
        });
      }

      if (missing.length === 0) {
        const cancelSuffix = cancelled > 0 ? `（中止${cancelled}件含む）` : "";
        const msg = `✅ 昨日（${dateLabel}）の日報：全${total}件 提出/中止 完了です！${cancelSuffix}`;
        await sendLineGroupMessage(
          transformWithCurrentCharacter(msg, { context: "report" }),
        );
        return NextResponse.json({
          success: true,
          missing_count: 0,
          total,
          submitted,
          cancelled,
          message: "全員提出済み（中止記録含む）",
        });
      }

      const lines = missing.map(
        (e) => `・${e.location_name}（担当：${e.staff_hint}）`,
      );
      const summaryLine =
        cancelled > 0
          ? `提出済み：${submitted}件 / 中止：${cancelled}件 / 全${total}件`
          : `提出済み：${submitted}件 / 全${total}件`;
      const message = [
        `📋 昨日（${dateLabel}）の日報状況`,
        "",
        summaryLine,
        "",
        "【未提出店舗】",
        ...lines,
        "",
        "確認をお願いします。",
      ].join("\n");

      const sent = await sendLineGroupMessage(
        transformWithCurrentCharacter(message, {
          context: "report",
          isScolding: true,
        }),
      );

      return NextResponse.json({
        success: sent,
        missing_count: missing.length,
        total,
        submitted,
        cancelled,
        error: sent ? undefined : "LINE送信に失敗しました",
      });
    } else {
      // ── スタッフ向け：当日の未提出リマインダー ──
      const today = todayJST();
      const { missing, total, submitted, cancelled } =
        await getMissingReportLocations(today);

      if (total === 0) {
        return NextResponse.json({
          success: true,
          missing_count: 0,
          submitted,
          cancelled,
          message: "本日はシフト予定がありません",
        });
      }

      if (missing.length === 0) {
        return NextResponse.json({
          success: true,
          missing_count: 0,
          submitted,
          cancelled,
          message:
            cancelled > 0
              ? `全員提出済み（中止${cancelled}件含む）`
              : "全員提出済みです",
        });
      }

      const lines = missing.map(
        (e) => `・${e.location_name}（担当：${e.staff_hint}）`,
      );
      const message = [
        "⏰ 本日の日報リマインダー",
        "",
        "以下の店舗はまだ日報が未提出です：",
        "",
        ...lines,
        "",
        "本日中の提出をお願いします！",
      ].join("\n");

      const sent = await sendLineGroupMessage(
        transformWithCurrentCharacter(message, {
          context: "report",
          isScolding: true,
        }),
      );

      return NextResponse.json({
        success: sent,
        missing_count: missing.length,
        total,
        submitted,
        cancelled,
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
