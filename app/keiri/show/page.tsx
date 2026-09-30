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
  SHOW_APPLY_HREF,
  SHOW_APPLY_LABEL,
  SHOW_AUDIENCE,
  SHOW_HANDOFF,
  SHOW_HEADLINE,
  SHOW_NUMBERS_LEAD,
  SHOW_NUMBER_LABELS,
  SHOW_OWNER_HINT,
  SHOW_PRICE_NOTE,
  SHOW_SUBLINE,
  SHOW_TAKEAWAY_COPY,
  SHOW_TAKEAWAY_LEAD,
  SHOW_TAKEAWAY_URL,
} from "@/lib/keiri/show";

/**
 * 「その場で見せる1枚」（kp191 → kp203 で作り直し）。送らない・待たない道。
 *
 * ■ 何のための1枚か
 *   出店先で顔を合わせる同業の店主に、**立ち話のあいだスマホを差し出すだけ**で
 *   中身が伝わる4画面です。送信ボタンも、相手の返事待ちもありません。
 *
 * ■ 2026-09-30（kp203）に何を直したか
 *   9/27 に出してから、この1枚は一度も開かれていませんでした（合言葉 show の記録0件）。
 *   作りを見直すと、**渡す前に「口で説明する」が要る形**になっていました。
 *     ①1画面目が いきなり手羽屋の数字で、「どんなお店向けか・いくらか」が無い
 *     ②立って腕をのばした距離（約50cm）には字が小さい
 *     ③申し込みの入力欄へ行く押し所が無く、最後の「ご案内ページを開く」は
 *       読むところの先頭に着くだけだった（合言葉も落ちていた）
 *   そこで、1画面目を**表紙（誰に・何が楽になるか・いくら）**にし、
 *   **1タップで申し込みの入力欄に着く押し所**を1画面目と最後に置き、
 *   **QRと押し所の行き先を1文字もずらさない**ようにしました。
 *
 * ■ 出すもの（これだけ）
 *   1画面目＝表紙（どんなお店向けか・何が楽になるか・いくら・押し所）
 *   2画面目＝手羽屋の**本物の先月の数字**（出店回数・売上・1回あたり）。
 *            日報から自動で出す（lib/keiri/caseStats.ts）。万円まで丸めた形だけ
 *   3画面目＝渡すのは日報とレシートの写真だけ／帳簿と通帳の用意は不要
 *   4画面目＝「いつでもやめられる」、持ち帰りのQRと住所、押し所
 *
 * ■ 出さないもの
 *   ・送り先のお店の名前・ご連絡先（誰に見せるかは手元の話）
 *   ・日報1枚ぶんの数字・経費の明細（丸めた月の合計だけ）
 *   ・利益の金額（立ち話で先に見せる必要が無く、同業に手の内を出しすぎるため）
 *
 * ■ 作りの決めごと
 *   ・**JavaScript が動かなくても4画面すべて読める。**
 *     画面送りは CSS の scroll-snap だけで、指で下に送るか、ふつうに
 *     スクロールするだけで進みます（kp189 と同じ考え方）
 *   ・**字は立って見る大きさ。**見出しは text-3xl、本文は text-lg 以上。
 *     小さい字にしてよいのは、相手に読ませない注記（いちばん下のじゅん向け）だけ
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

/**
 * 「このまま申し込む」の押し所。
 *
 * 行き先は QR（SHOW_TAKEAWAY_URL）と同じ場所で、押すと申し込みの入力欄に着きます。
 * 指で押す所なので、高さは 56px（min-h-14）取ります。
 */
function ApplyButton() {
  return (
    <Link
      href={SHOW_APPLY_HREF}
      className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-stone-900 px-5 text-lg font-bold text-white transition hover:bg-stone-700"
    >
      {SHOW_APPLY_LABEL}
    </Link>
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
      {/* ① 表紙＝どんなお店向けか・何が楽になるか・いくら（口で説明しないで済む所） */}
      <Screen step="1 / 4">
        <p className="text-lg font-bold text-stone-500">{SHOW_AUDIENCE}</p>
        <h1 className="text-3xl font-bold leading-snug text-stone-900">{SHOW_HEADLINE}</h1>
        <p className="text-xl leading-relaxed text-stone-700">{SHOW_SUBLINE}</p>
        <div className="rounded-2xl bg-stone-100 px-4 py-3">
          <p className="text-2xl font-bold leading-snug text-stone-900">{priceLabel()}</p>
          <p className="mt-1 text-lg font-bold text-stone-700">{cancelShortLabel(cardLive)}</p>
        </div>
        <ApplyButton />
      </Screen>

      {/* ② うちの先月の数字（本物） */}
      <Screen step="2 / 4">
        <p className="text-xl font-bold leading-relaxed text-stone-800">
          {SHOW_NUMBERS_LEAD}
        </p>
        <p className="text-base text-stone-500">{stats.month}・屋台「手羽屋」</p>
        <dl className="space-y-4">
          <div>
            <dt className="text-lg text-stone-500">{SHOW_NUMBER_LABELS.days}</dt>
            <dd className="text-4xl font-bold text-stone-900">{stats.days}回</dd>
          </div>
          <div>
            <dt className="text-lg text-stone-500">{SHOW_NUMBER_LABELS.sales}</dt>
            <dd className="text-4xl font-bold text-stone-900">{manYen(stats.salesMan)}</dd>
          </div>
          {averageMan !== null ? (
            <div>
              <dt className="text-lg text-stone-500">{SHOW_NUMBER_LABELS.average}</dt>
              <dd className="text-4xl font-bold text-stone-900">{manYen(averageMan)}</dd>
            </div>
          ) : null}
        </dl>
      </Screen>

      {/* ③ 渡すもの・やること */}
      <Screen step="3 / 4">
        <dl className="space-y-5">
          {SHOW_HANDOFF.map((line) => (
            <div key={line.label}>
              <dt className="text-xl font-bold text-stone-900">{line.label}</dt>
              <dd className="mt-1 text-lg leading-relaxed text-stone-700">{line.body}</dd>
            </div>
          ))}
        </dl>
      </Screen>

      {/* ④ 持ち帰りのQRと、押し所 */}
      <Screen step="4 / 4">
        <div>
          <p className="text-xl font-bold text-stone-900">{cancelShortLabel(cardLive)}</p>
          <p className="mt-2 text-lg leading-relaxed text-stone-700">{SHOW_PRICE_NOTE}</p>
        </div>

        <div className="space-y-2">
          <p className="text-lg leading-relaxed text-stone-700">{SHOW_TAKEAWAY_LEAD}</p>
          <svg
            viewBox={`0 0 ${span} ${span}`}
            role="img"
            aria-label={`ご案内ページ（${SHOW_TAKEAWAY_URL}）のQRコード`}
            className="h-52 w-52 rounded-xl border border-stone-200 bg-white p-1"
            shapeRendering="crispEdges"
          >
            <rect width={span} height={span} fill="#ffffff" />
            <g transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}>
              <path d={path} fill="#1c1917" />
            </g>
          </svg>
          <p className="text-sm leading-relaxed text-stone-600">{SHOW_TAKEAWAY_COPY}</p>
          <p className="select-all break-all text-base font-bold text-stone-900">
            {SHOW_TAKEAWAY_URL}
          </p>
        </div>

        <ApplyButton />
      </Screen>

      <p className="px-5 py-6 text-xs leading-relaxed text-stone-500">{SHOW_OWNER_HINT}</p>
    </main>
  );
}
