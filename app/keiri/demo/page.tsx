import type { Metadata } from "next";
import Link from "next/link";

import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";
import { priceSummaryLine } from "@/lib/keiri/caseNumbers";
import { DEMO_SHOP_NAME, demoTodayJst } from "@/lib/keiri/demo";
import DemoBoard from "./board";

/**
 * お試し版（kp80）。**買う前に、本物の画面を触れる場所。**
 *
 * ■ なぜ要るのか
 *   これまでは「申し込む → 払う → 初回設定」まで進まないと中身が見えませんでした。
 *   お店の人が自分で確かめる手段が無いまま値段だけ見せていたことになります。
 *
 * ■ 守ること
 *   ① 登録も申し込みも要らず、誰でも開ける（管理者の鍵は掛けない）
 *   ② 計算は本物と同じ関数をそのまま呼ぶ（board.tsx の頭のコメント参照）
 *   ③ **何も保存しない・データの倉庫につなぐ部品をそもそも読み込まない**
 *      （tests/keiriDemo.test.ts が見張っています）
 *   ④ 架空のお店の数字であることを画面に必ず書く
 *
 * ■ 月と今日の日付は、ここ（サーバー側）で1回だけ決めて画面に渡す
 *   画面の中で new Date() を呼ぶと、サーバーが描いた絵とブラウザが描き直した絵が
 *   月末にズレることがあるためです。
 */

/** 月が変わったら作り直す（1時間ごと） */
export const revalidate = 3600;

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/demo",
  type: "website",
  title: "お試し版｜経理パッケージを、申し込まずに触ってみる",
  description:
    "登録も申し込みも要りません。架空のお店の日報が入った本物の経理画面を、そのまま触れます。" +
    "日報を1件書くと、今月の利益・今の現金・まだ払っていないお金がその場で変わります。" +
    "入れた数字はどこにも送られず、保存もされません。",
});

export default function KeiriDemoPage() {
  const today = demoTodayJst();
  const ym = today.slice(0, 7);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "経理パッケージ", href: "/keiri/case" }, { name: "お試し版" }]} />

      <header className="mb-8">
        <p className="text-xs font-bold text-amber-700 tracking-wide">無料・登録不要・保存しません</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          申し込む前に、
          <br />
          中身を触ってみてください。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          下にあるのは、経理パッケージの<strong>本物の画面</strong>です。
          {DEMO_SHOP_NAME}の日報が3件だけ入った状態から始まります。
          日報を1件書き足すと、<strong>今月の利益・今の現金・まだ払っていないお金</strong>が
          その場で変わります。計算は、実際にお店で使っているものと同じ仕組みです。
        </p>
        <ul className="mt-4 space-y-2 text-sm text-stone-700">
          <li className="flex gap-2">
            <span aria-hidden className="flex-none text-amber-600 font-bold">・</span>
            <span>ここに入れた数字は<strong>どこにも送られず、保存もされません</strong>（画面を閉じれば消えます）。</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="flex-none text-amber-600 font-bold">・</span>
            <span>出てくる数字は<strong>架空のお店のもの</strong>です。実在のお店の数字ではありません。</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="flex-none text-amber-600 font-bold">・</span>
            <span>{priceSummaryLine()}</span>
          </li>
        </ul>
      </header>

      <DemoBoard ym={ym} today={today} />

      <section className="mt-12">
        <h2 className="text-lg font-bold text-stone-900">よくある質問</h2>
        <dl className="mt-4 space-y-5">
          <div>
            <dt className="font-bold text-stone-900">入れた数字は誰かに見られますか</dt>
            <dd className="mt-1 text-sm text-stone-600 leading-relaxed">
              いいえ。このページは、データの置き場につながる部品をそもそも読み込んでいません。
              入れた数字はあなたのブラウザの中だけにあり、画面を閉じると消えます。
            </dd>
          </div>
          <div>
            <dt className="font-bold text-stone-900">本物とどこが違いますか</dt>
            <dd className="mt-1 text-sm text-stone-600 leading-relaxed">
              保存されないことと、はじめから架空の日報が入っていることだけです。
              利益・現金・未払い・科目の振り分け・場所ごとの成績は、
              実際のお店で動いているのと同じ計算です。
              本物ではこのほかに、レシート写真の読み取り、会計ソフト用のCSV書き出し、
              払った記録の入力ができます。
            </dd>
          </div>
          <div>
            <dt className="font-bold text-stone-900">「まだ払っていないお金」には何が入りますか</dt>
            <dd className="mt-1 text-sm text-stone-600 leading-relaxed">
              給与・外注費・家賃の3つだけです。仕入れの掛け（今月末にまとめて払う材料代など）は
              入っていません。現金でのお支払いが中心のお店を前提にしているためです。
            </dd>
          </div>
          <div>
            <dt className="font-bold text-stone-900">スタッフに日報を書かせるのは大変ではないですか</dt>
            <dd className="mt-1 text-sm text-stone-600 leading-relaxed">
              実際のお店では、営業が終わったスタッフがスマホで数分入れるだけです。
              レシートは写真を撮ると金額を読み取ります。
              オーナーがやるのは、この画面を開いて数字を見ることだけです。
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-12 text-center">
        <Link href="/keiri/case" className="text-sm font-bold text-amber-700 underline">
          経理パッケージの価格と中身を見る →
        </Link>
      </section>

      <KeiriRelated current="/keiri/demo" />
      <KeiriFooter />
    </main>
  );
}
