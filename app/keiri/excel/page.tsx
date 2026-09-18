import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";

/**
 * 検索向けページ（代替型）：「エクセルの売上管理をやめたい」人の受け皿。
 *
 * ★他社の製品名・価格・機能は書かない。この環境からは公式ページを開けず、
 *   確かめられないことを書けば、それは推測になるため（CLAUDE.md の行動原則）。
 *   比べる相手は「エクセル・手書き」という、誰でも中身を知っている方法だけにする。
 * ★書いてよいのは、このアプリが実際にやっていることだけ。
 */

export const metadata: Metadata = {
  title: "エクセルの売上管理をやめたい｜日報だけで月の数字が締まる（経理パッケージ）",
  description:
    "小さな飲食店・移動販売の売上と経費を、エクセルや手書きの帳簿で管理している人向け。" +
    "毎日の日報を入れるだけで、月の利益・今の現金・まだ払っていないお金が自動で出ます。" +
    `${priceLabel()}。`,
};

const PAINS: { pain: string; answer: string }[] = [
  {
    pain: "レシートが溜まってから、月末にまとめて打ち込んでいる",
    answer:
      "営業が終わったその場で、レシートを写真に撮るだけ。金額と品名を読み取って経費の行になります。溜める前に終わります。",
  },
  {
    pain: "式を1か所直し忘れて、月によって計算が違う",
    answer:
      "計算はアプリの中の1か所にまとめてあり、画面ごとに違う数字が出ないようにしてあります。式を触る作業そのものがありません。",
  },
  {
    pain: "売上は分かるが、手元にいくら残っているのかが分からない",
    answer:
      "レジから払った経費をその場で引くので、今の手元の現金がいつでも出ています。月末にまとめて払う給与や家賃は、別に「まだ払っていないお金」として数えます。",
  },
  {
    pain: "場所ごと・商品ごとの良し悪しが、感覚でしか分からない",
    answer:
      "出店した場所ごとの売上と利益、商品ごとの本数が自動で並びます。直近の実績から出店先の目標額も決まります。",
  },
  {
    pain: "ファイルがスタッフの端末に散らばって、どれが最新か分からない",
    answer:
      "入力はスマホから、保存先は1つ。スタッフは日報を書くだけで、集計する人がファイルを集める作業はありません。",
  },
];

const KEEP: string[] = [
  "エクセルに書き出したい月は、会計ソフトが読める形のCSVを1回で出せます（Excelで開いても文字化けしません）",
  "過去のエクセルを取り込む機能はありません。始めた月から先の数字が貯まっていきます",
];

export default function KeiriExcelPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "エクセルの売上管理をやめたい" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          エクセルの売上管理を、
          <br />
          日報だけにする。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          売上と経費をエクセルや手書きの帳簿で管理していると、打ち込む時間そのものより、
          「集める・思い出す・直す」の時間のほうが長くなります。
          このアプリは、その日のうちに日報を1枚書けば、月の数字が勝手に締まる形にしたものです。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">エクセルでつらいところ</h2>
        <ul className="mt-4 space-y-3">
          {PAINS.map((p) => (
            <li key={p.pain} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{p.pain}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{p.answer}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">エクセルを完全にやめられるわけではありません</p>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-600 list-disc list-inside">
          {KEEP.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-2xl bg-white border border-stone-200 p-6">
        <p className="font-bold text-stone-900">実際に使っている店の数字を見る</p>
        <p className="mt-1 text-sm text-stone-600 leading-relaxed">
          宮崎で催事出店をしている屋台の、前の月の出店回数・売上・利益をそのまま載せています。
        </p>
        <Link
          href="/keiri/case"
          className="mt-4 flex items-center justify-center w-full h-14 rounded-2xl bg-amber-500 text-white font-bold text-lg hover:bg-amber-600 transition"
        >
          事例と価格を見る
        </Link>
      </section>

      <KeiriRelated current="/keiri/excel" />

      <KeiriFooter />
    </main>
  );
}
