import type { Metadata } from "next";
import Link from "next/link";

import {
  OUTREACH_LINE_SHARE_URL,
  OUTREACH_LINK,
  OUTREACH_MESSAGE,
  OUTREACH_SHOPS,
} from "@/lib/keiri/outreach";

/**
 * 「送る1枚」（kp162）。合言葉も印もアプリも要らない、送るためだけの1枚。
 *
 * ■ なぜ要るか
 *   送る入口は今まで「ホームの帯」しかなく、帯が出るには
 *   ①印を付ける1タップ ②アプリを開く の2つが要った。
 *   6日間 1通も送られていないので、**どちらも要らない道**を1本足す。
 *   じゅんは、この住所をメモやスマホのホーム画面から開くだけ。
 *
 * ■ この1枚が出すもの（これだけ）
 *   ・［LINEで送る］の1タップ（送り先を選ぶ画面が、文を持ったまま開く）
 *   ・送る文そのもの（長押しでコピーできる）
 *   ・相手が開く案内ページ（/keiri/case）への確かめリンク
 *
 * ■ 出さないもの（合言葉の要らない住所なので、内側の話は置かない）
 *   ・送り先8軒の一覧と連絡先 … 誰に送るかは司令室の手元だけ
 *   ・値段 … 受け取る同業に先に見えるのを避ける（帯と同じ決まり）
 *   ・日報・売上のデータ … この1枚は倉庫を1行も読まない
 *
 * ■ 検索には出さない
 *   robots.txt は経理パッケージの外向きページだけを許して残りはことわる作りなので、
 *   ここは最初からことわられている。念のため noindex も付けてある。
 */
export const metadata: Metadata = {
  title: "今日、1軒だけ送る",
  robots: { index: false, follow: false },
};

export default function KeiriSendPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-6 space-y-5">
      <header className="space-y-2">
        <h1 className="text-xl font-bold text-stone-900 leading-snug">
          今日、1軒だけ送る
        </h1>
        <p className="text-sm text-stone-700 leading-relaxed">
          文はできています。下のボタンで、LINEの「送り先を選ぶ画面」がこの文を持ったまま開きます。
          <strong>送るのは、ご自分で送信を押したときだけ</strong>です。1軒10秒、1日1軒で十分です。
        </p>
      </header>

      {/* ★この1枚の主役。ここだけ押せば送れる状態にしておく */}
      <a
        href={OUTREACH_LINE_SHARE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full h-14 items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-base font-bold shadow-sm transition"
      >
        LINEで送る（相手を選ぶだけ）
      </a>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2">
        <h2 className="text-sm font-bold text-stone-900">送る文（長押しでコピーできます）</h2>
        <p className="whitespace-pre-wrap text-sm text-stone-800 leading-relaxed bg-stone-50 rounded-xl p-3 border border-stone-200">
          {OUTREACH_MESSAGE}
        </p>
        <p className="text-xs text-stone-600 leading-relaxed">
          LINEが開かないときは、この文をコピーしてLINEに貼ってください。
          ボタンから開いた画面では文を直せないので、先頭の「◯◯さん」は入っていません。
          お名前を入れて送りたいときは、この文をコピーしてお使いください。
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 space-y-2">
        <h2 className="text-sm font-bold text-stone-900">相手に届く1枚を確かめる</h2>
        <p className="text-xs text-stone-700 leading-relaxed">
          文の最後のリンクを開くと、相手が見る案内ページが出ます（登録も申し込みも要りません）。
        </p>
        <Link
          href="/keiri/case"
          className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-900 hover:bg-stone-100 transition"
        >
          案内ページを見る
        </Link>
        <p className="text-xs text-stone-500 break-all">{OUTREACH_LINK}</p>
      </section>

      <p className="text-xs text-stone-600 leading-relaxed">
        送り先は全部で {OUTREACH_SHOPS.length} 軒です。どこに送ったかの控えは、
        ホームに出る帯（管理者の合言葉を入れた端末にだけ出ます）で付けられます。
        この1枚は、思い出したときに開いて1軒送るためだけのものです。
      </p>
    </main>
  );
}
