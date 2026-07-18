"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AdminGate from "@/app/components/AdminGate";
import ShiftFormModal, {
  resolveShiftVenueName,
  stripFreeVenueFromNote,
} from "@/app/components/ShiftFormModal";

// TODO: 将来追加予定の機能
// - 希望休申請（shift_change_requestsテーブル）
// - シフト交代募集
// - スマホでドラッグ＆ドロップ移動
// - スタッフ個別のLINE通知
// - 過去実績ベースの担当者推奨
// - Instagram投稿用テンプレートのカスタマイズ機能

type Location = { id: number; name: string; rank: string; target: number };

type Shift = {
  id: number;
  date: string;
  location_id: number;
  rank: string;
  target: number;
  staff_name: string | null;
  note: string | null;
  status: string;
  planned_open_time: string | null;
  planned_close_time: string | null;
  published_at: string | null;
  line_notified_at: string | null;
  locations?: { name: string } | null;
};

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const STATUS_LABEL: Record<string, string> = {
  draft: "未確定",
  published: "確定済み",
  cancelled: "中止",
};
const STATUS_ICON: Record<string, string> = {
  draft: "📝",
  published: "📤",
  cancelled: "🚫",
};

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

export default function ShiftsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // モーダル
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // 操作中フラグ
  const [copying, setCopying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [shiftsRes, locsRes] = await Promise.all([
        supabase
          .from("shifts")
          .select("*, locations(name)")
          .gte("date", `${monthStr}-01`)
          .lte("date", `${monthStr}-${lastDay}`)
          .order("date"),
        supabase
          .from("locations")
          .select("id, name, rank, target")
          .eq("is_active", true)
          .order("name"),
      ]);
      if (shiftsRes.error) throw shiftsRes.error;
      if (locsRes.error) throw locsRes.error;
      setShifts((shiftsRes.data as Shift[]) || []);
      setLocations((locsRes.data as Location[]) || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [year, month]);

  // カレンダーデータ
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

  // 日ごとのシフト件数
  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const arr = m.get(s.date) || [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [shifts]);

  // サマリー
  const summary = useMemo(() => {
    const active = shifts.filter((s) => s.status !== "cancelled");
    const published = shifts.filter((s) => s.status === "published");
    const draft = shifts.filter((s) => s.status === "draft");
    const totalTarget = active.reduce((s, sh) => s + (sh.target || 0), 0);
    return {
      total: active.length,
      published: published.length,
      draft: draft.length,
      totalTarget,
    };
  }, [shifts]);

  // 月切替
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

  // 先月コピー
  const handleCopy = async () => {
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    if (
      !confirm(
        `先月（${prevY}年${prevM}月）のシフトを${year}年${month}月にコピーしますか？\n日付は同じ曜日に合わせます。status は「未確定」で作成されます。`,
      )
    )
      return;
    setCopying(true);
    setActionResult(null);
    try {
      const res = await fetch("/api/shifts/copy-from-last-month", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ""}`,
        },
        body: JSON.stringify({ target_month: monthStr }),
      });
      const data = await res.json();
      setActionResult(
        data.success
          ? `✅ ${data.message}`
          : `❌ ${data.error || "不明なエラー"}`,
      );
      if (data.success) load();
    } catch (e: any) {
      setActionResult(`❌ 通信エラー: ${e?.message || e}`);
    } finally {
      setCopying(false);
    }
  };

  // LINE通知で確定
  const handlePublish = async () => {
    if (summary.draft === 0) {
      setActionResult("未確定のシフトがありません");
      return;
    }
    if (
      !confirm(
        `${year}年${month}月のシフト（未確定 ${summary.draft}件）をLINEグループに通知して確定しますか？`,
      )
    )
      return;
    setPublishing(true);
    setActionResult(null);
    try {
      const res = await fetch("/api/shifts/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ""}`,
        },
        body: JSON.stringify({ target_month: monthStr }),
      });
      const data = await res.json();
      if (data.success) {
        setActionResult(
          `✅ ${data.published_count}件を確定、LINE通知を${data.messages_sent}通送信しました`,
        );
        load();
      } else {
        setActionResult(`❌ ${data.error || "不明なエラー"}`);
      }
    } catch (e: any) {
      setActionResult(`❌ 通信エラー: ${e?.message || e}`);
    } finally {
      setPublishing(false);
    }
  };

  // シフト削除
  const handleDelete = async (id: number): Promise<boolean> => {
    if (!confirm("このシフトを削除しますか？")) return false;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) throw error;
      setShifts((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch (e: any) {
      alert("削除失敗: " + (e?.message || e));
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  // シフト中止
  const handleCancel = async (id: number) => {
    if (!confirm("このシフトを中止にしますか？")) return;
    try {
      const { error } = await supabase
        .from("shifts")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      load();
    } catch (e: any) {
      alert("更新失敗: " + (e?.message || e));
    }
  };

  // 日付セルの背景
  const cellBg = (count: number) => {
    if (count === 0) return "bg-white";
    if (count === 1) return "bg-orange-50";
    if (count === 2) return "bg-orange-100";
    return "bg-orange-200";
  };

  const dateStr = (day: number) =>
    `${monthStr}-${String(day).padStart(2, "0")}`;

  return (
    <AdminGate>
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <Link
            href="/admin"
            className="btn-secondary text-sm"
          >
            ← 管理者ページへ
          </Link>
          <h1 className="text-xl font-bold text-brand-dark">
            🗓️ シフト管理
          </h1>
          <div className="w-20" />
        </header>

        {/* 月切替 */}
        <div className="flex items-center justify-center gap-3">
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

        {/* Instagram投稿モード */}
        <Link
          href={`/admin/shifts/instagram`}
          className="block w-full bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 text-white font-bold px-4 py-3 rounded-xl text-sm text-center shadow"
        >
          📷 Instagram投稿モード
        </Link>

        {/* アクションボタン */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleCopy}
            disabled={copying}
            className="flex-1 bg-stone-600 hover:bg-stone-700 text-white font-bold px-4 py-3 rounded-xl disabled:opacity-50 text-sm"
          >
            {copying ? "コピー中…" : "📋 先月コピー"}
          </button>
          <button
            onClick={() => {
              setEditingShift(null);
              setShowAddModal(true);
              setSelectedDate(null);
            }}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-3 rounded-xl text-sm"
          >
            ＋ 新規追加
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </p>
        )}

        {/* カレンダー */}
        <div className="card overflow-x-auto">
          {loading ? (
            <p className="text-center text-stone-500 py-8">読み込み中…</p>
          ) : (
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
                      const activeCount = dayShifts.filter(
                        (s) => s.status !== "cancelled",
                      ).length;
                      return (
                        <td
                          key={di}
                          onClick={() => setSelectedDate(ds)}
                          className={`border border-stone-100 p-1 h-16 align-top cursor-pointer hover:bg-orange-50 transition-colors ${cellBg(activeCount)} ${
                            di === 0
                              ? "text-red-500"
                              : di === 6
                                ? "text-blue-500"
                                : ""
                          }`}
                        >
                          <div className="text-xs font-semibold">{day}</div>
                          {activeCount > 0 && (
                            <div className="text-[10px] text-center mt-1 font-bold text-orange-700">
                              📍{activeCount}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* サマリー */}
        <div className="card">
          <div className="text-sm text-stone-600 space-y-1">
            <div className="flex justify-between">
              <span>月間出店件数</span>
              <span className="font-bold">{summary.total}件</span>
            </div>
            <div className="flex justify-between">
              <span>月間目標</span>
              <span className="font-bold">{yen(summary.totalTarget)}</span>
            </div>
            <div className="flex justify-between">
              <span>状態</span>
              <span>
                確定 {summary.published}件 / 未確定 {summary.draft}件
              </span>
            </div>
          </div>
        </div>

        {/* LINE通知確定ボタン */}
        <button
          onClick={handlePublish}
          disabled={publishing || summary.draft === 0}
          className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold text-base px-6 py-4 rounded-xl shadow-md disabled:opacity-50 transition-colors"
        >
          {publishing
            ? "📢 送信中…"
            : `📢 シフトをLINE通知で確定（未確定 ${summary.draft}件）`}
        </button>

        {actionResult && (
          <div
            className={`card text-sm font-semibold ${
              actionResult.startsWith("✅")
                ? "bg-green-50 text-green-700 border border-green-200"
                : actionResult.startsWith("❌")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-stone-50 text-stone-700 border border-stone-200"
            }`}
          >
            {actionResult}
          </div>
        )}

        {/* 日付詳細モーダル */}
        {selectedDate && !showAddModal && !editingShift && (
          <DateModal
            dateStr={selectedDate}
            shifts={shiftsByDate.get(selectedDate) || []}
            onClose={() => setSelectedDate(null)}
            onAdd={() => {
              setShowAddModal(true);
            }}
            onEdit={(s) => {
              setEditingShift(s);
              setShowAddModal(true);
            }}
            onCancel={handleCancel}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        )}

        {/* 追加/編集モーダル */}
        {showAddModal && (
          <ShiftFormModal
            shift={editingShift}
            defaultDate={selectedDate || dateStr(1)}
            locations={locations}
            saving={saving}
            onClose={() => {
              setShowAddModal(false);
              setEditingShift(null);
            }}
            onDelete={
              editingShift
                ? async () => {
                    const ok = await handleDelete(editingShift.id);
                    if (ok) {
                      setShowAddModal(false);
                      setEditingShift(null);
                    }
                  }
                : undefined
            }
            onSave={async (data) => {
              setSaving(true);
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
                } else {
                  const { error } = await supabase
                    .from("shifts")
                    .insert(data);
                  if (error) throw error;
                }
                setShowAddModal(false);
                setEditingShift(null);
                load();
              } catch (e: any) {
                alert("保存失敗: " + (e?.message || e));
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
      </main>
    </AdminGate>
  );
}

/* ─── 日付詳細モーダル ─── */
function DateModal({
  dateStr,
  shifts,
  onClose,
  onAdd,
  onEdit,
  onCancel,
  onDelete,
  deletingId,
}: {
  dateStr: string;
  shifts: Shift[];
  onClose: () => void;
  onAdd: () => void;
  onEdit: (s: Shift) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  deletingId: number | null;
}) {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = DAY_NAMES[d.getDay()];
  const [, m, day] = dateStr.split("-");
  const label = `${parseInt(m)}月${parseInt(day)}日（${dayName}）`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-dark">
            {label}の出店
          </h2>
          <button
            onClick={onClose}
            className="text-stone-500 text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <button
          onClick={onAdd}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-xl mb-4 text-sm"
        >
          ＋ 新規追加
        </button>

        {shifts.length === 0 ? (
          <p className="text-sm text-stone-500 text-center py-4">
            出店予定はありません
          </p>
        ) : (
          <div className="space-y-3">
            {shifts.map((s) => (
              <div
                key={s.id}
                className={`border rounded-xl p-3 ${
                  s.status === "cancelled"
                    ? "border-stone-200 bg-stone-50 opacity-60"
                    : "border-stone-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">
                      📍{" "}
                      {resolveShiftVenueName(s) || `店舗ID:${s.location_id}`}
                      （{s.rank}）
                    </div>
                    <div className="text-xs text-stone-600 mt-1 space-y-0.5">
                      <div>担当：{s.staff_name || "未定"}</div>
                      <div>目標：{yen(s.target || 0)}</div>
                      <div>
                        状態：{STATUS_ICON[s.status] || ""}{" "}
                        {STATUS_LABEL[s.status] || s.status}
                      </div>
                      {stripFreeVenueFromNote(s.note) && (
                        <div className="text-stone-500">
                          備考：{stripFreeVenueFromNote(s.note)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {s.status !== "cancelled" && (
                  <div className="flex gap-1 mt-2">
                    <button
                      onClick={() => onEdit(s)}
                      className="text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => onCancel(s.id)}
                      className="text-xs text-yellow-700 border border-yellow-300 rounded px-2 py-1 hover:bg-yellow-50"
                    >
                      中止
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      disabled={deletingId === s.id}
                      className="text-xs text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-40"
                    >
                      {deletingId === s.id ? "削除中" : "削除"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ShiftFormModal は app/components/ShiftFormModal.tsx に切り出し済み */
