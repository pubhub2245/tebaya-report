import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 検索向けページ（やり方型）：「移動販売・催事出店の売上と経費をどう付けるか」。
 *
 * ★書くのは、このアプリで実際にできる手順だけ。一般論の水増しはしない。
 * ★税務の判断はしない・させない（CLAUDE.md 5-2）。断定しない。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/howto",
  title: "移動販売の売上・経費の付け方｜その日のうちに締める手順（経理パッケージ）",
  description:
    "出店ごとに場所も売上も変わるお店の、売上と経費の付け方。日報1枚で、レジの現金・場代・日当・持ち帰り金額まで" +
    `その日のうちに合わせる手順を並べました。${priceLabel()}。`,
});

const STEPS: { n: string; title: string; body: string; why: string }[] = [
  {
    n: "1",
    title: "商品ごとの本数を入れて、レジの売上と突き合わせる",
    body: "その日に売れた本数を商品ごとに入れると、単価×本数の合計が出ます。レジの売上と合わなければ先に進みません。",
    why: "売上から逆算して本数を埋めると、検算になりません。ズレた日にその場で気づくための順番です。",
  },
  {
    n: "2",
    title: "レジから払ったお金だけを経費に入れる",
    body: "その日レジの現金から払った仕入・消耗品を入れます。レシートは写真を撮るだけで、税込の金額を読み取ります。",
    why: "自分の財布から立て替えた分を混ぜると、手元の現金が合わなくなります。立替は別の入り口に分けてあります。",
  },
  {
    n: "3",
    title: "場代（出店料）は自動で入る",
    body: "出店場所ごとに「売上の◯％」「定額◯円」を決めておくと、日報に1行自動で入ります。金額はその場で直せます。",
    why: "毎回手で打つと打ち忘れが出ます。決まりを1か所に置いておけば、あとから検算もできます。",
  },
  {
    n: "4",
    title: "日当を入れる",
    body: "その日入ったスタッフの日当が入ります。金額はスタッフごとの登録から自動で入ります。",
    why: "当日払いの人件費は、その日の利益に効きます。月末にまとめると、日ごとの良し悪しが見えません。",
  },
  {
    n: "5",
    title: "レジの現金を数えて、閉店時点の残りを記録する",
    body: "硬貨と札を数えて入れると、過不足が出ます。翌日の開店前の金額と突き合わせる画面もあります。",
    why: "レジは閉店から翌朝まで誰も触らないはずなので、ここがズレた日は原因が必ずあります。",
  },
  {
    n: "6",
    title: "月末に「払った」を記録する",
    body: "給与・外注費・家賃など、あとでまとめて払うものを「払った」と記録します。作業はこれだけです。",
    why: "払う前は「まだ払っていないお金」、払ったら現金が減る。この2つを分けておかないと、使えるお金を勘違いします。",
  },
];

const POINTS: { title: string; body: string }[] = [
  {
    title: "場所ごとの良し悪しは、平均で見る",
    body: "直近の出店の平均売上から、出店先の目標額が自動で決まります。条件がまるで違った日（2人体制・祭りと同時など）は、集計から外す印を付けられます（売上そのものは消えません）。",
  },
  {
    title: "レシートが出ない支払いもある",
    body: "場代のようにレシートが出ないものは、決まりから計算しているので後から検算できます。それ以外でレシートが無いときは、理由を選ばないと先に進めません。",
  },
  {
    title: "同じ支払いを2回書かない",
    body: "「レジから払った」「自分で立て替えた」は入り口が分かれています。どちらか一方にだけ入れてください。",
  },
];

export default function KeiriHowtoPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "移動販売の売上・経費の付け方" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          移動販売の売上と経費は、
          <br />
          その日のうちに締める。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          出店ごとに場所も売上も変わるお店は、あとからまとめようとすると必ず思い出せなくなります。
          このアプリでの、その日のうちに数字を合わせる手順を並べました。
          全部で6つ、慣れれば数分で終わります。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">その日の手順</h2>
        <ol className="mt-4 space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="flex-none w-8 h-8 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center">
                {s.n}
              </span>
              <div className="rounded-xl bg-white border border-stone-200 p-4 flex-1">
                <p className="font-bold text-stone-900">{s.title}</p>
                <p className="mt-1 text-sm text-stone-600 leading-relaxed">{s.body}</p>
                <p className="mt-2 text-xs text-stone-500 leading-relaxed">なぜ：{s.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">つまずきやすいところ</h2>
        <ul className="mt-4 space-y-3">
          {POINTS.map((p) => (
            <li key={p.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{p.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">税金の判断はしません</p>
        <p className="mt-1 text-sm text-stone-600 leading-relaxed">
          科目や税区分の振り分けは下書きです。最終的な判断は税理士さんに見てもらってください。
        </p>
      </section>

      <section className="mb-10 rounded-2xl bg-white border border-stone-200 p-6">
        <p className="font-bold text-stone-900">この手順で回している店の数字</p>
        <Link
          href="/keiri/case"
          className="mt-4 flex items-center justify-center w-full h-14 rounded-2xl bg-amber-500 text-white font-bold text-lg hover:bg-amber-600 transition"
        >
          事例と価格を見る
        </Link>
      </section>

      <KeiriRelated current="/keiri/howto" />

      <KeiriFooter />
    </main>
  );
}
