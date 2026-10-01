"use client";

import { useState } from "react";

import { KEIRI_APPLY_LIMITS } from "@/lib/keiri/apply";
import {
  ONSITE_DONE_LABEL,
  ONSITE_FAIL_LABEL,
  ONSITE_FIELD_LABELS,
  ONSITE_FROM_KEY,
  ONSITE_LEAD,
  ONSITE_NOTE,
  ONSITE_OPEN_LABEL,
  ONSITE_PLACEHOLDERS,
  ONSITE_SENDING_LABEL,
  ONSITE_SUBMIT_LABEL,
} from "@/lib/keiri/show";

/**
 * 「この場で代わりに登録する」欄（2026-10-01・kp211）。
 *
 * ■ 何のための欄か
 *   出店説明会・出店先の立ち話で、**相手がスマホを出さなくても**
 *   じゅんが口で聞いた2つ（お店の名前・電話番号）を打ち込んで申し込みにする道です。
 *   いまある道は2本とも「相手が自分のスマホで打つ」ことが要り、
 *   立ち話ではそこがいちばん落ちます。
 *
 * ■ 決めごと
 *   ・**別の画面へ飛ばさない。**同じ画面の中で開いて、同じ画面の中で終わる
 *   ・送り先は ふだんのお申し込みとまったく同じ1か所（/api/keiri/apply）。
 *     受け皿も同じ（keiri_applications）で、合言葉だけ `onsite` にして数え分ける
 *   ・**相手の目の前で開く欄**なので、出すのは相手に見せても困らない文だけ。
 *     過去の申し込みは1件も読まない（他のお店の名前・電話は出ようがない）
 *   ・値段・解約の条件・特商法の書き方は1文字も変えない（ここに金額を書かない）
 *   ・開く所は <details>。**JavaScript が動かなくても欄そのものは開く**
 *     （この1枚の「JS なしでも全部読める」を崩さないため）
 *   ・文章は lib/keiri/show.ts が唯一の正。ここに直書きしない
 *
 * ■ 手羽屋の機能には1行もさわっていない
 *   日報・シフト・レジ・LINE の送り方・お金の計算（lib/money.ts）は変えていない。
 */

type State = "input" | "sending" | "done" | "failed";

const LABEL = "block text-base font-bold text-stone-700";
const INPUT =
  "mt-1 w-full h-14 rounded-xl border border-stone-300 px-3 text-lg text-stone-900 " +
  "focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300";

export default function OnsiteApplyForm() {
  const [state, setState] = useState<State>("input");
  const [errors, setErrors] = useState<string[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;

    const f = new FormData(e.currentTarget);
    setErrors([]);
    setState("sending");

    try {
      const res = await fetch("/api/keiri/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shopName: f.get("shopName"),
          phone: f.get("phone"),
          // ★どこから来た申し込みかを一緒に送る。紙（card）・見せる1枚（show）と
          //   混ざらないように、この道だけの合言葉を付ける
          campaign: ONSITE_FROM_KEY,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errors?: string[];
      };
      if (res.ok && data.ok) {
        setState("done");
        return;
      }
      // 入力の直しで済むとき（400）は、その場で直せるように文を出して欄に戻す。
      // 届かなかったとき（500番台）は、何度押しても同じなので「控えてください」に倒す。
      if (res.status === 400 && data.errors && data.errors.length > 0) {
        setErrors(data.errors);
        setState("input");
        return;
      }
      setState("failed");
    } catch {
      // 通信そのものが届かなかったとき（出店先は電波が細い）も、行き止まりにしない
      setState("failed");
    }
  }

  return (
    <details className="mt-2 rounded-2xl border border-stone-300 bg-white">
      <summary className="min-h-14 cursor-pointer list-none px-5 py-4 text-lg font-bold text-stone-900">
        {ONSITE_OPEN_LABEL}
      </summary>

      <div className="border-t border-stone-200 px-5 py-5">
        {state === "done" ? (
          <p className="text-xl font-bold leading-relaxed text-stone-900">{ONSITE_DONE_LABEL}</p>
        ) : state === "failed" ? (
          <div>
            <p className="text-lg font-bold leading-relaxed text-stone-900">
              {ONSITE_FAIL_LABEL}
            </p>
            <button
              type="button"
              onClick={() => setState("input")}
              className="mt-4 text-base font-bold text-stone-700 underline"
            >
              もう一度入れる
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-base leading-relaxed text-stone-700">{ONSITE_LEAD}</p>

            {errors.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-red-300 bg-red-50 p-3">
                {errors.map((m) => (
                  <li key={m} className="text-base text-red-700">
                    {m}
                  </li>
                ))}
              </ul>
            )}

            <div>
              <label className={LABEL} htmlFor="onsiteShopName">
                {ONSITE_FIELD_LABELS.shopName}
              </label>
              <input
                id="onsiteShopName"
                name="shopName"
                required
                maxLength={KEIRI_APPLY_LIMITS.shopName}
                autoComplete="off"
                className={INPUT}
                placeholder={ONSITE_PLACEHOLDERS.shopName}
              />
            </div>

            <div>
              <label className={LABEL} htmlFor="onsitePhone">
                {ONSITE_FIELD_LABELS.phone}
              </label>
              <input
                id="onsitePhone"
                name="phone"
                type="tel"
                required
                maxLength={KEIRI_APPLY_LIMITS.phone}
                autoComplete="off"
                inputMode="tel"
                className={INPUT}
                placeholder={ONSITE_PLACEHOLDERS.phone}
              />
            </div>

            <button
              type="submit"
              disabled={state === "sending"}
              className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-stone-900 px-5 text-lg font-bold text-white transition hover:bg-stone-700 disabled:opacity-60"
            >
              {state === "sending" ? ONSITE_SENDING_LABEL : ONSITE_SUBMIT_LABEL}
            </button>

            <p className="text-base text-stone-600">{ONSITE_NOTE}</p>
          </form>
        )}
      </div>
    </details>
  );
}
