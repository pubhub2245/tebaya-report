import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 検索向けページ（範囲型）：「小さな飲食店の記帳って、どこまでやればいいのか」。
 *
 * ★書くのは「このアプリでは、いつ・何を入れることになっているか」だけ。
 *   法令上どこまで義務か、という話は税務の判断にあたるので書かない（CLAUDE.md 5-2）。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/kicho",
  title: "小さな飲食店の記帳はどこまでやるか｜毎日・月末・年1回の分け方（経理パッケージ）",
  description:
    "店を1つ2つやっているだけなのに、帳簿づけに時間が溶ける人向け。毎日やること・月末にやること・" +
    `年に1回でいいことを分けて、毎日ぶんを日報1枚に寄せた形を説明します。${priceLabel()}。`,
});

const DAILY: { title: string; body: string; time: string }[] = [
  {
    title: "商品ごとの本数と、レジの売上",
    body: "本数を入れると単価×本数の合計が出て、レジの売上と合うか確かめます。合わない日は理由を選べば進めます（理由も残ります）。",
    time: "2分",
  },
  {
    title: "レジの現金から払った経費",
    body: "レシートを写真に撮ると、品名と金額が入ります。写真が無いときは理由を選びます。",
    time: "1分",
  },
  {
    title: "レジの現金を数える",
    body: "閉店時点の現金を入れます。翌朝の開店前の金額と自動で突き合わせます。",
    time: "1分",
  },
];

const MONTHLY: { title: string; body: string }[] = [
  {
    title: "払ったものを「払った」と記録する",
    body: "給与・外注費・家賃など、あとでまとめて払うものです。払うまでは「まだ払っていないお金」として数えられています。",
  },
  {
    title: "月の数字を見る",
    body: "売上・科目ごとの経費・利益・今の手元現金が、日報から自動で並びます。集計のための入力はありません。",
  },
];

const YEARLY: { title: string; body: string }[] = [
  {
    title: "仕訳のCSVを書き出して渡す",
    body: "会計ソフトが読む形で1回書き出すだけです。科目の割り振りは、あらかじめ決めてある対応表から自動で付きます。",
  },
  {
    title: "判断が要るところを税理士に見てもらう",
    body: "割れそうなものには印が付いています。判断そのものはこのアプリではしません。",
  },
];

const NOT_NEEDED: string[] = [
  "月末にレシートをまとめて打ち込む作業（その日のうちに写真で終わっています）",
  "出店料を毎回手で入れる作業（場所ごとの決まりから自動で入ります）",
  "スタッフの日当を計算する作業（登録した金額から入ります）",
  "場所ごと・商品ごとの集計をエクセルで作る作業（自動で並びます）",
];

export default function KeiriKichoPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "記帳はどこまでやるか" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          記帳を「毎日4分」まで
          <br />
          削るとこうなる。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          小さな店の経理がつらいのは、量が多いからではなく、
          「あとでまとめてやる」ことにしているからです。
          このアプリは、毎日やらないと意味が無いことだけを日報1枚に寄せ、
          残りを月末と年1回に振り分けています。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">毎日やること（日報1枚）</h2>
        <ul className="mt-4 space-y-3">
          {DAILY.map((d) => (
            <li key={d.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-stone-900">{d.title}</p>
                <p className="shrink-0 text-xs text-stone-500">{d.time}</p>
              </div>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{d.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-stone-600 leading-relaxed">
          毎日やるのはここまでです。ここを飛ばすと、あとから思い出す時間のほうが長くなります。
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">月末にやること</h2>
        <ul className="mt-4 space-y-3">
          {MONTHLY.map((m) => (
            <li key={m.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{m.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">年に1回でいいこと</h2>
        <ul className="mt-4 space-y-3">
          {YEARLY.map((y) => (
            <li key={y.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{y.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{y.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">やらなくてよくなること</p>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-600 list-disc list-inside">
          {NOT_NEEDED.map((t) => (
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

      <KeiriRelated current="/keiri/kicho" />

      <KeiriFooter />
    </main>
  );
}
