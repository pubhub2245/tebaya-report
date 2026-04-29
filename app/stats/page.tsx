"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { yen } from "@/lib/format";
import {
  getTeamStatsForPeriod,
  monthRange,
  currentYM,
  prevYM,
  labelYM,
  type TeamStats,
} from "@/lib/teamStats";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const UNIT_COLOR: Record<string, { bg: string; ring: string; emoji: string }> =
  {
    "1": { bg: "bg-blue-50", ring: "border-blue-300", emoji: "🟦" },
    "2": { bg: "bg-orange-50", ring: "border-orange-300", emoji: "🟧" },
    null: { bg: "bg-stone-50", ring: "border-stone-300", emoji: "⚪" },
  };

const UNIT_DESC: Record<string, string> = {
  "1": "じゅん・イデ",
  "2": "かずき・なぎさ",
  null: "応援メンバー等",
};

const rateBadge = (rate: number) => {
  if (rate >= 100) return "bg-green-500 text-white";
  if (rate >= 80) return "bg-yellow-400 text-stone-800";
  return "bg-stone-300 text-stone-700";
};

const keyOf = (unit: 1 | 2 | null) => (unit === null ? "null" : String(unit));

export default function StatsPage() {
  const thisYm = useMemo(() => currentYM(), []);
  const lastYm = useMemo(() => prevYM(thisYm), [thisYm]);

  const [thisMonth, setThisMonth] = useState<TeamStats[] | null>(null);
  const [lastMonth, setLastMonth] = useState<TeamStats[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [t, l] = await Promise.all([
          (async () => {
            const { start, end } = monthRange(thisYm);
            return getTeamStatsForPeriod(start, end);
          })(),
          (async () => {
            const { start, end } = monthRange(lastYm);
            return getTeamStatsForPeriod(start, end);
          })(),
        ]);
        if (!cancelled) {
          setThisMonth(t);
          setLastMonth(l);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thisYm, lastYm]);

  const chartData = useMemo(() => {
    if (!thisMonth || !lastMonth) return [];
    return thisMonth.map((t) => {
      const last = lastMonth.find((x) => keyOf(x.unit) === keyOf(t.unit));
      return {
        unit: t.unitLabel,
        今月: t.totalSales,
        先月: last?.totalSales ?? 0,
      };
    });
  }, [thisMonth, lastMonth]);

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-12 space-y-5">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          <span className="text-xs text-stone-500">
            {labelYM(thisYm)} 時点
          </span>
        </div>
        <h1 className="text-2xl font-bold text-brand-dark text-center">
          📊 チーム成績
        </h1>
        <p className="text-sm text-stone-600 text-center">
          今月の出店、お疲れさまです！🍗
        </p>
      </header>

      {error && (
        <div className="card bg-red-50 border border-red-200 text-red-700 text-sm">
          エラー: {error}
        </div>
      )}

      {loading && !thisMonth && (
        <p className="text-center text-sm text-stone-500">読み込み中…</p>
      )}

      {/* 番隊別カード */}
      {thisMonth && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-stone-700">
            今月（{labelYM(thisYm)}）の成績
          </h2>
          <div className="space-y-3">
            {thisMonth.map((t) => {
              const k = keyOf(t.unit);
              const c = UNIT_COLOR[k];
              return (
                <div
                  key={k}
                  className={`rounded-2xl border-2 ${c.ring} ${c.bg} p-4 shadow-sm`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-base font-bold text-stone-800">
                        {c.emoji} {t.unitLabel}
                      </div>
                      <div className="text-xs text-stone-500">
                        {UNIT_DESC[k]}
                      </div>
                    </div>
                    {t.reportCount > 0 && (
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${rateBadge(
                          t.achievementRate,
                        )}`}
                      >
                        達成率 {t.achievementRate}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] text-stone-500">合計売上</div>
                      <div className="text-base font-bold text-stone-800">
                        {yen(t.totalSales)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500">出店件数</div>
                      <div className="text-base font-bold text-stone-800">
                        {t.reportCount}件
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500">1出店平均</div>
                      <div className="text-base font-bold text-stone-800">
                        {yen(t.averageSalesPerReport)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 月次比較棒グラフ */}
      {thisMonth && lastMonth && (
        <section className="card space-y-2">
          <h2 className="text-base font-bold text-stone-700">
            今月 vs 先月（{labelYM(lastYm)} → {labelYM(thisYm)}）
          </h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="unit" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v: number) =>
                    v >= 10000 ? `${Math.round(v / 10000)}万` : String(v)
                  }
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: any) => yen(Number(v))} />
                <Legend />
                <Bar dataKey="先月" fill="#cbd5e1" />
                <Bar dataKey="今月" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <p className="text-xs text-stone-400 text-center pt-4">
        ※ 個人別の数字は管理者ページのみで確認できます
      </p>
    </main>
  );
}
