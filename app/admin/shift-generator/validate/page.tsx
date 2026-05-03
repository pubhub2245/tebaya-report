"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminGate from "@/app/components/AdminGate";
import {
  isTebayaCell,
  type ParserSelfCheckEntry,
} from "@/lib/nagayama-parser";

type NagayamaSchedule = {
  [storeName: string]: {
    [dateISO: string]: string | null;
  };
};

type ParsedShape = {
  schedule: NagayamaSchedule;
  confirmed: Record<string, string[]>;
  warnings: string[];
  parserSelfCheck: ParserSelfCheckEntry[];
  meta: {
    detectedYear: number;
    detectedMonths: number[];
    detectedStores: string[];
  };
};

const NAGAYAMA_DISPLAY_ORDER = [
  "鷹尾店",
  "若葉店",
  "三股店",
  "都北店",
  "山田店",
  "志比田",
] as const;
const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function ValidatePage() {
  return (
    <AdminGate>
      <ValidateView />
    </AdminGate>
  );
}

function ValidateView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const key = searchParams.get("key");
  const yearParam = parseInt(searchParams.get("year") ?? "");
  const monthParam = parseInt(searchParams.get("month") ?? "");

  const [parsed, setParsed] = useState<ParsedShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setLoadError(
        "キーが指定されていません。アップロード画面からやり直してください。",
      );
      setLoading(false);
      return;
    }
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) {
        setLoadError(
          "解析データが見つかりません。再アップロードしてください。",
        );
      } else {
        setParsed(JSON.parse(raw) as ParsedShape);
      }
    } catch (e: any) {
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [key]);

  // 当月の日付配列
  const daysOfMonth = useMemo(() => {
    if (!Number.isFinite(yearParam) || !Number.isFinite(monthParam)) return [];
    const dim = new Date(yearParam, monthParam, 0).getDate();
    return Array.from({ length: dim }, (_, i) => i + 1);
  }, [yearParam, monthParam]);

  // schedule のキー（実店舗名）と表示順を突き合わせる
  const orderedStoreNames = useMemo(() => {
    if (!parsed) return [];
    const keys = Object.keys(parsed.schedule);
    const ordered: string[] = [];
    for (const target of NAGAYAMA_DISPLAY_ORDER) {
      const hit = keys.find(
        (k) => k === target || k.includes(target.replace(/店$/, "")),
      );
      if (hit && !ordered.includes(hit)) ordered.push(hit);
    }
    for (const k of keys) {
      if (!ordered.includes(k)) ordered.push(k);
    }
    return ordered;
  }, [parsed]);

  const tebayaCount = useMemo(() => {
    if (!parsed || !Number.isFinite(monthParam)) return 0;
    const prefix = `${yearParam}-${pad2(monthParam)}-`;
    let n = 0;
    for (const dates of Object.values(parsed.schedule)) {
      for (const [iso, vendor] of Object.entries(dates)) {
        if (iso.startsWith(prefix) && isTebayaCell(vendor)) n++;
      }
    }
    return n;
  }, [parsed, yearParam, monthParam]);

  // 同日に複数店舗の手羽屋セル（衝突）を検出
  const dayConflicts = useMemo(() => {
    if (!parsed || !Number.isFinite(monthParam))
      return [] as Array<{ day: number; stores: string[] }>;
    const prefix = `${yearParam}-${pad2(monthParam)}-`;
    const map: Record<number, string[]> = {};
    for (const [storeName, dates] of Object.entries(parsed.schedule)) {
      for (const [iso, vendor] of Object.entries(dates)) {
        if (!iso.startsWith(prefix)) continue;
        if (!isTebayaCell(vendor)) continue;
        const day = parseInt(iso.slice(8), 10);
        (map[day] ??= []).push(storeName);
      }
    }
    return Object.entries(map)
      .filter(([, stores]) => stores.length >= 2)
      .map(([day, stores]) => ({ day: parseInt(day, 10), stores }))
      .sort((a, b) => a.day - b.day);
  }, [parsed, yearParam, monthParam]);

  const monthSelfCheck = useMemo(() => {
    if (!parsed) return [] as ParserSelfCheckEntry[];
    return parsed.parserSelfCheck.filter((p) => p.month === monthParam);
  }, [parsed, monthParam]);

  const monthSelfCheckIssues = monthSelfCheck.filter(
    (p) => p.expectedDays !== p.actualCellCount,
  );

  const handleConfirmGenerate = async () => {
    if (!parsed) return;
    setGenerateError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/shift-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: yearParam,
          month: monthParam,
          parsed,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "自動生成に失敗しました");
      }
      const previewKey = `shift-preview-${Date.now()}`;
      sessionStorage.setItem(previewKey, JSON.stringify(json.data));
      router.push(
        `/admin/shift-generator/preview?key=${encodeURIComponent(previewKey)}&year=${yearParam}&month=${monthParam}`,
      );
    } catch (e: any) {
      setGenerateError(e?.message || String(e));
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-6">
        <p className="text-stone-500">読み込み中…</p>
      </main>
    );
  }

  if (loadError || !parsed) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
          ❌ {loadError || "データがありません"}
        </div>
        <Link
          href="/admin/shift-generator"
          className="btn-primary inline-block"
        >
          ← アップロード画面へ
        </Link>
      </main>
    );
  }

  if (!Number.isFinite(yearParam) || !Number.isFinite(monthParam)) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
          ❌ 年月が指定されていません
        </div>
        <Link
          href="/admin/shift-generator"
          className="btn-primary inline-block"
        >
          ← アップロード画面へ
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-4 pb-32">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">
          🔍 PDF読み取り結果の確認（{yearParam}年{monthParam}月）
        </h1>
        <Link href="/admin/shift-generator" className="btn-secondary text-sm">
          ← やり直す
        </Link>
      </header>

      <p className="text-sm text-stone-600">
        AI が読み取った各店舗の「手羽屋」セルを目視確認してください。
        緑色のマスが「手羽屋」と判定されたセルです。
      </p>

      {/* サマリー */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div className="card text-center">
          <div className="text-xs text-stone-500">対象月</div>
          <div className="text-xl font-bold">
            {yearParam}/{monthParam}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-stone-500">検出店舗数</div>
          <div className="text-xl font-bold">
            {parsed.meta.detectedStores.length}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-stone-500">
            手羽屋セル数（{monthParam}月）
          </div>
          <div className="text-xl font-bold text-green-700">{tebayaCount}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-stone-500">同日衝突</div>
          <div
            className={`text-xl font-bold ${
              dayConflicts.length > 0 ? "text-red-600" : "text-stone-700"
            }`}
          >
            {dayConflicts.length}件
          </div>
        </div>
      </section>

      {/* 同日衝突の警告 */}
      {dayConflicts.length > 0 && (
        <section className="card border-2 border-red-400 bg-red-50">
          <h2 className="text-base font-bold text-red-800 mb-2">
            ⚠️ 同日に複数店舗で「手羽屋」が検出されました
          </h2>
          <p className="text-xs text-red-900 mb-2">
            ながやまの「1日1店舗ルール」に反するため、PDF読み取りミスの可能性があります。
            一覧を確認し、PDFと突き合わせてください。
          </p>
          <ul className="space-y-1 text-sm text-red-900">
            {dayConflicts.map((c) => (
              <li key={c.day}>
                <strong>
                  {monthParam}/{c.day}
                </strong>
                ：{c.stores.join("、")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* parserSelfCheck の不一致 */}
      {monthSelfCheckIssues.length > 0 && (
        <section className="card border-2 border-amber-400 bg-amber-50">
          <h2 className="text-base font-bold text-amber-900 mb-2">
            ⚠️ AI 読み取りの自己チェックで不一致
          </h2>
          <p className="text-xs text-amber-900 mb-2">
            日付エントリ数がカレンダーの日数と一致しない店舗があります。
            読み飛ばしや列ズレの可能性があります。
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {monthSelfCheckIssues.map((p, i) => (
              <li key={i}>
                <strong>{p.store}</strong>: {p.actualCellCount} /{" "}
                {p.expectedDays} 日（
                {p.expectedDays - p.actualCellCount > 0 ? "不足" : "超過"}{" "}
                {Math.abs(p.expectedDays - p.actualCellCount)} 日）
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* パーサー全般の警告 */}
      {parsed.warnings.length > 0 && (
        <section className="card border border-amber-300 bg-amber-50">
          <h2 className="text-sm font-bold text-amber-900 mb-1">
            パーサー警告（{parsed.warnings.length}件）
          </h2>
          <ul className="space-y-0.5 text-xs text-amber-900 max-h-40 overflow-y-auto">
            {parsed.warnings.map((w, i) => (
              <li key={i}>・{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* グリッド表示 */}
      <section className="card overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-stone-100 border border-stone-200 px-2 py-1 text-left z-10">
                店舗 ＼ 日
              </th>
              {daysOfMonth.map((d) => {
                const date = new Date(yearParam, monthParam - 1, d);
                const dow = date.getDay();
                return (
                  <th
                    key={d}
                    className={`border border-stone-200 px-1 py-1 text-center min-w-[26px] ${
                      dow === 0
                        ? "bg-red-50 text-red-700"
                        : dow === 6
                          ? "bg-blue-50 text-blue-700"
                          : "bg-stone-50"
                    }`}
                  >
                    <div className="font-bold">{d}</div>
                    <div className="text-[9px] opacity-70">
                      {WEEKDAY_LABEL[dow]}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {orderedStoreNames.map((store) => {
              const dates = parsed.schedule[store] ?? {};
              return (
                <tr key={store}>
                  <th className="sticky left-0 bg-white border border-stone-200 px-2 py-1 text-left whitespace-nowrap z-10">
                    {store}
                  </th>
                  {daysOfMonth.map((d) => {
                    const iso = `${yearParam}-${pad2(monthParam)}-${pad2(d)}`;
                    const cell = dates[iso];
                    const tebaya = isTebayaCell(cell);
                    const empty = cell === null || cell === undefined;
                    return (
                      <td
                        key={d}
                        title={cell ?? "(空き)"}
                        className={`border border-stone-200 text-center align-middle min-w-[26px] h-7 ${
                          tebaya
                            ? "bg-green-200 font-bold text-green-900"
                            : empty
                              ? "bg-white"
                              : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {tebaya ? "手" : empty ? "" : "・"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-stone-500 mt-2">
          凡例: <span className="bg-green-200 px-1 font-bold">手</span> =
          手羽屋確定、 <span className="bg-stone-100 px-1">・</span> = 他業者、
          (白) = 空き枠
        </p>
      </section>

      {generateError && (
        <div className="card bg-red-50 text-red-700 border border-red-200 text-sm font-semibold">
          ❌ {generateError}
        </div>
      )}

      {/* 下部固定アクション */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/admin/shift-generator" className="btn-secondary">
            ← やり直す
          </Link>
          <button
            type="button"
            onClick={handleConfirmGenerate}
            disabled={generating}
            className="btn-primary flex-1 max-w-xs"
          >
            {generating ? "⏳ 自動生成中…" : "この内容で自動生成する"}
          </button>
        </div>
      </div>
    </main>
  );
}
