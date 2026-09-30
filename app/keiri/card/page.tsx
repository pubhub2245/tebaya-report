import type { Metadata } from "next";

import { priceSummaryLine, cardCheckoutLive } from "@/lib/keiri/caseNumbers";
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from "@/lib/keiri/qr";
import PrintButton from "./PrintButton";
import {
  CARD_AUDIENCE,
  CARD_HEADLINE,
  CARD_OWNER_HINT,
  CARD_PRINT_NOTE,
  CARD_QR_LEAD,
  CARD_SIGNER,
  CARD_SUBLINE,
  CARD_TAKEAWAY_URL,
} from "@/lib/keiri/card";

/**
 * 出店の日に「置くだけ」で済む紙1枚（kp193）。
 *
 * ■ 何のための1枚か
 *   /keiri/show（その場で見せる1枚）は**立ち話になったときだけ**届きます。
 *   こちらは紙です。レジ横に1枚置いておけば、声をかけられなくても
 *   その日その場にいる人の目に入ります。返事待ちもありません。
 *
 * ■ 紙の形（家庭用プリンタでもコンビニでも、そのまま刷って切れる形）
 *   A4（210×297mm）1枚に、A6（105×148.5mm）の札が**2列×2段＝4枚**ちょうど並びます。
 *   切る所には薄い線を入れてあります（トンボではなく、見て切るための線）。
 *   4枚はまったく同じ中身です（同じ紙を4人に渡せる）。
 *
 * ■ 紙に載せるのは5つだけ
 *   ①何ができるか ②誰がやるか ③値段（月額・初期費用なし・いつでも解約）
 *   ④QR（ご案内ページ・`?from=card` 付き） ⑤差し出し主の名前と連絡先
 *   **手羽屋の売上・出店先・スタッフの名前は1文字も載せません。**
 *   置いた紙は誰の手にも渡るので、手の内が残る紙にしません。
 *
 * ■ 作りの決めごと
 *   ・**JavaScript が動かなくても、紙の中身は全部出る。**
 *     画面送りも折りたたみも使っていません（kp189・kp191 と同じ考え方）
 *   ・QRは**この中で組み立てる**（lib/keiri/qr.ts）。外の絵づくりサービスに
 *     お願いしないので、通信が細い出店先でも必ず出て、住所も外に渡りません
 *   ・行き先は `?from=card` 付きの1本だけ。紙から来た訪問だけを後から数え分けます
 *   ・検索には出さない（noindex）。sitemap にも載せない
 *   ・値段と金額は lib/ からだけ読む。この画面に直書きしない
 *
 * 文言は lib/keiri/card.ts が唯一の正。
 */

export const metadata: Metadata = {
  title: "出店の日に置く紙1枚（印刷用）",
  robots: { index: false, follow: false },
};

/**
 * 紙の寸法だけは Tailwind では書けない（mm と @page が要る）ので、
 * ここに1か所だけ置く。色は黒1色で、インクの節約にも倒している。
 */
const PRINT_CSS = `
.sheet {
  width: 210mm;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 105mm 105mm;
  grid-template-rows: 148.5mm 148.5mm;
  background: #ffffff;
}
.cell {
  box-sizing: border-box;
  width: 105mm;
  height: 148.5mm;
  padding: 10mm 8mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #000000;
  overflow: hidden;
}
/*
 * 切る所の薄い線（トンボではなく、見て切るための線）。
 * A6はA4のちょうど4分の1なので、**切るのはまん中の十字だけ**です。
 * 紙のふちに線を引くと、ふちまで刷れないプリンタで線だけ欠けて見えるので引きません。
 */
.cell-cut-right { border-right: 0.2mm dashed #b8b8b8; }
.cell-cut-bottom { border-bottom: 0.2mm dashed #b8b8b8; }
.cell-qr { width: 34mm; height: 34mm; }
@media screen {
  .sheet { box-shadow: 0 1px 12px rgba(0,0,0,.18); margin: 0 auto; }
}
@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
  .no-print { display: none !important; }
  /*
   * 画面用の余白と地の色を、紙のときだけ全部落とす。
   * ここを落とさないと、上下の余白（画面では見やすさのための 24px）が
   * A4の 297mm に足されて **2枚目の白紙が必ず出る**（2026-09-30 kp204 で実測）。
   * 紙は A4 ちょうど1枚でなければならない（4枚ぶんを切って使うため）。
   */
  .card-page { padding: 0 !important; margin: 0 !important; background: #ffffff !important; }
  .sheet { box-shadow: none; margin: 0; }
}
`;

/** 札1枚ぶん（4枚まったく同じ中身。切る線の向きだけが違う） */
function Card({
  qrPath,
  qrSpan,
  cut,
}: {
  qrPath: string;
  qrSpan: number;
  /** まん中の十字のうち、この札が受け持つ線 */
  cut: ("right" | "bottom")[];
}) {
  const cutClass = cut.map((side) => `cell-cut-${side}`).join(" ");
  return (
    <div className={`cell ${cutClass}`.trim()}>
      <div>
        <p style={{ fontSize: "3.4mm", fontWeight: 700, lineHeight: 1.5, margin: 0 }}>
          {CARD_AUDIENCE}
        </p>
        <p style={{ fontSize: "5.2mm", fontWeight: 700, lineHeight: 1.45, margin: "2.5mm 0 0" }}>
          {CARD_HEADLINE}
        </p>
        <p style={{ fontSize: "3.6mm", lineHeight: 1.6, margin: "3mm 0 0" }}>{CARD_SUBLINE}</p>
        <p style={{ fontSize: "3.6mm", fontWeight: 700, lineHeight: 1.6, margin: "4mm 0 0" }}>
          {priceSummaryLine(cardCheckoutLive())}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: "4mm" }}>
        <svg
          viewBox={`0 0 ${qrSpan} ${qrSpan}`}
          role="img"
          aria-label={`ご案内ページ（${CARD_TAKEAWAY_URL}）のQRコード`}
          className="cell-qr"
          shapeRendering="crispEdges"
        >
          <rect width={qrSpan} height={qrSpan} fill="#ffffff" />
          <g transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}>
            <path d={qrPath} fill="#000000" />
          </g>
        </svg>
        <div style={{ fontSize: "2.9mm", lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>{CARD_QR_LEAD}</p>
          <p style={{ margin: "1mm 0 0", wordBreak: "break-all" }}>{CARD_TAKEAWAY_URL}</p>
        </div>
      </div>

      <div style={{ borderTop: "0.2mm solid #000000", paddingTop: "3mm", fontSize: "3.1mm", lineHeight: 1.6 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{CARD_SIGNER.name}</p>
        <p style={{ margin: "0.5mm 0 0" }}>
          {CARD_SIGNER.tel}　{CARD_SIGNER.email}
        </p>
      </div>
    </div>
  );
}

export default function KeiriCardPage() {
  // QRは番地から組み立てる（画像ファイルも外への通信も無し）
  const matrix = qrMatrix(CARD_TAKEAWAY_URL);
  const qrPath = qrSvgPath(matrix);
  const qrSpan = matrix.length + QR_QUIET_ZONE * 2;

  return (
    <main className="card-page bg-stone-100 py-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* じゅん向けの使い方。紙には刷られない */}
      <section className="no-print mx-auto mb-6 max-w-[210mm] px-4">
        <h1 className="text-xl font-bold text-stone-900">出店の日に置く紙（A4に4枚）</h1>
        <div className="mt-4">
          <PrintButton />
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-stone-700">
          {CARD_OWNER_HINT.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden>・</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">{CARD_PRINT_NOTE}</p>
      </section>

      {/* ここから下が紙に刷られるぶん */}
      <div className="sheet">
        <Card qrPath={qrPath} qrSpan={qrSpan} cut={["right", "bottom"]} />
        <Card qrPath={qrPath} qrSpan={qrSpan} cut={["bottom"]} />
        <Card qrPath={qrPath} qrSpan={qrSpan} cut={["right"]} />
        <Card qrPath={qrPath} qrSpan={qrSpan} cut={[]} />
      </div>
    </main>
  );
}
