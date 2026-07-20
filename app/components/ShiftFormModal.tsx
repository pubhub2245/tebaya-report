"use client";

import { useState } from "react";
import { STAFF_OPTIONS } from "@/lib/formState";

export type ShiftLocation = {
  id: number;
  name: string;
  rank: string;
  target: number;
};

export type Shift = {
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

export type ShiftFormPayload = {
  date: string;
  location_id: number;
  rank: string;
  target: number;
  staff_name: string | null;
  planned_open_time: string | null;
  planned_close_time: string | null;
  status: string;
  note: string | null;
};

// 自由入力会場のセンチネル location_id。
// locations テーブルに事前作成した「その他（自由入力）」(is_active=false) のID。
export const FREE_VENUE_LOCATION_ID = 18;
const FREE_VENUE_PREFIX = "会場名｜";

/** note から自由入力の会場名だけを抜き出す（無ければ null） */
export function extractFreeVenueName(
  note: string | null | undefined,
): string | null {
  if (!note) return null;
  if (!note.startsWith(FREE_VENUE_PREFIX)) return null;
  const rest = note.slice(FREE_VENUE_PREFIX.length);
  const nl = rest.indexOf("\n");
  const name = (nl === -1 ? rest : rest.slice(0, nl)).trim();
  return name || null;
}

/** note から会場名プレフィックスを取り除いた、ユーザーが書いた純粋な備考だけを返す */
export function stripFreeVenueFromNote(
  note: string | null | undefined,
): string {
  if (!note) return "";
  if (!note.startsWith(FREE_VENUE_PREFIX)) return note;
  const rest = note.slice(FREE_VENUE_PREFIX.length);
  const nl = rest.indexOf("\n");
  return nl === -1 ? "" : rest.slice(nl + 1);
}

/** 自由入力モードで note を組み立てる */
export function composeNoteWithVenue(
  venue: string,
  baseNote: string,
): string | null {
  const v = venue.trim();
  const n = baseNote.trim();
  if (!v) return n || null;
  return n ? `${FREE_VENUE_PREFIX}${v}\n${n}` : `${FREE_VENUE_PREFIX}${v}`;
}

/** 表示用：シフトの会場名を解決する。自由入力 → マスタ → 空文字 の順 */
export function resolveShiftVenueName(shift: {
  location_id: number;
  note?: string | null;
  locations?: { name: string } | null;
}): string {
  const free = extractFreeVenueName(shift.note);
  if (free) return free;
  if (shift.locations?.name) return shift.locations.name;
  return "";
}

const RANKS = ["S", "A", "B", "C", "D"] as const;
const RANK_TARGET: Record<string, number> = {
  A: 60000,
  B: 50000,
  C: 40000,
  D: 30000,
};

/** 新規登録時だけ使う初期値（問い合わせ→出店予定への引き継ぎ用）。編集時は無視される。 */
export type ShiftPrefill = {
  date?: string;
  location_id?: number;
  freeVenue?: string;
  rank?: string;
  target?: number;
};

export default function ShiftFormModal({
  shift,
  defaultDate,
  locations,
  saving,
  defaultStatus = "draft",
  prefill,
  onClose,
  onSave,
  onDelete,
}: {
  shift: Shift | null;
  defaultDate: string;
  locations: ShiftLocation[];
  saving: boolean;
  defaultStatus?: string;
  prefill?: ShiftPrefill;
  onClose: () => void;
  onSave: (data: ShiftFormPayload) => void;
  onDelete?: () => void;
}) {
  const isNew = !shift;
  // prefill は新規登録のときだけ効かせる（編集時は shift の値が優先）
  const pf = isNew ? prefill : undefined;
  const initialFreeVenue = extractFreeVenueName(shift?.note) || pf?.freeVenue || "";
  const initialVenueMode: "master" | "free" = shift
    ? shift.location_id === FREE_VENUE_LOCATION_ID
      ? "free"
      : "master"
    : pf?.freeVenue
      ? "free"
      : "master";
  const initialBaseNote = stripFreeVenueFromNote(shift?.note);

  const [date, setDate] = useState(shift?.date || pf?.date || defaultDate);
  const [venueMode, setVenueMode] = useState<"master" | "free">(
    initialVenueMode,
  );
  const [locationId, setLocationId] = useState(
    initialVenueMode === "master"
      ? shift?.location_id?.toString() || pf?.location_id?.toString() || ""
      : "",
  );
  const [freeVenue, setFreeVenue] = useState(initialFreeVenue);
  const [rank, setRank] = useState(shift?.rank || pf?.rank || "C");
  const [target, setTarget] = useState(
    shift?.target?.toString() || pf?.target?.toString() || "40000",
  );
  const [staffName, setStaffName] = useState(shift?.staff_name || "");
  const [openTime, setOpenTime] = useState(
    isNew ? "11:00" : shift?.planned_open_time || "",
  );
  const [closeTime, setCloseTime] = useState(
    isNew ? "20:00" : shift?.planned_close_time || "",
  );
  const [status, setStatus] = useState(shift?.status || defaultStatus);
  const [note, setNote] = useState(initialBaseNote);
  const [formError, setFormError] = useState<string | null>(null);

  const handleRankChange = (r: string) => {
    setRank(r);
    // S は自動補完しない（空欄スタート）。A〜D は従来どおり自動補完。
    if (r === "S") {
      setTarget("");
    } else {
      setTarget(String(RANK_TARGET[r] || 40000));
    }
  };

  const handleLocationChange = (locId: string) => {
    setLocationId(locId);
    const loc = locations.find((l) => l.id === parseInt(locId));
    if (loc) {
      setRank(loc.rank || "C");
      setTarget(String(loc.target || RANK_TARGET[loc.rank] || 40000));
    }
  };

  const handleOpenTimeChange = (t: string) => {
    setOpenTime(t);
    if (t) {
      const [h] = t.split(":").map(Number);
      const closeH = Math.min(h + 9, 23);
      setCloseTime(`${String(closeH).padStart(2, "0")}:00`);
    }
  };

  const handleSubmit = () => {
    if (!date) {
      setFormError("日付を選択してください");
      return;
    }
    let finalLocationId: number;
    let finalNote: string | null;
    if (venueMode === "free") {
      if (!freeVenue.trim()) {
        setFormError("会場名を入力してください");
        return;
      }
      finalLocationId = FREE_VENUE_LOCATION_ID;
      finalNote = composeNoteWithVenue(freeVenue, note);
    } else {
      if (!locationId) {
        setFormError("店舗を選択してください");
        return;
      }
      finalLocationId = parseInt(locationId);
      finalNote = note.trim() || null;
    }
    setFormError(null);
    onSave({
      date,
      location_id: finalLocationId,
      rank,
      target: parseInt(target) || 0,
      staff_name: staffName.trim() || null,
      planned_open_time: openTime || null,
      planned_close_time: closeTime || null,
      status,
      note: finalNote,
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-dark">
            {shift ? "シフト編集" : "シフト追加"}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-500 text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>

        {formError && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded">
            {formError}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="label">日付 *</label>
            <input
              type="date"
              className="field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="label">会場 *</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setVenueMode("master")}
                className={`flex-1 text-xs py-2 rounded-lg border font-bold ${
                  venueMode === "master"
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                マスタから選ぶ
              </button>
              <button
                type="button"
                onClick={() => setVenueMode("free")}
                className={`flex-1 text-xs py-2 rounded-lg border font-bold ${
                  venueMode === "free"
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                自由入力（祭り等）
              </button>
            </div>
            {venueMode === "master" ? (
              <select
                className="field"
                value={locationId}
                onChange={(e) => handleLocationChange(e.target.value)}
              >
                <option value="">選択してください</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}（{l.rank}）
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="field"
                value={freeVenue}
                onChange={(e) => setFreeVenue(e.target.value)}
                placeholder="例：神柱公園 夏祭り特設会場"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ランク</label>
              <div className="flex rounded-lg border border-stone-300 overflow-hidden">
                {RANKS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRankChange(r)}
                    className={`flex-1 py-2 text-sm font-bold ${
                      rank === r
                        ? "bg-brand text-white"
                        : "bg-white text-stone-600"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">売上目標</label>
              <input
                type="number"
                className="field"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={rank === "S" ? "手入力してください" : ""}
              />
            </div>
          </div>

          <div>
            <label className="label">担当者</label>
            <select
              className="field"
              value={
                STAFF_OPTIONS.includes(staffName)
                  ? staffName
                  : staffName
                    ? "__other__"
                    : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__other__") setStaffName(" ");
                else setStaffName(v);
              }}
            >
              <option value="">未定</option>
              {STAFF_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              {staffName &&
                !STAFF_OPTIONS.includes(staffName) &&
                staffName.trim() !== "" && (
                  <option value={staffName}>{staffName}</option>
                )}
              <option value="__other__">その他（手入力）</option>
            </select>
            {staffName !== "" && !STAFF_OPTIONS.includes(staffName) && (
              <input
                className="field mt-2"
                placeholder="名前を入力"
                value={staffName.trim() === "" ? "" : staffName}
                onChange={(e) => setStaffName(e.target.value || " ")}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">開店時刻</label>
              <input
                type="time"
                className="field"
                value={openTime}
                onChange={(e) => handleOpenTimeChange(e.target.value)}
              />
            </div>
            <div>
              <label className="label">閉店予定</label>
              <input
                type="time"
                className="field"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">状態</label>
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">📝 未確定</option>
              <option value="published">📤 確定済み</option>
              <option value="cancelled">🚫 中止</option>
            </select>
          </div>

          <div>
            <label className="label">備考</label>
            <textarea
              className="field min-h-[60px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="メモがあれば入力"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>

          {shift && onDelete && (
            <button
              onClick={onDelete}
              disabled={saving}
              className="w-full mt-1 text-sm font-bold text-red-600 border border-red-300 rounded-xl py-2.5 hover:bg-red-50 disabled:opacity-40"
            >
              🗑️ このシフトを取り消し（削除）
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
