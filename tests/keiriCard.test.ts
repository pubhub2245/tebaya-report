/**
 * 出店の日に置く紙1枚（/keiri/card・kp193）の決めごとを固定する。
 *
 * この紙は **置いたら誰の手にも渡る** ものなので、崩れると次のどれかが起きる。
 *   ・手羽屋の売上・出店先・スタッフの名前が、知らない人の手元に紙で残る
 *   ・QRが読めないページを指して、その場が終わる
 *   ・「紙から来た人」と「それ以外」を数え分けられず、効いたか分からなくなる
 *   ・A4に4枚ちょうど並ばず、切れない・刷れない紙になる
 *   ・検索結果に印刷用の紙が出てしまう
 *
 * 読み戻し（作ったQRがちょうど元の住所に戻るか）は tests/keiriQr.test.ts の①で見る。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEIRI_PRICE } from "../lib/keiri/caseNumbers";
import { KEIRI_COMPANY } from "../lib/keiri/legal";
import { OUTREACH_LINK } from "../lib/keiri/outreach";
// 送り先の呼び名（クレープ…）は検算からだけ読む。配られる側からは取り込まない（kp172）
import { OUTREACH_SHOPS } from "../lib/keiri/outreachShopLabels";
import {
  CARD_AUDIENCE,
  CARD_FROM_KEY,
  CARD_HEADLINE,
  CARD_OWNER_LINE,
  CARD_PRINT_BUTTON_LABEL,
  CARD_PRINT_FALLBACK,
  CARD_SIGNER,
  CARD_SUBLINE,
  CARD_TAKEAWAY_URL,
  CARD_TAKEAWAY_URL_SHORT,
} from "../lib/keiri/card";
import { priceSummaryLine } from "../lib/keiri/caseNumbers";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const page = readFileSync(new URL("../app/keiri/card/page.tsx", import.meta.url), "utf8");
const beacon = readFileSync(new URL("../components/VisitBeacon.tsx", import.meta.url), "utf8");
const sendPage = readFileSync(new URL("../app/keiri/send/page.tsx", import.meta.url), "utf8");
const printButton = readFileSync(
  new URL("../app/keiri/card/PrintButton.tsx", import.meta.url),
  "utf8",
);

test("検索には出さない（noindex）", () => {
  assert.match(page, /robots:\s*\{\s*index:\s*false/, "noindex が付いていない");
});

test("sitemap（検索エンジンに知らせる一覧）には載せない", () => {
  assert.ok(
    !KEIRI_PUBLIC_PAGES.some((p) => p.path === "/keiri/card"),
    "外向きの一覧に /keiri/card が入っている（検索と訪問の数に混ざる）",
  );
});

test("QRの行き先はご案内ページ1本＋合言葉（from=card）だけ", () => {
  assert.equal(
    CARD_TAKEAWAY_URL,
    `${OUTREACH_LINK}?from=${CARD_FROM_KEY}`,
    "行き先の組み立て方が変わっている",
  );
  assert.match(
    CARD_TAKEAWAY_URL,
    /^https:\/\/[^/?]+\/keiri\/case\?from=card$/,
    "行き先の形が違う（読めないページを指すおそれ）",
  );
});

test("紙から来た訪問を数え分けられる（合言葉 from を受け取る作りになっている）", () => {
  assert.ok(
    beacon.includes('params.get("from")'),
    "訪問を数える部品が from を見ていない（紙から来た人を数え分けられない）",
  );
  assert.ok(
    beacon.includes('params.get("utm_campaign")'),
    "今までの utm_campaign を見なくなっている（前からの数え方が壊れる）",
  );
});

test("手羽屋の中身（売上・出店先・スタッフ名）は1文字も紙に載せない", () => {
  const forbidden = [
    "getCaseStats", // 日報から出す数字そのもの
    "getCaseUsage",
    "salesMan",
    "daily_reports",
    "locations",
    "イデ",
    "かずき",
    "なぎさ",
    "ながやま",
    "PASIO",
  ];
  for (const word of forbidden) {
    assert.ok(!page.includes(word), `紙に載ってはいけないものが入っている：${word}`);
  }
});

test("送り先のお店の呼び名は1つも出さない", () => {
  for (const shop of OUTREACH_SHOPS) {
    assert.ok(!page.includes(shop.label), `お店の呼び名が出ている：${shop.label}`);
  }
});

test("値段は lib からだけ出す（紙に金額を直書きしない）", () => {
  assert.ok(page.includes("priceSummaryLine("), "値段を lib から出していない");
  assert.ok(
    !page.includes(String(KEIRI_PRICE.monthlyYenTaxIncluded)),
    "画面に金額が直書きされている",
  );
  assert.ok(!/15,000/.test(page), "画面に金額が直書きされている");
});

test("差し出し主の名前と連絡先が、紙に必ず載る", () => {
  assert.match(CARD_SIGNER.name, /川畑/, "本人の名前が入っていない");
  assert.equal(CARD_SIGNER.tel, KEIRI_COMPANY.tel, "電話番号が会社の控えと違う");
  assert.equal(CARD_SIGNER.email, KEIRI_COMPANY.email, "メールが会社の控えと違う");
  assert.ok(page.includes("CARD_SIGNER.tel"), "紙に連絡先を出していない");
});

test("載せるのは6つだけ（言葉は lib から。紙に文章を直書きしない）", () => {
  for (const key of [
    "CARD_AUDIENCE",
    "CARD_HEADLINE",
    "CARD_SUBLINE",
    "CARD_OWNER_LINE",
    "CARD_QR_LEAD",
    "CARD_TAKEAWAY_URL",
    "CARD_TAKEAWAY_URL_SHORT",
  ]) {
    assert.ok(page.includes(key), `${key} を lib から出していない`);
  }
  // 数えられない言い切りを紙に書かない
  for (const word of ["最強", "必ず儲かる", "すぐ増え", "分で終わ"]) {
    assert.ok(
      !CARD_HEADLINE.includes(word) && !CARD_SUBLINE.includes(word),
      `数えられない言い切りが入っている：${word}`,
    );
  }
});

test("A4（210×297mm）に A6 が2列×2段でちょうど並び、切る線が入っている", () => {
  assert.ok(page.includes("width: 210mm"), "紙の横幅がA4でない");
  assert.ok(page.includes("grid-template-columns: 105mm 105mm"), "横に2枚並んでいない");
  assert.ok(page.includes("grid-template-rows: 148.5mm 148.5mm"), "縦に2枚並んでいない");
  assert.ok(page.includes("@page { size: A4; margin: 0; }"), "印刷の用紙がA4に決まっていない");
  assert.match(page, /border-right:\s*0\.2mm dashed/, "切る所の線が入っていない");
  // 札は4枚ちょうど
  const cards = page.match(/<Card qrPath=\{qrPath\} qrSpan=\{qrSpan\} cut=\{\[[^\]]*\]\} \/>/g) ?? [];
  assert.equal(cards.length, 4, `A4に並ぶ札が4枚でない（${cards.length}枚）`);
});

test("JavaScript が動かなくても紙の中身は全部出る（折りたたみも画面送りも使わない）", () => {
  assert.ok(!page.includes('"use client"'), "画面側で組み立てる作りになっている");
  assert.ok(!page.includes("<details"), "折りたたみで中身が隠れている");
  assert.ok(!page.includes("useState"), "画面側の状態で中身が出たり消えたりする");
});

test("QRは自分で組み立てる（外の絵づくりサービスに頼まない）", () => {
  assert.ok(page.includes("qrMatrix("), "QRを自分で組み立てていない");
  assert.ok(!/api\.qrserver|chart\.googleapis|qrcode\.show/.test(page), "外のQR作成先を呼んでいる");
});

test("じゅんが探さずに見つけられる（送る1枚から1本だけ入口がある）", () => {
  assert.ok(
    sendPage.includes('href="/keiri/card"'),
    "じゅんが毎回開く1枚（/keiri/send）から、印刷用の紙へ行けない",
  );
});

/* ───────── 2026-09-30 kp204：じゅんがその場で刷れて、渡された人が説明ゼロで読める ───────── */

test("渡された紙だけで4つとも分かる（どんなお店向け／何が楽になる／月額／やめられる）", () => {
  // ①どんなお店向けか（2026-09-30 kp205：業種の並びではなく出店業の困りごとで名指しする）
  assert.match(CARD_AUDIENCE, /出店/, "出店業の人に向けた紙だと分かる言葉が入っていない");
  // ②何が楽になるか
  assert.ok(CARD_HEADLINE.length > 0 && CARD_SUBLINE.length > 0, "何が楽になるかが書いていない");
  // ③④値段とやめられること（言葉は値段の出どころ1本からだけ出す）
  const price = priceSummaryLine(false);
  assert.match(price, /15,000円/, "紙に出る値段が月15,000円でない");
  assert.match(price, /いつでも解約/, "いつでもやめられることが紙に出ていない");
  // 4つとも「紙に刷られる側」に出ていること（画面だけの案内文に逃げていない）
  const paper = page.slice(page.indexOf("function Card("));
  for (const key of [
    "CARD_AUDIENCE",
    "CARD_HEADLINE",
    "CARD_SUBLINE",
    "CARD_OWNER_LINE",
    "priceSummaryLine(",
  ]) {
    assert.ok(paper.includes(key), `紙に刷られる側に ${key} が無い`);
  }
});

/* ───────── 2026-09-30 kp205：同じ出店仲間に渡す1枚にする ───────── */

test("いちばん上の1行が、出店業ならではの困りごとを名指ししている", () => {
  // その日ごとに売上・出店料・仕入れがバラバラ＝出店業の人だけが自分のことだと思う話
  for (const word of ["出店", "売上", "仕入れ"]) {
    assert.ok(CARD_AUDIENCE.includes(word), `困りごとの言葉が足りない：${word}`);
  }
  // 数えられない言い切り・評価語は入れない
  for (const word of ["必ず", "最強", "儲か", "劇的"]) {
    assert.ok(!CARD_AUDIENCE.includes(word), `言い切りが入っている：${word}`);
  }
});

test("「同じ出店に出ている手羽屋が自分のために作って使っている」が紙に出る", () => {
  assert.match(CARD_OWNER_LINE, /出店/, "同じ出店に出ていることが書いていない");
  assert.match(CARD_OWNER_LINE, /手羽屋/, "誰が作って使っているかが書いていない");
});

test("kp205 で足した2行にも、出してはいけないものが入っていない", () => {
  // 他店名・主催者名・手羽屋の売上・スタッフ名は1文字も出さない
  const forbidden = [
    "イデ",
    "かずき",
    "なぎさ",
    "ながやま",
    "PASIO",
    "マンガ倉庫",
    "イオンモール",
    "ニシムタ",
    "ふれあいまつり",
    "円",
  ];
  for (const word of forbidden) {
    for (const [name, line] of [
      ["いちばん上の1行", CARD_AUDIENCE],
      ["誰が作ったかの1行", CARD_OWNER_LINE],
    ] as const) {
      assert.ok(!line.includes(word), `${name}に出してはいけないものが入っている：${word}`);
    }
  }
  for (const shop of OUTREACH_SHOPS) {
    assert.ok(!CARD_AUDIENCE.includes(shop.label) && !CARD_OWNER_LINE.includes(shop.label));
  }
});

test("QRが読めない人のための短い住所が、紙に1行出る", () => {
  // `https://` と合言葉（?from=card）を外した、手で打てる形
  assert.equal(
    CARD_TAKEAWAY_URL_SHORT,
    OUTREACH_LINK.replace(/^https?:\/\//, ""),
    "短い住所の作り方が変わっている",
  );
  assert.ok(!CARD_TAKEAWAY_URL_SHORT.includes("https"), "短い住所に https が残っている");
  assert.ok(!CARD_TAKEAWAY_URL_SHORT.includes("?"), "短い住所に合言葉が残っている（打ち間違える）");
  assert.match(CARD_TAKEAWAY_URL_SHORT, /\/keiri\/case$/, "短い住所の行き先がご案内ページでない");
  const paper = page.slice(page.indexOf("function Card("));
  assert.ok(paper.includes("CARD_TAKEAWAY_URL_SHORT"), "短い住所が紙に刷られる側に無い");
});

test("QRの行き先は kp205 でも変わらない（紙から来た訪問を数え分けられる）", () => {
  assert.equal(CARD_TAKEAWAY_URL, `${OUTREACH_LINK}?from=${CARD_FROM_KEY}`);
  assert.equal(CARD_FROM_KEY, "card", "紙の合言葉が変わっている（今までの数え方が壊れる）");
});

test("じゅんがその場で刷れる（押すだけ）", () => {
  assert.ok(page.includes("<PrintButton />"), "画面に［印刷する］が無い");
  assert.ok(printButton.includes("window.print()"), "押しても印刷に回らない");
  assert.ok(printButton.includes("CARD_PRINT_BUTTON_LABEL"), "ボタンの文字を lib から出していない");
});

test("［印刷する］は紙には刷られない（案内文と同じ no-print の中にある）", () => {
  const noPrintBlock = page.slice(page.indexOf('className="no-print'), page.indexOf("</section>"));
  assert.ok(noPrintBlock.includes("<PrintButton />"), "ボタンが紙に刷られる側にある");
});

test("ボタンが効かない端末でも刷れる（逃げ道を必ず出す）", () => {
  assert.match(CARD_PRINT_FALLBACK, /Ctrl\+P/, "キーボードでの刷り方が書いていない");
  assert.ok(printButton.includes("CARD_PRINT_FALLBACK"), "逃げ道が画面に出ていない");
});

test("切る線は まん中の十字だけ（紙のふちには引かない）", () => {
  assert.ok(page.includes(".cell-cut-right"), "縦の切り線が無い");
  assert.ok(page.includes(".cell-cut-bottom"), "横の切り線が無い");
  const cuts = page.match(/cut=\{\[([^\]]*)\]\}/g) ?? [];
  assert.equal(cuts.length, 4, "札が4枚でない");
  assert.equal(
    cuts.filter((c) => c.includes("right")).length,
    2,
    "縦の切り線は左の列の2枚だけ（ふちに線が出る／十字が欠ける）",
  );
  assert.equal(
    cuts.filter((c) => c.includes("bottom")).length,
    2,
    "横の切り線は上の段の2枚だけ（ふちに線が出る／十字が欠ける）",
  );
});

test("紙は A4 ちょうど1枚に収まる（画面用の余白を紙に持ち込まない）", () => {
  assert.ok(page.includes('className="card-page'), "紙の枠に印の付いていない（余白を落とせない）");
  assert.match(
    page,
    /\.card-page \{[^}]*padding: 0 !important/,
    "印刷のとき、画面用の余白が残る（2枚目の白紙が出る）",
  );
});
