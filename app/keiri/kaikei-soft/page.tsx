import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { KeiriBreadcrumb, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 検索向けページ（比較型）：「会計ソフトとどう違うのか」に答える。
 *
 * ★他社の製品名・価格・機能は書かない（確かめられないことを書かない）。
 *   比べるのは「会計ソフトという種類の道具」と「このアプリ」の役割の違いだけ。
 * ★このアプリは会計ソフトの競合ではなく連携先（CLAUDE.md 5-2）。その立場を崩さない。
 * ★税務の判断はしない・させない。断定しない。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/kaikei-soft",
  title: "会計ソフトとの違い｜経理パッケージは「その手前」を埋める道具です",
  description:
    "会計ソフトの代わりではありません。日報から売上・経費・現金をその日のうちにまとめ、" +
    "会計ソフトが読める形のCSVで渡すところまでを受け持ちます。" +
    `${priceLabel()}。`,
});

const ROWS: { topic: string; soft: string; ours: string }[] = [
  {
    topic: "いつ入力するか",
    soft: "まとめて入力するのが基本。通帳やカードの記録を取り込んで仕分けます",
    ours: "営業が終わったその日に、スタッフがスマホで日報を1枚書きます",
  },
  {
    topic: "誰が入力するか",
    soft: "経理が分かる人（またはオーナー本人）",
    ours: "現場のスタッフ。経理の言葉は一切出しません",
  },
  {
    topic: "何が分かるか",
    soft: "決算・申告に必要な帳簿一式",
    ours: "今月の利益・今の手元の現金・まだ払っていないお金・場所ごとの利益",
  },
  {
    topic: "科目（勘定科目）の扱い",
    soft: "科目を決めるのは使う人",
    ours: "日報の内容から下書きとして自動で振り分けます。最終の判断は税理士さんに見てもらう前提です",
  },
  {
    topic: "申告",
    soft: "申告書類まで作れます",
    ours: "作りません。会計ソフトが読める形のCSVを出して、そこから先は会計ソフトに渡します",
  },
];

const WHY: string[] = [
  "会計ソフトは「1か月が終わってから」正しくするための道具です。営業中の「今いくら残っているか」には答えません",
  "現場のスタッフに会計ソフトを触らせるのは無理があります。日報なら、売上と払ったお金を書くだけで済みます",
  "だから両方使うのがいちばん早い、というのがこのアプリの立場です。置き換えではなく、手前に1枚挟む形です",
];

export default function KeiriKaikeiSoftPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "会計ソフトとの違い" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          会計ソフトの代わりでは
          <br />
          ありません。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          このアプリは、会計ソフトに渡す<strong>手前</strong>を受け持ちます。
          その日の売上と経費を現場が日報で入れ、月の利益・今の現金・まだ払っていないお金をその場で出し、
          最後に会計ソフトが読める形のCSVにして渡します。帳簿の締めと申告は、これまでどおり会計ソフトと税理士さんの仕事です。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">役割の違い</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="py-2 pr-3 font-bold">　</th>
                <th className="py-2 pr-3 font-bold">会計ソフト</th>
                <th className="py-2 font-bold">経理パッケージ</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.topic} className="border-t border-stone-200 align-top">
                  <th className="py-3 pr-3 text-left font-bold text-stone-900 whitespace-nowrap">{r.topic}</th>
                  <td className="py-3 pr-3 text-stone-600 leading-relaxed">{r.soft}</td>
                  <td className="py-3 text-stone-900 leading-relaxed">{r.ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone-500 leading-relaxed">
          会計ソフト側の内容は、種類としての一般的な役割を書いたものです。特定の製品の機能・価格については、
          それぞれの公式サイトをご確認ください。
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">なぜ両方いるのか</h2>
        <ul className="mt-4 space-y-3">
          {WHY.map((t) => (
            <li key={t} className="rounded-xl bg-white border border-stone-200 p-4 text-sm text-stone-600 leading-relaxed">
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">税金の判断はしません</p>
        <p className="mt-1 text-sm text-stone-600 leading-relaxed">
          科目や税区分の振り分けは<strong>下書き</strong>です。最終的な判断は税理士さんに見てもらってください。
          判断が割れそうなものには、こちらから「要確認」の印を付けます。
        </p>
      </section>

      <section className="mb-10 rounded-2xl bg-white border border-stone-200 p-6">
        <p className="font-bold text-stone-900">実際に使っている店の数字を見る</p>
        <Link
          href="/keiri/case"
          className="mt-4 flex items-center justify-center w-full h-14 rounded-2xl bg-amber-500 text-white font-bold text-lg hover:bg-amber-600 transition"
        >
          事例と価格を見る
        </Link>
      </section>

      <KeiriRelated current="/keiri/kaikei-soft" />

      <footer className="text-center text-xs text-stone-400">
        <p>運営：株式会社Alpha</p>
      </footer>
    </main>
  );
}
