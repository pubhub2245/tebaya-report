import { keiriContactMailto } from "@/lib/keiri/apply";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";

/**
 * JavaScript が動かない端末に出す「逃げ道」の中身を1か所で作るファイル。
 *
 * ■ なぜ要るのか（2026-09-26・B）
 *   経理の画面（/keiri）は中身をぜんぶ「画面で動く側（JavaScript）」で描いている。
 *   そのため最初に配られる中身は題名だけで、JavaScript が動かない・止められている
 *   端末では**題名だけのページで終わる**。連絡する先も画面に出ない。
 *   ここは**お金を払ったお店が毎日開く画面**なので、そこで詰まると
 *   「払ったのに使えない・どこに言えばいいか分からない」になる。
 *
 *   初回設定（/keiri/welcome・kp180）とお申し込み（/keiri/apply）には
 *   同じ逃げ道が先に置いてあった。**入室の画面だけ抜けていた**ので、
 *   同じ形を置き、書き方を1か所にまとめた。
 *
 * ■ 守っていること
 *   ・<noscript> の中身は、JavaScript が動く端末には**1ピクセルも出ない**。
 *     ふだんの見た目は1文字も変わらない
 *   ・出すのは公開情報だけ（会社のメールアドレスと電話番号）。
 *     合言葉・鍵・環境変数の値は1文字も入れない
 *   ・手羽屋の日報・シフト・レジ・LINE・お金の計算には触れていない
 */

/** HTML に入れてよい形に直す（文字がそのまま表示されるように） */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 逃げ道の中身（HTML の文字列）を作る。
 *
 * React の <noscript> は、中身を部品で書くと
 * 画面側で組み直すときに食い違うことがあるので、文字列で渡す。
 */
export function keiriNoScriptHtml(args: {
  /** 太字で出す1行（例「このブラウザでは経理の画面をお使いいただけません。」） */
  heading: string;
  /** その下の説明（何を送ってほしいか） */
  lead: string;
}): string {
  // 払ったあとの窓口なので "support"（写し付きの下書きが開く／kp72・kp112）
  const mail = keiriContactMailto({ to: KEIRI_COMPANY.email, kind: "support" });
  const tel = KEIRI_COMPANY.tel;

  return [
    '<div class="mx-auto mb-5 max-w-md rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-stone-800">',
    `<p class="font-bold">${esc(args.heading)}</p>`,
    `<p class="mt-2">${esc(args.lead)}`,
    `<a class="font-bold underline" href="${esc(mail.url)}">${esc(KEIRI_COMPANY.email)}</a>`,
    "</p>",
    `<p class="mt-2">お急ぎのときは <a class="font-bold underline" href="tel:${esc(
      tel.replace(/-/g, ""),
    )}">${esc(tel)}</a> までお電話ください。</p>`,
    "</div>",
  ].join("");
}

/** 経理の画面（入室）に出す逃げ道 */
export function keiriLoginNoScriptHtml(): string {
  return keiriNoScriptHtml({
    heading: "このブラウザでは経理の画面をお使いいただけません。",
    lead:
      "お手数ですが、お店の名前を添えて、こちらまでご連絡ください。" +
      "今月の利益・今の現金・まだ払っていないお金を、こちらでお調べしてお返しします。宛先は ",
  });
}
