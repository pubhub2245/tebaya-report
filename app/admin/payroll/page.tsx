"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { yen } from "@/lib/format";
import { laborFor } from "@/lib/formState";
import AdminGate from "@/app/components/AdminGate";

/**
 * スタッフ別 月間稼働集計（給与計算の補助）。
 * daily_reports から、月ごとに各スタッフの「実働日数」と「給与額」を集計する。
 * - 共同出店（「A、B」）は分解して各人にカウント。日当（labor）も人数で割って各人ぶんに。
 * - カタカナ/ひらがなの表記ゆれ（カズキ↔かずき）はひらがなに正規化して名寄せ
 * - 同じ日に複数店（手羽屋＋もも屋）や重複があっても「1日」で数える
 *   （その日の日当は複数行のうち一番高い額を1日ぶんとして採用＝二重計上を防ぐ）
 *
 * 給与額は2通り出す:
 *   ① 実給与  … 日報に実際に入力された日当（labor）ベース。イベント日当なども反映。
 *   ② 概算    … 稼働日数 × 標準日当（1万円等）。ざっくり確認用。
 *
 * さらに「要確認」として、日当未入力・重複の可能性がある日報を検知して表示する。
 * データは読み取りのみ。
 */

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

type Row = {
  date: string;
  staff_name: string | null;
  shop: string | null;
  location: string | null;
  labor: number | null;
  sales_amount: number | null;
};

/** カタカナ→ひらがな */
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** 「なぎさ、かずき＆ゆうや」→ ['なぎさ','かずき','ゆうや'] （正規化済み） */
function splitStaff(name: string | null): string[] {
  if (!name) return [];
  return kataToHira(name)
    .split(/[、,＆&・\/／\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** "2026-07-08" → "7/8（水）" */
function fmtMD(date: string): string {
  const d = new Date(date + "T00:00:00");
  const [, m, dd] = date.split("-");
  return `${parseInt(m)}/${parseInt(dd)}（${DOW[d.getDay()]}）`;
}

type DayEntry = {
  date: string;
  shops: Set<string>;
  locations: Set<string>;
  groupSize: number;
  /** その日の1人ぶん日当（複数行あれば最大額。日当未入力なら null） */
  laborShare: number | null;
};

type StaffSummary = {
  name: string;
  days: number;
  /** ① 実給与：日報の日当（labor）ベースの合計 */
  actualPay: number;
  /** ② 概算：稼働日数 × 標準日当 */
  estimatePay: number;
  /** 日当が未入力で標準日当で補った日数 */
  missingLaborDays: number;
  entries: DayEntry[];
};

export default function PayrollPage() {
  return (
    <AdminGate>
      <PayrollInner />
    </AdminGate>
  );
}

function PayrollInner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [openStaff, setOpenStaff] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedStaff, setCopiedStaff] = useState<string | null>(null);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("daily_reports")
      .select("date, staff_name, shop, location, labor, sales_amount")
      .gte("date", `${monthStr}-01`)
      .lte("date", `${monthStr}-31`)
      .order("date");
    if (error) setError(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [monthStr]);

  useEffect(() => {
    load();
  }, [load]);

  const summaries = useMemo<StaffSummary[]>(() => {
    // staff → date → DayEntry
    const byStaff = new Map<string, Map<string, DayEntry>>();
    for (const r of rows) {
      const names = splitStaff(r.staff_name);
      const groupSize = names.length || 1;
      // その行の1人ぶん日当（人数で割る）。未入力(null/0)なら null。
      const share =
        r.labor != null && r.labor > 0 ? r.labor / groupSize : null;
      for (const name of names) {
        let dayMap = byStaff.get(name);
        if (!dayMap) {
          dayMap = new Map();
          byStaff.set(name, dayMap);
        }
        let entry = dayMap.get(r.date);
        if (!entry) {
          entry = {
            date: r.date,
            shops: new Set(),
            locations: new Set(),
            groupSize,
            laborShare: null,
          };
          dayMap.set(r.date, entry);
        }
        if (r.shop) entry.shops.add(r.shop);
        if (r.location) entry.locations.add(r.location);
        entry.groupSize = Math.max(entry.groupSize, groupSize);
        // 同じ日に複数行（手羽屋＋もも屋など）あれば、一番高い額を1日ぶんに。
        if (share != null) {
          entry.laborShare =
            entry.laborShare == null
              ? share
              : Math.max(entry.laborShare, share);
        }
      }
    }

    const result: StaffSummary[] = [];
    for (const [name, dayMap] of byStaff) {
      const entries = Array.from(dayMap.values()).sort((a, b) =>
        a.date < b.date ? -1 : 1,
      );
      const days = entries.length;
      const std = laborFor(name);
      // 日当が入っていない日は標準日当で補う。
      const actualPay = entries.reduce(
        (s, e) => s + (e.laborShare ?? std),
        0,
      );
      const missingLaborDays = entries.filter(
        (e) => e.laborShare == null,
      ).length;
      result.push({
        name,
        days,
        actualPay,
        estimatePay: days * std,
        missingLaborDays,
        entries,
      });
    }
    result.sort((a, b) => b.actualPay - a.actualPay);
    return result;
  }, [rows]);

  // ---- ③ 入力ミス検知（日当未入力・重複の可能性） ----
  const warnings = useMemo(() => {
    // 日当未入力
    const missingLabor = rows.filter(
      (r) => r.labor == null || r.labor <= 0,
    );
    // 重複候補: 同じ日・同じ店・同じ担当（正規化）で2件以上
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${r.date}|${r.shop ?? ""}|${splitStaff(r.staff_name)
        .sort()
        .join("&")}`;
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }
    const dupGroups = Array.from(groups.values()).filter(
      (g) => g.length > 1,
    );
    return { missingLabor, dupGroups };
  }, [rows]);

  const totalActual = summaries.reduce((s, x) => s + x.actualPay, 0);
  const totalEstimate = summaries.reduce((s, x) => s + x.estimatePay, 0);

  const copySummary = async () => {
    const lines = [
      `【${year}年${month}月 スタッフ給与まとめ】`,
      "",
      ...summaries.map(
        (s) => `${s.name}　${s.days}日　${yen(s.actualPay)}`,
      ),
      "――――――――――",
      `合計　${yen(totalActual)}`,
      "",
      "※日報に入力された日当ベース。同じ日に複数店は1日分に調整。",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const copyStaff = async (s: StaffSummary) => {
    const lines = [
      `【${year}年${month}月 ${s.name} 給与明細】`,
      "",
      ...s.entries.map((e) => {
        const pay = e.laborShare ?? laborFor(s.name);
        const place =
          Array.from(e.shops).join("・") +
          (e.locations.size > 0
            ? `／${Array.from(e.locations).join("・")}`
            : "");
        const mark = e.laborShare == null ? "※" : "";
        return `${fmtMD(e.date)}　${place}　${yen(pay)}${mark}`;
      }),
      "――――――――――",
      `稼働 ${s.days}日　合計 ${yen(s.actualPay)}`,
      ...(s.missingLaborDays > 0
        ? [`※${s.missingLaborDays}日は日当未入力のため標準日当で計算`]
        : []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedStaff(s.name);
      setTimeout(() => setCopiedStaff(null), 1800);
    } catch {}
  };

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  };

  const hasWarnings =
    warnings.missingLabor.length > 0 || warnings.dupGroups.length > 0;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-dark">👥 スタッフ別 給与</h1>
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary text-sm">
            管理者ページ
          </Link>
          <Link href="/" className="btn-secondary text-sm">
            🏠 トップ
          </Link>
        </div>
      </header>

      <p className="text-xs text-stone-500">
        日報から各スタッフの実働日数と給与額を自動集計します。金額は日報に入力された日当（イベント日当なども反映）ベースです。共同出店・表記ゆれ・同日複数店もまとめて1日で数えます。
      </p>

      {/* 月切替 */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={prevMonth} className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100">
          ◀
        </button>
        <span className="text-xl font-bold text-brand-dark">
          {year}年{month}月
        </span>
        <button onClick={nextMonth} className="text-2xl px-3 py-1 rounded-lg hover:bg-stone-100">
          ▶
        </button>
      </div>

      {error && (
        <div className="card text-sm bg-red-50 text-red-700 border border-red-200">
          ❌ {error}
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">読み込み中…</p>}

      {!loading && summaries.length === 0 && (
        <p className="text-sm text-stone-400 py-4">この月の日報がありません。</p>
      )}

      {!loading && summaries.length > 0 && (
        <>
          <div className="card bg-emerald-50 border border-emerald-200 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-emerald-800">
                全スタッフ 給与合計
              </span>
              <span className="text-2xl font-extrabold font-mono text-emerald-700">
                {yen(totalActual)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-emerald-700/70">
              <span>（参考）日数×標準日当の概算</span>
              <span className="font-mono">{yen(totalEstimate)}</span>
            </div>
          </div>

          {/* ③ 要確認（入力ミス検知） */}
          {hasWarnings && (
            <div className="card bg-amber-50 border border-amber-300 space-y-2">
              <p className="text-sm font-bold text-amber-800">
                ⚠️ 要確認（{warnings.missingLabor.length + warnings.dupGroups.length}件）
              </p>

              {warnings.dupGroups.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-700">
                    重複の可能性（同じ日・同じ店・同じ担当）
                  </p>
                  {warnings.dupGroups.map((g, i) => (
                    <div
                      key={`dup-${i}`}
                      className="text-xs text-amber-800 bg-amber-100/60 rounded px-2 py-1"
                    >
                      <span className="font-mono">{fmtMD(g[0].date)}</span>{" "}
                      {g[0].shop}／{g[0].staff_name}
                      <span className="text-amber-700">
                        {g.length}件（
                        {g
                          .map((r) => yen(r.sales_amount ?? 0))
                          .join("・")}
                        ）
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {warnings.missingLabor.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-700">
                    日当が未入力
                  </p>
                  {warnings.missingLabor.map((r, i) => (
                    <div
                      key={`ml-${i}`}
                      className="text-xs text-amber-800 bg-amber-100/60 rounded px-2 py-1"
                    >
                      <span className="font-mono">{fmtMD(r.date)}</span>{" "}
                      {r.shop}／{r.staff_name}
                      {r.location ? `／${r.location}` : ""}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-amber-600 leading-relaxed">
                ※重複候補は「本当に2枚必要か」をご確認ください（手羽屋＋もも屋の併売は別店なので重複には出ません）。
                日当未入力の日は、上の給与額では標準日当で仮計算しています。
              </p>
            </div>
          )}

          <button onClick={copySummary} className="btn-secondary w-full">
            {copied ? "✅ コピーしました" : "📋 この月のまとめをコピー"}
          </button>

          <div className="space-y-2">
            {summaries.map((s) => (
              <div key={s.name} className="card space-y-2">
                <button
                  onClick={() =>
                    setOpenStaff(openStaff === s.name ? null : s.name)
                  }
                  className="w-full flex items-center justify-between gap-2"
                >
                  <span className="font-bold text-stone-800 text-lg">
                    {s.name}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-stone-600">
                      稼働{" "}
                      <span className="text-lg font-extrabold text-brand-dark">
                        {s.days}
                      </span>
                      日
                    </span>
                    <span className="text-base font-extrabold font-mono text-emerald-700">
                      {yen(s.actualPay)}
                    </span>
                    <span className="text-stone-400 text-xs">
                      {openStaff === s.name ? "▲" : "▼"}
                    </span>
                  </span>
                </button>

                {openStaff === s.name && (
                  <div className="space-y-1 pt-1 border-t border-stone-100">
                    {s.entries.map((e) => (
                      <div
                        key={e.date}
                        className="flex items-center justify-between text-xs text-stone-600 py-0.5 gap-2"
                      >
                        <span className="font-mono whitespace-nowrap">
                          {fmtMD(e.date)}
                        </span>
                        <span className="flex-1 px-1 truncate text-stone-500">
                          {Array.from(e.shops).join("・")}
                          {e.locations.size > 0 &&
                            `｜${Array.from(e.locations).join("・")}`}
                        </span>
                        {e.groupSize > 1 && (
                          <span className="text-stone-400 whitespace-nowrap">
                            {e.groupSize}人
                          </span>
                        )}
                        <span className="font-mono whitespace-nowrap text-emerald-700">
                          {e.laborShare != null
                            ? yen(e.laborShare)
                            : `${yen(laborFor(s.name))}※`}
                        </span>
                      </div>
                    ))}
                    <p className="text-[11px] text-stone-400 pt-1 leading-relaxed">
                      合計 {yen(s.actualPay)}（{s.days}日）。金額は日報に入力された日当です。
                      {s.missingLaborDays > 0 &&
                        ` ※印の${s.missingLaborDays}日は日当未入力のため標準日当${yen(laborFor(s.name))}で計算。`}
                    </p>
                    <button
                      onClick={() => copyStaff(s)}
                      className="btn-secondary w-full text-xs mt-1"
                    >
                      {copiedStaff === s.name
                        ? "✅ コピーしました"
                        : `📋 ${s.name}の明細をコピー`}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-stone-400 leading-relaxed pt-1">
            ※「稼働日数」は日報の日付で数えた実働日数です（同じ日に複数店・重複があっても1日）。
            給与額は各日の日報に入力された日当の合計で、共同出店は人数で割って各人ぶんにしています。
            同じ日に複数行がある場合は一番高い日当を1日ぶんとして採用します（二重計上を防ぐため）。
            表記ゆれ（カズキ↔かずき等）はひらがなに揃えて集計しています。
          </p>
        </>
      )}
    </main>
  );
}
