"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 過去の日報を修正するためのモーダル（画面に重なる編集フォーム）。
 * よく直したい項目（日付・担当・お店・場所・売上・日当・レジ差異）だけを編集できる。
 * 保存すると daily_reports の該当行を UPDATE する。
 */

export type EditableReport = {
  id: string;
  date: string;
  location: string | null;
  staff_name: string | null;
  shop: string | null;
  sales_amount: number | null;
  labor: number | null;
  register_diff: number | null;
};

export default function EditReportModal({
  report,
  onClose,
  onSaved,
}: {
  report: EditableReport;
  onClose: () => void;
  onSaved: (updated: EditableReport) => void;
}) {
  const [date, setDate] = useState(report.date);
  const [staff, setStaff] = useState(report.staff_name ?? "");
  const [shop, setShop] = useState(report.shop ?? "手羽屋");
  const [location, setLocation] = useState(report.location ?? "");
  const [sales, setSales] = useState(String(report.sales_amount ?? ""));
  const [labor, setLabor] = useState(String(report.labor ?? ""));
  const [regDiff, setRegDiff] = useState(String(report.register_diff ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const save = async () => {
    setError(null);
    const salesN = numOrNull(sales);
    const laborN = numOrNull(labor);
    const regN = numOrNull(regDiff);

    if (!date) return setError("日付を入力してください");
    if (!staff.trim()) return setError("担当者を入力してください");
    if (salesN != null && salesN < 0) return setError("売上はマイナスにできません");
    if (laborN != null && laborN < 0) return setError("日当はマイナスにできません");

    setSaving(true);
    const patch = {
      date,
      staff_name: staff.trim(),
      shop,
      location: location.trim() || null,
      sales_amount: salesN,
      labor: laborN,
      register_diff: regN,
    };
    const { error } = await supabase
      .from("daily_reports")
      .update(patch)
      .eq("id", report.id);
    setSaving(false);
    if (error) {
      setError(`保存に失敗しました: ${error.message}`);
      return;
    }
    onSaved({ ...report, ...patch });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-dark">日報を修正</h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">日付</label>
            <input
              type="date"
              className="field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="label">担当者</label>
            <input
              type="text"
              className="field"
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              placeholder="例: かずき、なぎさ"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              共同出店は「かずき、なぎさ」のように「、」で区切ります。
            </p>
          </div>

          <div>
            <label className="label">お店</label>
            <select
              className="field"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
            >
              <option value="手羽屋">手羽屋</option>
              <option value="もも屋">もも屋</option>
            </select>
          </div>

          <div>
            <label className="label">出店場所</label>
            <input
              type="text"
              className="field"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">売上（円）</label>
              <input
                type="number"
                inputMode="numeric"
                className="field"
                value={sales}
                onChange={(e) => setSales(e.target.value)}
              />
            </div>
            <div>
              <label className="label">日当（円）</label>
              <input
                type="number"
                inputMode="numeric"
                className="field"
                value={labor}
                onChange={(e) => setLabor(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">レジ差異（円・過不足）</label>
            <input
              type="number"
              inputMode="numeric"
              className="field"
              value={regDiff}
              onChange={(e) => setRegDiff(e.target.value)}
              placeholder="0（過不足なし）"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded px-2 py-1">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            onClick={save}
            className="btn-primary flex-1"
            disabled={saving}
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>

        <p className="text-[11px] text-stone-400 leading-relaxed">
          ※ ここで直せるのは日付・担当・お店・場所・売上・日当・レジ差異です。
          商品ごとの本数など細かい項目は、日報を出し直す（削除して再入力）必要があります。
        </p>
      </div>
    </div>
  );
}
