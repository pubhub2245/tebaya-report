"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  calculatePrepMinutes,
  getPrepSettings,
  type PrepProduct,
  type PrepSettings,
  type PrepReportRow,
  type PrepSessionRow,
  type PrepSessionItemRow,
} from "@/lib/prepHelpers";

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function yen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

type Bundle = {
  reports: PrepReportRow[];
  sessions: PrepSessionRow[];
  items: PrepSessionItemRow[];
};

export default function PrepReportDashboard() {
  const [yearMonth, setYearMonth] = useState<string>(thisMonth());
  const [products, setProducts] = useState<PrepProduct[]>([]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [settings, setSettings] = useState<PrepSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const startDate = `${yearMonth}-01`;
  const endDate = `${yearMonth}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [prodRes, reportRes, settingsData] = await Promise.all([
          supabase.from("prep_products").select("*"),
          supabase
            .from("prep_reports")
            .select("*")
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date"),
          getPrepSettings(endDate),
        ]);
        if (cancelled) return;
        if (prodRes.error) throw prodRes.error;
        if (reportRes.error) throw reportRes.error;
        const reports = (reportRes.data as PrepReportRow[]) ?? [];
        setProducts((prodRes.data as PrepProduct[]) ?? []);
        setSettings(settingsData);

        if (reports.length === 0) {
          setBundle({ reports: [], sessions: [], items: [] });
          return;
        }
        const reportIds = reports.map((r) => r.id);
        const { data: sessions, error: sessErr } = await supabase
          .from("prep_sessions")
          .select("*")
          .in("prep_report_id", reportIds);
        if (sessErr) throw sessErr;
        const sessionList = (sessions as PrepSessionRow[]) ?? [];
        let items: PrepSessionItemRow[] = [];
        if (sessionList.length > 0) {
          const sessionIds = sessionList.map((s) => s.id);
          const { data: itemRows } = await supabase
            .from("prep_session_items")
            .select("*")
            .in("prep_session_id", sessionIds);
          items = (itemRows as PrepSessionItemRow[]) ?? [];
        }
        setBundle({ reports, sessions: sessionList, items });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  // 月次集計
  const summary = useMemo(() => {
    if (!bundle) return null;
    const productMap = new Map<string, PrepProduct>();
    for (const p of products) productMap.set(p.id, p);

    // 業務時間カテゴリ合計
    let fieldWork = 0;
    let procurement = 0;
    let ordering = 0;
    let setup = 0;
    let other = 0;
    for (const r of bundle.reports) {
      fieldWork += r.field_work_minutes;
      procurement += r.procurement_minutes;
      ordering += r.ordering_minutes;
      setup += r.setup_minutes;
      other += r.other_minutes;
    }

    // 仕込み時間（sessions の品目から計算）
    let prepMinutes = 0;
    const productQty = new Map<string, number>();
    for (const session of bundle.sessions) {
      const items = bundle.items.filter((i) => i.prep_session_id === session.id);
      prepMinutes += calculatePrepMinutes(
        items,
        productMap as unknown as Map<string, { speed_basis: PrepProduct["speed_basis"]; speed_minutes: number }>,
      );
      for (const it of items) {
        productQty.set(
          it.product_id,
          (productQty.get(it.product_id) ?? 0) + it.quantity,
        );
      }
    }

    const nonPrepMinutes = fieldWork + procurement + ordering + setup + other;
    const totalMinutes = prepMinutes + nonPrepMinutes;
    const totalHours = totalMinutes / 60;

    const hourlyRate = settings?.hourly_rate ?? 1000;
    const monthlySalary = settings?.monthly_salary ?? 200000;
    const wageEquivalent = Math.round(totalHours * hourlyRate);

    // 商品別本数
    const productSummary = Array.from(productQty.entries())
      .map(([pid, qty]) => {
        const p = productMap.get(pid);
        return {
          name: p?.name ?? "(不明)",
          unit: p?.unit_label ?? "",
          qty,
          basis: p?.speed_basis ?? "per_100",
        };
      })
      .sort((a, b) => b.qty - a.qty);

    // 日別合計（簡易）
    const dailyTotals: Array<{ date: string; minutes: number }> = [];
    for (const r of bundle.reports) {
      const sessForReport = bundle.sessions.filter((s) => s.prep_report_id === r.id);
      let m = r.field_work_minutes + r.procurement_minutes + r.ordering_minutes + r.setup_minutes + r.other_minutes;
      for (const s of sessForReport) {
        m += calculatePrepMinutes(
          bundle.items.filter((i) => i.prep_session_id === s.id),
          productMap as unknown as Map<string, { speed_basis: PrepProduct["speed_basis"]; speed_minutes: number }>,
        );
      }
      dailyTotals.push({ date: r.date, minutes: m });
    }
    dailyTotals.sort((a, b) => a.date.localeCompare(b.date));

    return {
      fieldWork,
      procurement,
      ordering,
      setup,
      other,
      prepMinutes,
      nonPrepMinutes,
      totalMinutes,
      totalHours,
      wageEquivalent,
      monthlySalary,
      productSummary,
      dailyTotals,
      reportCount: bundle.reports.length,
    };
  }, [bundle, products, settings]);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-brand-dark">📊 仕込み日報の集計</h2>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="field text-sm py-1.5 w-auto"
        />
      </div>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-3 py-2 text-sm font-semibold">
          ❌ {error}
        </div>
      )}

      {summary && summary.reportCount === 0 && !loading && (
        <p className="text-sm text-stone-400">
          {year}年{month}月の仕込み日報はまだありません
        </p>
      )}

      {summary && summary.reportCount > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="card text-center">
              <div className="text-xs text-stone-500">提出件数</div>
              <div className="text-xl font-bold">{summary.reportCount}日</div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-stone-500">合計時間</div>
              <div className="text-xl font-bold text-brand-dark">
                {summary.totalHours.toFixed(1)}h
              </div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-stone-500">人件費換算</div>
              <div className="text-xl font-bold text-brand-dark">
                {yen(summary.wageEquivalent)}
              </div>
            </div>
            <div className="card text-center">
              <div className="text-xs text-stone-500">月給目安</div>
              <div className="text-xl font-bold text-stone-600">
                {yen(summary.monthlySalary)}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-stone-500 mb-1">
              月給目安に対する人件費換算の進捗
            </div>
            <div className="w-full bg-stone-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  summary.wageEquivalent >= summary.monthlySalary
                    ? "bg-emerald-500"
                    : summary.wageEquivalent >= summary.monthlySalary * 0.7
                      ? "bg-amber-500"
                      : "bg-stone-400"
                }`}
                style={{
                  width: `${Math.min(100, (summary.wageEquivalent / summary.monthlySalary) * 100)}%`,
                }}
              />
            </div>
            <div className="text-xs text-stone-500 mt-0.5 text-right">
              {((summary.wageEquivalent / summary.monthlySalary) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-bold text-stone-700">業務時間カテゴリ別</h3>
            <ul className="text-sm space-y-0.5 bg-stone-50 rounded-lg p-2">
              <li className="flex justify-between">
                <span>仕込み（セッション合計）</span>
                <span className="font-mono">{summary.prepMinutes}分</span>
              </li>
              <li className="flex justify-between">
                <span>現場勤務</span>
                <span className="font-mono">{summary.fieldWork}分</span>
              </li>
              <li className="flex justify-between">
                <span>仕入れ・買い出し</span>
                <span className="font-mono">{summary.procurement}分</span>
              </li>
              <li className="flex justify-between">
                <span>発注・業者連絡</span>
                <span className="font-mono">{summary.ordering}分</span>
              </li>
              <li className="flex justify-between">
                <span>翌日準備・セッティング</span>
                <span className="font-mono">{summary.setup}分</span>
              </li>
              <li className="flex justify-between">
                <span>その他</span>
                <span className="font-mono">{summary.other}分</span>
              </li>
            </ul>
          </div>

          {summary.productSummary.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-stone-700">商品別 仕込み量</h3>
              <ul className="text-sm space-y-0.5 bg-stone-50 rounded-lg p-2">
                {summary.productSummary.map((p) => (
                  <li key={p.name} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="font-mono">
                      {p.qty}
                      {p.unit}
                      {p.basis === "per_session" && "（セッション数）"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1">
            <h3 className="text-sm font-bold text-stone-700">日別 業務時間（簡易）</h3>
            <div className="bg-stone-50 rounded-lg p-2 max-h-48 overflow-y-auto">
              <ul className="text-xs space-y-0.5">
                {summary.dailyTotals.map((d) => (
                  <li key={d.date} className="flex justify-between">
                    <span>{d.date}</span>
                    <span className="font-mono">{d.minutes}分（{(d.minutes / 60).toFixed(1)}h）</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              alert("給与適正性レポート PDF/Excel ダウンロードは Phase 2 で実装予定です")
            }
            className="btn-secondary w-full text-sm"
          >
            📄 給与適正性レポート PDF/Excel ダウンロード（Phase 2）
          </button>
        </>
      )}
    </section>
  );
}
