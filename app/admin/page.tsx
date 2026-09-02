"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate } from "@/lib/format";
import { fetchStaffWages, makeLaborFor, type StaffWageMap } from "@/lib/staffWage";
import {
  calcActualProfit,
  calcGrossProfit,
  calcTakeHome,
  expensesTotalOf,
} from "@/lib/money";
import MonthlyDashboard from "@/app/components/MonthlyDashboard";
import AchievementRateDashboard from "@/app/components/AchievementRateDashboard";
import MonthlyLimitedProductManager from "@/app/components/MonthlyLimitedProductManager";
import FeedbackBoxAdmin from "@/app/components/FeedbackBoxAdmin";
import PrepProductManager from "@/app/components/PrepProductManager";
import PrepReportDashboard from "@/app/components/PrepReportDashboard";
import PrepSettingsManager from "@/app/components/PrepSettingsManager";
import LineDiagnostics from "@/app/components/LineDiagnostics";
import SystemHealthPanel from "@/app/components/SystemHealthPanel";
import EditReportModal from "@/app/components/EditReportModal";
import ReceiptMigrationPanel from "@/app/components/ReceiptMigrationPanel";
import ReceiptReocrPanel from "@/app/components/ReceiptReocrPanel";
import AdminGate from "@/app/components/AdminGate";

type Report = {
  id: string;
  date: string;
  location: string;
  staff_name: string;
  shop: string | null;
  sales_amount: number;
  register_diff: number | null;
  labor: number | null;
  /** 経費の合計（DB側で自動計算）。明細＝レシート写真は取得しない */
  expenses_total: number | null;
};

type Alert = {
  staff: string;
  date1: string;
  amount1: number;
  date2: string;
  amount2: number;
};

type Interim = {
  id: string;
  created_at: string;
  location: string;
  rank: string;
  staff_name: string;
  report_hour: number;
  current_sales: number;
  target_at_hour: number;
  difference: number;
  achievement_rate: number;
};

/** 粗利（推定）。計算は lib/money.ts に集約（tests/money.test.ts で検証済み） */
const calcProfit = (sales: number, labor: number) =>
  calcGrossProfit(sales, labor).profit;

/** 日当。日報に入っていればそれ、無ければスタッフマスタの標準日当 */
const reportLaborWith =
  (laborFor: (s: string) => number) =>
  (r: Pick<Report, "labor" | "staff_name">) =>
    r.labor ?? laborFor(r.staff_name);

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  // 日当はスタッフマスタが正。マスタに無い人だけコード側の保険値を使う
  const [staffWages, setStaffWages] = useState<StaffWageMap>(new Map());
  const reportLabor = useMemo(
    () => reportLaborWith(makeLaborFor(staffWages)),
    [staffWages]
  );
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Report | null>(null);
  const [interims, setInterims] = useState<Interim[]>([]);
  const [interimRange, setInterimRange] = useState<"today" | "week">("today");
  const [notifyingWeather, setNotifyingWeather] = useState(false);
  const [weatherResult, setWeatherResult] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);
  const [remindingYesterday, setRemindingYesterday] = useState(false);
  const [yesterdayResult, setYesterdayResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const since = new Date(now);
      if (interimRange === "today") {
        since.setHours(0, 0, 0, 0);
      } else {
        since.setDate(since.getDate() - 7);
        since.setHours(0, 0, 0, 0);
      }
      const { data, error } = await supabase
        .from("interim_reports")
        .select(
          "id, created_at, location, rank, staff_name, report_hour, current_sales, target_at_hour, difference, achievement_rate"
        )
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (!error) setInterims((data as Interim[]) || []);
    })();
  }, [interimRange]);

  const handleDelete = async (r: Report) => {
    if (
      !confirm(
        `この日報を削除しますか？\n${slashDate(r.date)} / ${r.location} / ${r.staff_name}`
      )
    )
      return;
    setDeletingId(r.id);
    try {
      const { error } = await supabase
        .from("daily_reports")
        .delete()
        .eq("id", r.id);
      if (error) throw error;
      setReports((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message || e));
    } finally {
      setDeletingId(null);
    }
  };

  // スタッフマスタの日当を読み込む（日当を変えたいときは管理画面のマスタを直す）
  useEffect(() => {
    fetchStaffWages().then(setStaffWages);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [recentRes, allRes] = await Promise.all([
          supabase
            .from("daily_reports")
            .select(
              "id, date, location, staff_name, shop, sales_amount, register_diff, labor, expenses_total"
            )
            .order("date", { ascending: false })
            .limit(30),
          supabase
            .from("daily_reports")
            .select("date, staff_name, register_diff")
            .order("date", { ascending: true }),
        ]);
        if (recentRes.error) throw recentRes.error;
        if (allRes.error) throw allRes.error;
        setReports((recentRes.data as Report[]) || []);

        const byStaff = new Map<
          string,
          { date: string; register_diff: number | null }[]
        >();
        ((allRes.data as any[]) || []).forEach((r) => {
          const arr = byStaff.get(r.staff_name) || [];
          arr.push({ date: r.date, register_diff: r.register_diff });
          byStaff.set(r.staff_name, arr);
        });
        const found: Alert[] = [];
        byStaff.forEach((rows, staff) => {
          for (let i = 0; i < rows.length - 1; i++) {
            const a = rows[i];
            const b = rows[i + 1];
            if ((a.register_diff ?? 0) < 0 && (b.register_diff ?? 0) < 0) {
              found.push({
                staff,
                date1: a.date,
                amount1: a.register_diff as number,
                date2: b.date,
                amount2: b.register_diff as number,
              });
            }
          }
        });
        setAlerts(found);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const monthStats = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startIso = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const endDate = new Date(y, m + 1, 0).getDate();
    const endIso = `${y}-${String(m + 1).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
    const inMonth = reports.filter(
      (r) => r.date >= startIso && r.date <= endIso
    );
    const sales = inMonth.reduce(
      (s, r) => s + (r.sales_amount || 0),
      0
    );
    const profit = inMonth.reduce(
      (s, r) => s + calcProfit(r.sales_amount || 0, reportLabor(r)),
      0
    );
    const takeHome = inMonth.reduce(
      (s, r) => s + calcTakeHome(r.sales_amount || 0, expensesTotalOf(r)),
      0
    );
    // 実績粗利：推定（食材25%・場代10%）を使わず、実際にレジから払った経費で計算する
    const actualProfit = inMonth.reduce(
      (s, r) =>
        s +
        calcActualProfit(
          r.sales_amount || 0,
          reportLabor(r),
          expensesTotalOf(r)
        ).profit,
      0
    );
    return {
      sales,
      profit,
      actualProfit,
      takeHome,
      count: inMonth.length,
      label: `${y}年${m + 1}月`,
    };
  }, [reports, reportLabor]);

  const handleWeatherNotify = async () => {
    if (
      !confirm(
        "翌日の天気予報をLINEグループに送信しますか？"
      )
    )
      return;
    setNotifyingWeather(true);
    setWeatherResult(null);
    try {
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET;
      const response = await fetch("/api/cron/notify-weather", {
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      });
      const data = await response.json();
      if (data.skipped) {
        setWeatherResult(`✅ ${data.message}`);
      } else if (data.success) {
        const f = data.forecast;
        setWeatherResult(
          `✅ 通知完了！ ${f.weather} / ${f.tempMin}℃〜${f.tempMax}℃ / 風速最大${f.windSpeedMax}m/s`
        );
      } else {
        setWeatherResult(
          `❌ エラー: ${data.error || "不明"}${data.details ? `\n詳細: ${data.details}` : ""}`
        );
      }
    } catch (e: any) {
      setWeatherResult(`❌ 通信エラー: ${e?.message || String(e)}`);
    } finally {
      setNotifyingWeather(false);
    }
  };

  const handleRemindTonight = async () => {
    if (!confirm("未提出スタッフへのリマインダーをLINEグループに送信しますか？"))
      return;
    setReminding(true);
    setReminderResult(null);
    try {
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET;
      const res = await fetch("/api/cron/remind-daily-reports", {
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        setReminderResult(
          data.missing_count > 0
            ? `✅ 送信完了！ 未提出：${data.missing_count}件`
            : `✅ ${data.message || "全員提出済みです"}`,
        );
      } else {
        setReminderResult(`❌ ${data.error || data.message || "送信失敗"}`);
      }
    } catch (e: any) {
      setReminderResult(`❌ 通信エラー: ${e?.message || e}`);
    } finally {
      setReminding(false);
    }
  };

  const handleRemindYesterday = async () => {
    if (!confirm("昨日の日報未提出一覧をLINEグループに送信しますか？")) return;
    setRemindingYesterday(true);
    setYesterdayResult(null);
    try {
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET;
      const res = await fetch("/api/cron/remind-daily-reports?mode=yesterday", {
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        setYesterdayResult(
          data.missing_count > 0
            ? `✅ 送信完了！ 未提出：${data.missing_count}件 / 全${data.total}件`
            : `✅ ${data.message || "全員提出済みです"}`,
        );
      } else {
        setYesterdayResult(`❌ ${data.error || data.message || "送信失敗"}`);
      }
    } catch (e: any) {
      setYesterdayResult(`❌ 通信エラー: ${e?.message || e}`);
    } finally {
      setRemindingYesterday(false);
    }
  };

  return (
    <AdminGate>
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">管理者ページ</h1>
        <div className="flex gap-2">
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          <Link href="/report" className="btn-secondary text-sm">
            日報へ
          </Link>
          <Link href="/interim" className="btn-secondary text-sm">
            中間報告へ
          </Link>
        </div>
      </header>

      <Link
        href="/admin/shifts"
        className="block w-full bg-brand hover:bg-brand-dark text-white font-bold text-base px-6 py-4 rounded-xl shadow-md text-center transition-colors"
      >
        🗓️ シフト管理ページへ
      </Link>

      <Link
        href="/admin/shift-generator"
        className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-6 py-4 rounded-xl shadow-md text-center transition-colors"
      >
        🤖 シフト自動生成（ながやまPDFから）
      </Link>

      <Link
        href="/admin/stats"
        className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base px-6 py-4 rounded-xl shadow-md text-center transition-colors"
      >
        📊 番隊別ダッシュボード
      </Link>

      <Link
        href="/admin/settings"
        className="block w-full bg-stone-700 hover:bg-stone-800 text-white font-bold text-base px-6 py-4 rounded-xl shadow-md text-center transition-colors"
      >
        ⚙️ 設定センター（商品・担当者・出店場所）
      </Link>

      <Link
        href="/admin/payroll"
        className="block w-full bg-teal-700 hover:bg-teal-800 text-white font-bold text-base px-6 py-4 rounded-xl shadow-md text-center transition-colors"
      >
        👥 スタッフ別 稼働（給与計算の補助）
      </Link>

      {/* 経理（今月の利益・今の現金・まだ払っていないお金）。設計は docs/keiri.md */}
      <Link
        href="/keiri"
        className="block w-full bg-amber-700 hover:bg-amber-800 text-white font-bold text-base px-6 py-4 rounded-xl shadow-md text-center transition-colors"
      >
        🧮 経理（今月の利益・今の現金）
      </Link>

      <MonthlyDashboard />

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-brand-dark">🌤️ 天気予報通知</h2>
        <button
          onClick={handleWeatherNotify}
          disabled={notifyingWeather}
          className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-base px-6 py-4 rounded-xl shadow-md disabled:opacity-50 transition-colors"
        >
          {notifyingWeather
            ? "🌤️ 取得中…"
            : "🌤️ 翌日の天気予報を今すぐ通知"}
        </button>
        {weatherResult && (
          <div
            className={`card text-sm font-semibold ${
              weatherResult.startsWith("✅")
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {weatherResult}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-brand-dark">📋 日報リマインダー</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleRemindTonight}
            disabled={reminding}
            className="flex-1 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-md disabled:opacity-50 transition-colors"
          >
            {reminding
              ? "⏰ チェック中…"
              : "⏰ 本日の未提出を通知"}
          </button>
          <button
            onClick={handleRemindYesterday}
            disabled={remindingYesterday}
            className="flex-1 bg-stone-600 hover:bg-stone-700 active:bg-stone-800 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-md disabled:opacity-50 transition-colors"
          >
            {remindingYesterday
              ? "📋 チェック中…"
              : "📋 昨日の未提出を通知"}
          </button>
        </div>
        {reminderResult && (
          <div
            className={`card text-sm font-semibold ${
              reminderResult.startsWith("✅")
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {reminderResult}
          </div>
        )}
        {yesterdayResult && (
          <div
            className={`card text-sm font-semibold ${
              yesterdayResult.startsWith("✅")
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {yesterdayResult}
          </div>
        )}
      </section>

      <SystemHealthPanel />

      <ReceiptMigrationPanel />

      <ReceiptReocrPanel />

      <LineDiagnostics />

      <AchievementRateDashboard />

      <MonthlyLimitedProductManager />

      <PrepProductManager />

      <PrepSettingsManager />

      <PrepReportDashboard />

      <FeedbackBoxAdmin />

      {alerts.length > 0 && (
        <section className="space-y-3">
          {alerts.map((a, i) => {
            const total = a.amount1 + a.amount2;
            return (
              <div
                key={i}
                className="border-2 border-red-400 bg-red-50 rounded-xl p-4 text-red-800"
              >
                <div className="font-bold text-lg mb-1">
                  ⚠️ {a.staff}：2回連続レジマイナス
                </div>
                <div className="text-sm">
                  {slashDate(a.date1)}：{a.amount1.toLocaleString("ja-JP")}円
                  {" / "}
                  {slashDate(a.date2)}：{a.amount2.toLocaleString("ja-JP")}円
                </div>
                <div className="mt-2 font-bold">
                  補填金額：{Math.abs(total).toLocaleString("ja-JP")}円
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <div className="text-xs text-stone-500">{monthStats.label} 売上合計</div>
          <div className="text-2xl font-bold text-brand-dark">
            {yen(monthStats.sales)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">
            {monthStats.label} 粗利合計（推定）
          </div>
          <div
            className={`text-2xl font-bold ${
              monthStats.profit >= 0 ? "text-brand-dark" : "text-red-600"
            }`}
          >
            {yen(monthStats.profit)}
          </div>
          {/* 推定と実績を並べて出す。推定は食材25%・場代10%の見込みで計算しているため、
              実際に払った額とはズレる（例：場代の実績は売上の約6.9%）。 */}
          <div className="mt-2 pt-2 border-t border-stone-200">
            <div className="text-xs text-stone-500">実績（レジから払った経費で計算）</div>
            <div
              className={`text-lg font-bold ${
                monthStats.actualProfit >= 0 ? "text-stone-700" : "text-red-600"
              }`}
            >
              {yen(monthStats.actualProfit)}
            </div>
            <div className="text-[11px] text-stone-400 leading-snug mt-0.5">
              推定は食材25%・場代10%の見込み。実績はレジから出た実際の経費と日当のみ。
            </div>
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">
            {monthStats.label} 持ち帰り金額合計
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {yen(monthStats.takeHome)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-stone-500">{monthStats.label} 日報件数</div>
          <div className="text-2xl font-bold">{monthStats.count}件</div>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-bold">中間報告</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setInterimRange("today")}
              className={`text-xs px-3 py-1 rounded border ${
                interimRange === "today"
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              今日
            </button>
            <button
              onClick={() => setInterimRange("week")}
              className={`text-xs px-3 py-1 rounded border ${
                interimRange === "week"
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              直近7日
            </button>
          </div>
        </div>
        {interims.length === 0 ? (
          <p className="text-sm text-stone-500">
            {interimRange === "today"
              ? "今日の中間報告はまだありません"
              : "直近7日間の中間報告はありません"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-stone-200">
                <th className="py-2 pr-3">日時</th>
                <th className="py-2 pr-3">店舗</th>
                <th className="py-2 pr-3">担当</th>
                <th className="py-2 pr-3 text-right">時刻</th>
                <th className="py-2 pr-3 text-right">売上</th>
                <th className="py-2 pr-3 text-right">目安</th>
                <th className="py-2 pr-3 text-right">差額</th>
                <th className="py-2 text-right">達成率</th>
              </tr>
            </thead>
            <tbody>
              {interims.map((r) => {
                const d = new Date(r.created_at);
                const dStr = `${d.getMonth() + 1}/${d.getDate()} ${String(
                  d.getHours()
                ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-stone-100 last:border-b-0"
                  >
                    <td className="py-2 pr-3">{dStr}</td>
                    <td className="py-2 pr-3">{r.location}</td>
                    <td className="py-2 pr-3">{r.staff_name}</td>
                    <td className="py-2 pr-3 text-right">{r.report_hour}時</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {yen(r.current_sales)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-stone-500">
                      {yen(r.target_at_hour)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono font-semibold ${
                        r.difference >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {yen(r.difference)}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {r.achievement_rate}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-bold mb-3">直近30件の日報</h2>
        {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
        {error && <p className="text-sm text-red-600">エラー: {error}</p>}
        {!loading && !error && reports.length === 0 && (
          <p className="text-sm text-stone-500">データがありません</p>
        )}
        {!loading && !error && reports.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-stone-200">
                <th className="py-2 pr-3">日付</th>
                <th className="py-2 pr-3">場所</th>
                <th className="py-2 pr-3">担当</th>
                <th className="py-2 pr-3 text-right">売上</th>
                <th className="py-2 pr-3 text-right">粗利</th>
                <th className="py-2 pr-3 text-right">持ち帰り</th>
                <th className="py-2 pr-3 text-right">レジ差異</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const profit = calcProfit(r.sales_amount || 0, reportLabor(r));
                const takeHome = calcTakeHome(
                  r.sales_amount || 0,
                  expensesTotalOf(r)
                );
                return (
                  <tr
                    key={r.id}
                    className="border-b border-stone-100 last:border-b-0"
                  >
                    <td className="py-2 pr-3">{slashDate(r.date)}</td>
                    <td className="py-2 pr-3">{r.location}</td>
                    <td className="py-2 pr-3">{r.staff_name}</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {yen(r.sales_amount || 0)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono ${
                        profit >= 0 ? "" : "text-red-600"
                      }`}
                    >
                      {yen(profit)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-orange-600">
                      {yen(takeHome)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {(r.register_diff ?? 0) === 0 ? (
                        <span className="text-stone-400">－</span>
                      ) : (
                        <span className="text-red-600">
                          {yen(r.register_diff ?? 0)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(r)}
                        className="text-blue-600 hover:text-blue-700 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50 mr-1"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="text-red-600 hover:text-red-700 border border-red-300 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-40"
                      >
                        {deletingId === r.id ? "削除中…" : "削除"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <EditReportModal
          report={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setReports((prev) =>
              prev.map((x) =>
                x.id === updated.id ? ({ ...x, ...updated } as Report) : x,
              ),
            );
            setEditing(null);
          }}
        />
      )}
    </main>
    </AdminGate>
  );
}
