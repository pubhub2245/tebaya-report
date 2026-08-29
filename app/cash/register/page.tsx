"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen, slashDate } from "@/lib/format";
import AdminGate from "@/app/components/AdminGate";
import {
  buildRegisterChain,
  normalizeUnit,
  type ChainSummary,
  type CloseRecord,
  type OpenRecord,
} from "@/lib/registerChain";

/**
 * レジ突き合わせ画面（管理者）。
 *
 * ■ 何を見る画面か
 *   レジのお金は、閉店してから翌日の開店までのあいだ誰も触らないはず。
 *   だから「前の営業日の閉店後の金額」と「今日の開店前の金額」は
 *   ぴったり同じになるはず。ここがズレていたら、どこかで何かが起きている。
 *
 *   金庫を閉めて鍵をかけ、翌朝そのまま開けたのに中身が変わっていたら変ですよね。
 *   それを毎日ぶん、自動で並べて見せるだけの画面です。
 *
 * ■ 使う数字
 *   開店前 … 設営後チェック（setup_checks）
 *   閉店後 … 営業後日報（daily_reports）
 *
 * ■ 読み込みについて
 *   合計だけを見る画面なので、レシート写真を含む経費の明細は取得しない
 *   （CLAUDE.md「4-2. 集計画面は経費の明細を取得しない」に従う）。
 */

/** 何日ぶんさかのぼって表示するか */
const RANGE_OPTIONS = [
  { label: "直近30日", days: 30 },
  { label: "直近90日", days: 90 },
  { label: "全期間", days: 0 },
];

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function RegisterCheckPage() {
  return (
    <AdminGate>
      <RegisterCheckInner />
    </AdminGate>
  );
}

function RegisterCheckInner() {
  const [opens, setOpens] = useState<OpenRecord[]>([]);
  const [closes, setCloses] = useState<CloseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [onlyMismatch, setOnlyMismatch] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 突き合わせには「その期間の前の営業日」も必要なので、
      // 表示したい期間より少し広めに読み込む
      const fetchFrom = days > 0 ? daysAgoStr(days + 120) : "1900-01-01";

      const [setupRes, reportRes] = await Promise.all([
        supabase
          .from("setup_checks")
          .select("date, location, team_unit, register_total")
          .gte("date", fetchFrom)
          .order("date"),
        supabase
          .from("daily_reports")
          .select(
            "date, location, unit_number, register_total, register_diff, sales_amount, expenses_total",
          )
          .gte("date", fetchFrom)
          .order("date"),
      ]);
      if (setupRes.error) throw setupRes.error;
      if (reportRes.error) throw reportRes.error;

      setOpens(
        ((setupRes.data as any[]) || []).map((r) => ({
          date: r.date,
          unit: normalizeUnit(r.team_unit),
          location: r.location || "",
          amount: Number(r.register_total) || 0,
        })),
      );
      setCloses(
        ((reportRes.data as any[]) || []).map((r) => ({
          date: r.date,
          unit: normalizeUnit(r.unit_number),
          location: r.location || "",
          amount: Number(r.register_total) || 0,
          sales: Number(r.sales_amount) || 0,
          expenses: Number(r.expenses_total) || 0,
          reportedDiff: Number(r.register_diff) || 0,
        })),
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  /** 突き合わせの計算。表示する期間だけに絞ってから集計する */
  const summary: ChainSummary = useMemo(() => {
    const from = days > 0 ? daysAgoStr(days) : "1900-01-01";
    const shown = opens.filter((o) => o.date >= from);
    return buildRegisterChain(shown, closes);
  }, [opens, closes, days]);

  const rows = onlyMismatch
    ? summary.rows.filter((r) => r.checkable && r.diff !== 0)
    : summary.rows;

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-dark">🔍 レジ突き合わせ</h1>
        <Link href="/" className="text-sm text-stone-500 underline">
          ← トップ
        </Link>
      </div>

      <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 rounded-xl px-3 py-2">
        レジのお金は、閉店してから翌日の開店までのあいだ誰も触らないはずです。
        つまり <b>前の営業日の「閉店後」＝ 今日の「開店前」</b> になるはず。
        ここがズレていたら、数え間違い・レジからの出し入れ・入力忘れのどれかが起きています。
      </p>

      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-2 py-1">❌ {error}</p>
      )}

      {!loading && !error && (
        <>
          {/* まとめ */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="確認できた日数" value={`${summary.checked}日`} />
            <StatCard label="ぴったり合っていた" value={`${summary.matched}日`} tone="ok" />
            <StatCard
              label="ズレていた"
              value={`${summary.mismatched}日`}
              tone={summary.mismatched > 0 ? "warn" : "ok"}
            />
            <StatCard
              label="ズレの合計"
              value={yen(summary.netDiff)}
              tone={summary.netDiff === 0 ? "ok" : "warn"}
            />
          </section>

          {summary.unknown > 0 && (
            <p className="text-xs text-stone-500">
              ※ {summary.unknown}日ぶんは、前の営業日の日報が見つからないため確かめられませんでした
              （日報の未提出、または号車が未入力）。
            </p>
          )}

          {/* 絞り込み */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.label}
                onClick={() => setDays(o.days)}
                className={`px-3 py-1 rounded border ${
                  days === o.days
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {o.label}
              </button>
            ))}
            <label className="flex items-center gap-1 ml-auto text-stone-600">
              <input
                type="checkbox"
                checked={onlyMismatch}
                onChange={(e) => setOnlyMismatch(e.target.checked)}
              />
              ズレた日だけ表示
            </label>
          </div>

          {/* 一覧 */}
          {rows.length === 0 ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-3">
              ✅ この期間、レジのつながりにズレはありませんでした。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                    <th className="py-2 pr-2">号車</th>
                    <th className="py-2 pr-2">前の営業日（閉店後）</th>
                    <th className="py-2 pr-2 text-right">閉店後</th>
                    <th className="py-2 pr-2">この日（開店前）</th>
                    <th className="py-2 pr-2 text-right">開店前</th>
                    <th className="py-2 text-right">ズレ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.unit}-${r.date}`}
                      className="border-b border-stone-100 align-top"
                    >
                      <td className="py-2 pr-2 whitespace-nowrap">{r.unit}号車</td>
                      <td className="py-2 pr-2 whitespace-nowrap text-stone-600">
                        {r.prevDate ? (
                          <>
                            {slashDate(r.prevDate)}
                            <span className="block text-[11px] text-stone-400">
                              {r.prevLocation}
                            </span>
                          </>
                        ) : (
                          <span className="text-stone-400">記録なし</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right font-mono whitespace-nowrap">
                        {r.prevCloseAmount === null ? "—" : yen(r.prevCloseAmount)}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {slashDate(r.date)}
                        <span className="block text-[11px] text-stone-400">
                          {r.location}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right font-mono whitespace-nowrap">
                        {yen(r.openAmount)}
                      </td>
                      <td
                        className={`py-2 text-right font-mono whitespace-nowrap font-bold ${
                          r.diff === null
                            ? "text-stone-400"
                            : r.diff === 0
                              ? "text-emerald-600"
                              : "text-red-600"
                        }`}
                      >
                        {r.diff === null
                          ? "確認不可"
                          : r.diff === 0
                            ? "±0"
                            : `${r.diff > 0 ? "+" : ""}${yen(r.diff)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-stone-400 leading-relaxed">
            開店前の金額は「設営後チェック」、閉店後の金額は「営業後日報」から取っています。
            どちらかが未提出の日は突き合わせできません。
            この画面はデータを見るだけで、書き換えは一切しません。
          </p>
        </>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const color =
    tone === "warn"
      ? "text-red-600"
      : tone === "ok"
        ? "text-emerald-700"
        : "text-brand-dark";
  return (
    <div className="card">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
