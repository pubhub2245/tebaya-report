"use client";

import { useMemo } from "react";

import { calcFl, flShareText, toNumber, yen } from "@/lib/keiri/tools";
import { NumberField, ResultRow } from "@/app/keiri/tools/components/field";
import { CopyResultButton, useShareableNumbers } from "@/app/keiri/tools/components/share";

/** 開いたときの初期値（URL に数字が入っていれば、そちらが優先される） */
const DEFAULTS = { sales: "", food: "", labor: "" };

/** 原価率・人件費率・FL比率の計算（ブラウザの中だけで完結する） */
export default function GenkaForm() {
  const { values, setValue, shareUrl } = useShareableNumbers(DEFAULTS);
  const { sales, food, labor } = values;

  const r = useMemo(() => calcFl(toNumber(sales), toNumber(food), toNumber(labor)), [sales, food, labor]);
  const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}％`);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">1か月ぶんの数字を入れてください</h2>
        <div className="mt-5 space-y-5">
          <NumberField label="売上（税込・1か月）" unit="円" value={sales} onChange={(v) => setValue("sales", v)} placeholder="0" />
          <NumberField
            label="食材の仕入（1か月）"
            hint="その月に仕入れた食材・飲み物の合計。消費税を抜かず、払った金額のまま入れてかまいません。"
            unit="円"
            value={food}
            onChange={(v) => setValue("food", v)}
            placeholder="0"
          />
          <NumberField
            label="人件費（1か月）"
            hint="社員・アルバイトに払った給料の合計。自分の取り分を入れるかどうかは、毎月そろえてください。"
            unit="円"
            value={labor}
            onChange={(v) => setValue("labor", v)}
            placeholder="0"
          />
        </div>
      </section>

      <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5" aria-live="polite">
        <h2 className="text-lg font-bold text-stone-900">答え</h2>
        {r.foodRate === null ? (
          <p className="mt-3 text-sm text-stone-600 leading-relaxed">売上を入れると、ここに割合が出ます。</p>
        ) : (
          <div className="mt-3">
            <ResultRow label="FL比率（原価率＋人件費率）" value={pct(r.flRate)} strong />
            <ResultRow label="原価率（F）" value={pct(r.foodRate)} />
            <ResultRow label="人件費率（L）" value={pct(r.laborRate)} />
            <ResultRow label="食材と人件費を引いて残る額" value={yen(r.remainYen)} />
            <p className="mt-4 text-xs text-stone-600 leading-relaxed">
              残った額から、家賃・水道光熱・その他の経費を払います。ここが家賃を下回っていれば、その月は赤字です。
            </p>
          </div>
        )}
        <CopyResultButton
          disabled={r.foodRate === null}
          text={() => flShareText(toNumber(sales), toNumber(food), toNumber(labor), r, shareUrl())}
        />
      </section>

      <p className="text-xs text-stone-500 leading-relaxed">
        入力した数字はこの画面の中だけで計算しています。どこにも送っていませんし、保存もしていません。
        ページのアドレス（URL）には入れているので、そのまま人に渡せば同じ答えが開きます。
      </p>
    </div>
  );
}
