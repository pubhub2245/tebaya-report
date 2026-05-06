"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  calculatePrepMinutes,
  getPrepSettings,
  calculateMonthlyCostBreakdown,
  getDirectCostStatus,
  type PrepProduct,
  type PrepSettings,
  type PrepReportRow,
  type PrepSessionRow,
  type PrepSessionItemRow,
  type MonthlyCostBreakdown,
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
  const [costBreakdown, setCostBreakdown] = useState<MonthlyCostBreakdown | null>(null);
  const [prevCostBreakdown, setPrevCostBreakdown] = useState<MonthlyCostBreakdown | null>(null);
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
        // 前月（直接費比率の前月比表示用）
        const prevM = month === 1 ? 12 : month - 1;
        const prevY = month === 1 ? year - 1 : year;
        const [prodRes, reportRes, settingsData, breakdown, prevBreakdown] =
          await Promise.all([
            supabase.from("prep_products").select("*"),
            supabase
              .from("prep_reports")
              .select("*")
              .gte("date", startDate)
              .lte("date", endDate)
              .order("date"),
            getPrepSettings(endDate),
            calculateMonthlyCostBreakdown(year, month),
            calculateMonthlyCostBreakdown(prevY, prevM),
          ]);
        if (cancelled) return;
        if (prodRes.error) throw prodRes.error;
        if (reportRes.error) throw reportRes.error;
        const reports = (reportRes.data as PrepReportRow[]) ?? [];
        setProducts((prodRes.data as PrepProduct[]) ?? []);
        setSettings(settingsData);
        setCostBreakdown(breakdown);
        setPrevCostBreakdown(prevBreakdown);

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

          {/* 💡 直接費比率セクション */}
          {costBreakdown && settings && costBreakdown.total_minutes > 0 && (
            <DirectCostSection
              breakdown={costBreakdown}
              prev={prevCostBreakdown}
              settings={settings}
            />
          )}

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

// ---------------------------------------------------------------------------
// 💡 直接費比率セクション
// ---------------------------------------------------------------------------

function DirectCostSection({
  breakdown,
  prev,
  settings,
}: {
  breakdown: MonthlyCostBreakdown;
  prev: MonthlyCostBreakdown | null;
  settings: PrepSettings;
}) {
  const ratio = breakdown.direct_cost_ratio;
  const ratioPct = (ratio * 100).toFixed(1);
  const status = getDirectCostStatus(ratio, settings);

  const wPct = Number(settings.direct_cost_warning_threshold) * 100;
  const tPct = Number(settings.direct_cost_target_threshold) * 100;
  const iPct = Number(settings.direct_cost_ideal_threshold) * 100;

  // 前月比
  let diffText: string | null = null;
  if (prev && prev.total_minutes > 0) {
    const diff = (ratio - prev.direct_cost_ratio) * 100;
    const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
    diffText = `前月比 ${sign}${diff.toFixed(1)} pt（前月 ${(prev.direct_cost_ratio * 100).toFixed(1)}%）`;
  }

  // バッジ色マップ
  const badgeColor: Record<typeof status.color, string> = {
    red: "bg-red-100 text-red-800 border-red-300",
    amber: "bg-amber-100 text-amber-800 border-amber-300",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-300",
  };
  const barColor: Record<typeof status.color, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    yellow: "bg-yellow-500",
    emerald: "bg-emerald-500",
  };

  return (
    <div className="space-y-2 border-t border-stone-200 pt-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-stone-700">💡 直接費比率</h3>
        <span
          className={`text-xs font-bold rounded-full px-2 py-0.5 border ${badgeColor[status.color]}`}
        >
          {status.label}
        </span>
      </div>

      <div className="text-center py-1">
        <span className="text-3xl font-bold text-stone-800">{ratioPct}%</span>
        {diffText && (
          <div className="text-xs text-stone-500 mt-0.5">{diffText}</div>
        )}
      </div>

      {/* 警告メッセージ */}
      {status.level === "warning" && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-2 py-1.5 font-semibold">
          ⚠️ 警告：直接費比率が{wPct.toFixed(0)}%を下回っています。間接費の削減を検討してください。
        </div>
      )}

      {/* プログレスバー with 3段階マーカー */}
      <div className="relative w-full bg-stone-200 rounded-full h-3 overflow-visible">
        <div
          className={`h-3 rounded-full transition-all ${barColor[status.color]}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
        {/* 警告ライン */}
        <div
          className="absolute top-0 h-3 border-l-2 border-red-400"
          style={{ left: `${wPct}%` }}
          title={`警告ライン ${wPct.toFixed(0)}%`}
        />
        {/* 目標ライン */}
        <div
          className="absolute top-0 h-3 border-l-2 border-yellow-500"
          style={{ left: `${tPct}%` }}
          title={`目標ライン ${tPct.toFixed(0)}%`}
        />
        {/* 理想ライン */}
        <div
          className="absolute top-0 h-3 border-l-2 border-emerald-500"
          style={{ left: `${iPct}%` }}
          title={`理想ライン ${iPct.toFixed(0)}%`}
        />
      </div>
      <div className="flex justify-between text-[10px] text-stone-500">
        <span>0%</span>
        <span style={{ marginLeft: `calc(${wPct}% - 1.5em)` }}>
          警告 {wPct.toFixed(0)}%
        </span>
        <span style={{ marginLeft: `calc(${tPct - wPct}% - 1.5em)` }}>
          目標 {tPct.toFixed(0)}%
        </span>
        <span style={{ marginLeft: `calc(${iPct - tPct}% - 1.5em)` }}>
          理想 {iPct.toFixed(0)}%
        </span>
        <span>100%</span>
      </div>

      {/* 内訳 */}
      <ul className="text-xs space-y-0.5 bg-stone-50 rounded-lg p-2 mt-2">
        <li className="flex justify-between">
          <span>直接費（仕込み + 現場勤務）</span>
          <span className="font-mono">
            {(breakdown.direct_cost_minutes / 60).toFixed(1)}h ¥{breakdown.direct_cost_amount.toLocaleString()}
          </span>
        </li>
        <li className="flex justify-between">
          <span>間接費（仕入れ + 発注 + 準備 + その他）</span>
          <span className="font-mono">
            {(breakdown.indirect_cost_minutes / 60).toFixed(1)}h ¥{breakdown.indirect_cost_amount.toLocaleString()}
          </span>
        </li>
      </ul>
    </div>
  );
}
