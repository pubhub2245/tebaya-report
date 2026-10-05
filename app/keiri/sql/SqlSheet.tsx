"use client";

/**
 * 貼り紙の「コピーする」ボタンと、「いま流れているか」の表示。
 *
 * ★見せるために JS を必要にしない（本文は親のページが先に出している）。
 *   ここは**コピーのボタン**と**流れたかの印**だけ。JS が動かなくても
 *   SQL の文そのものは画面に出ているので、長押しでコピーできる。
 */

import { useCallback, useEffect, useState } from "react";

type ShelfRow = {
  step: string;
  name: string;
  benefit: string;
  state: "ある" | "まだ無い" | "分からない";
  check: string;
  note: string;
};

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 2500);
    } catch {
      setDone(false);
    }
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 items-center rounded-xl bg-stone-900 px-4 text-sm font-bold text-white hover:bg-stone-700 transition"
    >
      {done ? "コピーしました" : label}
    </button>
  );
}

/** 流れたかどうかを、本番の窓口（/api/keiri/shelves）に聞いて出す */
export function ShelfStatus() {
  const [rows, setRows] = useState<ShelfRow[] | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/keiri/shelves", { cache: "no-store" });
        const json = (await res.json()) as { shelves?: ShelfRow[]; summary?: string };
        if (!alive) return;
        setRows(json.shelves ?? []);
        setSummary(json.summary ?? "");
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-stone-700">
        いま流れているかを確かめられませんでした。
        <code className="mx-1">/api/keiri/shelves</code>
        を直接開くと同じ内容が出ます。
      </p>
    );
  }

  if (!rows) {
    return <p className="text-sm text-stone-600">いまの状態を確かめています…</p>;
  }

  return (
    <div className="space-y-2">
      {summary ? (
        <p className="text-sm font-bold text-stone-900">{summary}</p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.step}
            className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800"
          >
            <span className="font-bold">
              {r.step} {r.name}
            </span>
            <span
              className={
                "ml-2 rounded-lg px-2 py-0.5 text-xs font-bold " +
                (r.state === "ある"
                  ? "bg-emerald-100 text-emerald-900"
                  : r.state === "まだ無い"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-stone-200 text-stone-800")
              }
            >
              {r.state}
            </span>
            <p className="mt-1 text-xs text-stone-600 leading-relaxed">{r.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
