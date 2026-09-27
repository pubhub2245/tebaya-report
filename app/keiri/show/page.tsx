import type { Metadata } from "next";
import Link from "next/link";

import {
  cancelShortLabel,
  cardCheckoutLive,
  manYen,
  priceLabel,
} from "@/lib/keiri/caseNumbers";
import { getCaseStats } from "@/lib/keiri/caseStats";
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from "@/lib/keiri/qr";
import {
  SHOW_HANDOFF,
  SHOW_NUMBERS_LEAD,
  SHOW_NUMBER_LABELS,
  SHOW_OWNER_HINT,
  SHOW_PRICE_NOTE,
  SHOW_TAKEAWAY_COPY,
  SHOW_TAKEAWAY_LEAD,
  SHOW_TAKEAWAY_URL,
} from "@/lib/keiri/show";

/**
 * 「その場で見せる1枚」（kp191）。送らない・待たない道。
 *
 * ■ 何のための1枚か
 *   出店先で顔を合わせる同業の店主に、**立ち話のあいだスマホを差し出すだけ**で
 *   中身が伝わる3画面です。送信ボタンも、相手の返事待ちもありません。
 *   相手が興味を持てば、3画面目のQRをその方のスマホで読み取って持ち帰ります。
 *
 * ■ 出すもの（これだけ）
 *   1画面目＝手羽屋の**本物の先月の数字**（出店回数・売上・1回あたり）。
 *            日報から自動で出す（lib/keiri/caseStats.ts）。万円まで丸めた形だけ
 *   2画面目＝渡すのは日報とレシートの写真だけ／帳簿と通帳の用意は不要
 *   3画面目＝値段と「いつでもやめられる」、そして持ち帰りのQRと住所
 *
 * ■ 出さないもの
 *   ・送り先のお店の名前・ご連絡先（誰に見せるかは手元の話）
 *   ・日報1枚ぶんの数字・経費の明細（丸めた月の合計だけ）
 *   ・利益の金額（立ち話で先に見せる必要が無く、同業に手の内を出しすぎるため）
 *
 * ■ 作りの決めごと
 *   ・**JavaScript が動かなくても3画面すべて読める。**
 *     画面送りは CSS の scroll-snap だけで、指で下に送るか、ふつうに
 *     スクロールするだけで進みます（kp189 と同じ考え方）
 *   ・QRは**この中で組み立てる**（lib/keiri/qr.ts）。外の絵づくりサービスに
 *     お願いしないので、通信が細い出店先でも必ず出て、住所も外に渡らない
 *   ・検索には出さない（noindex）。sitemap にも載せない
 *   ・数字と値段は lib/ からだけ読む。この画面に直書きしない
 *
 * 文言は lib/keiri/show.ts が唯一の正。
 */

/** 数字は前の月ぶん。1時間ごとに作り直す（毎回倉庫を叩かない） */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "その場で見せる1枚",
  robots: { index: false, follow: false },
};

/** 立って見る1画面ぶんの外枠 */
function Screen({
  step,
  children,
}: {
  step: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[88svh] snap-start flex-col justify-center gap-5 border-b border-stone-200 px-5 py-10">
      <p className="text-xs font-bold tracking-widest text-stone-400">{step}</p>
      {children}
    </section>
  );
}

export default async function KeiriShowPage() {
  const stats = await getCaseStats();
  // カードで払える状態かどうかで、解約の言い方が変わる（嘘のほうへ倒さない）
  const cardLive = cardCheckoutLive();
  const averageMan = stats.days > 0 ? stats.salesMan / stats.days : null;

  // QRは番地から組み立てる（画像ファイルも外への通信も無し）
  const matrix = qrMatrix(SHOW_TAKEAWAY_URL);
  const path = qrSvgPath(matrix);
  const span = matrix.length + QR_QUIET_ZONE * 2;

  return (
    <main className="mx-auto max-w-md snap-y snap-mandatory">
      {/* ① うちの先月の数字（本物） */}
      <Screen step="1 / 3">
        <p className="text-base font-bold leading-relaxed text-stone-800">
          {SHOW_NUMBERS_LEAD}
        </p>
        <p className="text-sm text-stone-500">{stats.month}・屋台「手羽屋」</p>
        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-stone-500">{SHOW_NUMBER_LABELS.days}</dt>
            <dd className="text-4xl font-bold text-stone-900">{stats.days}回</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">{SHOW_NUMBER_LABELS.sales}</dt>
            <dd className="text-4xl font-bold text-stone-900">{manYen(stats.salesMan)}</dd>
          </div>
          {averageMan !== null ? (
            <div>
              <dt className="text-sm text-stone-500">{SHOW_NUMBER_LABELS.average}</dt>
              <dd className="text-4xl font-bold text-stone-900">{manYen(averageMan)}</dd>
            </div>
          ) : null}
        </dl>
      </Screen>

      {/* ② 渡すもの・やること */}
      <Screen step="2 / 3">
        <dl className="space-y-5">
          {SHOW_HANDOFF.map((line) => (
            <div key={line.label}>
              <dt className="text-lg font-bold text-stone-900">{line.label}</dt>
              <dd className="mt-1 text-base leading-relaxed text-stone-700">{line.body}</dd>
            </div>
          ))}
        </dl>
      </Screen>

      {/* ③ 値段と、持ち帰りのQR */}
      <Screen step="3 / 3">
        <div>
          <p className="text-2xl font-bold leading-snug text-stone-900">{priceLabel()}</p>
          <p className="mt-1 text-base font-bold text-stone-700">{cancelShortLabel(cardLive)}</p>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{SHOW_PRICE_NOTE}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-stone-700">{SHOW_TAKEAWAY_LEAD}</p>
          <svg
            viewBox={`0 0 ${span} ${span}`}
            role="img"
            aria-label={`ご案内ページ（${SHOW_TAKEAWAY_URL}）のQRコード`}
            className="h-56 w-56 rounded-xl border border-stone-200 bg-white p-1"
            shapeRendering="crispEdges"
          >
            <rect width={span} height={span} fill="#ffffff" />
            <g transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}>
              <path d={path} fill="#1c1917" />
            </g>
          </svg>
          <p className="text-xs leading-relaxed text-stone-600">{SHOW_TAKEAWAY_COPY}</p>
          <p className="select-all break-all text-sm font-bold text-stone-900">
            {SHOW_TAKEAWAY_URL}
          </p>
        </div>

        <Link
          href="/keiri/case"
          className="inline-flex min-h-11 w-fit items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 transition hover:bg-stone-100"
        >
          ご案内ページを開く
        </Link>
      </Screen>

      <p className="px-5 py-6 text-xs leading-relaxed text-stone-500">{SHOW_OWNER_HINT}</p>
    </main>
  );
}
