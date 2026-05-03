"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminGate from "@/app/components/AdminGate";
import EditStoreModal, {
  type EditStoreInitial,
} from "./_components/EditStoreModal";
import type { MonthlyShift, ShiftStore } from "@/lib/shift-engine/types";

const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];
const STAFF_KEYS = ["かずき", "なぎさ", "イデ", "じゅん"] as const;

export default function PreviewPage() {
  return (
    <AdminGate>
      <PreviewView />
    </AdminGate>
  );
}

function PreviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const key = searchParams.get("key");
  const yearParam = parseInt(searchParams.get("year") ?? "");
  const monthParam = parseInt(searchParams.get("month") ?? "");

  const [shift, setShift] = useState<MonthlyShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // モーダル制御
  const [editTarget, setEditTarget] = useState<{
    day: number;
    date: string;
    weekdayLabel: string;
    initial: EditStoreInitial;
    storeIndex?: number;
  } | null>(null);

  // 上書き確認モーダル
  const [overwrite, setOverwrite] = useState<{
    count: number;
    earliest: string;
    latest: string;
  } | null>(null);

  // コミット中・完了
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setLoadError("キーが指定されていません。アップロード画面からやり直してください。");
      setLoading(false);
      return;
    }
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) {
        setLoadError(
          "プレビューデータが見つかりません。再度生成してください。",
        );
      } else {
        const parsed = JSON.parse(raw) as MonthlyShift;
        setShift(parsed);
      }
    } catch (e: any) {
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [key]);

  // ----- 編集ヘルパー -----
  const updateDayStores = (
    day: number,
    updater: (prev: ShiftStore[]) => ShiftStore[],
  ) => {
    setShift((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) =>
          d.day === day ? { ...d, stores: updater(d.stores) } : d,
        ),
      };
    });
  };

  const handleAddStore = (day: number, date: string, weekday: number) => {
    setEditTarget({
      day,
      date,
      weekdayLabel: WEEKDAY_LABEL[weekday],
      initial: { mode: "add" },
    });
  };

  const handleEditStore = (
    day: number,
    date: string,
    weekday: number,
    storeIndex: number,
    storeData: ShiftStore,
  ) => {
    setEditTarget({
      day,
      date,
      weekdayLabel: WEEKDAY_LABEL[weekday],
      storeIndex,
      initial: { mode: "edit", initial: storeData },
    });
  };

  const handleDeleteStore = (day: number, storeIndex: number) => {
    if (!confirm("この店舗を削除しますか？")) return;
    updateDayStores(day, (stores) =>
      stores.filter((_, i) => i !== storeIndex),
    );
  };

  const handleModalSubmit = (entry: ShiftStore) => {
    if (!editTarget) return;
    const { day, storeIndex, initial } = editTarget;
    updateDayStores(day, (stores) => {
      if (initial.mode === "edit" && storeIndex !== undefined) {
        const next = [...stores];
        next[storeIndex] = entry;
        return next;
      }
      return [...stores, entry];
    });
    setEditTarget(null);
  };

  // ----- サマリー再計算（編集に追従させる）-----
  const liveSummary = useMemo(() => {
    if (!shift) return null;
    let total = 0;
    let unassigned = 0;
    let restDays = 0;
    const staffCount: Record<string, number> = {};
    for (const day of shift.days) {
      if (day.stores.length === 0) {
        restDays++;
        continue;
      }
      for (const s of day.stores) {
        total++;
        if (!s.staffName) unassigned++;
        else staffCount[s.staffName] = (staffCount[s.staffName] ?? 0) + 1;
      }
    }
    return { total, unassigned, restDays, staffCount };
  }, [shift]);

  // ----- 月カレンダーの構造（7列×6行）-----
  const calendarWeeks = useMemo(() => {
    if (!shift) return [] as Array<Array<number | null>>;
    const first = new Date(shift.year, shift.month - 1, 1);
    const startDow = first.getDay();
    const dim = new Date(shift.year, shift.month, 0).getDate();
    const weeks: Array<Array<number | null>> = [];
    let week: Array<number | null> = Array(startDow).fill(null);
    for (let d = 1; d <= dim; d++) {
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
  }, [shift]);

  const getDayInfo = (day: number) => {
    return shift?.days.find((d) => d.day === day) ?? null;
  };

  // ----- DB登録 -----
  const handleCommitClick = async () => {
    if (!shift) return;
    setCommitResult(null);
    try {
      const res = await fetch(
        `/api/shift-generator/check-draft?year=${shift.year}&month=${shift.month}`,
      );
      const json = await res.json();
      if (json.exists) {
        setOverwrite({
          count: json.count,
          earliest: json.dateRange?.earliest ?? "",
          latest: json.dateRange?.latest ?? "",
        });
      } else {
        await doCommit();
      }
    } catch (e: any) {
      setCommitResult(`❌ チェック失敗: ${e?.message || e}`);
    }
  };

  const doCommit = async () => {
    if (!shift) return;
    setOverwrite(null);
    setCommitting(true);
    setCommitResult(null);
    try {
      const res = await fetch("/api/shift-generator/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: shift.year,
          month: shift.month,
          data: shift,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "DB登録に失敗しました");
      }
      const skipMsg =
        json.skipped && json.skipped.length > 0
          ? `（locations未解決でスキップ: ${json.skipped.length}件）`
          : "";
      setCommitResult(
        `✅ 登録完了！ INSERT ${json.inserted}件 / 既存draft削除 ${json.deleted}件 ${skipMsg}`,
      );
      // 3秒後に /shifts へ
      setTimeout(() => {
        router.push("/shifts");
      }, 3000);
    } catch (e: any) {
      setCommitResult(`❌ ${e?.message || e}`);
    } finally {
      setCommitting(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-stone-500">読み込み中…</p>
      </main>
    );
  }

  if (loadError || !shift) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
          ❌ {loadError || "データがありません"}
        </div>
        <Link href="/admin/shift-generator" className="btn-primary inline-block">
          ← アップロード画面へ
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-32">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">
          🗓️ シフトプレビュー（{shift.year}年{shift.month}月）
        </h1>
        <Link href="/admin/shift-generator" className="btn-secondary text-sm">
          ← やり直し
        </Link>
      </header>

      {/* サマリー */}
      {liveSummary && (
        <section className="grid grid-cols-2 md:grid-cols-7 gap-2 text-sm">
          <div className="card text-center">
            <div className="text-xs text-stone-500">全シフト</div>
            <div className="text-xl font-bold text-brand-dark">
              {liveSummary.total}件
            </div>
          </div>
          {STAFF_KEYS.map((name) => (
            <div key={name} className="card text-center">
              <div className="text-xs text-stone-500">{name}</div>
              <div className="text-xl font-bold">
                {liveSummary.staffCount[name] ?? 0}件
              </div>
            </div>
          ))}
          <div className="card text-center">
            <div className="text-xs text-stone-500">未割当</div>
            <div
              className={`text-xl font-bold ${liveSummary.unassigned > 0 ? "text-red-600" : "text-stone-700"}`}
            >
              {liveSummary.unassigned}件
            </div>
          </div>
          <div className="card text-center">
            <div className="text-xs text-stone-500">休み</div>
            <div className="text-xl font-bold text-stone-500">
              {liveSummary.restDays}日
            </div>
          </div>
        </section>
      )}

      {/* 警告パネル */}
      {shift.warnings.length > 0 && (
        <section className="card border-2 border-amber-300 bg-amber-50">
          <h2 className="text-base font-bold text-amber-800 mb-2">
            ⚠️ {shift.warnings.length}件の警告
          </h2>
          <ul className="space-y-1 text-sm text-amber-900 max-h-48 overflow-y-auto">
            {shift.warnings.map((w, i) => (
              <li key={i} className="flex">
                <span className="mr-2">・</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 月カレンダー */}
      <section className="card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {WEEKDAY_LABEL.map((label, i) => (
                <th
                  key={label}
                  className={`p-2 text-xs font-semibold border border-stone-200 ${
                    i === 0
                      ? "text-red-600"
                      : i === 6
                        ? "text-blue-600"
                        : "text-stone-700"
                  }`}
                >
                  {label}
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
                        className="p-2 border border-stone-200 bg-stone-50"
                      />
                    );
                  }
                  const info = getDayInfo(day);
                  if (!info) return <td key={di} />;
                  const isWeekend = di === 0 || di === 6;
                  return (
                    <td
                      key={di}
                      className={`p-1.5 border border-stone-200 align-top min-w-[110px] ${
                        info.stores.length === 0 ? "bg-stone-50" : "bg-white"
                      }`}
                    >
                      <div
                        className={`text-xs font-bold mb-1 ${
                          di === 0
                            ? "text-red-600"
                            : di === 6
                              ? "text-blue-600"
                              : "text-stone-700"
                        }`}
                      >
                        {day}
                        {isWeekend && (
                          <span className="ml-1 text-stone-400">
                            ({WEEKDAY_LABEL[di]})
                          </span>
                        )}
                      </div>
                      {info.stores.length === 0 ? (
                        <div className="text-xs text-stone-400 italic mb-1">
                          (休み)
                        </div>
                      ) : (
                        <div className="space-y-1 mb-1">
                          {info.stores.map((s, si) => (
                            <StoreCard
                              key={si}
                              store={s}
                              onEdit={() =>
                                handleEditStore(
                                  day,
                                  info.date,
                                  info.weekday,
                                  si,
                                  s,
                                )
                              }
                              onDelete={() => handleDeleteStore(day, si)}
                            />
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() =>
                          handleAddStore(day, info.date, info.weekday)
                        }
                        className="w-full text-[10px] text-stone-500 hover:text-brand border border-dashed border-stone-300 hover:border-brand rounded py-0.5"
                      >
                        + 店舗追加
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 編集モーダル */}
      {editTarget && (
        <EditStoreModal
          date={editTarget.date}
          weekdayLabel={editTarget.weekdayLabel}
          initial={editTarget.initial}
          onClose={() => setEditTarget(null)}
          onSubmit={handleModalSubmit}
        />
      )}

      {/* 上書き確認モーダル */}
      {overwrite && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          onClick={() => setOverwrite(null)}
        >
          <div
            className="bg-white max-w-md w-full mx-4 rounded-2xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-red-600 mb-2">
              ⚠️ 上書き確認
            </h2>
            <p className="text-sm text-stone-700 mb-4">
              {shift.year}年{shift.month}月のdraftが既に
              <strong>{overwrite.count}件</strong>存在します
              （{overwrite.earliest} 〜 {overwrite.latest}）。
              <br />
              上書きするとこれらは削除されます。続行しますか？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOverwrite(null)}
                className="btn-secondary flex-1"
              >
                キャンセル
              </button>
              <button
                onClick={doCommit}
                className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl px-5 py-3 flex-1"
              >
                上書き登録
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 結果トースト */}
      {commitResult && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-40 card text-sm font-semibold shadow-lg ${
            commitResult.startsWith("✅")
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {commitResult}
        </div>
      )}

      {/* 下部固定アクション */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/admin/shift-generator" className="btn-secondary">
            ← 戻る
          </Link>
          <button
            onClick={handleCommitClick}
            disabled={committing}
            className="btn-primary flex-1 max-w-xs"
          >
            {committing ? "⏳ 登録中…" : "DBに登録"}
          </button>
        </div>
      </div>
    </main>
  );
}

function StoreCard({
  store,
  onEdit,
  onDelete,
}: {
  store: ShiftStore;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isNagayama = store.storeName.startsWith("ながやま");
  const isUnassigned = !store.staffName;
  const noteIsAlert = store.note === "【スタッフ要設定】";

  let bg = "bg-stone-100 border-stone-200 text-stone-800";
  if (noteIsAlert || isUnassigned) {
    bg = "bg-red-50 border-red-300 text-red-900";
  } else if (isNagayama) {
    bg = "bg-blue-50 border-blue-200 text-blue-900";
  } else if (store.storeName === "マンガ倉庫") {
    bg = "bg-green-50 border-green-200 text-green-900";
  } else if (store.note === "【未確定】") {
    bg = "bg-stone-100 border-stone-300 text-stone-700";
  }

  return (
    <div
      className={`relative text-[10px] leading-tight border rounded p-1 ${bg}`}
    >
      <button
        onClick={onDelete}
        title="削除"
        className="absolute -top-1 -right-1 w-4 h-4 text-[9px] bg-white border border-stone-400 rounded-full text-stone-500 hover:text-red-600 hover:border-red-400 flex items-center justify-center"
      >
        ×
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="block w-full text-left"
      >
        <div className="font-bold truncate" title={store.storeName}>
          {store.storeName}
        </div>
        <div className="text-[9px]">
          {store.staffName ? store.staffName : <span className="font-bold">⚠ 未設定</span>}
        </div>
        {store.note && (
          <div className="text-[9px] opacity-75 truncate">{store.note}</div>
        )}
      </button>
    </div>
  );
}
