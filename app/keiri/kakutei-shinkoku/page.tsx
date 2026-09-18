import type { Metadata } from "next";
import Link from "next/link";

import { priceLabel } from "@/lib/keiri/caseNumbers";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 検索向けページ（準備型）：「屋台・移動販売の確定申告、何を用意すればいいのか」。
 *
 * ★このアプリは税務の判断をしない・させない（CLAUDE.md 5-2）。
 *   書いてよいのは「アプリが実際に出せるもの」と「それを誰に渡すか」まで。
 *   経費になる／ならない、税区分が正しい、といった断定は書かない。
 * ★他社の製品名・価格・機能は書かない（この環境からは確かめられないため）。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/kakutei-shinkoku",
  title: "屋台・移動販売の確定申告の準備｜何を用意して誰に渡すか（経理パッケージ）",
  description:
    "催事出店や移動販売のお店が、確定申告の前にそろえておくもの。日報を毎日入れておけば、" +
    "売上・経費・現金の記録と、会計ソフトに取り込める仕訳のCSVがそのまま出ます。" +
    `税務の判断はしません。${priceLabel()}。`,
});

/** 年明けにあわてないために、日々そろっている必要があるもの */
const MATERIALS: { title: string; body: string; where: string }[] = [
  {
    title: "日ごとの売上",
    body: "商品ごとの本数を入れ、単価×本数の合計がレジの売上と合うところまで確かめた金額です。合わない日は理由が記録に残ります。",
    where: "日報（毎日）",
  },
  {
    title: "日ごとの経費と、その裏付け",
    body: "レジの現金から払った仕入・消耗品を、レシートの写真つきで残します。写真が無いときは理由を選ばないと先に進めません。",
    where: "日報 STEP5（毎日）",
  },
  {
    title: "出店料（場代）",
    body: "出店場所ごとに決めた「売上の◯％」「定額◯円」から自動で1行入ります。レシートが出ない支払いでも、あとから計算を追えます。",
    where: "出店場所の設定（1回だけ）",
  },
  {
    title: "人に払ったお金",
    body: "当日払いの日当はその日の日報に、月末にまとめて払う給与・外注費・家賃は「払った」の記録に入ります。",
    where: "日報＋月末の記録",
  },
  {
    title: "手元の現金の動き",
    body: "レジの現金がいくらで閉まり、翌朝いくらで開いたかを号車ごとに突き合わせます。合わない日はその場で出ます。",
    where: "レジ突き合わせ（毎日）",
  },
];

/** 申告の時期に、このアプリから出せるもの */
const OUTPUTS: { title: string; body: string }[] = [
  {
    title: "会計ソフトに取り込める仕訳のCSV",
    body:
      "マネーフォワード クラウド会計が読む形（27項目）で書き出せます。文字コードは2通り出せるので、" +
      "そのまま取り込んでも、表計算ソフトで開いても文字化けしません。",
  },
  {
    title: "月ごとの売上・経費・利益の一覧",
    body: "月の売上、科目ごとの経費、利益（見込みと実績の両方）、今の手元現金、まだ払っていないお金が並びます。",
  },
  {
    title: "レシートの写真",
    body: "経費の1行ごとに、元になったレシートの写真が紐づいています。1枚のレシートから作られた行には全部同じ写真が付きます。",
  },
];

/** ここから先は税理士の仕事、という線引き */
const NOT_OURS: string[] = [
  "その支払いが経費になるかどうかの判断",
  "勘定科目・税区分が正しいかどうかの最終確認",
  "申告書そのものの作成と提出",
  "消費税の課税・免税や、簡易課税かどうかの判断",
];

export default function KeiriKakuteiShinkokuPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "確定申告の準備" }]} />

      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          屋台の確定申告は、
          <br />
          年明けではなく毎日で決まる。
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          催事出店や移動販売は、日によって場所も売上も経費も変わります。
          年が明けてからレシートの山を前に思い出そうとすると、いちばん時間がかかります。
          このアプリは、その日のうちに日報を1枚書いておけば、
          申告のときに渡す材料がそのまま出ている、という形にしたものです。
        </p>
      </header>

      <section className="mb-10 rounded-xl bg-stone-50 border border-stone-200 p-4">
        <p className="font-bold text-stone-900">先にはっきりさせておきます</p>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          このアプリは<strong>税務の判断をしません</strong>。
          科目の割り振りは税理士に見てもらうための下書きで、判断が割れそうなものには印が付きます。
          最後に決めるのは税理士です。
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">毎日そろえておくもの</h2>
        <ul className="mt-4 space-y-3">
          {MATERIALS.map((m) => (
            <li key={m.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-stone-900">{m.title}</p>
                <p className="shrink-0 text-xs text-stone-500">{m.where}</p>
              </div>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">申告の時期に出せるもの</h2>
        <ul className="mt-4 space-y-3">
          {OUTPUTS.map((o) => (
            <li key={o.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{o.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{o.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">このアプリがやらないこと</h2>
        <ul className="mt-4 space-y-1.5 text-sm text-stone-600 list-disc list-inside">
          {NOT_OURS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-stone-600 leading-relaxed">
          会計ソフトの代わりではありません。会計ソフトに渡す手前を埋める道具です。
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

      <KeiriRelated current="/keiri/kakutei-shinkoku" />

      <KeiriFooter />
    </main>
  );
}
