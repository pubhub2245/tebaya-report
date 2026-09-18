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
} from "../lib/keiri/offer";
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
  const rows = tokushohoRows();
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
