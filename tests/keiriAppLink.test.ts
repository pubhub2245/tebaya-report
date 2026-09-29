/**
 * 毎日ひらかれている日報アプリから、経理パッケージのご案内へ行く道を固定する（kp200）。
 *
 * ここが崩れると、次のどれかが静かに起きる。
 *   ・毎日開かれている画面から、ご案内へ行く道が（また）消える
 *   ・押したのに「読むところ」に着いて、入力欄まで自分で探すことになる
 *   ・どの道から来た人が申し込んだのか数え分けられなくなる（効いたか分からない）
 *   ・日報アプリの画面に金額が直書きされ、値段を変えたときに食い違う
 *   ・日報の入力の途中に割り込んで、現場の手を止める
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  APP_CASE_HREF,
  APP_FROM_KEY,
  APP_LINK_ACTION,
  APP_LINK_LABEL,
  APP_SHOW_HREF,
  APP_SHOW_LABEL,
  appLinkNote,
} from "../lib/keiri/appLink";
import { CARD_FROM_KEY } from "../lib/keiri/card";
import { TRIAL_FROM_KEY } from "../lib/keiri/trial";
import { cleanCampaign } from "../lib/siteVisits";
import { keiriApplyCampaign } from "../lib/keiri/apply";

const home = readFileSync("app/page.tsx", "utf8");
const admin = readFileSync("app/admin/page.tsx", "utf8");
const link = readFileSync("app/components/KeiriCaseLink.tsx", "utf8");

/** 画面に見えている所だけ（説明書きのコメントは読み手には見えないので外す） */
const visible = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("①行き先は、ご案内ページの入力欄そのもの（読むところではない）", () => {
  assert.equal(APP_CASE_HREF, `/keiri/case?from=${APP_FROM_KEY}#apply`);
  assert.ok(APP_CASE_HREF.endsWith("#apply"));
  // 同じサイトの中なので、住所は相対のまま（http… を書かない）
  assert.ok(APP_CASE_HREF.startsWith("/keiri/case?"));
});

test("②日報アプリから来た人を数え分けられる合言葉が付いている", () => {
  assert.equal(APP_FROM_KEY, "app");
  // 紙（card）・お試し（trial）と混ざらない
  assert.notEqual(APP_FROM_KEY, CARD_FROM_KEY);
  assert.notEqual(APP_FROM_KEY, TRIAL_FROM_KEY);
  // 受け取り側（訪問の記録・お申し込みの控え）が、そのまま1つとして数えられる
  assert.equal(cleanCampaign(APP_FROM_KEY), APP_FROM_KEY);
  assert.equal(keiriApplyCampaign(APP_FROM_KEY), APP_FROM_KEY);
  // 末尾に余分な記号が混じっても同じ1つに揃う（kp195 と同じ掃除を通る）
  assert.equal(keiriApplyCampaign("app`"), APP_FROM_KEY);
});

test("③毎日ひらかれている2画面（ホーム・管理者ページ）の両方に道がある", () => {
  assert.ok(home.includes("<KeiriCaseLink />"), "ホームに道がありません");
  assert.ok(admin.includes("<KeiriCaseLink />"), "管理者ページに道がありません");
  // 古い「読むところに着くだけ」のリンクは残っていない
  assert.equal(visible(home).includes('href="/keiri/case"'), false);
});

test("④金額は画面に直書きしない（値段は caseNumbers.ts からだけ読む）", () => {
  assert.equal(/15,?000/.test(APP_LINK_LABEL + APP_LINK_ACTION), false);
  assert.ok(link.includes("priceLabel"));
  assert.equal(/15,?000/.test(visible(link)), false);
  assert.equal(/15,?000/.test(visible(home)), false);
});

test("⑤『この画面でお支払いは発生しません』を必ず添える", () => {
  assert.ok(appLinkNote("月額◯円").includes("お支払いは発生しません"));
  assert.ok(link.includes("appLinkNote"));
});

test("⑥出店先でその場で見せる1枚への道も隣にある（送らない・返事を待たない）", () => {
  assert.equal(APP_SHOW_HREF, "/keiri/show");
  assert.ok(APP_SHOW_LABEL.length > 0);
  assert.ok(link.includes("APP_SHOW_HREF"));
});

test("⑦日報の入力を邪魔しない（画面に貼り付く帯にしない）", () => {
  // 貼り付く帯（fixed）にしていないこと。ここが本文や入力欄をふさぐと現場が止まる
  assert.equal(/fixed/.test(link), false);
  // 置くのはいちばん下だけ。ホームでは footer の中、管理者ページでは最後の section
  assert.ok(
    home.indexOf("<KeiriCaseLink />") > home.indexOf("<footer"),
    "ホームでは画面のいちばん下（footer）に置く",
  );
  assert.ok(
    admin.indexOf("<KeiriCaseLink />") > admin.indexOf("EditReportModal"),
    "管理者ページでは日報の一覧より後ろに置く",
  );
});

test("⑧押せる所は指の幅（44px）以上ある＝余白は押す所の中に置く", () => {
  // 最初の版は文字の高さ（18px）しか押せなかった（本物の390×844で実測）。
  // 余白（py-3）が押す所（a）の外に出ると、また18pxに戻る。
  const anchors = link.match(/className="block[^"]*"/g) ?? [];
  assert.ok(anchors.length >= 2, "押す所が2つ（ご案内・見せる1枚）ありません");
  for (const a of anchors) {
    assert.ok(/py-3/.test(a), `押す所に上下の余白がありません：${a}`);
  }
  // 「見せる1枚」は字が小さく、余白だけでは 41px にしかならなかった（実測）。
  // 高さの下限（44px）を付けて指の幅を確保している
  assert.ok(/min-h-\[44px\]/.test(link), "小さい方の押す所に高さの下限がありません");
});

test("⑨ただのリンクである（日報・売上のデータを読まない）", () => {
  for (const mark of ["supabase", "useEffect", "fetch("]) {
    assert.equal(link.includes(mark), false, `${mark} を使っていません`);
  }
});
