import type { Metadata } from "next";
import Link from "next/link";

import {
  PLAN_DOES,
  PLAN_DOES_NOT,
  PLAN_DRAFT_NOTICE,
  PLAN_LEAD,
  PLAN_NAME,
  PLAN_PRICE_LINE,
  PLAN_TAX_HANDOFF,
  PLAN_VS_SELF_SERVE,
} from "@/lib/keiri/plan50k";

/**
 * 「経理まるごと」（月5万円前後）の中身を1枚で説明する紙（下書き・2026-10-03・f5-3）。
 *
 * ■ 公開していません
 *   じゅんの確認が済むまで、検索に出さず（noindex）、どのページからもリンクせず、
 *   sitemap にも載せません（KEIRI_PUBLIC_PAGES に入れていない）。
 *   住所を知っている人だけが開ける下書きです。
 *
 * ■ 守ること
 *   ・文章は lib/keiri/plan50k.ts からだけ読む（この画面に直書きしない）
 *   ・やることは、すでに動いているものか じゅんが決めたものだけ
 *   ・税務の個別判断には踏み込まない。申告はお店の税理士へつなぐ
 *   ・JavaScript が動かなくても全部読める（折りたたみを使わない）
 */

export const metadata: Metadata = {
  title: `${PLAN_NAME}（下書き・未公開）`,
  robots: { index: false, follow: false },
};

export default function KeiriPlanDraftPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-800">
        {PLAN_DRAFT_NOTICE}
      </p>

      <h1 className="mt-6 text-2xl font-bold text-stone-900">{PLAN_NAME}</h1>
      <p className="mt-2 text-base font-bold text-stone-900">{PLAN_PRICE_LINE}</p>
      <p className="mt-2 text-sm text-stone-600 leading-relaxed">{PLAN_LEAD}</p>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-stone-900">やること</h2>
        <ul className="mt-3 space-y-3">
          {PLAN_DOES.map((p) => (
            <li key={p.title} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="font-bold text-stone-900">{p.title}</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-stone-900">やらないこと</h2>
        <ul className="mt-3 space-y-2">
          {PLAN_DOES_NOT.map((t) => (
            <li key={t} className="flex gap-2 text-sm text-stone-700 leading-relaxed">
              <span aria-hidden="true" className="flex-none text-stone-400">
                ×
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-700 leading-relaxed">
          {PLAN_TAX_HANDOFF}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-stone-900">ご自身でやるプランとの違い</h2>
        <ul className="mt-3 space-y-2">
          {PLAN_VS_SELF_SERVE.map((t) => (
            <li key={t} className="text-sm text-stone-700 leading-relaxed">
              ・{t}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-stone-900">先に見ていただけるもの</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link href="/keiri/demo" className="underline hover:text-stone-700">
              お試し版（登録なしで、本物の画面をそのまま触れます）
            </Link>
          </li>
          <li>
            <Link href="/keiri/monthly-sample" className="underline hover:text-stone-700">
              毎月お届けする1枚（見本）
            </Link>
          </li>
        </ul>
      </section>

      <p className="mt-10 text-center text-xs text-stone-400">運営：株式会社Alpha</p>
    </main>
  );
}
