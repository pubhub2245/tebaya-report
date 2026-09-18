import type { Metadata } from "next";
import Link from "next/link";

import { KeiriBreadcrumb, KeiriRelated } from "@/app/keiri/components/nav";
import { priceLabel } from "@/lib/keiri/caseNumbers";
import BunkiForm from "./form";

export const metadata: Metadata = {
  title: "飲食店の損益分岐点（赤字ライン）計算ツール｜月にいくら売ればトントンか",
  description:
    "家賃・人件費・原価率を入れるだけで、飲食店が赤字にならない売上（損益分岐点）を出します。" +
    "1営業日あたりの売上と必要な客数まで。登録不要・無料、入力した数字はどこにも送りません。",
};

const STEPS: { q: string; a: string }[] = [
  {
    q: "損益分岐点って何ですか",
    a: "利益がちょうど0円になる売上のことです。これを下回った月は赤字、上回った分が利益になります。「今月あといくら売ればいいか」を考えるときの基準の線です。",
  },
  {
    q: "どうやって出しているんですか",
    a: "毎月かならず出ていくお金（家賃・固定の人件費など）を、売上のうち手元に残る割合で割っています。原価率が30%なら、1万円売っても手元に残るのは7千円。だから固定費が70万円なら、70万円 ÷ 0.7 で100万円売る必要がある、という計算です。",
  },
  {
    q: "原価率が分からないときは",
    a: "先月の「仕入の合計 ÷ 売上」で出せます。レシートを月ごとにまとめていないと出せない数字なので、そこが毎月すぐ出る形にしておくのが本当は先です。",
  },
  {
    q: "この数字を目標にしていいですか",
    a: "いいえ。トントンは「赤字にならない下限」であって目標ではありません。自分の生活費・借入の返済・設備の積み立てを足した額が、実際に目指す売上です。",
  },
];

export default function BunkiTenPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "無料の計算ツール", href: "/keiri/tools" }, { name: "赤字ラインの計算" }]} />

      <header className="mb-8">
        <p className="text-xs font-bold text-amber-700 tracking-wide">無料・登録不要</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          月にいくら売れば、
          <br />
          赤字にならないか。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          家賃と原価率を入れるだけで、飲食店の損益分岐点（赤字にならない売上）を出します。
          1営業日あたりの売上と、必要なお客さんの数まで出ます。
        </p>
      </header>

      <BunkiForm />

      <section className="mt-12">
        <h2 className="text-lg font-bold text-stone-900">この計算について</h2>
        <dl className="mt-4 space-y-5">
          {STEPS.map((s) => (
            <div key={s.q}>
              <dt className="font-bold text-stone-900">{s.q}</dt>
              <dd className="mt-1 text-sm text-stone-600 leading-relaxed">{s.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-stone-500 leading-relaxed">
          このページは計算の道具です。税金や申告の判断はしません。個別の税務のことは税理士にご確認ください。
        </p>
      </section>

      <section className="mt-12 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">毎月この数字が自動で出る形にするなら</h2>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          ここで出した線は、毎月の売上と経費が揃って初めて意味を持ちます。
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
        <KeiriRelated current="/keiri/tools/bunki-ten" />
      </div>
    </main>
  );
}
