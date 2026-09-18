import type { Metadata } from "next";
import Link from "next/link";

import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";
import { priceLabel } from "@/lib/keiri/caseNumbers";
import GenkaForm from "./form";

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/tools/genka-ritsu",
  title: "原価率・FL比率の計算ツール（飲食店）｜売上・仕入・人件費を入れるだけ",
  description:
    "飲食店の原価率（F）・人件費率（L）・FL比率を、1か月の売上と仕入と給料から出します。" +
    "登録不要・無料。入力した数字はどこにも送りません。",
});

const NOTES: { q: string; a: string }[] = [
  {
    q: "FL比率とは",
    a: "食材（Food）と人件費（Labor）を足した金額が、売上の何％かを見る割合です。飲食店でいちばん大きい2つの費用をまとめて見るための数字で、60%前後を一つの目安に置く店が多いですが、業態によって適正は変わります。",
  },
  {
    q: "消費税は抜くべきですか",
    a: "毎月同じやり方でそろえてあれば、どちらでもかまいません。月によって税込と税抜が混ざると、上がった下がったが分からなくなります。迷うなら「払った金額のまま」でそろえるのがいちばん崩れません。",
  },
  {
    q: "自分の給料は人件費に入れますか",
    a: "個人か法人か、役員報酬を取っているかで変わります。ここでも大事なのは毎月そろえることです。入れるなら毎月入れる、入れないなら毎月入れない、と決めてください。",
  },
  {
    q: "割合が高いと何が問題ですか",
    a: "残る額が家賃や水道光熱を払えない額になります。割合そのものより、「残った額で固定費を払えるか」を見てください。その線を出すのが赤字ラインの計算です。",
  },
];

export default function GenkaRitsuPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "無料の計算ツール", href: "/keiri/tools" }, { name: "原価率・FL比率の計算" }]} />

      <header className="mb-8">
        <p className="text-xs font-bold text-amber-700 tracking-wide">無料・登録不要</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          原価率とFL比率を、
          <br />
          その場で出す。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          1か月の売上・食材の仕入・人件費を入れると、原価率（F）・人件費率（L）・FL比率と、
          2つを引いたあとに残る金額が出ます。
        </p>
      </header>

      <GenkaForm />

      <section className="mt-12">
        <h2 className="text-lg font-bold text-stone-900">この数字の読み方</h2>
        <dl className="mt-4 space-y-5">
          {NOTES.map((n) => (
            <div key={n.q}>
              <dt className="font-bold text-stone-900">{n.q}</dt>
              <dd className="mt-1 text-sm text-stone-600 leading-relaxed">{n.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-stone-500 leading-relaxed">
          このページは計算の道具です。税金や申告の判断はしません。個別の税務のことは税理士にご確認ください。
        </p>
      </section>

      <section className="mt-12 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">毎月この数字が勝手に出る形にするなら</h2>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          この計算をするには、1か月の仕入と給料が月末にすぐ出る必要があります。
          日報を書くだけで今月の利益・今の現金・まだ払っていないお金が出る仕組みを、実際に屋台で使っている形のまま貸しています（{priceLabel()}）。
        </p>
        <Link
          href="/keiri/case"
          className="mt-4 inline-block rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700"
        >
          経理パッケージを見る
        </Link>
      </section>

      <div className="mt-12">
        <KeiriRelated current="/keiri/tools/genka-ritsu" />
      </div>

      <KeiriFooter />
    </main>
  );
}
