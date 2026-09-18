import type { Metadata } from "next";
import Link from "next/link";

import {
  CASE_TEBAYA,
  KEIRI_PRICE,
  manYen,
  paymentLinkUrl,
  priceLabel,
  priceSummaryLine,
} from "@/lib/keiri/caseNumbers";
import { getCaseStats } from "@/lib/keiri/caseStats";
import { KeiriBreadcrumb, KeiriRelated } from "@/app/keiri/components/nav";

/**
 * 経理パッケージの紹介ページ（無人販売の入口①・事例ページ）。
 *
 * ★誰でも見られるページ（管理者の鍵は掛けない）。店の中のデータは一切読まない。
 * ★数字と価格は lib/keiri/caseNumbers.ts からだけ読む。ここに直書きしない。
 * ★申し込みボタンは環境変数 NEXT_PUBLIC_KEIRI_PAYMENT_LINK があるときだけ出す。
 *   無いときは「準備中」と正直に出す（偽の導線を作らない）。
 * ★事例1号の数字（出店回数・売上・利益）は、前の月の日報から自動で出す
 *   （lib/keiri/caseStats.ts）。倉庫が読めないときは caseNumbers.ts の控えに戻る。
 * 設計：docs/auto/2026-09-17_経理パッケージ_無人販売の流れ_設計.md（司令室B）
 */

/** 数字は毎日入れ替わる。1時間ごとに作り直す（毎回DBを叩かない） */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "経理パッケージ｜日報を書くだけで、月の利益と今の現金が分かる",
  description:
    "小さな飲食店・移動販売・催事出店のための経理アプリ。毎日の日報を書くだけで、月の利益・今の現金・まだ払っていないお金が自動で出ます。" +
    `${priceLabel()}、いつでも解約。`,
};

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
    body: "月ごとの仕訳を CSV で出せるので、確定申告や税理士さんへの受け渡しがそのまま済みます。",
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

const NOT_FOR: string[] = [
  "税務申告そのものを代わりに行うものではありません（申告用のCSVは出せます）",
  "請求書払い・売掛が多い業態は、現金主義の集計と合いません",
];

export default async function KeiriCasePage() {
  const link = paymentLinkUrl();
  const stats = await getCaseStats();
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
        {/* 30秒で分かる1行。LINEで開いた店主が最初の画面で「いくら・やめられるか」を確かめられるように、
            下の価格の枠にある言葉をそのまま上に出す（新しい約束は足さない）。 */}
        <p className="mt-3 inline-block rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
          {priceSummaryLine()}
        </p>
        <p className="mt-4 text-stone-600 leading-relaxed">
          小さな飲食店・移動販売・催事出店のための経理アプリです。
          毎日の売上と経費を日報に入れるだけで、月の利益・今の現金・まだ払っていないお金が自動で出ます。
          帳簿づけの時間はゼロになります。
        </p>
      </header>

      {/* ---------- 事例1号 ---------- */}
      <section className="mb-10 rounded-2xl bg-white border border-stone-200 p-6 shadow-sm">
        <p className="text-xs font-bold text-stone-400">事例1号</p>
        <h2 className="mt-1 text-lg font-bold text-stone-900">{c.shopName}</h2>
        <p className="mt-1 text-sm text-stone-500">
          {c.month}の実績。このアプリの日報から{c.auto ? "自動で" : ""}集計した数字です（{c.checkedOn} 確認）。
        </p>
        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
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
          <div className="rounded-xl bg-amber-50 py-4">
            <dt className="text-xs text-amber-800">月の利益</dt>
            <dd className="mt-1 text-2xl font-bold text-amber-800">{manYen(c.profitMan)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-stone-600 leading-relaxed">
          手羽屋では、スタッフが営業後にスマホで日報を書くだけ。オーナーは経理画面を開けば、その月のもうけと手元のお金がその場で分かります。
          給与・外注費・家賃のような「あとでまとめて払うお金」も、払い忘れが出ないように別に数えています。
        </p>
      </section>

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
            {NOT_FOR.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- 価格と申し込み ---------- */}
      <section className="mb-10 rounded-2xl bg-amber-500 text-white p-6 shadow-md">
        <p className="text-xs font-bold opacity-90">価格</p>
        <p className="mt-1 text-2xl font-bold">{priceLabel()}</p>
        <ul className="mt-3 text-sm space-y-1 opacity-95">
          <li>・{KEIRI_PRICE.freeTrial ? "初月無料" : "初期費用なし・初月無料はありません"}</li>
          <li>・{KEIRI_PRICE.cancelAnytime ? "いつでも解約できます（ご自身の画面から。連絡は不要です）" : ""}</li>
          <li>・申し込みから使い始めまで、人の手は入りません。支払い後すぐに使えます</li>
        </ul>
        {link ? (
          <a
            href={link}
            className="mt-5 flex items-center justify-center w-full h-14 rounded-2xl bg-white text-amber-700 font-bold text-lg shadow hover:bg-amber-50 transition"
          >
            申し込む
          </a>
        ) : (
          <p className="mt-5 flex items-center justify-center w-full h-14 rounded-2xl bg-amber-600/60 text-white font-bold">
            申し込み受付は準備中です
          </p>
        )}
      </section>

      <KeiriRelated current="/keiri/case" />

      <footer className="text-center text-xs text-stone-400">
        <p>運営：株式会社Alpha</p>
        <p className="mt-1">
          <Link href="/" className="underline hover:text-stone-600">
            手羽屋 業務システムへ戻る
          </Link>
        </p>
      </footer>
    </main>
  );
}
