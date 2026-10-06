"use client";

import { useState } from "react";

/**
 * レシートの写真を1枚えらぶと、**科目の付いた経費の行**が出る試し場（kp229・f1-6）。
 *
 * ・送った写真も、出た行も **どこにも保存しません**（/api/keiri/receipt-read が保存しない窓口）。
 * ・金額を勝手に作りません。支払合計と合わないときは、直さず「要確認」と出します。
 * ・手羽屋の日報・経費は1行も増えません。
 */

type Row = {
  description: string;
  amount: number;
  accountLabel: string;
  matched: boolean;
};

type Result = {
  ok?: boolean;
  rows?: Row[];
  total?: number;
  rowsTotal?: number;
  taxAdjusted?: boolean;
  totalMatched?: boolean;
  unmatchedCount?: number;
  needsHuman?: boolean;
  message?: string;
  error?: string;
};

const yen = (n: number | undefined) => `¥${(n ?? 0).toLocaleString("ja-JP")}`;

export default function ReceiptTry() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onPick(file: File | null) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("写真を読み込めませんでした"));
        reader.readAsDataURL(file);
      });
      const mediaType = file.type || "image/jpeg";
      const res = await fetch("/api/keiri/receipt-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, mediaType }),
      });
      setResult((await res.json()) as Result);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "うまくいきませんでした" });
    } finally {
      setBusy(false);
    }
  }

  const rows = result?.rows ?? [];

  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-6">
      <p className="font-bold text-stone-900">ここで1枚 試せます（保存されません）</p>
      <p className="mt-1 text-sm text-stone-600 leading-relaxed">
        レシートの写真をえらぶと、税込に直した金額と、当てた科目つきの経費の行が出ます。
        送った写真も出た行も、どこにも保存されません。
      </p>

      <label className="mt-4 flex items-center justify-center w-full h-14 rounded-2xl bg-amber-500 text-white font-bold text-lg hover:bg-amber-600 transition cursor-pointer">
        {busy ? "読み取っています…" : "レシートの写真をえらぶ"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>

      {result?.error && (
        <p className="mt-4 text-sm text-red-700">⚠️ {result.error}</p>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="py-1">内容</th>
                <th className="py-1">科目</th>
                <th className="py-1 text-right">金額（税込）</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.description}-${i}`} className="border-t border-stone-100">
                  <td className="py-1 text-stone-900">{r.description}</td>
                  <td className="py-1 text-stone-600">
                    {r.accountLabel}
                    {r.matched ? "" : "（要確認）"}
                  </td>
                  <td className="py-1 text-right text-stone-900">{yen(r.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-stone-300 font-bold">
                <td className="py-1" colSpan={2}>
                  合計
                </td>
                <td className="py-1 text-right">{yen(result?.rowsTotal)}</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-sm text-stone-700 leading-relaxed">{result?.message}</p>
          <p className="mt-2 text-xs text-stone-500">
            レシートの支払合計 {yen(result?.total)}／
            {result?.totalMatched ? "行の合計とぴったり合っています" : "行の合計と合っていません（金額は直していません）"}
            {result?.unmatchedCount ? `／科目が分からない行 ${result.unmatchedCount}件` : ""}
          </p>
          <p className="mt-1 text-xs text-stone-500">保存はしていません（日報・経費は1行も増えていません）。</p>
        </div>
      )}
    </div>
  );
}
