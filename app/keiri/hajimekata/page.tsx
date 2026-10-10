import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { keiriSetupHandoffLine } from "@/lib/keiri/offer";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 検索向けページ（順番型）：「経理は何から手を付ければいいのか」。
 *
 * ★書くのは、このアプリを使い始めるときの実際の順番だけ。
 *   「開業1年目にやるべき手続き」のような一般論・行政手続きは書かない
 *   （確かめられないことは書かない／税務の判断はしない・CLAUDE.md 5-2）。
 *
 * ★「誰が初期設定をやるのか」は、ここで文を書かない（2026-10-10・B2 の検査から）。
 *   店主に見える3ページ（/keiri/case・/keiri/plan・ここ）で言い方が食い違っていて、
 *   このページだけが「申し込んだあとに開く画面で、お店の人が自分で入れる」と読めました。
 *   実際は申し込み直後に画面が自動では出ないので、そのとおりに読んだ店主は
 *   「画面が出ない」で止まります。文は lib/keiri/offer.ts の
 *   keiriSetupHandoffLine() だけが持ち、3ページとも同じ1文を出します。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/hajimekata",
  title: "経理は何から手を付けるか｜始めの3日でここまで（経理パッケージ）",
  description:
    "店を始めたばかりで、経理を何から手を付ければいいのか分からない人向け。" +
    "入れるのは最初に3つだけ、あとは日報を書くだけで月の数字が出ます。" +
    `始めた月から先の数字が貯まっていきます。${priceLabel()}。`,
});

const DAY1: { title: string; body: string }[] = [
  {
    title: "店の名前・数え始めの日・その日の手元の現金",
    body:
      // ★入口が誰からどう届くかは、3ページ共通の1文にまかせる（上の★を参照）
      keiriSetupHandoffLine() +
      "「数え始めの日」から先の利益と現金を数えます。過去にさかのぼって入れ直す必要はありません。",
  },
  {
    title: "管理画面の合言葉を控える",
    body: "設定が終わった画面に1回だけ出ます。画面を閉じると二度と出ないので、その場で控えてください。",
  },
];

const DAY2: { title: string; body: string }[] = [
  {
    title: "出店する場所を登録する",
    body:
      "場所ごとに、出店料（売上の◯％／定額◯円／無し）を決めておきます。" +
      "決まりが分からない場所は、分かるまで「無し」のままにします。0円の記録を作ると、あとで「無料だった」という嘘の記録が残るためです。",
  },
  {
    title: "商品と単価を登録する",
    body: "日報で「単価×本数」を突き合わせるのに使います。あとで値上げしても、その日に使った単価は日報側に控えが残るので過去は壊れません。",
  },
  {
    title: "スタッフと日当を登録する",
    body: "日報で人を選ぶと日当が入ります。金額を変えるときはここを直すだけです。",
  },
];

const DAY3: { title: string; body: string }[] = [
  {
    title: "初日の日報を、最後まで1枚書いてみる",
    body: "本数・レジの売上・経費・レジの現金まで入れると、その日の利益と手元現金が出ます。ここまで通れば、あとは毎日同じです。",
  },
  {
    title: "翌朝、開店前の現金を入れてみる",
    body: "前の日の閉店後の金額と自動で突き合わせます。ここが合っていれば、毎日の記録がつながっている合図です。",
  },
];

const LATER: string[] = [
  "月末に、給与・外注費・家賃など「あとで払うもの」を払ったときに記録する",
  "月の数字（売上・科目ごとの経費・利益・手元現金）を見る",
  "年に1回、会計ソフトに取り込める仕訳のCSVを書き出して、税理士に渡す",
];

export default function KeiriHajimekataPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "何から手を付けるか" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          経理は、
          <br />
          始めの3日で形が決まる。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          店を始めたばかりの時期は、やることが多すぎて経理があと回しになります。
          ただ、あと回しにした分は必ず「思い出す時間」として返ってきます。
          最初の3日でここまで作っておけば、あとは毎日の日報だけで数字が貯まります。
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">1日目：使い始める</h2>
        <ul className="mt-4 space-y-3">
          {DAY1.map((d) => (
            <li key={d.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{d.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{d.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">2日目：決まりごとを1か所に置く</h2>
        <ul className="mt-4 space-y-3">
          {DAY2.map((d) => (
            <li key={d.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{d.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{d.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-stone-600 leading-relaxed">
          ここで登録したものが、毎日の入力から手打ちを減らしていきます。
          毎回手で打つ項目が残っていると、必ず打ち忘れが出ます。
        </p>
        {/* ★「お店が自分で全部やる」と読めないようにする（2026-10-10・B2 の検査）。
              少ない軒数にこちらが入って設定する、が 2026-10-02 の決めごと。 */}
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          この3つは、あとから足せます。分からないところは、こちらで一緒に入れます。
          お店で全部そろえてから始める必要はありません。
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">3日目：1日ぶんを通して確かめる</h2>
        <ul className="mt-4 space-y-3">
          {DAY3.map((d) => (
            <li key={d.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{d.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{d.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">ここから先は、月と年の作業だけ</p>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-600 list-disc list-inside">
          {LATER.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-stone-600 leading-relaxed">
          科目の割り振りは下書きです。判断が割れそうなものには印が付きます。最後に決めるのは税理士です。
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

      <KeiriRelated current="/keiri/hajimekata" />

      <KeiriFooter />
    </main>
  );
}
