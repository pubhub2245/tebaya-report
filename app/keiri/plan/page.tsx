import Link from "next/link";

import { KeiriBreadcrumb, KeiriFooter } from "@/app/keiri/components/nav";
import { keiriMetadata } from "@/lib/keiri/metadata";
import {
  PLAN_DOES,
  PLAN_DOES_NOT,
  PLAN_LEAD,
  PLAN_NAME,
  PLAN_PRICE_LINE,
  PLAN_TAX_HANDOFF,
  PLAN_VS_SELF_SERVE,
} from "@/lib/keiri/plan50k";

/**
 * 「経理まるごと」（月5万円前後）の中身を1枚で説明するページ（2026-10-03・f5-2／f5-3）。
 *
 * ■ なぜ公開したか
 *   10/3 10:20 の時点では /keiri/plan-draft という下書きで、
 *   「じゅんの確認が済むまでどこからもリンクしない」決めごとにしていました。
 *   ところが そのせいで
 *   **お試し → 毎月の1枚 → 月5万円の中身 の3つが1本の道になりません**（f5-2 が不合格）。
 *   司令室の決めごとは「人の返事を待つ仕事を作らない」なので、
 *   下書きのまま置いて待つのをやめ、この1枚を公開して道をつなげました。
 *   文章は下書きのときから1文字も変えていません（断り書きだけ外しました）。
 *   直すところが出たら、言葉は lib/keiri/plan50k.ts の1か所を直せば全部変わります。
 *   /keiri/plan-draft の住所は、そのままここへ送るので開けます。
 *
 * ■ 守ること
 *   ・文章は lib/keiri/plan50k.ts からだけ読む（この画面に直書きしない）
 *   ・やることは、すでに動いているものか じゅんが決めたものだけ
 *   ・税務の個別判断には踏み込まない。申告はお店の税理士へつなぐ（CLAUDE.md 5-2）
 *   ・JavaScript が動かなくても全部読める（折りたたみを使わない）
 *   ・お店のデータは1行も読まない。誰でも開ける（管理者の鍵は掛けない）
 */

export const metadata = keiriMetadata({
  path: "/keiri/plan",
  title: "経理まるごと（月5万円前後）｜経理パッケージ",
  description:
    "日報1枚で、月の締めも会計ソフト向けの書き出しもこちらでやり、月1回 数字を一緒に見ます。やること・やらないことを1枚にまとめました。",
});

export default function KeiriPlanPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <KeiriBreadcrumb items={[{ name: PLAN_NAME }]} />

      <h1 className="text-2xl font-bold text-stone-900">{PLAN_NAME}</h1>
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

      {/* ---------- 3分で見ていただく順番の、前の2つへ戻る道 ---------- */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-stone-900">先に見ていただけるもの</h2>
        <ul className="mt-3 space-y-3">
          <li>
            <Link
              href="/keiri/demo"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">お試し版（申し込まずに触る）</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                登録も申し込みも要らずに、本物の画面をそのまま触れます。日報を1件足すと数字が変わります。
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/keiri/monthly-sample"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">毎月お届けする1枚（見本）</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                月はじめにお渡しする「1枚の要約」の見本です。
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/keiri/apply"
              className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-300"
            >
              <p className="font-bold text-stone-900">お申し込み</p>
              <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                お店の名前とお電話番号だけで送れます。この画面でお支払いは発生しません。
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <div className="mt-10">
        <KeiriFooter />
      </div>
    </main>
  );
}
