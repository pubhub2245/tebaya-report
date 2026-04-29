"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminGate from "@/app/components/AdminGate";
import { yen } from "@/lib/format";
import {
  getTeamStatsForPeriod,
  getStaffStatsForPeriod,
  getLocationStatsForPeriod,
  getTeamLocationCrossForPeriod,
  monthRange,
  currentYM,
  prevYM,
  labelYM,
  type TeamStats,
  type StaffStats,
  type LocationStats,
  type TeamLocationCross,
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

const UNIT_BADGE: Record<string, string> = {
  "1": "bg-blue-100 text-blue-700 border border-blue-200",
  "2": "bg-orange-100 text-orange-700 border border-orange-200",
  null: "bg-stone-100 text-stone-700 border border-stone-200",
};

const rateBadge = (rate: number) => {
  if (rate >= 100) return "bg-green-500 text-white";
  if (rate >= 80) return "bg-yellow-400 text-stone-800";
  return "bg-stone-300 text-stone-700";
};

const keyOf = (unit: 1 | 2 | null) => (unit === null ? "null" : String(unit));

const monthOptions = (count = 12): { value: string; label: string }[] => {
  const now = new Date();
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    opts.push({
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: `${y}年${m}月`,
    });
  }
  return opts;
};

type TabKey = "overview" | "staff" | "location" | "cross";

function AdminStatsBody() {
  const [ym, setYm] = useState(currentYM());
  const lastYm = useMemo(() => prevYM(ym), [ym]);

  const [team, setTeam] = useState<TeamStats[] | null>(null);
  const [teamLast, setTeamLast] = useState<TeamStats[] | null>(null);
  const [staff, setStaff] = useState<StaffStats[] | null>(null);
  const [loc, setLoc] = useState<LocationStats[] | null>(null);
  const [cross, setCross] = useState<TeamLocationCross[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { start, end } = monthRange(ym);
        const last = monthRange(lastYm);
        const [t, tl, s, l, c] = await Promise.all([
          getTeamStatsForPeriod(start, end),
          getTeamStatsForPeriod(last.start, last.end),
          getStaffStatsForPeriod(start, end),
          getLocationStatsForPeriod(start, end),
          getTeamLocationCrossForPeriod(start, end),
        ]);
        if (cancelled) return;
        setTeam(t);
        setTeamLast(tl);
        setStaff(s);
        setLoc(l);
        setCross(c);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ym, lastYm]);

  const chartData = useMemo(() => {
    if (!team || !teamLast) return [];
    return team.map((t) => {
      const l = teamLast.find((x) => keyOf(x.unit) === keyOf(t.unit));
      return {
        unit: t.unitLabel,
        先月: l?.totalSales ?? 0,
        今月: t.totalSales,
      };
    });
  }, [team, teamLast]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "概要" },
    { key: "staff", label: "個人別" },
    { key: "location", label: "店舗別" },
    { key: "cross", label: "番隊×店舗" },
  ];

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="btn-secondary text-sm">
            ← 管理者TOP
          </Link>
          <h1 className="text-xl font-bold text-brand-dark">
            📊 番隊別ダッシュボード
          </h1>
        </div>
        <select
          value={ym}
          onChange={(e) => setYm(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          {monthOptions(12).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </header>

      {/* タブ切替 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              tab === t.key
                ? "bg-brand text-white"
                : "bg-white border border-stone-300 text-stone-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card bg-red-50 border border-red-200 text-red-700 text-sm">
          エラー: {error}
        </div>
      )}
      {loading && !team && (
        <p className="text-center text-sm text-stone-500">読み込み中…</p>
      )}

      {/* === 概要タブ === */}
      {tab === "overview" && team && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {team.map((t) => {
              const k = keyOf(t.unit);
              const c = UNIT_COLOR[k];
              return (
                <div
                  key={k}
                  className={`rounded-2xl border-2 ${c.ring} ${c.bg} p-4`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold">
                      {c.emoji} {t.unitLabel}
                    </div>
                    {t.reportCount > 0 && (
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full ${rateBadge(
                          t.achievementRate,
                        )}`}
                      >
                        {t.achievementRate}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-xs">
                    <div>
                      <div className="text-stone-500">売上</div>
                      <div className="font-bold">{yen(t.totalSales)}</div>
                    </div>
                    <div>
                      <div className="text-stone-500">件数</div>
                      <div className="font-bold">{t.reportCount}</div>
                    </div>
                    <div>
                      <div className="text-stone-500">平均</div>
                      <div className="font-bold">
                        {yen(t.averageSalesPerReport)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card space-y-2">
            <h2 className="font-bold">月次比較</h2>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="unit" tick={{ fontSize: 12 }} />
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
        </>
      )}

      {/* === 個人別タブ === */}
      {tab === "staff" && staff && (
        <section className="card overflow-x-auto">
          <h2 className="font-bold mb-2">個人別売上貢献</h2>
          {staff.length === 0 ? (
            <p className="text-sm text-stone-500">データなし</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-stone-200">
                  <th className="py-2 pr-3">スタッフ</th>
                  <th className="py-2 pr-3">番隊</th>
                  <th className="py-2 pr-3 text-right">売上合計</th>
                  <th className="py-2 pr-3 text-right">件数</th>
                  <th className="py-2 text-right">平均</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const k = keyOf(s.unit);
                  return (
                    <tr key={s.staffName} className="border-b border-stone-100">
                      <td className="py-2 pr-3 font-semibold">{s.staffName}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full ${UNIT_BADGE[k]}`}
                        >
                          {s.unitLabel}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {yen(s.totalSales)}
                      </td>
                      <td className="py-2 pr-3 text-right">{s.reportCount}</td>
                      <td className="py-2 text-right font-mono">
                        {yen(s.averageSalesPerReport)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* === 店舗別タブ === */}
      {tab === "location" && loc && (
        <section className="card overflow-x-auto">
          <h2 className="font-bold mb-2">店舗別売上明細</h2>
          {loc.length === 0 ? (
            <p className="text-sm text-stone-500">データなし</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-stone-200">
                  <th className="py-2 pr-3">店舗</th>
                  <th className="py-2 pr-3">主担当番隊</th>
                  <th className="py-2 pr-3 text-right">売上</th>
                  <th className="py-2 pr-3 text-right">件数</th>
                  <th className="py-2 text-right">達成率</th>
                </tr>
              </thead>
              <tbody>
                {loc.map((l) => {
                  const k = keyOf(l.primaryUnit);
                  return (
                    <tr
                      key={l.locationName}
                      className="border-b border-stone-100"
                    >
                      <td className="py-2 pr-3 font-semibold">
                        {l.locationName}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full ${UNIT_BADGE[k]}`}
                        >
                          {l.primaryUnitLabel}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {yen(l.totalSales)}
                      </td>
                      <td className="py-2 pr-3 text-right">{l.reportCount}</td>
                      <td className="py-2 text-right">
                        {l.totalTarget > 0 ? (
                          <span
                            className={`inline-block text-xs px-2 py-0.5 rounded-full ${rateBadge(l.achievementRate)}`}
                          >
                            {l.achievementRate}%
                          </span>
                        ) : (
                          <span className="text-stone-400 text-xs">−</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* === クロス集計タブ === */}
      {tab === "cross" && cross && (
        <section className="card overflow-x-auto">
          <h2 className="font-bold mb-2">番隊×店舗 クロス集計</h2>
          <p className="text-xs text-stone-500 mb-3">
            上段：売上合計 / 下段：件数
          </p>
          {cross.length === 0 ? (
            <p className="text-sm text-stone-500">データなし</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-stone-200">
                  <th className="py-2 pr-3">店舗</th>
                  <th className="py-2 pr-3 text-right">🟦 1番隊</th>
                  <th className="py-2 pr-3 text-right">🟧 2番隊</th>
                  <th className="py-2 pr-3 text-right">⚪ 応援/他</th>
                  <th className="py-2 text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {cross.map((c) => (
                  <tr
                    key={c.locationName}
                    className="border-b border-stone-100 align-top"
                  >
                    <td className="py-2 pr-3 font-semibold">
                      {c.locationName}
                    </td>
                    {(["1", "2", "null"] as const).map((k) => (
                      <td key={k} className="py-2 pr-3 text-right font-mono">
                        <div>
                          {c.cells[k].totalSales > 0
                            ? yen(c.cells[k].totalSales)
                            : "−"}
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {c.cells[k].reportCount > 0
                            ? `${c.cells[k].reportCount}件`
                            : ""}
                        </div>
                      </td>
                    ))}
                    <td className="py-2 text-right font-mono font-bold">
                      <div>{yen(c.total.totalSales)}</div>
                      <div className="text-[10px] text-stone-500">
                        {c.total.reportCount}件
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

export default function AdminStatsPage() {
  return (
    <AdminGate>
      <AdminStatsBody />
    </AdminGate>
  );
}
