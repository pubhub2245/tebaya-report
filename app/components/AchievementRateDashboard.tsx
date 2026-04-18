"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RateRow = {
  location_id: string | null;
  location_name: string;
  day_type: string;
  hour: number;
  rate: number;
  sample_count: number;
  is_global: boolean;
};

type CalcLog = {
  id: string;
  calculated_at: string;
  data_count: number;
  rates_updated: number;
  triggered_by: string;
  notes: string | null;
};

const HOURS = [11, 13, 15, 17, 19, 20];

export default function AchievementRateDashboard() {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [lastCalc, setLastCalc] = useState<CalcLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ratesRes, logRes, locsRes] = await Promise.all([
        supabase
          .from("achievement_rates")
          .select("location_id, day_type, hour, rate, sample_count, is_global")
          .order("location_id", { ascending: true, nullsFirst: true })
          .order("day_type")
          .order("hour"),
        supabase
          .from("achievement_rate_calculations")
          .select("*")
          .order("calculated_at", { ascending: false })
          .limit(1),
        supabase.from("locations").select("id, name"),
      ]);
      if (ratesRes.error) throw ratesRes.error;
      if (logRes.error) throw logRes.error;
      if (locsRes.error) throw locsRes.error;

      const locNames = new Map<string, string>();
      (locsRes.data || []).forEach((l: any) =>
        locNames.set(String(l.id), l.name)
      );

      const rows = (ratesRes.data || []).map((r: any) => ({
        ...r,
        location_name: r.is_global
          ? "全店平均"
          : locNames.get(String(r.location_id)) || `店舗${r.location_id}`,
      }));

      setRates(rows);
      setLastCalc((logRes.data?.[0] as CalcLog) || null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRecalc = async () => {
    setRecalculating(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/cron/calculate-achievement-rates?triggered_by=manual",
        {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ""}`,
          },
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "再計算失敗");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRecalculating(false);
    }
  };

  // Group rates by "location_name|day_type"
  type GroupedRow = {
    label: string;
    isGlobal: boolean;
    byHour: Map<number, { rate: number; sample_count: number; is_global: boolean }>;
  };
  const grouped: GroupedRow[] = [];
  const groupMap = new Map<string, GroupedRow>();

  rates.forEach((r) => {
    const dayLabel = r.day_type === "weekend" ? "土日" : "平日";
    const key = `${r.location_name}|${dayLabel}`;
    let g = groupMap.get(key);
    if (!g) {
      g = {
        label: `${r.location_name}（${dayLabel}）`,
        isGlobal: r.is_global,
        byHour: new Map(),
      };
      groupMap.set(key, g);
      grouped.push(g);
    }
    g.byHour.set(r.hour, {
      rate: r.rate,
      sample_count: r.sample_count,
      is_global: r.is_global,
    });
  });

  // Sort: globals first, then by name
  grouped.sort((a, b) => {
    if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-brand-dark">
          到達率の状況
        </h2>
        <button
          onClick={handleRecalc}
          disabled={recalculating}
          className="text-sm px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          {recalculating ? "再計算中…" : "今すぐ再計算"}
        </button>
      </div>

      {lastCalc && (
        <div className="text-xs text-stone-500">
          最終更新：
          {new Date(lastCalc.calculated_at).toLocaleString("ja-JP")}
          （{lastCalc.triggered_by === "cron" ? "cron自動実行" : "手動実行"}
          ・データ{lastCalc.data_count}件使用・{lastCalc.rates_updated}件更新）
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">読み込み中…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-stone-500">
          到達率データがありません。「今すぐ再計算」を実行してください。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-stone-200">
                <th className="py-2 pr-3 whitespace-nowrap">店舗×曜日</th>
                {HOURS.map((h) => (
                  <th
                    key={h}
                    className="py-2 px-2 text-center whitespace-nowrap"
                  >
                    {h}時
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <tr
                  key={g.label}
                  className={`border-b border-stone-100 last:border-b-0 ${
                    g.isGlobal ? "bg-stone-50" : ""
                  }`}
                >
                  <td className="py-2 pr-3 font-semibold whitespace-nowrap">
                    {g.label}
                  </td>
                  {HOURS.map((h) => {
                    const cell = g.byHour.get(h);
                    if (!cell) {
                      return (
                        <td
                          key={h}
                          className="py-2 px-2 text-center text-stone-400"
                        >
                          -
                        </td>
                      );
                    }
                    return (
                      <td key={h} className="py-2 px-2 text-center">
                        <div className="font-mono font-semibold">
                          {Math.round(cell.rate * 1000) / 10}%
                        </div>
                        <div
                          className={`text-[10px] ${
                            cell.is_global
                              ? "text-stone-400"
                              : "text-stone-500"
                          }`}
                        >
                          {cell.is_global
                            ? "全店平均"
                            : `(${cell.sample_count}件)`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
