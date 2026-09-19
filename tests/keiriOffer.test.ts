/**
 * 経理パッケージの「月額いくらの代わりに何を渡すか」（lib/keiri/offer.ts）のテスト。
 *
 * ★ここで守るのは3点。
 *   ① 渡すものと渡さないものが、どちらも空にならない（値段だけ上げて中身が無い状態を作らない）
 *   ② 税務の個別判断はしないと必ず書いてある（CLAUDE.md 5-2）
 *   ③ 紹介ページと特商法の表記が、同じ定義から作られている（片方だけ古くならない）
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  KEIRI_MONTHLY_CLOSE_TIMING,
  KEIRI_OFFER_ITEMS,
  KEIRI_OFFER_NOT_INCLUDED,
  KEIRI_TOP_LINES,
  keiriStartSteps,
} from "../lib/keiri/offer";
import { KEIRI_CASE_FAQ_QUESTIONS, KEIRI_FAQ, keiriCaseFaq } from "../lib/keiri/support";
import { offerSummaryForLegal, tokushohoRows } from "../lib/keiri/legal";
import { priceLabel } from "../lib/keiri/caseNumbers";

test("含まれるものは4つあり、どれも見出しと中身がある", () => {
  assert.equal(KEIRI_OFFER_ITEMS.length, 4);
  for (const o of KEIRI_OFFER_ITEMS) {
    assert.ok(o.title.length > 0, "見出しが空");
    assert.ok(o.body.length > 0, "中身が空");
    assert.ok(o.by === "お店" || o.by === "こちら");
  }
});

test("含まれるもののうち3つは、お店の作業がいらない（値上げに見合う中身）", () => {
  const ours = KEIRI_OFFER_ITEMS.filter((o) => o.by === "こちら");
  assert.equal(ours.length, 3);
  // 「毎月の締め」は値上げの根拠そのものなので、必ず含まれていること
  assert.ok(ours.some((o) => o.title.includes("毎月の締め")));
});

test("渡さないものが空でなく、税務の個別判断はしないと書いてある", () => {
  assert.ok(KEIRI_OFFER_NOT_INCLUDED.length >= 1);
  const all = KEIRI_OFFER_NOT_INCLUDED.join("／");
  assert.ok(all.includes("税務"));
  assert.ok(all.includes("判断"));
});

test("一番上の3行は「何をしてくれるか2行＋いくら1行」で、価格の行は価格の定義から作る", () => {
  assert.equal(KEIRI_TOP_LINES.length, 2);
  for (const line of KEIRI_TOP_LINES) assert.ok(line.length > 0);
  // 上の2行には金額を書き写さない（値上げのときに直し忘れないように）
  for (const line of KEIRI_TOP_LINES) assert.ok(!/\d{1,3},\d{3}円/.test(line));
  // 3行目にあたる価格の行は priceLabel() から作られる
  assert.ok(priceLabel().includes("月額"));
});

test("特商法の表記は offer.ts と同じ定義から作られる（片方だけ古くならない）", () => {
  const rows = tokushohoRows(true);
  const content = rows.find((r) => r.label === "サービスの内容");
  const timing = rows.find((r) => r.label === "サービスの提供時期");
  assert.ok(content, "サービスの内容の行が無い");
  assert.ok(timing, "サービスの提供時期の行が無い");
  assert.equal(content!.value, offerSummaryForLegal());
  assert.equal(timing!.value, KEIRI_MONTHLY_CLOSE_TIMING);
  // 内容の行には、含まれるもの4つの見出しが全部出ている
  for (const o of KEIRI_OFFER_ITEMS) assert.ok(content!.value.includes(o.title));
  // 税務の個別判断はしないことを、法定表記の中でも書いている
  assert.ok(content!.value.includes("税務"));
});

test("特商法の販売価格は、いまの価格の定義から作られる", () => {
  const rows = tokushohoRows();
  const price = rows.find((r) => r.label === "販売価格");
  assert.ok(price);
  assert.equal(price!.value, priceLabel());
});

test("カードの受付口が無いときの特商法の表記は、実際に起きることだけを書く", () => {
  // ★ 2026-09-19 実測：本番は NEXT_PUBLIC_KEIRI_PAYMENT_LINK_15000 が未設定。
  //   つまり「お申し込み時に初回分を決済」も「Stripe のカスタマーポータルから解約」も起きない。
  //   法律で出すことが決まっているページなので、ここに嘘があってはいけない。
  const rows = tokushohoRows(false);
  const get = (label: string) => rows.find((r) => r.label === label)!.value;

  assert.ok(!get("支払方法").startsWith("クレジットカード決済"));
  assert.ok(get("支払方法").includes("準備中"));
  assert.ok(!get("支払時期").includes("お申し込み時に初回分を決済"));
  assert.ok(get("支払時期").includes("お申し込みの時点ではお支払いは発生しません"));
  assert.ok(!get("解約について").includes("カスタマーポータル"));
  assert.ok(get("解約について").includes("いつでも解約できます"));
  assert.ok(!get("サービスの提供時期").includes("決済完了後"));

  // ページ全体を通して「カスタマーポータル」の文字が1つも出ない
  assert.ok(!rows.map((r) => r.value).join("").includes("カスタマーポータル"));

  // 渡し忘れたときも、正直なほうに倒れる
  assert.deepEqual(tokushohoRows(), tokushohoRows(false));
});

test("カードの受付口ができたら、特商法の表記は自動でカードの書き方に戻る", () => {
  const rows = tokushohoRows(true);
  const get = (label: string) => rows.find((r) => r.label === label)!.value;
  assert.equal(get("支払方法"), "クレジットカード決済（Stripe）");
  assert.ok(get("支払時期").includes("お申し込み時に初回分を決済"));
  assert.ok(get("解約について").includes("カスタマーポータル"));
  assert.equal(get("サービスの提供時期"), KEIRI_MONTHLY_CLOSE_TIMING);
});

test("会社の情報・販売価格は、カードが使えるかどうかで変わらない", () => {
  const off = tokushohoRows(false);
  const on = tokushohoRows(true);
  for (const label of ["販売事業者名", "所在地", "電話番号", "メールアドレス", "販売価格", "サービスの内容"]) {
    assert.equal(
      off.find((r) => r.label === label)!.value,
      on.find((r) => r.label === label)!.value,
      label + " が食い違っている",
    );
  }
});

// ============================================================
// 申し込んでから、使い始めるまで（2026-09-20 追加・kp110）
// ============================================================
/**
 * ★ここで守るのは、紹介ページが「守れない約束」をしないこと。
 *   とくに、初回設定とお申し込みの「入れるのは3つだけ」は、
 *   画面の入力欄が増えた瞬間に嘘になる。数字を書いた以上は固定する。
 */
test("申し込んでからの流れは4段階で、どれも見出しと中身がある", () => {
  const steps = keiriStartSteps(false);
  assert.equal(steps.length, 4);
  assert.deepEqual(
    steps.map((s) => s.n),
    ["1", "2", "3", "4"],
  );
  for (const s of steps) {
    assert.ok(s.title.length > 0, "見出しが空");
    assert.ok(s.body.length > 0, "中身が空");
  }
});

test("カードで払えないときは、②が「担当からご案内」になる（起きないことを書かない）", () => {
  const off = keiriStartSteps(false)[1];
  assert.ok(!off.body.includes("カード"), "カードで払えないのにカードと書いている");
  assert.ok(off.body.includes("1営業日以内"), "いつ連絡が来るかが書かれていない");

  const on = keiriStartSteps(true)[1];
  assert.ok(on.body.includes("カード"), "カードで払えるのにカードと書いていない");
});

test("初回設定は3つだけ、と書いてある（welcome の入力欄が増えたら直すこと）", () => {
  const setup = keiriStartSteps(false)[2];
  assert.ok(setup.body.includes("3つだけ"), "初回設定が3つだけだと書かれていない");
  assert.ok(setup.body.includes("書類はありません"), "用意する書類が無いことが書かれていない");
});

test("お申し込みで必ず入れるのは3つ、と書いてある（apply の required と合わせる）", () => {
  const apply = keiriStartSteps(false)[0];
  assert.ok(apply.body.includes("3つだけ"), "必ず入れるのが3つだと書かれていない");
  assert.ok(
    apply.body.includes("お支払いは発生しません"),
    "この画面でお金が動かないことが書かれていない",
  );
});

test("紹介ページに出す質問は、よくある質問に実在する（片方だけ消えると黙って減る）", () => {
  assert.equal(KEIRI_CASE_FAQ_QUESTIONS.length, 4);
  for (const q of KEIRI_CASE_FAQ_QUESTIONS) {
    assert.ok(
      KEIRI_FAQ.some((f) => f.q === q),
      "よくある質問に無い質問を紹介ページに出そうとしている: " + q,
    );
  }
  assert.equal(keiriCaseFaq().length, KEIRI_CASE_FAQ_QUESTIONS.length);
});

test("紹介ページの答えは、よくある質問の文をそのまま使う（2か所に書かない）", () => {
  for (const f of keiriCaseFaq()) {
    const src = KEIRI_FAQ.find((x) => x.q === f.q)!;
    assert.equal(f.a, src.a, "答えの文が食い違っている: " + f.q);
  }
});
