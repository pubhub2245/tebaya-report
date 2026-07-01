"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { yen } from "@/lib/format";
import {
  getOutletAnalytics,
  type OutletStats,
  type RankKind,
} from "@/lib/analytics/outletAnalytics";

/** トップ画面に出す上位店舗数 */
const TOP_N = 5;

const RANK_BADGE: Record<RankKind, string> = {
  A: "bg-amber-400 text-amber-950",
  B: "bg-lime-400 text-lime-950",
  C: "bg-sky-400 text-sky-950",
  D: "bg-stone-300 text-stone-700",
  INSUFFICIENT: "bg-stone-200 text-stone-500",
  EVENT: "bg-fuchsia-200 text-fuchsia-800",
};

export default function LocationRankingSummary() {
  const [outlets, setOutlets] = useState<OutletStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getOutletAnalytics();
        if (!cancelled) setOutlets(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return null; // トップ画面では静かに非表示（既存機能を邪魔しない）

  // 自動ランク確定店（A〜D）のみを上位表示。データ不足・イベントは除外。
  const ranked = (outlets || []).filter((s) =>
    ["A", "B", "C", "D"].includes(s.rankKind),
  );
  const top = ranked.slice(0, TOP_N);

  return (
    <div className="bg-white rounded-2xl shadow-md ring-1 ring-stone-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-brand-dark text-base">
          📍 出店先ランキング
        </div>
        <Link
          href="/analytics"
          className="text-xs text-indigo-600 underline hover:text-indigo-800"
        >
          詳しく見る →
        </Link>
      </div>

      {!outlets && (
        <p className="text-sm text-stone-500">読み込み中…</p>
      )}

      {outlets && top.length === 0 && (
        <p className="text-sm text-stone-500">
          まだランキングを出せるデータがありません
        </p>
      )}

      {top.length > 0 && (
        <ol className="space-y-2">
          {top.map((s, i) => (
            <li
              key={s.name}
              className="flex items-center gap-2 text-sm"
            >
              <span className="w-5 text-center font-bold text-stone-400">
                {i + 1}
              </span>
              <span
                className={`shrink-0 text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${RANK_BADGE[s.rankKind]}`}
              >
                {s.rankKind}
              </span>
              <span className="flex-1 truncate text-stone-700">{s.name}</span>
              <span className="text-[10px] text-stone-400">
                {s.reportCount}回
              </span>
              <span
                className={`font-bold font-mono ${
                  s.aboveBreakEven ? "text-green-600" : "text-red-500"
                }`}
              >
                {yen(s.average)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
