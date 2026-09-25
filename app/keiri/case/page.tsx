import type { Metadata } from "next";
import Link from "next/link";

import {
  CASE_TEBAYA,
  KEIRI_PRICE,
  manYen,
  cancelLongLabel,
  paymentLinkUrl,
  priceLabel,
  priceSummaryLine,
} from "@/lib/keiri/caseNumbers";
import { getCaseStats } from "@/lib/keiri/caseStats";
import { getCaseUsage } from "@/lib/keiri/caseUsage";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";
import { paymentHandoffLine, paymentNoticeLine } from "@/lib/keiri/payment";
import { keiriContactMailto } from "@/lib/keiri/apply";
import {
  KEIRI_OFFER_ITEMS,
  KEIRI_OFFER_NOT_INCLUDED,
  KEIRI_TOP_LINES,
  keiriStartSteps,
} from "@/lib/keiri/offer";
import {
  SAMPLE_LEAD,
  SAMPLE_NOTICE,
  buildMonthlySample,
  sampleYen,
} from "@/lib/keiri/monthlySample";
import { keiriCaseFaq } from "@/lib/keiri/support";
import { KeiriBreadcrumb, KeiriFooter, KeiriRelated } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";

/**
 * 経理パッケージの紹介ページ（無人販売の入口①・事例ページ）。
 *
 * ★誰でも見られるページ（管理者の鍵は掛けない）。店の中のデータは一切読まない。
 * ★数字と価格は lib/keiri/caseNumbers.ts からだけ読む。ここに直書きしない。
 * ★「何を渡すか」の文言は lib/keiri/offer.ts からだけ読む。ここに直書きしない。
 * ★申し込みボタンは支払いリンクの環境変数（paymentLinkEnvName()）があるときだけ出す。
 *   無いときは「準備中」と正直に出す（偽の導線を作らない）。
 *   環境変数の名前には金額が入っているので、値上げしたのに前の金額のリンクが
 *   残っている、という食い違いは起きない（自動で「準備中」に戻る）。
 * ★事例1号の数字（出店回数・売上・利益）は、前の月の日報から自動で出す
 *   （lib/keiri/caseStats.ts）。倉庫が読めないときは caseNumbers.ts の控えに戻る。
 * ★「続いていること」（日報の枚数・続いている月数）は lib/keiri/caseUsage.ts から。
 *   こちらは **金額を1つも読まない**（同業の店主が開くページなので手の内を見せない）。
 *   読めなければ区画ごと出さない。控えの数字を手で書いて置かない。
 * 設計：docs/auto/2026-09-17_経理パッケージ_無人販売の流れ_設計.md（司令室B）
 */

/** 数字は毎日入れ替わる。1時間ごとに作り直す（毎回DBを叩かない） */
export const revalidate = 3600;

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/case",
  type: "website",
  title: "経理パッケージ｜日報を書くだけで、月の利益と今の現金が分かる",
  description:
    "小さな飲食店・移動販売・催事出店のための経理。毎日の日報を書くだけで、月の利益・今の現金・まだ払っていないお金が自動で出ます。" +
    "毎月の締めはこちらでやり、会計ソフト用のCSVと要約を月はじめにお出しします。" +
    `${priceLabel()}、いつでも解約。`,
});

const OUTPUTS: { title: string; body: string }[] = [
  {
    title: "今月の利益",
    body: "売上から、材料・場代などの経費と、給与・外注費・家賃を引いた「もうけ」。月の途中でも見られます。",
  },
  {
    title: "今の現金",
    body: "いま手元にいくらあるか。レジから払った経費と、実際に払った給与・家賃だけを引いて出します。",
  },
  {
    title: "まだ払っていないお金",
    body: "月末にまとめて払う給与・外注費・家賃のうち、まだ払っていない分。払い忘れと「使っていいお金」の勘違いを防ぎます。",
  },
  {
    title: "科目ごとの内訳と場所ごとの利益",
    body: "経費を科目（仕入・出店料・消耗品など）に自動で振り分け、出店場所ごとの利益も並べます。",
  },
  {
    title: "会計ソフト用のCSV",
    body:
      "月ごとの仕訳を CSV で出せるので、確定申告や税理士さんへの受け渡しがそのまま済みます。" +
      "弥生会計・マネーフォワード クラウド会計・freee会計のどれにも取り込める形でお出しします。",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: "1", title: "営業が終わったら日報を書く", body: "売上・払った経費・その日の日当をスマホで入力。レシートは写真を撮るだけで金額を読み取ります。" },
  { n: "2", title: "経理画面を開く", body: "集計は自動。月を選ぶだけで、利益・現金・未払いの3つが出ています。" },
  { n: "3", title: "月末は払った記録を1行足す", body: "給与・外注費・家賃を「払った」と記録すると、現金と未払いが動きます。作業はそれだけです。" },
];

const FITS: string[] = [
  "移動販売・催事出店など、日によって場所と売上が変わるお店",
  "1〜3人で回していて、経理に時間をかけたくないお店",
  "売上と経費は現金中心で、月の数字を「その月のうちに」知りたいお店",
];

/* ★「先にお伝えしておくこと」は lib/keiri/offer.ts の KEIRI_OFFER_NOT_INCLUDED が正。
      同じ内容を2か所に書くと、値上げのたびに片方だけ古くなるのでここには置かない。 */

export default async function KeiriCasePage() {
  const link = paymentLinkUrl();
  /* カードでその場で払えるか。画面の言い方（解約のしかた等）はここだけを見て決める */
  const cardLive = link !== null;
  const stats = await getCaseStats();
  /* 「本当に毎日続いているか」の実測値。金額は1つも読まない（lib/keiri/caseUsage.ts）。
     倉庫が読めなければ null ＝ その区画ごと出さない（数字を作らない） */
  const usage = await getCaseUsage();
  /* 毎月お届けするものの見本。架空のお店の数字を、本物と同じ関数に計算させる */
  const sample = buildMonthlySample();
  const c = { shopName: CASE_TEBAYA.shopName, ...stats };

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "経理パッケージ" }]} />

      {/* ---------- 見出し ---------- */}
      <header className="mb-10">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">
          日報を書くだけで、
          <br />
          月の利益と今の現金が分かる。
        </h1>
        {/* 30秒で分かる3行。LINEで開いた店主が最初の画面だけで
            「何をしてくれるか・いくらか・やめられるか」を確かめられるようにする。
            文言は lib/keiri/offer.ts と caseNumbers.ts からだけ引く（ここに約束を直書きしない）。 */}
        <ul className="mt-4 space-y-2">
          {KEIRI_TOP_LINES.map((line) => (
            <li key={line} className="flex gap-2 text-stone-700 leading-relaxed">
              <span aria-hidden className="flex-none text-amber-600 font-bold">
                ・
              </span>
              <span>{line}</span>
            </li>
          ))}
          <li className="flex gap-2 leading-relaxed">
            <span aria-hidden className="flex-none text-amber-600 font-bold">
              ・
            </span>
            <span className="font-bold text-amber-800">{priceSummaryLine(cardLive)}</span>
          </li>
        </ul>
        <p className="mt-4 text-stone-600 leading-relaxed">
          小さな飲食店・移動販売・催事出店のための経理です。
          毎日の売上と経費を日報に入れるだけで、月の利益・今の現金・まだ払っていないお金が自動で出ます。
          帳簿づけの時間はゼロになります。
        </p>

        {/* ★一番上に「まず触ってみる」を置く（kp80）。
             値段の説明より先に、中身を自分で確かめられるようにするため。
             申し込みも登録も要らず、入れた数字は保存されない。 */}
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50/70 p-5">
          <p className="font-bold text-stone-900">読むより、触ったほうが早いと思います。</p>
          <p className="mt-1 text-sm text-stone-600 leading-relaxed">
            申し込みも登録も要りません。架空のお店の日報が入った本物の画面を、そのまま触れます。
            日報を1件書くと、3つの数字がその場で変わります。入れた数字は保存されません。
          </p>
          {/* ★2つのボタンを「横に並べて」置く（kp141。kp133 の縦積みからの変更）。
               縦に積んでいたときは、スマホ（幅390px・高さ844px）で実測すると
               「申し込む」が 817px＝画面のいちばん下の端にかかり、全部は見えなかった。
               8軒への1通を受け取った店主が最初に見るのはこの1画面なので、
               「もう決めた」人がその場で申し込めるように、2つとも1画面目に収める。
               主役は今までどおり「まず触ってみる」（塗りのボタン）。
               申し込みは枠だけの控えめな見た目にして、上下の差を色と塗りで付ける。
               新しい約束・新しい値段の言葉は1つも足さない
               （行き先は下の申し込み枠と同じ /keiri/apply）。 */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href="/keiri/demo"
              className="rounded-xl bg-amber-500 px-3 py-3 text-center font-bold leading-tight text-white hover:bg-amber-600"
            >
              まず触ってみる
              <span className="mt-0.5 block text-[11px] font-normal">無料・登録不要</span>
            </Link>
            <Link
              href="/keiri/apply"
              className="rounded-xl border border-amber-400 bg-white px-3 py-3 text-center font-bold leading-tight text-amber-800 hover:bg-amber-100"
            >
              申し込む
              <span className="mt-0.5 block text-[11px] font-normal text-stone-500">
                もうお決まりの方
              </span>
            </Link>
          </div>
          <p className="mt-2 text-center text-xs text-stone-500">
            この画面ではお支払いは発生しません。
          </p>
        </div>
      </header>

      {/* ---------- 事例1号 ---------- */}
      <section className="mb-10 rounded-2xl bg-white border border-stone-200 p-6 shadow-sm">
        <p className="text-xs font-bold text-stone-400">事例1号</p>
        <h2 className="mt-1 text-lg font-bold text-stone-900">{c.shopName}</h2>
        <p className="mt-1 text-sm text-stone-500">
          {c.month}の実績。このアプリの日報から{c.auto ? "自動で" : ""}集計した数字です（{c.checkedOn} 確認）。
        </p>
        {/*
          利益は、確かめた値が無いとき（c.profitMan === null）は枠ごと出さない。
          「—」や 0 を出すと、数字が無いのに数字があるように見えてしまうため。
          その場合は残り2枠なので、並びも2列にする。
        */}
        <dl
          className={`mt-5 grid gap-3 text-center ${
            c.profitMan === null ? "grid-cols-2" : "grid-cols-3"
          }`}
        >
          <div className="rounded-xl bg-stone-50 py-4">
            <dt className="text-xs text-stone-500">出店</dt>
            <dd className="mt-1 text-2xl font-bold text-stone-900">
              {c.days}
              <span className="text-sm font-normal text-stone-500">回</span>
            </dd>
          </div>
          <div className="rounded-xl bg-stone-50 py-4">
            <dt className="text-xs text-stone-500">売上</dt>
            <dd className="mt-1 text-2xl font-bold text-stone-900">{manYen(c.salesMan)}</dd>
          </div>
          {c.profitMan !== null && (
            <div className="rounded-xl bg-amber-50 py-4">
              <dt className="text-xs text-amber-800">月の利益</dt>
              <dd className="mt-1 text-2xl font-bold text-amber-800">{manYen(c.profitMan)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-sm text-stone-600 leading-relaxed">
          手羽屋では、スタッフが営業後にスマホで日報を書くだけ。オーナーは経理画面を開けば、その月のもうけと手元のお金がその場で分かります。
          給与・外注費・家賃のような「あとでまとめて払うお金」も、払い忘れが出ないように別に数えています。
        </p>
      </section>

      {/* ---------- 続いていること（金額は出さない） ---------- */}
      {usage && (
        <section className="mb-10 rounded-2xl bg-white border border-stone-200 p-6 shadow-sm">
          <p className="text-xs font-bold text-stone-400">見本ではありません</p>
          <h2 className="mt-1 text-lg font-bold text-stone-900">手羽屋が、毎日の営業で使っています</h2>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-stone-50 py-4">
              <dt className="text-xs text-stone-500">書かれた日報</dt>
              <dd className="mt-1 text-2xl font-bold text-stone-900">
                {usage.reports}
                <span className="text-sm font-normal text-stone-500">枚</span>
              </dd>
            </div>
            <div className="rounded-xl bg-stone-50 py-4">
              <dt className="text-xs text-stone-500">日報が残っている月</dt>
              <dd className="mt-1 text-2xl font-bold text-stone-900">
                {usage.months}
                <span className="text-sm font-normal text-stone-500">か月</span>
              </dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2 text-sm text-stone-600 leading-relaxed">
            <li>
              {usage.firstMonth}から{usage.lastMonth}まで
              {usage.noGap ? "、1か月も抜けずに" : "で、合わせて"}
              {usage.months}か月ぶんの日報が残っています。
            </li>
            <li>いちばん新しい日報は {usage.lastDate} に書かれたものです。</li>
            <li>
              月末の締めの集計は、お店ではなくこちらで行っています（下の「月額に含まれるもの」に書いてあります）。
            </li>
          </ul>
          <p className="mt-4 text-xs text-stone-500 leading-relaxed">
            このアプリに残っている日報を、その場で数えた値です（{usage.checkedOn} 集計）。
            手で書き写した数字ではないので、日報が増えればここも増えます。
          </p>
        </section>
      )}

      {/* ---------- 何が出るか ---------- */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">自動で出るもの</h2>
        <ul className="mt-4 space-y-3">
          {OUTPUTS.map((o) => (
            <li key={o.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{o.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{o.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 使い方 ---------- */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">毎日やること</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="flex-none w-8 h-8 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center">
                {s.n}
              </span>
              <div>
                <p className="font-bold text-stone-900">{s.title}</p>
                <p className="mt-1 text-sm text-stone-600 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- 向いているお店 ---------- */}
      <section className="mb-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white border border-stone-200 p-4">
          <p className="font-bold text-stone-900">向いているお店</p>
          <ul className="mt-2 space-y-1.5 text-sm text-stone-600 list-disc list-inside">
            {FITS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-stone-50 border border-stone-200 p-4">
          <p className="font-bold text-stone-900">先にお伝えしておくこと</p>
          <ul className="mt-2 space-y-1.5 text-sm text-stone-600 list-disc list-inside">
            {KEIRI_OFFER_NOT_INCLUDED.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- 月額に含まれるもの（誰が手を動かすかを並べて書く） ---------- */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">{priceLabel()}に含まれるもの</h2>
        <p className="mt-1 text-sm text-stone-500">
          「こちら」と書いてあるものは、お店の作業はありません。
        </p>
        <ul className="mt-4 space-y-3">
          {KEIRI_OFFER_ITEMS.map((o) => (
            <li key={o.title} className="rounded-xl bg-white border border-stone-200 p-4">
              <div className="flex items-center gap-2">
                <p className="font-bold text-stone-900">{o.title}</p>
                <span
                  className={
                    o.by === "こちら"
                      ? "flex-none rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"
                      : "flex-none rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600"
                  }
                >
                  {o.by === "こちら" ? "こちらがやります" : "お店がやること"}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{o.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 毎月お届けするもの（見本） ---------- */}
      {/* ★含まれるもの②「毎月の締め」のすぐ下に置く。
            月15,000円の重いほうは「毎月の締めをこちらでやって渡す」なのに、
            その渡すものが文章でしか書かれておらず、どこにも見えていなかった。
            数字は lib/keiri/monthlySample.ts が本物と同じ関数で計算したものだけを出す
            （ここに金額を直書きしない。書いたらそれは嘘の約束になる）。 */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">毎月お届けするもの（見本）</h2>
        <p className="mt-1 text-sm text-stone-600 leading-relaxed">{SAMPLE_LEAD}</p>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-bold text-amber-700">1枚の要約</p>
          <p className="mt-1 text-sm text-stone-500">
            {sample.monthLabel}・{sample.shopName}
          </p>

          <dl className="mt-3 divide-y divide-stone-100">
            {sample.headline.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-sm text-stone-600">{line.label}</dt>
                <dd className="font-bold text-stone-900 tabular-nums">{sampleYen(line.yen)}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-xs font-bold text-stone-500">経費の内訳</p>
          <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {sample.expenses.map((e) => (
              <li
                key={e.label}
                className="flex items-baseline justify-between gap-3 text-sm text-stone-700"
              >
                <span>{e.label}</span>
                <span className="tabular-nums">{sampleYen(e.yen)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-bold text-amber-700">会計ソフトに取り込めるCSV</p>
          <p className="mt-1 text-sm text-stone-500">
            全部で{sample.journalRowCount}行のうち、はじめの{sample.journalRows.length}行です。
          </p>
          <div className="mt-3 -mx-1 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="text-stone-500">
                  {sample.journalHeaders.map((h) => (
                    <th key={h} className="px-1 py-1 text-left font-bold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-stone-700">
                {sample.journalRows.map((r, i) => (
                  <tr key={`${r.date}-${i}`} className="border-t border-stone-100">
                    <td className="px-1 py-1 whitespace-nowrap">{r.date}</td>
                    <td className="px-1 py-1 whitespace-nowrap">{r.debitAccount}</td>
                    <td className="px-1 py-1 whitespace-nowrap tabular-nums">
                      {r.debitAmount.toLocaleString("ja-JP")}
                    </td>
                    <td className="px-1 py-1 whitespace-nowrap">{r.creditAccount}</td>
                    <td className="px-1 py-1 whitespace-nowrap tabular-nums">
                      {r.creditAmount.toLocaleString("ja-JP")}
                    </td>
                    <td className="px-1 py-1">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* ★お使いの会計ソフトの名前を、ここで出す（2026-09-24・kp135）。
                「うちは弥生だから、たぶん使えない」で静かに離れてしまうのを防ぐため。
                3つとも実際に取り込める形で書き出せることを確かめたうえで書いている
                （決まりと突き合わせた記録は docs/auto/2026-09-24_会計ソフト取込仕様.md）。
                新しい約束は足していない。いまできることをそのまま書いただけ。 */}
          <div className="mt-3 space-y-1.5 text-xs text-stone-500 leading-relaxed">
            <p className="font-bold text-stone-700">お使いの会計ソフトに、そのまま取り込めます</p>
            <p>
              ・<strong>弥生会計／やよいの青色申告</strong>へは、仕訳日記帳インポートの形（
              {sample.yayoiColumnCount}列・Shift-JIS）でお出しします。
            </p>
            <p>
              ・<strong>マネーフォワード クラウド会計</strong>へは、仕訳帳インポートの形（
              {sample.mfColumnCount}列）でお出しします。
            </p>
            <p>
              ・<strong>freee会計</strong>は、取り込むときに列を選び直せるので、上の
              マネーフォワード用のファイルをそのままお使いいただけます。
            </p>
            <p className="pt-1">
              どの形も、税区分は空のままでお出しします（税務のことはこのアプリでは決めません）。
              どれでも同じ中身です。お試し版で、いま実際に書き出してみられます。
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-stone-500 leading-relaxed">{SAMPLE_NOTICE}</p>

        {/* ★見本を読み終えた「その場」に、申し込みへの道を1本置く（kp142）。
             2026-09-24 22:40 に本番（版 4f35a6f）をスマホの幅（390×844px）で実測したところ、
             申し込みへの入口は 731px（一番上の2つ）と 6,938px の2か所しかなく、
             そのあいだ 6,207px＝画面7.4枚ぶん、押せるものが1つも無かった。
             毎月の月額を出すか決める最後の材料はこの見本（4,227〜5,300px）なので、
             読み終えたその場に道を置く。お試し版で同じことをしたのが kp134。
             新しい約束・新しい値段の言葉は1つも足さない
             （行き先も言い方も、お試し版・下の申し込み枠とまったく同じ）。 */}
        <div className="mt-4 text-center">
          <Link
            href="/keiri/apply"
            className="inline-block rounded-xl border border-amber-400 bg-white px-5 py-3 text-sm font-bold text-amber-800 hover:bg-amber-50"
          >
            この形で毎月お届けします → お申し込みへ
          </Link>
          <p className="mt-2 text-xs text-stone-500">この画面ではお支払いは発生しません。</p>
        </div>
      </section>

      {/* ---------- 申し込んでから、使い始めるまで ---------- */}
      {/* ★申し込みボタンの「すぐ上」に置く。押したあと自分に何が起きるかを
            知らないまま押す人はいないので、値段より前ではなく直前に出す。
            文言は lib/keiri/offer.ts からだけ引く（ここに約束を直書きしない）。 */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">申し込んでから、使い始めるまで</h2>
        <ol className="mt-4 space-y-3">
          {keiriStartSteps(cardLive).map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="flex-none w-8 h-8 rounded-full bg-stone-200 text-stone-700 font-bold flex items-center justify-center">
                {s.n}
              </span>
              <div>
                <p className="font-bold text-stone-900">{s.title}</p>
                <p className="mt-1 text-sm text-stone-600 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- 申し込む前に、よく聞かれること ---------- */}
      {/* ★答えは増やさない。lib/keiri/support.ts の KEIRI_FAQ をそのまま出す。
            「困ったとき」のページ（/keiri/help）にある答えのうち、決める直前に
            いちばん効く4つだけを、ここへ持ってくる。 */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900">申し込む前に、よく聞かれること</h2>
        <dl className="mt-4 space-y-3">
          {keiriCaseFaq().map((f) => (
            <div key={f.q} className="rounded-xl bg-white border border-stone-200 p-4">
              <dt className="font-bold text-stone-900">{f.q}</dt>
              <dd className="mt-1 text-sm text-stone-600 leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-stone-500">
          ほかの質問は{" "}
          <Link href="/keiri/help" className="underline font-bold text-stone-700">
            困ったときのページ
          </Link>{" "}
          にまとめてあります。
        </p>
      </section>

      {/* ---------- 価格と申し込み ---------- */}
      <section className="mb-10 rounded-2xl bg-amber-500 text-white p-6 shadow-md">
        <p className="text-xs font-bold opacity-90">価格</p>
        <p className="mt-1 text-2xl font-bold">{priceLabel()}</p>
        <ul className="mt-3 text-sm space-y-1 opacity-95">
          <li>・{KEIRI_PRICE.freeTrial ? "初月無料" : "初期費用なし・初月無料はありません"}</li>
          <li>・{KEIRI_PRICE.cancelAnytime ? cancelLongLabel(cardLive) : ""}</li>
          {/* ★カードの受付口が無い間は「人の手は入りません」は事実でなくなる
                （担当が折り返してお振込先をご案内するため）。正直なほうに出し分ける。
                文は lib/keiri/payment.ts が唯一の正（2026-09-25・kp184）。
                ここは［申し込む］の真上なので、方法を言わないまま終わらせない。 */}
          <li>・{paymentHandoffLine(cardLive)}</li>
        </ul>
        {link ? (
          <div className="mt-5">
            <a
              href={link}
              className="flex items-center justify-center w-full h-14 rounded-2xl bg-white text-amber-700 font-bold text-lg shadow hover:bg-amber-50 transition"
            >
              申し込む
            </a>
            {/* ★カードが使えない・請求書で払いたいお店のために、申し込みフォームも残す。
                カードが本線なので、こちらは小さく添えるだけにする。 */}
            <p className="mt-3 text-sm leading-relaxed opacity-95">
              カード以外でのお支払いをご希望の方は{" "}
              <Link href="/keiri/apply" className="underline font-bold">
                お申し込みフォーム
              </Link>{" "}
              からどうぞ。
            </p>
          </div>
        ) : (
          <div className="mt-5">
            {/* ★カードの受付口（Stripe の支払いリンク）が用意できていない間も、
                「申し込みます」と言える道は必ず1本置く。
                「準備中」で行き止まりにすると、せっかく開いた店主がそのまま離れてしまう。
                フォームではお金は動かさない（お支払いは銀行振込で、お振込先は折り返しご案内する）。
                添える1文は lib/keiri/payment.ts が唯一の正（2026-09-25・kp181）。 */}
            <Link
              href="/keiri/apply"
              className="flex items-center justify-center w-full h-14 rounded-2xl bg-white text-amber-700 font-bold text-lg shadow hover:bg-amber-50 transition"
            >
              申し込む
            </Link>
            <p className="mt-3 text-sm leading-relaxed opacity-95">
              {paymentNoticeLine()} メールでも受け付けています：{" "}
              <a
                href={keiriContactMailto({ to: KEIRI_COMPANY.email }).url}
                className="underline font-bold"
              >
                {KEIRI_COMPANY.email}
              </a>
            </p>
          </div>
        )}
        <p className="mt-4 text-xs opacity-90">
          <Link href="/keiri/legal" className="underline">
            特定商取引法に基づく表記・会社概要
          </Link>
          （だれが売っているか・解約と返金の条件）
        </p>
      </section>

      <KeiriRelated current="/keiri/case" />

      <KeiriFooter />
    </main>
  );
}
