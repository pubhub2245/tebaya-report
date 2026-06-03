"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";

type Props = {
  yearMonth?: string;
  variant?: "compact" | "large";
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

export default function MonthlySummary({
  yearMonth,
  variant = "compact",
}: Props) {
  const today = todayLocal();
  const ym = yearMonth ?? today.slice(0, 7);
  const { start, end, y, m } = getMonthRange(ym);
  const upTo = today < start ? start : today > end ? end : today;
  const upToLabel = `${parseInt(upTo.slice(5, 7), 10)}/${parseInt(upTo.slice(8, 10), 10)}`;

  const [target, setTarget] = useState(0);
  const [expected, setExpected] = useState(0);
  const [actual, setActual] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [shiftsAll, shiftsToDate, reports] = await Promise.all([
          supabase
            .from("shifts")
            .select("target")
            .eq("status", "published")
            .gte("date", start)
            .lte("date", end),
          supabase
            .from("shifts")
            .select("target")
            .eq("status", "published")
            .gte("date", start)
            .lte("date", upTo),
          supabase
            .from("daily_reports")
            .select("sales_amount")
            .gte("date", start)
            .lte("date", upTo),
        ]);
        if (shiftsAll.error) throw shiftsAll.error;
        if (shiftsToDate.error) throw shiftsToDate.error;
        if (reports.error) throw reports.error;
        if (cancelled) return;
        const t = (shiftsAll.data || []).reduce(
          (s: number, r: any) => s + (r.target || 0),
          0
        );
        const e = (shiftsToDate.data || []).reduce(
          (s: number, r: any) => s + (r.target || 0),
          0
        );
        const a = (reports.data || []).reduce(
          (s: number, r: any) => s + (r.sales_amount || 0),
          0
        );
        setTarget(t);
        setExpected(e);
        setActual(a);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end, upTo]);

  const rate = expected > 0 ? Math.round((actual / expected) * 100) : 0;
  const diff = actual - expected;
  const targetRate = target > 0 ? Math.round((actual / target) * 100) : 0;

  const tone =
    rate >= 100
      ? {
          bar: "bg-green-500",
          text: "text-green-600",
          ring: "ring-green-200",
          badge: "bg-green-100 text-green-700",
        }
      : rate >= 90
      ? {
          bar: "bg-yellow-500",
          text: "text-yellow-600",
          ring: "ring-yellow-200",
          badge: "bg-yellow-100 text-yellow-700",
        }
      : {
          bar: "bg-red-500",
          text: "text-red-600",
          ring: "ring-red-200",
          badge: "bg-red-100 text-red-700",
        };

  const isLarge = variant === "large";
  const titleSize = isLarge ? "text-lg" : "text-base";
  const valueSize = isLarge ? "text-2xl" : "text-xl";
  const barH = isLarge ? "h-5" : "h-4";
  const barPct = Math.min(100, Math.max(0, rate));

  return (
    <div
      className={`bg-white rounded-2xl shadow-md ring-1 ${tone.ring} p-5 ${
        isLarge ? "md:p-6" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className={`font-bold text-brand-dark ${titleSize}`}>
          📊 {y}年{m}月の進捗
        </div>
        <span
          className={`text-xs font-bold px-2 py-1 rounded-full ${tone.badge}`}
        >
          進捗率 {rate}%
        </span>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-2">読込エラー: {error}</p>
      )}
      {loading && !error && (
        <p className="text-sm text-stone-500 mb-2">読み込み中…</p>
      )}

      <div className={`grid ${isLarge ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"} gap-3 mb-4`}>
        <div>
          <div className="text-xs text-stone-500">月間目標</div>
          <div className={`font-bold text-brand-dark font-mono ${valueSize}`}>
            {yen(target)}
          </div>
        </div>
        <div>
          <div className="text-xs text-stone-500">
            現時点想定（{upToLabel}）
          </div>
          <div className={`font-bold text-stone-700 font-mono ${valueSize}`}>
            {yen(expected)}
          </div>
        </div>
        <div>
          <div className="text-xs text-stone-500">実績累計</div>
          <div className={`font-bold ${tone.text} font-mono ${valueSize}`}>
            {yen(actual)}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className={`w-full rounded-full bg-stone-200 overflow-hidden ${barH}`}>
          <div
            className={`${barH} ${tone.bar} transition-all`}
            style={{ width: `${barPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-stone-600">
          <span>進捗率 {rate}%</span>
          <span className={`font-semibold ${tone.text}`}>
            想定比 {diff >= 0 ? "+" : "-"}
            {yen(Math.abs(diff)).replace("¥", "¥")}
          </span>
        </div>
        {isLarge && (
          <div className="text-xs text-stone-500 mt-1">
            月間目標達成率：{targetRate}%
          </div>
        )}
      </div>
    </div>
  );
}
