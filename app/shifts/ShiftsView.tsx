"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { shortLocationName } from "@/lib/locationDisplay";
import ShiftFormModal, {
  type Shift,
  type ShiftLocation,
  type ShiftFormPayload,
  type ShiftPrefill,
  resolveShiftVenueName,
} from "@/app/components/ShiftFormModal";

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

/** 問い合わせ「OK」→ 出店予定登録の引き継ぎ要求 */
export type OpenNewShiftRequest = {
  date: string | null;
  storeName: string;
  token: number; // 変化を検知して開くためのカウンタ
};

export default function ShiftsView({
  openNewRequest,
}: {
  openNewRequest?: OpenNewShiftRequest | null;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [staffList, setStaffList] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"calendar" | "list">("calendar");

  const [locations, setLocations] = useState<ShiftLocation[]>([]);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [prefill, setPrefill] = useState<ShiftPrefill | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();

  const load = async () => {
    setLoading(true);
    const [shiftsRes, locsRes] = await Promise.all([
      supabase
        .from("shifts")
        .select("*, locations(name)")
        .eq("status", "published")
        .gte("date", `${monthStr}-01`)
        .lte("date", `${monthStr}-${lastDay}`)
        .order("date"),
      supabase
        .from("locations")
        .select("id, name, rank, target")
        .eq("is_active", true)
        .order("name"),
    ]);
    const shifts = (shiftsRes.data as Shift[]) || [];
    setAllShifts(shifts);
    setLocations((locsRes.data as ShiftLocation[]) || []);

    const names = new Set<string>();
    for (const s of shifts) {
      if (!s.staff_name) continue;
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
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // 問い合わせ「OK」から出店予定登録を開く（店名→店舗マスタを照合、無ければ自由入力）
  useEffect(() => {
    if (!openNewRequest) return;
    const { date, storeName } = openNewRequest;
    // 店舗マスタ名と照合（完全一致 or 略称一致）
    const matched = locations.find(
      (l) =>
        l.name === storeName ||
        shortLocationName(l.name) === storeName ||
        shortLocationName(l.name) === shortLocationName(storeName),
    );
    if (date) {
      const [y, m] = date.split("-").map(Number);
      if (y && m) {
        setYear(y);
        setMonth(m);
      }
    }
    setEditingShift(null);
    setPrefill(
      matched
        ? {
            date: date || undefined,
            location_id: matched.id,
            rank: matched.rank,
            target: matched.target,
          }
        : { date: date || undefined, freeVenue: storeName },
    );
    setShowFormModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewRequest?.token]);

  const myShifts = useMemo(() => {
    if (!selectedStaff) return [];
    return allShifts.filter((s) => s.staff_name?.includes(selectedStaff));
  }, [allShifts, selectedStaff]);

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

  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of myShifts) {
      const arr = m.get(s.date) || [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [myShifts]);

  const summary = useMemo(() => {
    if (!selectedStaff || myShifts.length === 0) return null;
    const uniqueDates = new Set(myShifts.map((s) => s.date));
    const totalTarget = myShifts.reduce((s, sh) => s + (sh.target || 0), 0);

    const locCount = new Map<string, number>();
    for (const s of myShifts) {
      const resolved = resolveShiftVenueName(s);
      const name =
        shortLocationName(resolved) || resolved || `店舗ID:${s.location_id}`;
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

  const dateStr = (day: number) => `${monthStr}-${String(day).padStart(2, "0")}`;

  const defaultDateForNew = `${monthStr}-${String(now.getDate()).padStart(2, "0")}`;

  const handleSave = async (data: ShiftFormPayload) => {
    setSaving(true);
    setActionResult(null);
    try {
      if (editingShift) {
        const { error } = await supabase
          .from("shifts")
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingShift.id);
        if (error) throw error;
        setActionResult("✅ 出店予定を更新しました");
      } else {
        const { error } = await supabase.from("shifts").insert(data);
        if (error) throw error;
        setActionResult("✅ 出店予定を登録しました");
      }
      setShowFormModal(false);
      setEditingShift(null);
      setPrefill(undefined);
      load();
    } catch (e: any) {
      setActionResult(`❌ 保存失敗：${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  // 出店予定の取り消し（削除）。間違い・重複時に消せるように。
  const handleDelete = async () => {
    if (!editingShift) return;
    if (!window.confirm("この出店予定を取り消し（削除）しますか？")) return;
    setSaving(true);
    setActionResult(null);
    try {
      const { error } = await supabase
        .from("shifts")
        .delete()
        .eq("id", editingShift.id);
      if (error) throw error;
      setActionResult("✅ 出店予定を取り消しました");
      setShowFormModal(false);
      setEditingShift(null);
      setPrefill(undefined);
      load();
    } catch (e: any) {
      setActionResult(`❌ 取り消し失敗：${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* 出店予定の登録ボタン（誰でも入力可） */}
      <button
        onClick={() => {
          setEditingShift(null);
          setPrefill(undefined);
          setShowFormModal(true);
        }}
        className="w-full mb-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold px-4 py-3 rounded-xl text-sm shadow"
      >
        ＋ 出店予定を登録
      </button>

      {actionResult && (
        <div
          className={`mb-4 card text-sm font-semibold ${
            actionResult.startsWith("✅")
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {actionResult}
        </div>
      )}

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
              view === "list" ? "bg-brand text-white" : "bg-white text-stone-600"
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

      {loading && <p className="text-center text-stone-500 py-8">読み込み中…</p>}

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
                        return (
                          <td
                            key={di}
                            className={`border border-stone-100 p-1 h-16 align-top ${
                              hasShift ? "bg-orange-100" : "bg-stone-50"
                            } ${
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
                                  const resolved = resolveShiftVenueName(s);
                                  return (
                                    <div key={si}>
                                      {shortLocationName(resolved) || resolved}
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
                  const resolvedName = resolveShiftVenueName(s);
                  const locName =
                    shortLocationName(resolvedName) ||
                    resolvedName ||
                    `店舗ID:${s.location_id}`;
                  return (
                    <div key={s.id} className="card py-3">
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
                      <div className="mt-2">
                        <button
                          onClick={() => {
                            setEditingShift(s);
                            setPrefill(undefined);
                            setShowFormModal(true);
                          }}
                          className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50"
                        >
                          編集
                        </button>
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
                  <span className="font-bold">{yen(summary.totalTarget)}</span>
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

      {showFormModal && (
        <ShiftFormModal
          shift={editingShift}
          defaultDate={editingShift?.date || defaultDateForNew}
          locations={locations}
          saving={saving}
          defaultStatus="published"
          prefill={prefill}
          onClose={() => {
            setShowFormModal(false);
            setEditingShift(null);
            setPrefill(undefined);
          }}
          onSave={handleSave}
          onDelete={editingShift ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
