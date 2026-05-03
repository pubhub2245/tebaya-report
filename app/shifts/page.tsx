"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { shortLocationName } from "@/lib/locationDisplay";

type Shift = {
  id: number;
  date: string;
  location_id: number;
  rank: string;
  target: number;
  staff_name: string | null;
  note: string | null;
  status: string;
  locations?: { name: string } | null;
};

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

function getNoteKind(note: string | null): "unconfirmed" | "staff_required" | null {
  if (!note) return null;
  if (note.includes("【スタッフ要設定】")) return "staff_required";
  if (note.includes("【未確定】")) return "unconfirmed";
  return null;
}

export default function StaffShiftsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [staffList, setStaffList] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"calendar" | "list">("calendar");

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();

  // データ取得
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("shifts")
        .select("*, locations(name)")
        .eq("status", "published")
        .gte("date", `${monthStr}-01`)
        .lte("date", `${monthStr}-${lastDay}`)
        .order("date");
      const shifts = (data as Shift[]) || [];
      setAllShifts(shifts);

      // 個人名リストを抽出（連名は除外）
      const names = new Set<string>();
      for (const s of shifts) {
        if (!s.staff_name) continue;
        // 「&」を含む場合は分割して個人名を登録
        if (s.staff_name.includes("&")) {
          s.staff_name.split("&").forEach((n) => {
            const trimmed = n.trim();
            if (trimmed) names.add(trimmed);
          });
        } else {
          names.add(s.staff_name.trim());
        }
      }
      setStaffList(Array.from(names).sort());
      setLoading(false);
    })();
  }, [year, month]);

  // 選択した担当者のシフト（連名含む）
  const myShifts = useMemo(() => {
    if (!selectedStaff) return [];
    return allShifts.filter((s) => s.staff_name?.includes(selectedStaff));
  }, [allShifts, selectedStaff]);

  // カレンダー週配列
  const calendarWeeks = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startDow = first.getDay();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= lastDay; d++) {
      week.push(d);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [year, month, lastDay]);

  // 日ごとのシフト
  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of myShifts) {
      const arr = m.get(s.date) || [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [myShifts]);

  // サマリー
  const summary = useMemo(() => {
    if (!selectedStaff || myShifts.length === 0) return null;
    const uniqueDates = new Set(myShifts.map((s) => s.date));
    const totalTarget = myShifts.reduce((s, sh) => s + (sh.target || 0), 0);

    // 店舗別日数
    const locCount = new Map<string, number>();
    for (const s of myShifts) {
      const name =
        shortLocationName((s.locations as any)?.name || "") ||
        `店舗ID:${s.location_id}`;
      locCount.set(name, (locCount.get(name) || 0) + 1);
    }
    const locSorted = Array.from(locCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return {
      days: uniqueDates.size,
      totalTarget,
      locations: locSorted,
    };
  }, [myShifts, selectedStaff]);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const dateStr = (day: number) =>
    `${monthStr}-${String(day).padStart(2, "0")}`;

  return (
    <main className="max-w-md mx-auto px-4 py-5 pb-24">
      <header className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-sm px-3 py-2"
        >
          🏠 トップ
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">📅 シフト確認</h1>
        <div className="w-16" />
      </header>

      {/* 担当者選択 + 表示切替 */}
      <section className="card mb-4 space-y-3">
        <div>
          <label className="label">担当者</label>
          <select
            className="field"
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
          >
            <option value="">-- 担当者を選択 --</option>
            {staffList.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex rounded-lg border border-stone-300 overflow-hidden">
          <button
            onClick={() => setView("calendar")}
            className={`flex-1 text-sm py-2 font-bold ${
              view === "calendar"
                ? "bg-brand text-white"
                : "bg-white text-stone-600"
            }`}
          >
            📅 カレンダー
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex-1 text-sm py-2 font-bold ${
              view === "list"
                ? "bg-brand text-white"
                : "bg-white text-stone-600"
            }`}
          >
            📋 リスト
          </button>
        </div>
      </section>

      {/* 月切替 */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button
          onClick={prevMonth}
          className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100"
        >
          ◀
        </button>
        <span className="text-xl font-bold text-brand-dark">
          {year}年{month}月
        </span>
        <button
          onClick={nextMonth}
          className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100"
        >
          ▶
        </button>
      </div>

      {loading && (
        <p className="text-center text-stone-500 py-8">読み込み中…</p>
      )}

      {!loading && !selectedStaff && (
        <p className="text-center text-stone-400 py-12">
          担当者を選択してください
        </p>
      )}

      {!loading && selectedStaff && (
        <>
          {/* カレンダー表示 */}
          {view === "calendar" && (
            <div className="card overflow-x-auto mb-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {DAY_NAMES.map((d, i) => (
                      <th
                        key={d}
                        className={`text-center text-xs font-bold py-2 border-b border-stone-200 ${
                          i === 0
                            ? "text-red-500"
                            : i === 6
                              ? "text-blue-500"
                              : "text-stone-600"
                        }`}
                      >
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendarWeeks.map((week, wi) => (
                    <tr key={wi}>
                      {week.map((day, di) => {
                        if (day === null) {
                          return (
                            <td
                              key={di}
                              className="border border-stone-100 p-1 h-16"
                            />
                          );
                        }
                        const ds = dateStr(day);
                        const dayShifts = shiftsByDate.get(ds) || [];
                        const hasShift = dayShifts.length > 0;
                        const dayHasStaffRequired = dayShifts.some(
                          (s) => getNoteKind(s.note) === "staff_required",
                        );
                        const dayHasUnconfirmed = dayShifts.some(
                          (s) => getNoteKind(s.note) === "unconfirmed",
                        );
                        const cellBg = hasShift
                          ? dayHasStaffRequired
                            ? "bg-orange-100"
                            : dayHasUnconfirmed
                              ? "bg-yellow-100"
                              : "bg-orange-100"
                          : "bg-stone-50";
                        return (
                          <td
                            key={di}
                            className={`border border-stone-100 p-1 h-16 align-top ${cellBg} ${
                              di === 0
                                ? "text-red-500"
                                : di === 6
                                  ? "text-blue-500"
                                  : ""
                            }`}
                          >
                            <div className="text-xs font-semibold">{day}</div>
                            {hasShift && (
                              <div className="text-[9px] font-bold text-orange-700 mt-0.5 leading-tight">
                                {dayShifts.map((s, si) => {
                                  const kind = getNoteKind(s.note);
                                  return (
                                    <div key={si}>
                                      {kind === "staff_required" && (
                                        <span className="text-red-600 font-bold mr-0.5">
                                          👤
                                        </span>
                                      )}
                                      {kind === "unconfirmed" && (
                                        <span className="text-red-600 font-bold mr-0.5">
                                          ⚠️
                                        </span>
                                      )}
                                      {shortLocationName(
                                        (s.locations as any)?.name || "",
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* リスト表示 */}
          {view === "list" && (
            <div className="space-y-2 mb-4">
              {myShifts.length === 0 ? (
                <p className="text-center text-stone-400 py-8">
                  出勤予定はありません
                </p>
              ) : (
                myShifts.map((s) => {
                  const d = new Date(s.date + "T00:00:00");
                  const dayName = DAY_NAMES[d.getDay()];
                  const [, m2, d2] = s.date.split("-");
                  const locName =
                    shortLocationName(
                      (s.locations as any)?.name || "",
                    ) || `店舗ID:${s.location_id}`;
                  const kind = getNoteKind(s.note);
                  const cardBg =
                    kind === "staff_required"
                      ? "bg-orange-100 border border-orange-300"
                      : kind === "unconfirmed"
                        ? "bg-yellow-100 border border-yellow-300"
                        : "";
                  return (
                    <div key={s.id} className={`card py-3 ${cardBg}`}>
                      {kind && (
                        <div className="mb-1 text-xs font-bold text-red-600">
                          {kind === "staff_required"
                            ? "👤 スタッフ要設定"
                            : "⚠️ 未確定"}
                        </div>
                      )}
                      <div className="text-sm font-bold text-stone-700">
                        {parseInt(m2)}/{parseInt(d2)}（{dayName}）
                      </div>
                      <div className="text-sm mt-1">
                        <span className="font-bold text-brand-dark">
                          📍 {locName}（{s.rank}）
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        目標：{yen(s.target || 0)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* サマリー */}
          {summary && summary.days > 0 && (
            <div className="card bg-orange-50 border border-orange-200">
              <div className="font-bold text-brand-dark mb-2">
                {selectedStaff}の{year}年{month}月
              </div>
              <div className="text-sm space-y-1 text-stone-700">
                <div className="flex justify-between">
                  <span>📊 出勤日数</span>
                  <span className="font-bold">{summary.days}日</span>
                </div>
                <div className="flex justify-between">
                  <span>🎯 月間目標合計</span>
                  <span className="font-bold">
                    {yen(summary.totalTarget)}
                  </span>
                </div>
              </div>
              {summary.locations.length > 0 && (
                <div className="mt-3 pt-2 border-t border-orange-200">
                  <div className="text-xs font-bold text-stone-600 mb-1">
                    📍 出店店舗（多い順）
                  </div>
                  <div className="text-xs text-stone-600 space-y-0.5">
                    {summary.locations.map((l) => (
                      <div key={l.name}>
                        ・{l.name}：{l.count}日
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {myShifts.length === 0 && (
            <p className="text-center text-stone-400 py-4">
              出勤予定はありません
            </p>
          )}
        </>
      )}
    </main>
  );
}
