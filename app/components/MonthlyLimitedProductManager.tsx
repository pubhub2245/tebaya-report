"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listLimitedProducts,
  upsertLimitedProduct,
  type MonthlyLimitedProduct,
} from "@/lib/limitedProduct";

type EditableMonth = {
  year: number;
  month: number;
  label: string; // 表示用 "2026年6月（翌月）"
};

function buildEditableMonths(now: Date): EditableMonth[] {
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1; // 1-12
  const ny = cm === 12 ? cy + 1 : cy;
  const nm = cm === 12 ? 1 : cm + 1;
  return [
    { year: ny, month: nm, label: `${ny}年${nm}月（翌月）` },
    { year: cy, month: cm, label: `${cy}年${cm}月（当月）` },
  ];
}

function buildPastMonths(now: Date, count: number): EditableMonth[] {
  const out: EditableMonth[] = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  // 当月の1ヶ月前から count ヶ月遡る
  for (let i = 0; i < count; i++) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    out.push({ year: y, month: m, label: `${y}年${m}月` });
  }
  return out;
}

export default function MonthlyLimitedProductManager() {
  const now = useMemo(() => new Date(), []);
  const editableMonths = useMemo(() => buildEditableMonths(now), [now]);
  const pastMonths = useMemo(() => buildPastMonths(now, 6), [now]);

  const [records, setRecords] = useState<MonthlyLimitedProduct[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editPrices, setEditPrices] = useState<Record<string, number>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const keyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

  const findRecord = (y: number, m: number) =>
    records.find((r) => r.year === y && r.month === m);

  const reload = async () => {
    setLoading(true);
    const rows = await listLimitedProducts();
    setRecords(rows);
    // 編集中の値はそのまま、未触のところは DB の値を反映
    setEditValues((prev) => {
      const next = { ...prev };
      for (const m of editableMonths) {
        const k = keyOf(m.year, m.month);
        if (next[k] === undefined) {
          const r = rows.find((x) => x.year === m.year && x.month === m.month);
          next[k] = r?.product_name ?? "";
        }
      }
      return next;
    });
    setEditPrices((prev) => {
      const next = { ...prev };
      for (const m of editableMonths) {
        const k = keyOf(m.year, m.month);
        if (next[k] === undefined) {
          const r = rows.find((x) => x.year === m.year && x.month === m.month);
          next[k] = r?.price ?? 0;
        }
      }
      return next;
    });
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (m: EditableMonth) => {
    const k = keyOf(m.year, m.month);
    const value = editValues[k] ?? "";
    const price = editPrices[k] ?? 0;
    if (value.trim() !== "" && price <= 0) {
      setFeedback({
        kind: "err",
        text: "単価を入れてください。0円のままだと日報の内訳に金額が入りません",
      });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    setSavingKey(k);
    setFeedback(null);
    try {
      const res = await upsertLimitedProduct(m.year, m.month, value, price);
      if (!res.success) throw new Error(res.error || "保存失敗");
      setFeedback({
        kind: "ok",
        text: `${m.label} を保存しました${value.trim() === "" ? "（空欄＝設定削除）" : ""}`,
      });
      await reload();
    } catch (e: any) {
      setFeedback({ kind: "err", text: e?.message || String(e) });
    } finally {
      setSavingKey(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-bold text-brand-dark">🍴 月次限定商品設定</h2>
      <p className="text-xs text-stone-600">
        当月・翌月の限定商品名と単価をここで設定すると、日報フォームの限定商品欄に自動入力されます。
        単価は月ごとに持てるので、月によって値段が変わっても大丈夫です。
        商品名を空欄で保存すると設定が削除されます。
      </p>

      {feedback && (
        <div
          className={`text-sm font-semibold rounded-xl px-3 py-2 ${
            feedback.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.kind === "ok" ? "✅" : "❌"} {feedback.text}
        </div>
      )}

      {/* 編集可能：翌月＋当月 */}
      <div className="space-y-2">
        {editableMonths.map((m) => {
          const k = keyOf(m.year, m.month);
          const value = editValues[k] ?? "";
          const isSaving = savingKey === k;
          const isCurrent = m.label.includes("当月");
          return (
            <div
              key={k}
              className={`rounded-xl border p-3 ${
                isCurrent
                  ? "border-brand bg-amber-50"
                  : "border-stone-200 bg-stone-50"
              }`}
            >
              <div className="text-sm font-bold text-stone-700 mb-2">
                {m.label}
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={value}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      [k]: e.target.value,
                    }))
                  }
                  placeholder="例：チキン南蛮（空欄で設定削除）"
                  className="field w-full"
                  disabled={isSaving}
                />
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-sm text-stone-600">単価</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={10}
                      value={editPrices[k] || ""}
                      onChange={(e) =>
                        setEditPrices((prev) => ({
                          ...prev,
                          [k]: Math.max(
                            0,
                            parseInt(e.target.value || "0", 10),
                          ),
                        }))
                      }
                      placeholder="例：250"
                      className="field flex-1 text-right"
                      disabled={isSaving}
                    />
                    <span className="text-sm text-stone-600">円</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSave(m)}
                    disabled={isSaving}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {isSaving ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 読み取り専用：過去6ヶ月 */}
      <div className="pt-2 border-t border-stone-200">
        <div className="text-xs font-bold text-stone-500 mb-2">
          ── 過去6ヶ月（読み取り専用）──
        </div>
        {loading ? (
          <p className="text-sm text-stone-500">読み込み中…</p>
        ) : (
          <ul className="text-sm space-y-0.5">
            {pastMonths.map((m) => {
              const r = findRecord(m.year, m.month);
              return (
                <li key={keyOf(m.year, m.month)} className="text-stone-700">
                  {m.label}：
                  <span className={r ? "font-semibold" : "text-stone-400"}>
                    {r ? `${r.product_name}${r.price > 0 ? `（¥${r.price}）` : "（単価未設定）"}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
