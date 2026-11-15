"use client";

import { useMemo, useState } from "react";

import { judgeKeyShape } from "@/lib/keiri/keyShape";

/**
 * 「貼る前に、その場で合っているか言う」箱（/keiri/key）。
 *
 * ■ なぜ要るのか（2026-11-15 18:3x B）
 *   鍵の欄には、鍵ではないものが入ったままです（日本語447文字・改行12個）。
 *   じゅんの直しは1分で済むのに、**貼って Vercel を出し直すまで合っているか分からない**
 *   ので、同じしくじりがもう一度 起きると また数日 止まります。
 *
 * ■ 守っていること
 *   ・入れた文字は **どこにも送りません**（このファイルに送る所がありません）。
 *   ・**どこにも残しません**（画面を閉じれば消えます。保存もしません）。
 *   ・画面には ●●● で出ます（配信中に映っても大丈夫です）。
 *   ・見分けの決まりは lib/keiri/keyShape.ts の1か所だけ（tests/keyShape.test.ts で固定）。
 *   ・サーバーが「この値を使ってよいか」を決める所（lib/supabaseServer.ts）は1行も変えていません。
 */
export default function KeyShapeCheck({ expectedRef }: { expectedRef: string }) {
  const [text, setText] = useState("");
  const verdict = useMemo(() => judgeKeyShape(text, expectedRef), [text, expectedRef]);

  const tone = verdict.ok
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : verdict.kind === "empty"
      ? "border-stone-200 bg-stone-50 text-stone-700"
      : "border-rose-300 bg-rose-50 text-rose-900";

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <h2 className="text-base font-bold text-stone-900">
        貼る前に、ここで1回 確かめられます（10秒）
      </h2>
      <p className="text-sm text-stone-700 leading-relaxed">
        Supabase でコピーしたものを、下の欄に貼ってください。
        <strong>合っているかどうかだけ</strong>、その場で出ます。
        入れた文字は<strong>どこにも送らず、どこにも残りません</strong>（画面では ● で隠れます）。
      </p>

      <label className="block space-y-1">
        <span className="text-sm font-bold text-stone-900">コピーしたものを貼る欄</span>
        <input
          type="password"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="ここに貼る"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
        />
      </label>

      <div className={`rounded-lg border p-3 space-y-1 ${tone}`}>
        <p className="text-sm font-bold leading-snug">{verdict.headline}</p>
        {verdict.reasons.map((r) => (
          <p key={r} className="text-sm leading-relaxed">
            {r}
          </p>
        ))}
        {verdict.trimmed && (
          <p className="text-xs leading-relaxed">
            ※ 前後に よけいな空白か引用符が付いていました。
            Vercel に貼るときは、それを取り除いた中身だけを貼ってください。
          </p>
        )}
      </div>

      {text.length > 0 && (
        <button
          type="button"
          onClick={() => setText("")}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-bold text-stone-700"
        >
          入れたものを消す
        </button>
      )}
    </section>
  );
}
