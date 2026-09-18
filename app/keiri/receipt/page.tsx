import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 検索向けページ（落とし穴型）：「レシートの残し方」。
 *
 * ★中身は、このアプリが実際にやっている処理だけ（CLAUDE.md 4-12 / 4-7）。
 * ★電子帳簿保存法に合うかどうかは税務・法務の判断なので、断定しない。
 *   「判断しません・税理士に確認してください」とだけ書く（CLAUDE.md 5-2）。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/receipt",
  title: "レシートの残し方｜写真1枚で、税込の金額のまま経費にする（経理パッケージ）",
  description:
    "レシートの読み取りで経費が毎回8〜10%少なくなる、よくある落とし穴と、その直し方。" +
    "写真を撮ると税込の金額で経費の行になり、写真は経費1行ごとに紐づいて残ります。" +
    `${priceLabel()}。`,
});

const FLOW: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "その場でレシートを撮る",
    body: "営業が終わってから探すのではなく、払ったときに撮ります。品名と金額を読み取って、経費の行がそのまま作られます。",
  },
  {
    n: "2",
    title: "税込の金額に直す",
    body:
      "スーパーや業務用の店のレシートは、品物の値段が本体価格（税抜）で並び、消費税は下にまとまっています。" +
      "品物の合計と支払合計の差が消費税で説明できる範囲なら、差額を品物に割り振って税込に直します。割り振ったあとの合計は支払合計とぴったり合います。",
  },
  {
    n: "3",
    title: "説明のつかない差は、直さずに知らせる",
    body: "値引きや読み落としで説明がつかない差が出たときは、金額を勝手に作らず、画面に警告を出して人に確かめてもらいます。",
  },
  {
    n: "4",
    title: "写真は置き場に預けて、記録には住所だけ持つ",
    body: "写真そのものを記録の中に埋め込むと、日報1件を開くのも毎日の控えも重くなります。写真は別の置き場に預け、記録には行き先だけを持たせます。",
  },
];

const RULES: { title: string; body: string }[] = [
  {
    title: "1枚のレシートから作られた行には、全部同じ写真が付く",
    body: "以前は1行目にしか付かず、どの行がどのレシートか追えませんでした。いまは全部に付きます（置き場に送るのは1回だけなので、同じ写真は溜まりません）。",
  },
  {
    title: "写真が無いときは、理由を選ばないと進めない",
    body: "レシートは原則必須です。理由は記録に残るので、あとから見たときに「忘れた」のか「もともと出ない支払い」なのかが分かります。",
  },
  {
    title: "出店料（場代）はレシートが要らない",
    body: "そもそもレシートが出ない支払いです。金額は出店場所ごとの決まりから計算しているので、あとから検算できます。",
  },
  {
    title: "昔の分は読み直せる",
    body: "税抜のまま入っている古い経費は、写真が残っている行だけを読み直して税込に直せます。書き換える前に必ず控えを取り、取れなければ実行しません。",
  },
];

export default function KeiriReceiptPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "レシートの残し方" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          経費が毎回8〜10%
          <br />
          少なく残っていないか。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          レシートを読み取って経費にするとき、品物の値段だけを拾うと、
          下にまとまっている消費税がまるごと落ちます。
          1回あたりは数百円でも、毎日続けば月で効いてきます。
          実際にこのアプリでも起きていて、直した話です。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">いまのやり方</h2>
        <ol className="mt-4 space-y-3">
          {FLOW.map((f) => (
            <li key={f.n} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">
                <span className="text-amber-600">{f.n}.</span> {f.title}
              </p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{f.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">決めごと</h2>
        <ul className="mt-4 space-y-3">
          {RULES.map((r) => (
            <li key={r.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{r.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{r.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">保存の要件については判断しません</p>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          写真で残す形が電子帳簿保存法の求める形に当てはまるかどうかは、
          このアプリでは判断しません。紙の原本をどうするかも含めて、税理士に確認してください。
          このアプリがやるのは「撮った写真を、経費の1行ごとに紐づけて失くさずに置いておく」ところまでです。
        </p>
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

      <KeiriRelated current="/keiri/receipt" />

      <KeiriFooter />
    </main>
  );
}
