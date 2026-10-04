"use client";

/**
 * 毎月お店にお渡しする「1枚の要約」——**本物のお店の数字**（2026-10-04・kp231・f1-5）。
 *
 * ■ なぜ作ったか
 *   1枚の要約は見本（/keiri/monthly-sample・架空のお店）だけにありました。
 *   経理画面（/keiri）には数字とCSVはありますが、**そのまま渡せる1枚が無い**ので、
 *   毎月お渡しするには人が数字を書き写すしかありませんでした。
 *   書き写すと、その月だけ数字が変わる余地が残ります（f1-5 の合格条件に反します）。
 *
 * ■ 守ること（ここを崩さないこと）
 *   ① **数字を書き写さない。** 読むのは lib/keiri/loadMonth.ts（経理画面と同じ）、
 *      並べるのは lib/keiri/oneSheet.ts（見本と同じ）。このページは呼ぶだけです。
 *   ② **合言葉の内側に置く。** 実際のお店の数字なので、外から開けません（AdminGate）。
 *   ③ **読むだけ。** 倉庫に1行も書きません。
 *   ④ 印刷すると紙1枚（リンクと月の送りは刷りません）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AdminGate from "@/app/components/AdminGate";
import OneSheetView from "@/app/keiri/components/OneSheetView";
import { keiriLoginNoScriptHtml } from "@/lib/keiri/noscriptFallback";
import { loadKeiriMonth, type KeiriMonthData } from "@/lib/keiri/loadMonth";
import { buildOneSheet } from "@/lib/keiri/oneSheet";
import {
  defaultSettingsFor,
  monthKey,
  sheetShopName,
  templateFor,
} from "@/lib/keiri";
import { businessCodeForScope, readTenantScope } from "@/lib/tenantScope";
import { todayStr } from "@/lib/format";

/** 紙1枚に収めるための指定だけ（色は付けない） */
const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  .sheet { box-shadow: none !important; border-color: #d6d3d1 !important; }
  @page { size: A4; margin: 12mm; }
}
`;

export default function KeiriMonthlyPage() {
  return (
    <>
      {/* JavaScript が動かない端末でも、ここが何の画面で誰に言えばいいか分かるように
          （経理画面と同じ逃げ道。lib/keiri/noscriptFallback.ts の1か所で作る） */}
      <noscript dangerouslySetInnerHTML={{ __html: keiriLoginNoScriptHtml() }} />
      <AdminGate allowShops>
        <MonthlyInner />
      </AdminGate>
    </>
  );
}

function MonthlyInner() {
  const now = new Date();
  // 既定は「まるまる終わった前の月」。実際にお渡しするのがその月ぶんなので。
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(first.getFullYear());
  const [month, setMonth] = useState(first.getMonth() + 1);

  const scope = useMemo(() => readTenantScope(), []);
  const businessCode = useMemo(() => businessCodeForScope(scope), [scope]);
  const fallbackSettings = useMemo(
    () => defaultSettingsFor(businessCode),
    [businessCode],
  );
  const template = useMemo(() => templateFor(businessCode), [businessCode]);
  const shopName = useMemo(() => sheetShopName(businessCode), [businessCode]);

  const ym = monthKey(year, month);
  const monthLabel = `${year}年${month}月`;
  const today = useMemo(() => todayStr(), []);
  const todayYm = today.slice(0, 7);

  const [data, setData] = useState<KeiriMonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadKeiriMonth({ ym, scope, businessCode, fallbackSettings }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [ym, scope, businessCode, fallbackSettings]);

  useEffect(() => {
    load();
  }, [load]);

  const sheet = useMemo(() => {
    if (!data) return null;
    return buildOneSheet({
      ym,
      monthLabel,
      shopName,
      reports: data.reports,
      payments: data.payments,
      advances: data.advances,
      settings: data.settings,
      template,
      // 家賃の「まだ払っていない分」は今日の月まで数える（経理画面と同じ）
      currentYm: todayYm,
      // 「◯月◯日に作りました」に出す日（出した日が紙に残るように）
      madeOn: today,
    });
  }, [data, ym, monthLabel, shopName, template, todayYm, today]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print">
        <Link href="/keiri" className="text-sm text-amber-700 hover:underline">
          ← 経理の画面にもどる
        </Link>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-stone-900">毎月お渡しする1枚</h1>
      <p className="mt-2 text-sm text-stone-600 leading-relaxed">
        この1枚は、日報から自動で出した数字だけでできています。人が数字を書き写すところはありません。
        そのまま印刷すると紙1枚になります。
      </p>

      {/* ---------- 月の送り（刷らない） ---------- */}
      <div className="no-print mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          onClick={() => shiftMonth(-1)}
        >
          ← 前の月
        </button>
        <p className="text-base font-bold text-stone-900">{monthLabel}</p>
        <button
          type="button"
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          onClick={() => shiftMonth(1)}
        >
          次の月 →
        </button>
      </div>

      {loading && <p className="mt-6 text-sm text-stone-600">読み込んでいます…</p>}
      {error && (
        <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          読めませんでした：{error}
        </p>
      )}
      {!loading && !error && data?.settingsMissing && (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 leading-relaxed">
          このお店の「数え始めの日・手元の現金」がまだ入っていません。先に初期設定を済ませてください。
        </p>
      )}

      {sheet && <OneSheetView sheet={sheet} />}

      {/* ---------- 刷るとき・比べるとき（刷らない） ---------- */}
      <section className="no-print mt-8">
        <button
          type="button"
          className="w-full rounded-xl bg-amber-700 px-4 py-3 font-bold text-white"
          onClick={() => window.print()}
        >
          この1枚を印刷する
        </button>
        <ul className="mt-4 space-y-3">
          <li>
            <Link
              href="/keiri"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">経理の画面（CSVの書き出しもこちら）</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                同じ月を選べば、画面の数字とこの1枚は同じ数字になります（同じ計算を通っています）。
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/keiri/monthly-sample"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">見本（架空のお店）</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                店主にお見せする用の1枚。形はこのページとまったく同じです。
              </p>
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
