"use client";

import { useState } from "react";
import {
  type VenueInquiry,
  type InquiryInput,
  type InquiryStatus,
  STATUS_OPTIONS,
  insertInquiry,
  updateInquiry,
  checkOkLimit,
} from "@/lib/venueInquiries";
import type { RankKind } from "@/lib/analytics/outletAnalytics";

/** よく使う店（店舗名クイック入力） */
const QUICK_STORES = [
  "パシオ高城店",
  "パシオ志比田店",
  "パシオ早鈴店",
  "パシオ鷹尾店",
  "ニシムタ都城店",
  "AZ隼人店",
  "ながやま三股店",
  "ながやま若葉店",
  "ながやま志比田店",
  "ながやま山田店",
  "ながやま都北店",
  "ながやま鷹尾店",
  "マンガ倉庫",
  "イオンモール",
];

/** スタッフ候補 */
const STAFF = ["イデ", "じゅん", "かずき", "なぎさ"];

type Props = {
  mode: "create" | "edit";
  initial: VenueInquiry | null;
  /** 上限チェック用: 既存の全行 */
  rows: VenueInquiry[];
  /** 上限チェック用: 店名→ランク区分 */
  rankKindOf: (storeName: string) => RankKind | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function InquiryForm({
  mode,
  initial,
  rows,
  rankKindOf,
  onClose,
  onSaved,
}: Props) {
  const [date, setDate] = useState<string>(initial?.date ?? "");
  const [storeName, setStoreName] = useState<string>(initial?.store_name ?? "");
  const [status, setStatus] = useState<InquiryStatus>(
    initial?.status ?? "未連絡",
  );
  const [contactedBy, setContactedBy] = useState<string>(
    initial?.contacted_by ?? "",
  );
  const [assignedStaff, setAssignedStaff] = useState<string>(
    initial?.assigned_staff ?? "",
  );
  const [slot, setSlot] = useState<string>(initial?.slot ?? "");
  const [memo, setMemo] = useState<string>(initial?.memo ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildInput = (): InquiryInput => ({
    date: date || null,
    store_name: storeName.trim(),
    status,
    contacted_by: contactedBy.trim() || null,
    assigned_staff: assignedStaff.trim() || null,
    slot: slot || null,
    memo: memo.trim() || null,
  });

  const save = async () => {
    setError(null);
    if (!storeName.trim()) {
      setError("店舗名を入力してください。");
      return;
    }

    // ★ status を OK にする場合はランク別の月間上限チェック
    if (status === "OK") {
      const check = checkOkLimit({
        rows,
        rankKindOf,
        editingId: initial?.id ?? null,
        storeName: storeName.trim(),
        date: date || null,
      });
      if (!check.allowed) {
        setError(`⚠️ ${check.message}`);
        return; // 保存をブロック
      }
    }

    setSaving(true);
    try {
      if (mode === "edit" && initial) {
        await updateInquiry(initial.id, buildInput(), initial.contacted_at);
      } else {
        await insertInquiry(buildInput());
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-brand-dark">
            {mode === "edit" ? "問い合わせを編集" : "問い合わせを追加"}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-xl leading-none"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 出店予定日 */}
          <div>
            <label className="label">出店したい日付</label>
            <input
              type="date"
              className="field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* 店舗名: 自由入力 + よく使う店ボタン */}
          <div>
            <label className="label">店舗名</label>
            <input
              type="text"
              className="field"
              placeholder="店舗名を入力"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_STORES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStoreName(s)}
                  className={`text-xs px-2 py-1 rounded-full border transition ${
                    storeName === s
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-stone-50 text-stone-600 border-stone-300 hover:bg-stone-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* ステータス */}
          <div>
            <label className="label">ステータス</label>
            <div className="grid grid-cols-4 gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`text-sm py-2 rounded-lg border font-bold transition ${
                    status === s
                      ? "bg-brand-dark text-white border-brand-dark"
                      : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              「連絡中 / OK / NG」にすると連絡日時が自動で記録されます。OKには月間上限があります。
            </p>
          </div>

          {/* 連絡者 / 出店担当 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">連絡した人</label>
              <input
                type="text"
                className="field"
                list="staff-list"
                value={contactedBy}
                onChange={(e) => setContactedBy(e.target.value)}
              />
            </div>
            <div>
              <label className="label">出店担当</label>
              <input
                type="text"
                className="field"
                list="staff-list"
                value={assignedStaff}
                onChange={(e) => setAssignedStaff(e.target.value)}
              />
            </div>
            <datalist id="staff-list">
              {STAFF.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* 枠 */}
          <div>
            <label className="label">枠</label>
            <div className="flex gap-2">
              {["①", "②"].map((sl) => (
                <button
                  key={sl}
                  type="button"
                  onClick={() => setSlot(slot === sl ? "" : sl)}
                  className={`px-4 py-2 rounded-lg border font-bold transition ${
                    slot === sl
                      ? "bg-indigo-500 text-white border-indigo-500"
                      : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {sl}
                </button>
              ))}
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="label">メモ</label>
            <textarea
              className="field"
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
