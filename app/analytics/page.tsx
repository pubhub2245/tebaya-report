"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { yen } from "@/lib/format";
import {
  getOutletAnalytics,
  BREAK_EVEN_LINE,
  type OutletStats,
  type RankKind,
} from "@/lib/analytics/outletAnalytics";

/** ランクバッジの色 */
const RANK_BADGE: Record<RankKind, { label: string; cls: string }> = {
  A: { label: "A", cls: "bg-amber-400 text-amber-950" },
  B: { label: "B", cls: "bg-lime-400 text-lime-950" },
  C: { label: "C", cls: "bg-sky-400 text-sky-950" },
  D: { label: "D", cls: "bg-stone-300 text-stone-700" },
  INSUFFICIENT: { label: "データ不足", cls: "bg-stone-200 text-stone-500" },
  EVENT: { label: "S / イベント枠", cls: "bg-fuchsia-200 text-fuchsia-800" },
};

function OutletCard({ s }: { s: OutletStats }) {
  const badge = RANK_BADGE[s.rankKind];
  const isLatest = s.basis === "latest";

  return (
    <div className="bg-white rounded-2xl shadow-md ring-1 ring-stone-200 p-4 space-y-3">
      {/* ヘッダー: 店名 + ランク */}
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold text-brand-dark text-lg leading-tight">
          {s.name}
        </div>
        <span
          className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      {/* 平均売上 + 損益分岐の色分け */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-stone-500">平均売上</div>
          <div className="text-2xl font-bold font-mono text-stone-800">
            {yen(s.average)}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-sm font-bold ${
              s.aboveBreakEven ? "text-green-600" : "text-red-500"
            }`}
          >
            {s.aboveBreakEven ? "🟢 黒字ライン" : "🔴 損益分岐 未満"}
          </div>
          <div className="text-[10px] text-stone-400">
            分岐ライン {yen(BREAK_EVEN_LINE)}
          </div>
        </div>
      </div>

      {/* ★ 出店可能数（強調表示）＋ 今月の残り回数 */}
      {s.rankDef && (
        <div className="rounded-xl bg-indigo-50 border-2 border-indigo-300 px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none">📅</span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-indigo-500">
                今月の出店可能数
              </div>
              <div className="text-2xl font-extrabold text-indigo-800 leading-tight">
                {s.rankDef.monthlyLimitLabel}
              </div>
            </div>
          </div>
          {s.remaining !== null && (
            <div
              className={`rounded-lg px-3 py-2 text-center font-extrabold ${
                s.remaining > 0
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {s.remaining > 0 ? (
                <>
                  残り あと<span className="text-2xl mx-1">{s.remaining}</span>回
                  出店できます
                </>
              ) : (
                <>今月は上限に達しています</>
              )}
              <div className="text-[11px] font-normal text-stone-500 mt-0.5">
                今月{s.usedThisMonth}回出店
                {s.isAggregateLimit && "（Dランク全店 合計で判定）"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 出店回数 + ランクの目標 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
        <span>
          出店回数{" "}
          <span className="font-bold text-stone-800">{s.reportCount}回</span>
          {s.basis === "latest" && s.totalReportCount > s.reportCount && (
            <span className="text-stone-400">（全期間{s.totalReportCount}回）</span>
          )}
        </span>
        {s.rankDef && (
          <span>
            目標{" "}
            <span className="font-bold text-stone-800">
              {yen(s.rankDef.target)}
            </span>
          </span>
        )}
      </div>

      {/* 平均の根拠バッジ（最新 / 参考値）を色と位置で明確に分ける */}
      {isLatest ? (
        <div className="inline-flex items-center gap-1 rounded-md bg-green-100 text-green-700 text-xs font-bold px-2 py-1">
          🟢 最新（6/10以降・14-19時の実力）
        </div>
      ) : (
        <div className="rounded-md bg-yellow-100 text-yellow-800 text-xs px-2 py-1 leading-snug">
          ⚠️ ※営業時間が長い期間の平均（参考値）
          <span className="block text-yellow-700/80">
            今の14-19時だと下がる可能性があります
          </span>
        </div>
      )}

      {/* 注意書き: データ不足 */}
      {s.rankKind === "INSUFFICIENT" && (
        <div className="text-xs text-stone-500">
          出店回数が少ないため、ランクは断定していません（参考値）
        </div>
      )}

      {/* 曜日別の平均（月〜日） */}
      <div>
        <div className="text-[10px] text-stone-400 mb-1">曜日別の平均</div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {s.weekday.labels.map((label, i) => {
            const v = s.weekday.averages[i];
            const isWeekend = i >= 5;
            return (
              <div key={label} className="space-y-0.5">
                <div
                  className={`text-[10px] ${
                    isWeekend ? "text-rose-400" : "text-stone-400"
                  }`}
                >
                  {label}
                </div>
                <div
                  className={`text-[10px] font-mono rounded py-1 ${
                    v === null
                      ? "bg-stone-50 text-stone-300"
                      : v >= BREAK_EVEN_LINE
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-600"
                  }`}
                >
                  {v === null ? "—" : `${Math.round(v / 1000)}k`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [outlets, setOutlets] = useState<OutletStats[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOutletAnalytics();
        if (!cancelled) setOutlets(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-12 space-y-5">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
          <span className="text-xs text-stone-500">リアルタイム集計</span>
        </div>
        <h1 className="text-2xl font-bold text-brand-dark text-center">
          📍 出店先 売上分析
        </h1>
        <p className="text-sm text-stone-600 text-center">
          各店の平均売上・ランク・損益分岐を自動集計しています
        </p>
      </header>

      {error && (
        <div className="card bg-red-50 border border-red-200 text-red-700 text-sm">
          エラー: {error}
        </div>
      )}

      {loading && !outlets && (
        <p className="text-center text-sm text-stone-500">読み込み中…</p>
      )}

      {outlets && outlets.length === 0 && (
        <p className="text-center text-sm text-stone-500">
          集計できる日報データがありません
        </p>
      )}

      {outlets && outlets.length > 0 && (
        <section className="space-y-3">
          {outlets.map((s) => (
            <OutletCard key={s.name} s={s} />
          ))}
        </section>
      )}

      <p className="text-xs text-stone-400 leading-relaxed pt-2">
        ※ ランクは平均売上から自動判定（A:3万〜 / B:2.5万〜 / C:2万〜 /
        D:2万以下）。出店回数が{" "}
        <span className="font-bold">3回未満</span>{" "}
        の店は「データ不足」、イベント・朝市など単発は「S/イベント枠」として
        自動ランク対象外にしています。
      </p>
    </main>
  );
}
