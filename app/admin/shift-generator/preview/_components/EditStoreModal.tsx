"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ShiftStore } from "@/lib/shift-engine/types";

type Location = {
  id: number;
  name: string;
  rank: string | null;
  target: number | null;
};

const STAFF_OPTIONS = [
  "かずき",
  "なぎさ",
  "イデ",
  "じゅん",
  "さとみ",
  "ゆうや",
] as const;
const NOTE_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: null, label: "確定枠（note なし）" },
  { value: "【未確定】", label: "【未確定】" },
  { value: "【スタッフ要設定】", label: "【スタッフ要設定】" },
];

export type EditStoreInitial = {
  mode: "add" | "edit";
  /** edit のときの初期値 */
  initial?: ShiftStore;
};

export default function EditStoreModal({
  date,
  weekdayLabel,
  initial,
  onClose,
  onSubmit,
}: {
  date: string;
  weekdayLabel: string;
  initial: EditStoreInitial;
  onClose: () => void;
  onSubmit: (entry: ShiftStore) => void;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フォーム state
  const [locationId, setLocationId] = useState<number | null>(
    initial.initial?.locationId ?? null,
  );
  const [staffName, setStaffName] = useState<string | null>(
    initial.initial?.staffName ?? null,
  );
  const [note, setNote] = useState<string | null>(
    initial.initial?.note ?? null,
  );

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("locations")
          .select("id, name, rank, target")
          .eq("is_active", true)
          .order("name");
        if (err) throw err;
        setLocations((data as Location[]) || []);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 追加モードでは ながやま系を選択肢から除く（手動追加の対象外）
  const selectableLocations = useMemo(() => {
    if (initial.mode === "edit") return locations;
    return locations.filter((l) => !l.name.startsWith("ながやま"));
  }, [locations, initial.mode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (initial.mode === "add" && !locationId) {
      setError("店舗を選んでください");
      return;
    }
    const loc = locations.find((l) => l.id === locationId) ?? null;
    const storeName =
      initial.mode === "edit" && initial.initial
        ? initial.initial.storeName
        : (loc?.name ?? "");
    onSubmit({
      storeName,
      locationId: locationId,
      rank: loc?.rank ?? initial.initial?.rank ?? null,
      target: loc?.target ?? initial.initial?.target ?? null,
      staffName,
      note,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-brand-dark mb-3">
          {initial.mode === "edit" ? "店舗を編集" : "店舗を追加"}
          <span className="text-sm font-normal text-stone-500 ml-2">
            {date}（{weekdayLabel}）
          </span>
        </h2>

        {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
        {error && (
          <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold mb-3">
            ❌ {error}
          </div>
        )}

        {!loading && (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">店舗</label>
              {initial.mode === "edit" ? (
                <input
                  type="text"
                  value={initial.initial?.storeName ?? ""}
                  disabled
                  className="field bg-stone-100"
                />
              ) : (
                <select
                  value={locationId ?? ""}
                  onChange={(e) =>
                    setLocationId(
                      e.target.value === "" ? null : parseInt(e.target.value),
                    )
                  }
                  className="field"
                  required
                >
                  <option value="">— 選択してください —</option>
                  {selectableLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.rank ? `（ランク${l.rank}）` : ""}
                    </option>
                  ))}
                </select>
              )}
              {initial.mode === "add" && (
                <p className="text-xs text-stone-500 mt-1">
                  ※ ながやま系は自動配置のため、ここでは選べません
                </p>
              )}
            </div>

            <div>
              <label className="label">スタッフ</label>
              <select
                value={staffName ?? ""}
                onChange={(e) =>
                  setStaffName(e.target.value === "" ? null : e.target.value)
                }
                className="field"
              >
                <option value="">— 未設定 —</option>
                {STAFF_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">note</label>
              <select
                value={note === null ? "__null__" : note}
                onChange={(e) =>
                  setNote(e.target.value === "__null__" ? null : e.target.value)
                }
                className="field"
              >
                {NOTE_OPTIONS.map((opt) => (
                  <option
                    key={opt.label}
                    value={opt.value === null ? "__null__" : opt.value}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary flex-1"
              >
                キャンセル
              </button>
              <button type="submit" className="btn-primary flex-1">
                {initial.mode === "edit" ? "更新" : "追加"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
