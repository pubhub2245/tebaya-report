import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 検索向けページ（合わない型）：「現金商売で、レジのお金が合わない」。
 *
 * ★書くのは、このアプリが実際にやっている突き合わせだけ（CLAUDE.md 4-9 / 5-4）。
 * ★「合わないときの正しい処理」は税務の判断にあたるので書かない。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/genkin",
  title: "現金商売でレジのお金が合わない｜どこでズレたかを毎日で切り分ける（経理パッケージ）",
  description:
    "屋台・移動販売のように売上がほぼ全部現金のお店で、手元の現金が合わなくなる原因と、" +
    `その日のうちに切り分ける方法。閉店後の残高と翌朝の開店前を突き合わせます。${priceLabel()}。`,
});

const CAUSES: { cause: string; answer: string }[] = [
  {
    cause: "売上の内訳を、売上金額から逆算して埋めている",
    answer:
      "商品ごとの本数を先に入れて、単価×本数の合計とレジの売上を突き合わせます。合わないと先へ進めません。逆算だと検算になりませんし、端数が毎日消えていきます。",
  },
  {
    cause: "レジから払った経費と、自分で立て替えた分が混ざっている",
    answer:
      "入り口を分けてあります。レジから払った分は日報に入れてその場で手元現金から引き、自分の財布から出した分は別の画面に入れます。同じ支払いを2か所に入れないのが決まりです。",
  },
  {
    cause: "出店料を入れ忘れた日がある",
    answer: "出店場所ごとに「売上の◯％」「定額◯円」を登録しておくと、日報に自動で1行入ります。金額はその場で直せます。",
  },
  {
    cause: "前の日の閉店後と、今日の開店前を比べていない",
    answer:
      "レジは閉店から翌朝まで誰も触らないはずです。前の営業日の閉店後の金額と、今日の開店前の金額を突き合わせて、ズレた日だけを出します。",
  },
];

const HOW: { title: string; body: string }[] = [
  {
    title: "レジごとに分けて比べる",
    body: "車や台が2つあるなら、レジも別々です。混ぜて合計で見ると、片方のプラスがもう片方のマイナスを隠してしまいます。",
  },
  {
    title: "休みをまたいでもさかのぼる",
    body: "出店しなかった日があっても、前の営業日まで戻って比べます。",
  },
  {
    title: "ズレた日の一覧で終わらせる",
    body: "「今月どこかで合っていない」ではなく「◯月◯日の1号車で◯円」まで出ます。ここまで絞れれば、その日の人に聞けば分かります。",
  },
];

export default function KeiriGenkinPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "レジのお金が合わない" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          レジが合わない日を、
          <br />
          月末ではなく翌朝に見つける。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          売上がほぼ全部現金のお店では、手元のお金が合っているかどうかがそのまま帳簿の正しさになります。
          ただ、月末にまとめて見ても「どこかで合っていない」としか分かりません。
          日ごとに区切って、ズレた日だけを出すのが早道です。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">よくある原因</h2>
        <ul className="mt-4 space-y-3">
          {CAUSES.map((c) => (
            <li key={c.cause} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{c.cause}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{c.answer}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">突き合わせのやり方</h2>
        <ul className="mt-4 space-y-3">
          {HOW.map((h) => (
            <li key={h.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{h.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{h.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">合わなかった分をどう処理するかは、決めません</p>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          ズレた事実と金額は記録に残しますが、それを帳簿の上でどう扱うかは税務の判断です。
          このアプリでは判断せず、税理士に見てもらう材料として残します。
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

      <KeiriRelated current="/keiri/genkin" />

      <KeiriFooter />
    </main>
  );
}
