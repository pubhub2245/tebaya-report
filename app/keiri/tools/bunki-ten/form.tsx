"use client";

import { useMemo, useState } from "react";

import { calcBreakEven, toNumber, yen } from "@/lib/keiri/tools";
import { NumberField, ResultRow } from "@/app/keiri/tools/components/field";

/**
 * 赤字ラインの計算（ブラウザの中だけで完結する）。
 * 入力はどこにも送らない・保存しない。
 */
export default function BunkiForm() {
  const [rent, setRent] = useState("");
  const [labor, setLabor] = useState("");
  const [other, setOther] = useState("");
  const [rate, setRate] = useState("30");
  const [days, setDays] = useState("25");
  const [spend, setSpend] = useState("");

  const fixed = toNumber(rent) + toNumber(labor) + toNumber(other);
  const result = useMemo(
    () =>
      calcBreakEven({
        fixedCostYen: fixed,
        variableRatePercent: toNumber(rate),
        openDays: toNumber(days),
        averageSpendYen: toNumber(spend),
      }),
    [fixed, rate, days, spend],
  );

  const filled = fixed > 0;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">毎月かならず出ていくお金</h2>
        <p className="mt-1 text-sm text-stone-600 leading-relaxed">
          売上が0円の月でも出ていくお金です。空欄は0として計算します。
        </p>
        <div className="mt-5 space-y-5">
          <NumberField label="家賃・場所代" unit="円" value={rent} onChange={setRent} placeholder="0" />
          <NumberField
            label="人件費（毎月ほぼ決まっている分）"
            hint="社員の給料や、毎月同じだけ入るアルバイトの分。売上に連れて増える分は下の「割合」に入れます。"
            unit="円"
            value={labor}
            onChange={setLabor}
            placeholder="0"
          />
          <NumberField
            label="その他の固定費"
            hint="水道光熱・通信・リース・保険・借入の返済など。"
            unit="円"
            value={other}
            onChange={setOther}
            placeholder="0"
          />
        </div>
        <p className="mt-5 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-700">
          毎月出ていくお金の合計：<span className="font-bold tabular-nums">{yen(fixed)}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">売上に連れて増えるお金</h2>
        <div className="mt-5 space-y-5">
          <NumberField
            label="原価率（売上に対する食材・仕入の割合）"
            hint="分からないときは、先月の「仕入の合計 ÷ 売上」で出せます。飲食店では30%前後に置くことが多い数字です。"
            unit="％"
            value={rate}
            onChange={setRate}
            placeholder="30"
          />
          <NumberField label="月の営業日数" unit="日" value={days} onChange={setDays} placeholder="25" />
          <NumberField
            label="客単価（任意）"
            hint="入れると「1日に何人来ればいいか」まで出ます。"
            unit="円"
            value={spend}
            onChange={setSpend}
            placeholder="0"
          />
        </div>
      </section>

      <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5" aria-live="polite">
        <h2 className="text-lg font-bold text-stone-900">赤字にならない売上</h2>
        {!filled ? (
          <p className="mt-3 text-sm text-stone-600 leading-relaxed">
            上の「毎月かならず出ていくお金」を入れると、ここに答えが出ます。
          </p>
        ) : result.impossibleReason ? (
          <p className="mt-3 text-sm text-stone-800 leading-relaxed">{result.impossibleReason}</p>
        ) : (
          <div className="mt-3">
            <ResultRow label="月にこれだけ売ればトントン" value={yen(result.monthlySalesYen ?? 0)} strong />
            {result.dailySalesYen !== null && (
              <ResultRow label="1営業日あたり" value={yen(result.dailySalesYen)} />
            )}
            {result.dailyCustomers !== null && (
              <ResultRow label="1営業日あたりのお客さん" value={`${result.dailyCustomers.toLocaleString("ja-JP")}人`} />
            )}
            <p className="mt-4 text-xs text-stone-600 leading-relaxed">
              「トントン」は利益が0円になる売上です。ここに自分の生活費や返済を足した額が、実際に目指す売上になります。
            </p>
          </div>
        )}
      </section>

      <p className="text-xs text-stone-500 leading-relaxed">
        入力した数字はこの画面の中だけで計算しています。どこにも送っていませんし、保存もしていません。
        ページを閉じれば消えます。
      </p>
    </div>
  );
}
