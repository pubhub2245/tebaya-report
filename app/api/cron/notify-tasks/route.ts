import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLineGroupMessage } from "@/lib/line/sendMessage";
import { transformWithCurrentCharacter } from "@/lib/formatters/characterTransform";

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

/** 日付を1日進める */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const PRIORITY_LABEL: Record<string, string> = {
  high: "高",
  normal: "中",
  low: "低",
};

export async function GET(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayJST();
  const tomorrow = addDays(today, 1);
  const errors: string[] = [];
  let reminderCount = 0;
  let overdueCount = 0;

  try {
    // ── リマインダー通知（期限が明日のタスク）──
    const { data: reminderTasks, error: remErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("status", "pending")
      .eq("due_date", tomorrow)
      .eq("line_notified_reminder", false);

    if (remErr) {
      errors.push(`リマインダー取得エラー: ${remErr.message}`);
    } else if (reminderTasks && reminderTasks.length > 0) {
      const lines = reminderTasks.map(
        (t) =>
          `・${t.title}（${t.assignee || "未割当"} / 優先度:${PRIORITY_LABEL[t.priority] || t.priority}）`,
      );
      const message = [
        "📋 【タスクリマインダー】",
        `明日（${tomorrow}）が期限のタスクが ${reminderTasks.length}件 あります：`,
        "",
        ...lines,
        "",
        "期限内に完了させましょう！",
      ].join("\n");

      const sent = await sendLineGroupMessage(
        transformWithCurrentCharacter(message, { context: "task" }),
      );
      if (sent) {
        // 通知済みフラグを更新
        const ids = reminderTasks.map((t) => t.id);
        await supabase
          .from("tasks")
          .update({ line_notified_reminder: true })
          .in("id", ids);
        reminderCount = reminderTasks.length;
      } else {
        errors.push("リマインダーLINE送信失敗");
      }
    }

    // ── 期限超過通知（期限が今日より前で未完了）──
    const { data: overdueTasks, error: ovErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("status", "pending")
      .lt("due_date", today)
      .eq("line_notified_overdue", false);

    if (ovErr) {
      errors.push(`期限超過取得エラー: ${ovErr.message}`);
    } else if (overdueTasks && overdueTasks.length > 0) {
      const lines = overdueTasks.map((t) => {
        const daysOver = Math.round(
          (new Date(today + "T00:00:00").getTime() -
            new Date(t.due_date + "T00:00:00").getTime()) /
            (24 * 3600 * 1000),
        );
        return `・${t.title}（${t.assignee || "未割当"} / ${daysOver}日超過 / 優先度:${PRIORITY_LABEL[t.priority] || t.priority}）`;
      });
      const message = [
        "🚨 【期限超過タスク】",
        `期限を過ぎた未完了タスクが ${overdueTasks.length}件 あります：`,
        "",
        ...lines,
        "",
        "至急対応をお願いします！",
      ].join("\n");

      const sent = await sendLineGroupMessage(
        transformWithCurrentCharacter(message, { context: "task" }),
      );
      if (sent) {
        const ids = overdueTasks.map((t) => t.id);
        await supabase
          .from("tasks")
          .update({ line_notified_overdue: true })
          .in("id", ids);
        overdueCount = overdueTasks.length;
      } else {
        errors.push("期限超過LINE送信失敗");
      }
    }

    // ── 昨日の日報未提出チェック ──
    let reportMissingCount = 0;
    const yesterday = addDays(today, -1);
    try {
      const { data: shifts } = await supabase
        .from("shifts")
        .select("staff_name, locations(name)")
        .eq("date", yesterday)
        .eq("status", "published");

      if (shifts && shifts.length > 0) {
        const { data: reports } = await supabase
          .from("daily_reports")
          .select("staff_name")
          .eq("date", yesterday);

        const reportedStaff = new Set(
          (reports || []).map((r: any) => r.staff_name),
        );

        const missing: { staff: string; location: string }[] = [];
        for (const s of shifts) {
          const staffName = s.staff_name || "未定";
          const locName = (s.locations as any)?.name || "不明";
          if (staffName.includes("&") || staffName.includes("・")) {
            const individuals = staffName
              .split(/[&・]/)
              .map((n: string) => n.trim())
              .filter(Boolean);
            const unsubmitted = individuals.filter(
              (name: string) => !reportedStaff.has(name),
            );
            if (unsubmitted.length > 0) {
              missing.push({
                staff: unsubmitted.join("・"),
                location: locName,
              });
            }
          } else if (!reportedStaff.has(staffName)) {
            missing.push({ staff: staffName, location: locName });
          }
        }

        if (missing.length > 0) {
          const [, m, d] = yesterday.split("-");
          const dateLabel = `${parseInt(m)}/${parseInt(d)}`;
          const submitted = shifts.length - missing.length;
          const lines = missing.map(
            (e) => `・${e.staff}（${e.location}）`,
          );
          const message = [
            `📋 昨日（${dateLabel}）の日報状況`,
            "",
            `提出済み：${submitted}件 / 全${shifts.length}件`,
            "",
            "【未提出】",
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
          if (sent) reportMissingCount = missing.length;
          else errors.push("日報未提出LINE送信失敗");
        }
      }
    } catch (e: any) {
      errors.push(`日報未提出チェックエラー: ${e?.message || e}`);
    }

    return NextResponse.json({
      success: errors.length === 0,
      reminder_count: reminderCount,
      overdue_count: overdueCount,
      report_missing_count: reportMissingCount,
      today,
      tomorrow,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[notify-tasks] エラー:", e);
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
