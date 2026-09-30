"use client";

import { CARD_PRINT_BUTTON_LABEL, CARD_PRINT_FALLBACK } from "@/lib/keiri/card";

/**
 * 紙（/keiri/card）を、その場で印刷に回すボタン（kp204）。
 *
 * ■ なぜ別のファイルにしてあるか
 *   紙そのもの（page.tsx）は **JavaScript が動かなくても全部出る** 作りに
 *   してあります（kp193 の決めごと・tests/keiriCard.test.ts で固定）。
 *   ボタンだけは押した合図が要るので、ここに切り出して page.tsx を
 *   サーバー側の組み立てのまま保っています。
 *
 * ■ このボタンが無くても刷れる
 *   Ctrl+P（スマホは共有 →「プリント」）で同じものが刷れます。
 *   その逃げ道を、ボタンのすぐ下に必ず出します。
 *   ＝ボタンが動かない端末でも、紙は刷れて申し込みの道は切れません。
 *
 * ■ 紙には刷らない
 *   親の枠に `no-print` が付いているので、印刷には出ません。
 */
export default function PrintButton() {
  return (
    <div>
      <button
        type="button"
        onClick={() => window.print()}
        className="w-full rounded-lg bg-stone-900 px-5 py-4 text-base font-bold text-white sm:w-auto"
      >
        {CARD_PRINT_BUTTON_LABEL}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">{CARD_PRINT_FALLBACK}</p>
    </div>
  );
}
