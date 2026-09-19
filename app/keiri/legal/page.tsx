import type { Metadata } from "next";
import Link from "next/link";

import { KeiriBreadcrumb, KeiriRelated } from "@/app/keiri/components/nav";
import { KEIRI_COMPANY, companyRows, tokushohoRows } from "@/lib/keiri/legal";
import { cardCheckoutLive } from "@/lib/keiri/caseNumbers";

/**
 * 特定商取引法に基づく表記・会社概要（無人販売の入口に必要な法律上のページ）。
 *
 * ★誰でも見られるページ（管理者の鍵は掛けない）。店の中のデータは一切読まない。
 * ★文言は lib/keiri/legal.ts からだけ読む。ここに直書きしない。
 * ★このページは検索結果には出さなくてよいので、metadata で robots を noindex にする…
 *   ことはしない。特商法の表記は「お客さんがいつでも見られる」ことが要件のため、
 *   ふつうに見えるページにしておく（サイトマップにも載せる）。
 */

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記・会社概要｜経理パッケージ",
  description:
    "経理パッケージ（株式会社Alpha）の特定商取引法に基づく表記と会社概要。販売価格・支払方法・提供時期・解約・返金の条件を1ページにまとめています。",
};

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="rounded-2xl bg-white border border-stone-200 divide-y divide-stone-100">
      {rows.map((r) => (
        <div key={r.label} className="p-4 sm:flex sm:gap-4">
          <dt className="text-xs font-bold text-stone-500 sm:w-48 sm:shrink-0 sm:text-sm">
            {r.label}
          </dt>
          <dd className="mt-1 text-sm text-stone-800 leading-relaxed sm:mt-0">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function KeiriLegalPage() {
  /* ★いま、その場でカードで払えるか。
       払えないあいだは「申し込み時に決済」「カスタマーポータルから解約」と書かない
       （どちらも実際には起きないため）。受付口ができたら自動で元に戻る。 */
  const cardLive = cardCheckoutLive();

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <KeiriBreadcrumb items={[{ name: "特定商取引法に基づく表記" }]} />

      <h1 className="text-2xl font-bold text-stone-900">特定商取引法に基づく表記</h1>
      <p className="mt-3 text-sm text-stone-600 leading-relaxed">
        経理パッケージ（月額のサービス）を販売している事業者と、価格・支払い・解約の条件です。
      </p>

      <section className="mt-6 mb-10">
        <Rows rows={tokushohoRows(cardLive)} />
      </section>

      <h2 className="text-xl font-bold text-stone-900">会社概要</h2>
      <section className="mt-4 mb-10">
        <Rows rows={companyRows()} />
      </section>

      <section className="mb-10 rounded-2xl bg-stone-100 p-5">
        <h2 className="text-base font-bold text-stone-900">お問い合わせ</h2>
        <p className="mt-2 text-sm text-stone-700 leading-relaxed">
          サービスの内容・お支払いについてのご連絡は {KEIRI_COMPANY.email} へお願いします。
          使い方でお困りのときは、
          <Link href="/keiri/help" className="underline hover:text-stone-900">
            困ったとき（よくある質問）
          </Link>
          もご覧ください。
        </p>
      </section>

      <KeiriRelated current="/keiri/legal" />

      <footer className="text-center text-xs text-stone-400">
        <p>運営：{KEIRI_COMPANY.name}</p>
        <p className="mt-1">
          <Link href="/keiri/case" className="underline hover:text-stone-600">
            経理パッケージのページへ戻る
          </Link>
        </p>
      </footer>
    </main>
  );
}
