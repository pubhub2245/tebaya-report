import type { Metadata } from "next";
import Link from "next/link";

import ApplyForm from "./ApplyForm";
import { KeiriFooter } from "@/app/keiri/components/nav";
import { KEIRI_OFFER_ITEMS } from "@/lib/keiri/offer";
import { KEIRI_COMPANY } from "@/lib/keiri/legal";
import { keiriContactMailto } from "@/lib/keiri/apply";
import { keiriMetadata } from "@/lib/keiri/metadata";
import { priceLabel, priceSummaryLine } from "@/lib/keiri/caseNumbers";

/**
 * 経理パッケージの「お申し込み」。
 *
 * ★カードの受付口（Stripe の支払いリンク）が用意できていなくても、
 *   店主が「申し込みます」と言える道を1本だけ用意するためのページ。
 *   これが無いと、紹介ページの申し込み枠が「準備中」で行き止まりになる。
 * ★この画面ではお金は動かない。カード番号・口座番号は入れてもらわない。
 * ★価格と「含まれるもの」は紹介ページと同じ定義から読む（書き写さない）。
 */

export const metadata: Metadata = keiriMetadata({
  path: "/keiri/apply",
  title: "お申し込み｜経理パッケージ",
  description:
    "経理パッケージ（月額15,000円・税込／1店舗）のお申し込み。お店の名前・お名前・メールアドレスをいただければ、担当からお支払いの方法と使い始めの準備をご案内します。この画面でお支払いは発生しません。",
  type: "website",
});

export default function KeiriApplyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <header className="mb-8">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">お申し込み</h1>
        <p className="mt-3 text-stone-700 leading-relaxed">{priceSummaryLine()}</p>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          下の4つをいただければ、担当からご連絡します。
          <strong className="font-bold">この画面ではお支払いは発生しません。</strong>
          お支払いの方法は、ご連絡のときにご案内します。
        </p>
      </header>

      {/* ---------- 何に申し込むのか（紹介ページと同じ定義から読む） ---------- */}
      <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-bold text-stone-500">お申し込みの内容</p>
        <p className="mt-1 font-bold text-stone-900">経理パッケージ／{priceLabel()}</p>
        <ul className="mt-3 space-y-1 text-sm text-stone-700">
          {KEIRI_OFFER_ITEMS.map((o) => (
            <li key={o.title}>・{o.title}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-500 leading-relaxed">
          初期費用はかかりません。いつでもご自身の画面から解約できます。詳しくは{" "}
          <Link href="/keiri/legal" className="underline">
            特定商取引法に基づく表記
          </Link>
          をご覧ください。税務の個別のご判断は行いません。
        </p>
      </section>

      <section className="mb-10">
        {/* ★入力欄は JavaScript で送る作りなので、それが動かない環境では使えない。
            黙って使えないのが一番まずいので、その場合の宛先をここに出しておく。 */}
        <noscript>
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-stone-800 leading-relaxed">
            このブラウザでは入力欄をお使いいただけません。お手数ですが{" "}
            <a
              href={keiriContactMailto({ to: KEIRI_COMPANY.email }).url}
              className="underline font-bold"
            >
              {KEIRI_COMPANY.email}
            </a>{" "}
            まで、お店の名前・お名前・ご連絡先をお送りください。
          </div>
        </noscript>
        <ApplyForm email={KEIRI_COMPANY.email} tel={KEIRI_COMPANY.tel} />
      </section>

      <section className="mb-10">
        <p className="text-sm text-stone-600 leading-relaxed">
          先に中身を見たい方は{" "}
          <Link href="/keiri/case" className="underline font-bold">
            事例と価格のページ
          </Link>
          、聞きたいことがある方は{" "}
          <Link href="/keiri/help" className="underline font-bold">
            よくある質問
          </Link>{" "}
          をご覧ください。
        </p>
      </section>

      <KeiriFooter />
    </main>
  );
}
