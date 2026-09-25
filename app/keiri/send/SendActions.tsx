"use client";

import { useEffect, useState } from "react";

import { copyToClipboard } from "@/lib/feedbackPrompt";
import { isPhoneLike } from "@/lib/keiri/sendDevice";

/**
 * 「送る1枚」の押すところ（kp169）。
 *
 * ■ 直したこと（やさしい説明）
 *   これまで主役は［LINEで送る］の1つだけでした。あのボタンが開くのは
 *   **スマホの LINE だけが分かる特別なリンク**で、パソコン版の LINE は
 *   このしかけに対応していません。＝ パソコンで開いて押しても何も起きません。
 *   じゅんは Vercel や Supabase の画面をパソコンで開くので、
 *   この1枚もパソコンで開いていれば、押しても送れないままだったことになります。
 *
 *   そこで端末を見て、主役を入れ替えます。
 *   ・スマホ … ［LINEで送る］（今までどおり。送り先を選ぶ画面が文を持って開く）
 *   ・パソコン … ［送る文をコピーする］（押すとコピー。あとはLINEのトークに貼るだけ）
 *   どちらの端末でも**両方のボタンが出ています**。入れ替わるのは大きさと順番だけなので、
 *   見分けを間違えても道が消えません。JavaScript が動かないときはスマホの並びで出ます。
 *
 * ■ 勝手に送らない
 *   コピーは文を写すだけ、LINEのボタンは送り先を選ぶ画面までです。
 *   送信を押すのは、いつでも人です。
 */
export default function SendActions({
  shareUrl,
  message,
}: {
  /** LINE の「送り先を選ぶ」画面を開くリンク（スマホでだけ開く） */
  shareUrl: string;
  /** コピーする文（宛名の空欄が入っていない方。貼ってすぐ送れる） */
  message: string;
}) {
  // 最初はスマホの並び（＝いちばん道が消えない側）で描いてから、端末を見て入れ替える
  const [phone, setPhone] = useState(true);
  const [copied, setCopied] = useState<null | boolean>(null);

  useEffect(() => {
    let pointerCoarse: boolean | null = null;
    try {
      if (typeof window.matchMedia === "function") {
        pointerCoarse = window.matchMedia("(pointer: coarse)").matches;
      }
    } catch {}
    setPhone(
      isPhoneLike({
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        pointerCoarse,
      }),
    );
  }, []);

  const copy = async () => {
    const ok = await copyToClipboard(message);
    setCopied(ok);
  };

  const big =
    "flex w-full h-14 items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-base font-bold shadow-sm transition";
  const small =
    "flex w-full min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-900 hover:bg-stone-100 transition";

  const lineButton = (
    <a
      href={shareUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={phone ? big : small}
    >
      {phone ? "LINEで送る（相手を選ぶだけ）" : "LINEで送る（スマホのときだけ開きます）"}
    </a>
  );

  const copyButton = (
    <button type="button" onClick={copy} className={phone ? small : big}>
      {copied === true ? "コピーしました" : "送る文をコピーする"}
    </button>
  );

  return (
    <div className="space-y-2">
      {phone ? lineButton : copyButton}
      {phone ? copyButton : lineButton}

      {/* パソコンのときだけ、コピーしたあとの手順を1行だけ出す */}
      {!phone && (
        <p className="text-xs text-stone-700 leading-relaxed">
          コピーしたら、パソコンのLINEでお店のトークを開いて、貼り付けて送信してください。
          オレンジのボタンが「コピー」になっているのは、この端末がパソコンだからです
          （LINEの送り先を選ぶ画面は、スマホでしか開きません）。
        </p>
      )}

      {copied === false && (
        <p className="text-xs font-bold text-red-700 leading-relaxed">
          コピーできませんでした。下に出ている文を選んでコピーしてください。
        </p>
      )}
    </div>
  );
}
