"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminGate from "@/app/components/AdminGate";

const LOADING_MESSAGES = [
  { atSeconds: 0, text: "PDFをアップロード中…" },
  { atSeconds: 5, text: "Claude API でPDFを解析中… 約60秒かかります" },
  { atSeconds: 30, text: "もう少しです（PDF解析中）…" },
  { atSeconds: 70, text: "シフトを組み立て中…" },
  { atSeconds: 90, text: "ほぼ完了です…" },
];

export default function ShiftGeneratorPage() {
  return (
    <AdminGate>
      <UploadView />
    </AdminGate>
  );
}

function UploadView() {
  const router = useRouter();
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1; // 今月をデフォルト

  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitting) return;
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [submitting]);

  const yearOptions: number[] = [];
  for (let y = defaultYear - 1; y <= defaultYear + 1; y++) yearOptions.push(y);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("PDFファイルを選んでください");
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("PDFファイルを選んでください");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      fd.append("year", String(year));
      fd.append("month", String(month));
      const res = await fetch("/api/shift-generator/generate", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "生成に失敗しました");
      }
      const key = `shift-preview-${Date.now()}`;
      try {
        sessionStorage.setItem(key, JSON.stringify(json.data));
      } catch (storageErr: any) {
        throw new Error(
          "プレビューデータの一時保存に失敗しました（容量超過？）: " +
            (storageErr?.message || ""),
        );
      }
      router.push(
        `/admin/shift-generator/preview?key=${encodeURIComponent(key)}&year=${year}&month=${month}`,
      );
    } catch (err: any) {
      setError(err?.message || String(err));
      setSubmitting(false);
    }
  };

  const currentMessage =
    [...LOADING_MESSAGES].reverse().find((m) => elapsed >= m.atSeconds)?.text ||
    LOADING_MESSAGES[0].text;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">
          🗓️ シフト自動生成
        </h1>
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary text-sm">
            ← 管理者トップ
          </Link>
        </div>
      </header>

      <div className="card space-y-4">
        <p className="text-sm text-stone-600 leading-relaxed">
          ながやまPDFスケジュール表をアップロードして、月次シフトを自動生成します。
          生成後にプレビュー画面で内容を編集してから DB に登録できます。
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">📎 ながやまPDF</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFileChange}
              disabled={submitting}
              className="block w-full text-sm text-stone-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand file:text-white hover:file:bg-brand-dark disabled:opacity-50"
            />
            {file && (
              <div className="text-xs text-stone-500 mt-1">
                選択中: {file.name}（{Math.round(file.size / 1024)} KB）
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">📅 対象年</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                disabled={submitting}
                className="field"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">📅 対象月</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                disabled={submitting}
                className="field"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !file}
            className="btn-primary w-full"
          >
            {submitting ? "⏳ 生成中…" : "シフトを生成"}
          </button>
        </form>
      </div>

      {submitting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl space-y-4">
            <div className="text-center">
              <div className="text-5xl animate-bounce mb-3">🗓️</div>
              <h2 className="text-lg font-bold text-brand-dark">
                シフト生成中…
              </h2>
              <p className="text-sm text-stone-600 mt-2">{currentMessage}</p>
            </div>
            <div className="text-center text-3xl font-mono font-bold text-stone-700">
              {elapsed}秒
            </div>
            <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand h-full transition-all duration-1000"
                style={{
                  width: `${Math.min((elapsed / 90) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-stone-500 text-center">
              ※ ブラウザを閉じないでください
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
