"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 過去の日報を修正するためのモーダル（画面に重なる編集フォーム）。
 * よく直したい項目（日付・担当・お店・場所・売上・日当・レジ差異）だけを編集できる。
 * 保存すると daily_reports の該当行を UPDATE し、
 * 「誰が・いつ・どこを直したか」を daily_report_edits に履歴として残す。
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

type EditRow = {
  id: string;
  edited_by: string;
  edited_at: string;
  changes: Record<string, { from: any; to: any }>;
};

/** 項目名を日本語に */
const FIELD_LABEL: Record<string, string> = {
  date: "日付",
  staff_name: "担当",
  shop: "お店",
  location: "場所",
  sales_amount: "売上",
  labor: "日当",
  register_diff: "レジ差異",
};

function showVal(v: any): string {
  if (v === null || v === undefined || v === "") return "（空）";
  return String(v);
}

export default function EditReportModal({
  report,
  onClose,
  onSaved,
  requireEditor = false,
}: {
  report: EditableReport;
  onClose: () => void;
  onSaved: (updated: EditableReport) => void;
  /** true のとき「修正した人」の入力を必須にする（従業員が直接直すとき用） */
  requireEditor?: boolean;
}) {
  const [date, setDate] = useState(report.date);
  const [staff, setStaff] = useState(report.staff_name ?? "");
  const [shop, setShop] = useState(report.shop ?? "手羽屋");
  const [location, setLocation] = useState(report.location ?? "");
  const [sales, setSales] = useState(String(report.sales_amount ?? ""));
  const [labor, setLabor] = useState(String(report.labor ?? ""));
  const [regDiff, setRegDiff] = useState(String(report.register_diff ?? ""));
  const [editor, setEditor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<EditRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("daily_report_edits")
        .select("id, edited_by, edited_at, changes")
        .eq("report_id", report.id)
        .order("edited_at", { ascending: false });
      if (!cancelled) setHistory((data as EditRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [report.id]);

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
    if (requireEditor && !editor.trim())
      return setError("修正した人を入力してください");
    if (salesN != null && salesN < 0) return setError("売上はマイナスにできません");
    if (laborN != null && laborN < 0) return setError("日当はマイナスにできません");

    const patch = {
      date,
      staff_name: staff.trim(),
      shop,
      location: location.trim() || null,
      sales_amount: salesN,
      labor: laborN,
      register_diff: regN,
    };

    // 変更前後の差分（変わった項目だけ）を作る
    const before: Record<string, any> = {
      date: report.date,
      staff_name: report.staff_name,
      shop: report.shop,
      location: report.location,
      sales_amount: report.sales_amount,
      labor: report.labor,
      register_diff: report.register_diff,
    };
    const changes: Record<string, { from: any; to: any }> = {};
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      const from = before[k] ?? null;
      const to = (patch[k] as any) ?? null;
      if (from !== to) changes[k] = { from, to };
    }

    if (Object.keys(changes).length === 0) {
      setError("変更点がありません");
      return;
    }

    setSaving(true);
    const { error: upErr } = await supabase
      .from("daily_reports")
      .update(patch)
      .eq("id", report.id);
    if (upErr) {
      setSaving(false);
      setError(`保存に失敗しました: ${upErr.message}`);
      return;
    }

    // 履歴を残す（失敗しても保存自体は成功扱いにする）
    try {
      await supabase.from("daily_report_edits").insert({
        report_id: report.id,
        edited_by: editor.trim() || "（未記入）",
        changes,
      });
    } catch {
      // 履歴の失敗は致命的ではないので握りつぶす
    }

    setSaving(false);
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
            <label className="label">
              修正した人{requireEditor && <span className="text-red-500">（必須）</span>}
            </label>
            <input
              type="text"
              className="field"
              value={editor}
              onChange={(e) => setEditor(e.target.value)}
              placeholder="例: かずき"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              あとで「誰が直したか」を残すために記入してください。
            </p>
          </div>

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

        {/* 修正履歴 */}
        {history.length > 0 && (
          <details className="border-t border-stone-100 pt-2">
            <summary className="cursor-pointer text-sm font-bold text-stone-600">
              修正履歴（{history.length}件）
            </summary>
            <div className="pt-2 space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="text-xs text-stone-600 bg-stone-50 rounded px-2 py-1.5"
                >
                  <div className="font-bold text-stone-700">
                    {h.edited_by}
                    <span className="font-normal text-stone-400 ml-2">
                      {new Date(h.edited_at).toLocaleString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {Object.entries(h.changes || {}).map(([field, c]) => (
                      <li key={field}>
                        {FIELD_LABEL[field] ?? field}：{showVal(c.from)} →{" "}
                        <span className="text-stone-800 font-semibold">
                          {showVal(c.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}

        <p className="text-[11px] text-stone-400 leading-relaxed">
          ※ ここで直せるのは日付・担当・お店・場所・売上・日当・レジ差異です。
          商品ごとの本数など細かい項目は、日報を出し直す（削除して再入力）必要があります。
        </p>
      </div>
    </div>
  );
}
