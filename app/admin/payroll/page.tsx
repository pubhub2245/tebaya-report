"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import { laborFor } from "@/lib/formState";
import AdminGate from "@/app/components/AdminGate";

/**
 * スタッフ別 月間稼働集計（給与計算の補助）。
 * daily_reports から、月ごとに各スタッフの「実働日数」を集計する。
 * - 共同出店（「A、B」）は分解して各人にカウント
 * - カタカナ/ひらがなの表記ゆれ（カズキ↔かずき）はひらがなに正規化して名寄せ
 * - 同じ日に複数店（手羽屋＋もも屋）や重複があっても「1日」で数える
 * データは読み取りのみ。
 */

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

type Row = {
  date: string;
  staff_name: string | null;
  shop: string | null;
  location: string | null;
  labor: number | null;
  sales_amount: number | null;
};

/** カタカナ→ひらがな */
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** 「なぎさ、かずき＆ゆうや」→ ['なぎさ','かずき','ゆうや'] （正規化済み） */
function splitStaff(name: string | null): string[] {
  if (!name) return [];
  return kataToHira(name)
    .split(/[、,＆&・\/／\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

type DayEntry = {
  date: string;
  shops: Set<string>;
  locations: Set<string>;
  groupSize: number;
};

type StaffSummary = {
  name: string;
  days: number;
  estimatePay: number;
  entries: DayEntry[];
};

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PayrollPage() {
  return (
    <AdminGate>
      <PayrollInner />
    </AdminGate>
  );
}

function PayrollInner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [openStaff, setOpenStaff] = useState<string | null>(null);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("daily_reports")
      .select("date, staff_name, shop, location, labor, sales_amount")
      .gte("date", `${monthStr}-01`)
      .lte("date", `${monthStr}-31`)
      .order("date");
    if (error) setError(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [monthStr]);

  useEffect(() => {
    load();
  }, [load]);

  const summaries = useMemo<StaffSummary[]>(() => {
    // staff → date → DayEntry
    const byStaff = new Map<string, Map<string, DayEntry>>();
    for (const r of rows) {
      const names = splitStaff(r.staff_name);
      const groupSize = names.length || 1;
      for (const name of names) {
        let dayMap = byStaff.get(name);
        if (!dayMap) {
          dayMap = new Map();
          byStaff.set(name, dayMap);
        }
        let entry = dayMap.get(r.date);
        if (!entry) {
          entry = {
            date: r.date,
            shops: new Set(),
            locations: new Set(),
            groupSize,
          };
          dayMap.set(r.date, entry);
        }
        if (r.shop) entry.shops.add(r.shop);
        if (r.location) entry.locations.add(r.location);
        entry.groupSize = Math.max(entry.groupSize, groupSize);
      }
    }

    const result: StaffSummary[] = [];
    for (const [name, dayMap] of byStaff) {
      const entries = Array.from(dayMap.values()).sort((a, b) =>
        a.date < b.date ? -1 : 1,
      );
      const days = entries.length;
      result.push({
        name,
        days,
        estimatePay: days * laborFor(name),
        entries,
      });
    }
    result.sort((a, b) => b.days - a.days);
    return result;
  }, [rows]);

  const totalPay = summaries.reduce((s, x) => s + x.estimatePay, 0);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">👥 スタッフ別 稼働</h1>
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary text-sm">
            管理者ページ
          </Link>
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
        </div>
      </header>

      <p className="text-xs text-stone-500">
        日報から各スタッフの実働日数を自動集計します（給与計算の補助）。共同出店・表記ゆれ・同日複数店もまとめて1日で数えます。
      </p>

      {/* 月切替 */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={prevMonth} className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100">
          ◀
        </button>
        <span className="text-xl font-bold text-brand-dark">
          {year}年{month}月
        </span>
        <button onClick={nextMonth} className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100">
          ▶
        </button>
      </div>

      {error && (
        <div className="card text-sm bg-red-50 text-red-700 border border-red-200">
          ❌ {error}
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && summaries.length === 0 && (
        <p className="text-sm text-stone-400 py-4">この月の日報がありません。</p>
      )}

      {!loading && summaries.length > 0 && (
        <>
          <div className="card flex justify-between items-center bg-emerald-50 border border-emerald-200">
            <span className="text-sm font-bold text-emerald-800">
              全スタッフ 概算日当合計
            </span>
            <span className="text-xl font-extrabold font-mono text-emerald-700">
              {yen(totalPay)}
            </span>
          </div>

          <div className="space-y-2">
            {summaries.map((s) => (
              <div key={s.name} className="card space-y-2">
                <button
                  onClick={() =>
                    setOpenStaff(openStaff === s.name ? null : s.name)
                  }
                  className="w-full flex items-center justify-between gap-2"
                >
                  <span className="font-bold text-stone-800 text-lg">
                    {s.name}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-stone-600">
                      稼働{" "}
                      <span className="text-xl font-extrabold text-brand-dark">
                        {s.days}
                      </span>
                      日
                    </span>
                    <span className="text-sm font-mono text-emerald-700">
                      {yen(s.estimatePay)}
                    </span>
                    <span className="text-stone-400 text-xs">
                      {openStaff === s.name ? "▲" : "▼"}
                    </span>
                  </span>
                </button>

                {openStaff === s.name && (
                  <div className="space-y-1 pt-1 border-t border-stone-100">
                    {s.entries.map((e) => {
                      const d = new Date(e.date + "T00:00:00");
                      const [, m, dd] = e.date.split("-");
                      return (
                        <div
                          key={e.date}
                          className="flex items-center justify-between text-xs text-stone-600 py-0.5"
                        >
                          <span className="font-mono">
                            {parseInt(m)}/{parseInt(dd)}（{DOW[d.getDay()]}）
                          </span>
                          <span className="flex-1 px-2 truncate text-stone-500">
                            {Array.from(e.shops).join("・")}
                            {e.locations.size > 0 &&
                              `｜${Array.from(e.locations).join("・")}`}
                          </span>
                          {e.groupSize > 1 && (
                            <span className="text-stone-400">
                              {e.groupSize}人
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-stone-400 pt-1">
                      概算日当 = 稼働{s.days}日 × 標準日当{yen(laborFor(s.name))}
                      。イベント等で日当が違う日は別途調整してください。
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-stone-400 leading-relaxed pt-1">
            ※ 「稼働日数」は日報の日付で数えた実働日数です（同じ日に複数店・重複があっても1日）。
            日当は各スタッフの標準日当×日数の概算で、イベント日当などは反映していません。
            表記ゆれ（カズキ↔かずき等）はひらがなに揃えて集計しています。
          </p>
        </>
      )}
    </main>
  );
}
