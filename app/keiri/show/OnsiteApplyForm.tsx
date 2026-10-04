"use client";

import { useState } from "react";

import { KEIRI_APPLY_LIMITS } from "@/lib/keiri/apply";
import {
  ONSITE_AGAIN_LABEL,
  ONSITE_DONE_LABEL,
  ONSITE_EDIT_LABEL,
  ONSITE_FAIL_LABEL,
  ONSITE_FIELD_LABELS,
  ONSITE_FROM_KEY,
  ONSITE_KEEP_TITLE,
  ONSITE_LEAD,
  ONSITE_NOTE,
  ONSITE_OPEN_LABEL,
  ONSITE_PLACEHOLDERS,
  ONSITE_RETRY_LABEL,
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

/** うかがった2つ。送れなかったときも消さずに持っておく（2026-10-02・kp215） */
type Heard = { shopName: string; phone: string };
const NOTHING_HEARD: Heard = { shopName: "", phone: "" };

const LABEL = "block text-base font-bold text-stone-700";
const INPUT =
  "mt-1 w-full h-14 rounded-xl border border-stone-300 px-3 text-lg text-stone-900 " +
  "focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300";
const SUB_BUTTON =
  "mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl border border-stone-400 " +
  "px-5 text-lg font-bold text-stone-900";

/**
 * @param defaultOpen 開いた状態で出すかどうか（2026-10-02・kp216）。
 *   立ち話で「代わりに打つ」を選んだときは、<details> を開く操作をもう1回
 *   させないために、欄が開いた1枚（/keiri/show/toroku）から true で呼びます。
 *   見せる1枚のいちばん下（従来どおり）は閉じたままです。
 */
export default function OnsiteApplyForm({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [state, setState] = useState<State>("input");
  const [errors, setErrors] = useState<string[]>([]);
  // ★うかがった2つは、送れても送れなくても、こちらで持っておく。
  //   送れなかったときに空の欄へ戻すと、相手はもう次の方と話しているので聞き直せない。
  const [heard, setHeard] = useState<Heard>(NOTHING_HEARD);
  // ★欄を空に戻すための番号。次のお店を入れるときだけ1つ増やす
  //   （送れなかったときは増やさない＝うかがった2つが入ったまま）。
  const [round, setRound] = useState(0);

  async function send(values: Heard) {
    setErrors([]);
    setState("sending");

    try {
      const res = await fetch("/api/keiri/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shopName: values.shopName,
          phone: values.phone,
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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;

    const f = new FormData(e.currentTarget);
    const values: Heard = {
      shopName: String(f.get("shopName") ?? ""),
      phone: String(f.get("phone") ?? ""),
    };
    setHeard(values);
    void send(values);
  }

  /** 次のお店を入れる（説明会では続けて2軒・3軒とうかがう） */
  function nextShop() {
    setHeard(NOTHING_HEARD);
    setRound((n) => n + 1);
    setErrors([]);
    setState("input");
  }

  return (
    <details open={defaultOpen} className="mt-2 rounded-2xl border border-stone-300 bg-white">
      <summary className="min-h-14 cursor-pointer list-none px-5 py-4 text-lg font-bold text-stone-900">
        {ONSITE_OPEN_LABEL}
      </summary>

      <div className="border-t border-stone-200 px-5 py-5">
        {state === "done" ? (
          <div>
            <p className="text-xl font-bold leading-relaxed text-stone-900">{ONSITE_DONE_LABEL}</p>
            {/* ★続けて次のお店をうかがう場面がふつうに起きるので、
                 ページを開き直さずに空の欄へ戻せるようにする */}
            <button type="button" onClick={nextShop} className={SUB_BUTTON}>
              {ONSITE_AGAIN_LABEL}
            </button>
          </div>
        ) : state === "failed" ? (
          <div>
            <p className="text-lg font-bold leading-relaxed text-stone-900">
              {ONSITE_FAIL_LABEL}
            </p>
            {/* ★うかがった2つを、消さずにそのまま出す。
                 そのまま送り直せるし、書き留めることもできる */}
            <dl className="mt-4 rounded-xl border border-stone-300 bg-stone-50 p-4">
              <p className="text-base font-bold text-stone-700">{ONSITE_KEEP_TITLE}</p>
              <dt className="mt-3 text-base text-stone-600">{ONSITE_FIELD_LABELS.shopName}</dt>
              <dd className="text-lg font-bold text-stone-900">{heard.shopName}</dd>
              <dt className="mt-2 text-base text-stone-600">{ONSITE_FIELD_LABELS.phone}</dt>
              <dd className="text-lg font-bold text-stone-900">{heard.phone}</dd>
            </dl>
            <button
              type="button"
              onClick={() => void send(heard)}
              className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-stone-900 px-5 text-lg font-bold text-white"
            >
              {ONSITE_RETRY_LABEL}
            </button>
            <button
              type="button"
              onClick={() => setState("input")}
              className={SUB_BUTTON}
            >
              {ONSITE_EDIT_LABEL}
            </button>
          </div>
        ) : (
          <form key={round} onSubmit={onSubmit} className="space-y-4">
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
                defaultValue={heard.shopName}
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
                defaultValue={heard.phone}
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
