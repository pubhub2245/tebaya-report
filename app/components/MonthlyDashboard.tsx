"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import MonthlySummary from "./MonthlySummary";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Shift = {
  date: string;
  target: number;
  location_id: string | number;
  locations?: { name: string } | { name: string }[] | null;
};

type Report = {
  date: string;
  location: string;
  sales_amount: number;
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, y, m, lastDay };
}

function genMonthOptions(count = 12) {
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
}

function locName(s: Shift): string | null {
  const l = s.locations;
  if (!l) return null;
  if (Array.isArray(l)) return l[0]?.name ?? null;
  return l.name ?? null;
}

export default function MonthlyDashboard() {
  const today = todayLocal();
  const [ym, setYm] = useState(today.slice(0, 7));
  const { start, end, m, lastDay } = getMonthRange(ym);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, r] = await Promise.all([
          supabase
            .from("shifts")
            .select("date, target, location_id, locations(name)")
            .gte("date", start)
            .lte("date", end),
          supabase
            .from("daily_reports")
            .select("date, location, sales_amount")
            .gte("date", start)
            .lte("date", end),
        ]);
        if (s.error) throw s.error;
        if (r.error) throw r.error;
        if (cancelled) return;
        setShifts((s.data as any as Shift[]) || []);
        setReports((r.data as any as Report[]) || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const chartData = useMemo(() => {
    const shiftsByDate = new Map<string, number>();
    shifts.forEach((s) => {
      shiftsByDate.set(
        s.date,
        (shiftsByDate.get(s.date) || 0) + (s.target || 0)
      );
    });
    const reportsByDate = new Map<string, number>();
    reports.forEach((r) => {
      reportsByDate.set(
        r.date,
        (reportsByDate.get(r.date) || 0) + (r.sales_amount || 0)
      );
    });

    const rows: { date: string; 想定: number; 実績: number | null }[] = [];
    let cumExpected = 0;
    let cumActual = 0;
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      cumExpected += shiftsByDate.get(dateStr) || 0;
      if (dateStr <= today) {
        cumActual += reportsByDate.get(dateStr) || 0;
        rows.push({
          date: `${m}/${day}`,
          想定: cumExpected,
          実績: cumActual,
        });
      } else {
        rows.push({
          date: `${m}/${day}`,
          想定: cumExpected,
          実績: null,
        });
      }
    }
    return rows;
  }, [shifts, reports, ym, m, lastDay, today]);

  const storeStats = useMemo(() => {
    const byLoc = new Map<
      string,
      { name: string; count: number; target: number }
    >();
    shifts.forEach((s) => {
      const name = locName(s) || `店舗${s.location_id}`;
      const cur = byLoc.get(name) || { name, count: 0, target: 0 };
      cur.count++;
      cur.target += s.target || 0;
      byLoc.set(name, cur);
    });

    const salesByName = new Map<string, number>();
    reports.forEach((r) => {
      salesByName.set(
        r.location,
        (salesByName.get(r.location) || 0) + (r.sales_amount || 0)
      );
    });

    const rows: {
      name: string;
      count: number;
      target: number;
      actual: number;
      rate: number;
    }[] = [];
    byLoc.forEach((v) => {
      const actual = salesByName.get(v.name) || 0;
      const rate = v.target > 0 ? Math.round((actual / v.target) * 100) : 0;
      rows.push({
        name: v.name,
        count: v.count,
        target: v.target,
        actual,
        rate,
      });
    });
    return rows.sort((a, b) => b.target - a.target);
  }, [shifts, reports]);

  const monthOpts = useMemo(() => genMonthOptions(12), []);

  const rateClass = (rate: number) =>
    rate >= 100
      ? "text-green-600"
      : rate >= 90
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-brand-dark">
          📊 月間ダッシュボード
        </h2>
        <select
          value={ym}
          onChange={(e) => setYm(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          {monthOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <MonthlySummary yearMonth={ym} variant="large" />

      <div className="card">
        <h3 className="text-base font-bold mb-3">日別累積グラフ</h3>
        {error && <p className="text-sm text-red-600 mb-2">エラー: {error}</p>}
        {loading ? (
          <p className="text-sm text-stone-500">読み込み中…</p>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v: number) =>
                    v >= 10000 ? `${Math.round(v / 10000)}万` : String(v)
                  }
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: any) => yen(Number(v))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="想定"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="実績"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-base font-bold mb-3">店舗別実績</h3>
        {loading ? (
          <p className="text-sm text-stone-500">読み込み中…</p>
        ) : storeStats.length === 0 ? (
          <p className="text-sm text-stone-500">データがありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-stone-200">
                <th className="py-2 pr-3">店舗名</th>
                <th className="py-2 pr-3 text-right">出店回数</th>
                <th className="py-2 pr-3 text-right">目標合計</th>
                <th className="py-2 pr-3 text-right">実績合計</th>
                <th className="py-2 text-right">達成率</th>
              </tr>
            </thead>
            <tbody>
              {storeStats.map((s) => (
                <tr
                  key={s.name}
                  className="border-b border-stone-100 last:border-b-0"
                >
                  <td className="py-2 pr-3">{s.name}</td>
                  <td className="py-2 pr-3 text-right">{s.count}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {yen(s.target)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {yen(s.actual)}
                  </td>
                  <td
                    className={`py-2 text-right font-mono font-bold ${rateClass(
                      s.rate
                    )}`}
                  >
                    {s.rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
