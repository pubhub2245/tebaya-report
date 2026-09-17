import type { Metadata } from "next";
import Link from "next/link";

import { FEEDBACK_PATH, KEIRI_FAQ, supportEmail } from "@/lib/keiri/support";

/**
 * 経理パッケージの「困ったとき」の窓口（無人販売の入口④）。
 *
 * ★誰でも見られるページ（管理者の鍵は掛けない）。店の中のデータは一切読まない。
 * ★文言と連絡先は lib/keiri/support.ts からだけ読む。ここに直書きしない。
 * ★問い合わせ先は環境変数が入っているときだけ出す。無いときは「準備中」と正直に出す。
 * 設計：docs/auto/2026-09-17_経理パッケージ_無人販売の流れ_設計.md（司令室B）
 */

export const metadata: Metadata = {
  title: "困ったとき｜経理パッケージ",
  description:
    "経理パッケージのよくある質問と問い合わせ先。毎日やること・レシートの税込・立替の入れ方・利益と現金の違い・会計ソフトへの渡し方・解約のしかたを1ページにまとめています。",
};

function faqLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: KEIRI_FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export default function KeiriHelpPage() {
  const mail = supportEmail();

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd()) }}
      />

      <header className="mb-8">
        <p className="text-xs font-bold text-amber-700 tracking-wide">経理パッケージ</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-900 leading-tight">困ったとき</h1>
        <p className="mt-3 text-stone-600 leading-relaxed">
          よくある質問を10個にまとめました。ここに無いことは、下の窓口からお知らせください。
        </p>
      </header>

      {/* ---------- よくある質問 ---------- */}
      <section className="space-y-3">
        {KEIRI_FAQ.map((f, i) => (
          <details
            key={f.q}
            className="rounded-xl border border-stone-200 bg-white p-4"
            open={i === 0}
          >
            <summary className="cursor-pointer font-bold text-stone-900">{f.q}</summary>
            <p className="mt-3 text-sm text-stone-700 leading-relaxed">{f.a}</p>
            {f.link && (
              <Link
                href={f.link.href}
                className="mt-3 inline-block text-sm font-bold text-amber-700 underline"
              >
                {f.link.label}
              </Link>
            )}
          </details>
        ))}
      </section>

      {/* ---------- 窓口 ---------- */}
      <section className="mt-10 rounded-xl border border-stone-200 bg-stone-50 p-5">
        <h2 className="text-lg font-bold text-stone-900">それでも解決しないとき</h2>
        <p className="mt-2 text-sm text-stone-700 leading-relaxed">
          「ここが使いにくい」「こうなったらいいのに」もこちらへどうぞ。いただいた内容は一覧に残り、
          直したものから順に反映します。
        </p>

        <Link
          href={FEEDBACK_PATH}
          className="mt-4 block rounded-xl bg-amber-600 px-5 py-3 text-center font-bold text-white hover:bg-amber-700"
        >
          意見・不具合を書いて送る
        </Link>

        <p className="mt-4 text-sm text-stone-700">
          {mail ? (
            <>
              メールでも受け付けています：
              <a href={`mailto:${mail}`} className="font-bold text-amber-700 underline">
                {mail}
              </a>
            </>
          ) : (
            <span className="text-stone-500">
              メールの窓口は準備中です。いまは上のボタンからお知らせください。
            </span>
          )}
        </p>
      </section>

      {/* ---------- 行き先 ---------- */}
      <nav className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/keiri" className="font-bold text-amber-700 underline">
          経理画面へ
        </Link>
        <Link href="/" className="font-bold text-stone-600 underline">
          トップへ
        </Link>
      </nav>
    </main>
  );
}
