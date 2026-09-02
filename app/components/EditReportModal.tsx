"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import { NO_RECEIPT_REASONS } from "@/lib/formState";

/**
 * 過去の日報を修正するためのモーダル（画面に重なる編集フォーム）。
 * よく直したい項目（日付・担当・お店・場所・売上・日当・レジ差異）と、
 * **経費の明細（内容・金額）** を編集できる。
 * 保存すると daily_reports の該当行を UPDATE し、
 * 「誰が・いつ・どこを直したか」を daily_report_edits に履歴として残す。
 *
 * ■ 経費とレシートについて（2026-09 追加）
 *   経費の明細とレシート写真をここで見られるようにした。
 *   これまでは、入力された金額がレシートと合っているかを確かめる画面が
 *   どこにも無く、間違って入った金額を直す方法も無かった。
 *   （消費税が抜けた税抜の金額が入っていたことが分かったため）
 *
 *   明細（レシート写真を含む）は**その日報1件ぶんだけ**取得する。
 *   一覧や集計では絶対に取らないこと（CLAUDE.md 4-2）。
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
  expenses: "経費",
};

/** 経費の明細1件 */
type ExpenseItem = {
  description?: string | null;
  amount?: number | null;
  receipt_image_url?: string | null;
  no_receipt_reason?: string | null;
  [k: string]: unknown;
};

/** 経費の中身を、履歴に出すための短い文にする（「割り箸 ¥300 / 場代 ¥2,000」） */
function expensesToText(v: any): string {
  if (!Array.isArray(v) || v.length === 0) return "（なし）";
  return (v as ExpenseItem[])
    .map((e) => `${(e.description || "").trim() || "（内容なし）"} ${yen(Number(e.amount) || 0)}`)
    .join(" / ");
}

/** 経費を比べるときは「内容・金額・レシートの有無」だけを見る（写真の中身までは見ない） */
function normalizeForCompare(v: any) {
  if (!Array.isArray(v)) return v;
  return (v as ExpenseItem[]).map((e) => [
    (e.description ?? "").trim(),
    Number(e.amount) || 0,
    e.receipt_image_url ? 1 : 0,
    (e.no_receipt_reason ?? "").trim(),
  ]);
}

function showVal(v: any): string {
  if (v === null || v === undefined || v === "") return "（空）";
  if (Array.isArray(v)) return expensesToText(v);
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

  // 経費の明細（この日報1件ぶんだけ取得する）
  const [expenses, setExpenses] = useState<ExpenseItem[] | null>(null);
  const [expensesBefore, setExpensesBefore] = useState<ExpenseItem[]>([]);
  const [expensesError, setExpensesError] = useState<string | null>(null);

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

    // 経費の明細（レシート写真を含む）。★この1件ぶんだけ（CLAUDE.md 4-2）
    (async () => {
      const { data, error: exErr } = await supabase
        .from("daily_reports")
        .select("expenses")
        .eq("id", report.id)
        .maybeSingle();
      if (cancelled) return;
      if (exErr) {
        setExpensesError(exErr.message);
        setExpenses([]);
        return;
      }
      const raw = (data as { expenses?: unknown } | null)?.expenses;
      const list = Array.isArray(raw) ? (raw as ExpenseItem[]) : [];
      setExpenses(list.map((e) => ({ ...e })));
      setExpensesBefore(list.map((e) => ({ ...e })));
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

    // 経費：金額がマイナスの行はダメ。内容も金額も空の行は保存前に落とす
    const cleanedExpenses = (expenses ?? []).filter(
      (e) => (e.description ?? "").trim() !== "" || (Number(e.amount) || 0) !== 0,
    );
    if (cleanedExpenses.some((e) => (Number(e.amount) || 0) < 0))
      return setError("経費の金額はマイナスにできません");

    const patch: Record<string, any> = {
      date,
      staff_name: staff.trim(),
      shop,
      location: location.trim() || null,
      sales_amount: salesN,
      labor: laborN,
      register_diff: regN,
    };
    // 明細を読み込めているときだけ経費を書き戻す
    // （読み込みに失敗しているのに空で上書きして消してしまわないように）
    const canSaveExpenses = expenses !== null && expensesError === null;
    if (canSaveExpenses) {
      patch.expenses = cleanedExpenses.map((e) => ({
        ...e,
        description: (e.description ?? "").trim(),
        amount: Number(e.amount) || 0,
      }));
    }

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
    if (canSaveExpenses) before.expenses = expensesBefore;

    const changes: Record<string, { from: any; to: any }> = {};
    for (const k of Object.keys(patch)) {
      const from = before[k] ?? null;
      const to = patch[k] ?? null;
      // 経費は配列なので、中身を文字にして比べる
      const same =
        k === "expenses"
          ? JSON.stringify(normalizeForCompare(from)) ===
            JSON.stringify(normalizeForCompare(to))
          : from === to;
      if (!same) changes[k] = { from, to };
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
    if (canSaveExpenses) setExpensesBefore(patch.expenses);
    onSaved({
      ...report,
      date: patch.date,
      staff_name: patch.staff_name,
      shop: patch.shop,
      location: patch.location,
      sales_amount: patch.sales_amount,
      labor: patch.labor,
      register_diff: patch.register_diff,
    });
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

          {/* 経費の明細とレシート写真 */}
          <div className="border-t border-stone-100 pt-3">
            <label className="label">
              レジから払った経費{" "}
              {expenses && (
                <span className="font-normal text-stone-400">
                  （{expenses.length}件・合計{" "}
                  {yen(
                    expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
                  )}
                  ）
                </span>
              )}
            </label>
            <p className="text-[11px] text-stone-500 leading-relaxed mb-2">
              レシートの写真と見くらべて、金額が合っているか確かめてください。
              <b>消費税が抜けていないか（税抜のまま入っていないか）</b>に特に注意してください。
            </p>

            {expensesError && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                経費を読み込めませんでした：{expensesError}
              </p>
            )}
            {expenses === null && !expensesError && (
              <p className="text-xs text-stone-400">読み込み中…</p>
            )}
            {expenses !== null && expenses.length === 0 && (
              <p className="text-xs text-stone-400">この日の経費はありません。</p>
            )}

            <div className="space-y-2">
              {(expenses ?? []).map((e, i) => (
                <div
                  key={i}
                  className="border border-stone-200 rounded-xl p-2 space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="field flex-1 text-sm"
                      value={e.description ?? ""}
                      placeholder="内容"
                      onChange={(ev) =>
                        setExpenses((list) =>
                          (list ?? []).map((x, k) =>
                            k === i ? { ...x, description: ev.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      className="field w-28 text-sm text-right"
                      value={e.amount ?? ""}
                      placeholder="金額"
                      onChange={(ev) =>
                        setExpenses((list) =>
                          (list ?? []).map((x, k) =>
                            k === i
                              ? { ...x, amount: parseInt(ev.target.value || "0", 10) }
                              : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="text-xs text-red-600 px-1"
                      onClick={() =>
                        setExpenses((list) =>
                          (list ?? []).filter((_, k) => k !== i),
                        )
                      }
                    >
                      削除
                    </button>
                  </div>

                  {e.receipt_image_url ? (
                    <a
                      href={e.receipt_image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={e.receipt_image_url}
                        alt="レシート"
                        className="w-full max-h-56 object-contain rounded-lg border bg-stone-50"
                      />
                      <span className="text-[11px] text-blue-600 underline">
                        タップで大きく見る
                      </span>
                    </a>
                  ) : (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      レシート写真なし
                      {(e.no_receipt_reason ?? "").trim()
                        ? `（理由：${e.no_receipt_reason}）`
                        : "（理由も未記入）"}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {expenses !== null && !expensesError && (
              <button
                type="button"
                className="btn-secondary w-full text-sm mt-2"
                onClick={() =>
                  setExpenses((list) => [
                    ...(list ?? []),
                    {
                      description: "",
                      amount: 0,
                      receipt_image_url: null,
                      no_receipt_reason: NO_RECEIPT_REASONS[1],
                    },
                  ])
                }
              >
                ＋ 経費を追加
              </button>
            )}
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
          ※ ここで直せるのは日付・担当・お店・場所・売上・日当・レジ差異と、
          レジから払った経費（内容・金額）です。
          商品ごとの本数など細かい項目は、日報を出し直す（削除して再入力）必要があります。
        </p>
      </div>
    </div>
  );
}
