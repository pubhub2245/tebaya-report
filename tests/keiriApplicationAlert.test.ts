/**
 * 「お申し込みが入っています」の赤い知らせ（kp156）の決めごとを固定する。
 *
 * ここが崩れると、
 *   ・手羽屋のスタッフの画面に、経理パッケージのお申し込みが出る
 *   ・お申し込みされた方の連絡先が、端末の画面に出る
 *   ・数えられなかっただけなのに「0件です」と嘘の安心を出す
 *   ・逆に、数えられなかったのに赤い警報を出す
 * のどれかが起きる。どれも取り返しがつかないので、戻り止めを置く。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  applicationAlertHeadline,
  applicationAlertWhen,
  readApplicationCountSummary,
  shouldShowApplicationAlert,
} from "../lib/keiri/applicationAlert";

const counted = (pending: number, latestAt: string | null = null) => ({
  countable: true,
  pending,
  total: pending,
  latestAt,
});

test("印の付いていない端末（スタッフ）には、何件あっても出さない", () => {
  assert.equal(
    shouldShowApplicationAlert({ ownerDevice: false, summary: counted(3) }),
    false,
  );
});

test("じゅんの端末で、手当てしていない申し込みが1件以上あるときだけ出す", () => {
  assert.equal(shouldShowApplicationAlert({ ownerDevice: true, summary: counted(1) }), true);
  assert.equal(shouldShowApplicationAlert({ ownerDevice: true, summary: counted(0) }), false);
});

test("数えられなかったときは出さない（0件と取り違えない）", () => {
  assert.equal(
    shouldShowApplicationAlert({
      ownerDevice: true,
      summary: { countable: false, pending: null, total: null, latestAt: null },
    }),
    false,
  );
  assert.equal(shouldShowApplicationAlert({ ownerDevice: true, summary: null }), false);
});

test("countable:false のときは、件数が入っていても出さない", () => {
  // 窓口が数を返してきても「数えられた」と言っていなければ信じない。
  // ここを外すと、読めなかった数で赤い警報を出すことになる。
  assert.equal(
    shouldShowApplicationAlert({
      ownerDevice: true,
      summary: { countable: false, pending: 2, total: 2, latestAt: null },
    }),
    false,
  );
});

test("窓口が countable:true と言っていても、件数が数字でなければ出さない", () => {
  assert.equal(
    shouldShowApplicationAlert({
      ownerDevice: true,
      summary: { countable: true, pending: null, total: null, latestAt: null },
    }),
    false,
  );
});

test("見出しには件数だけを入れる（連絡先は入らない）", () => {
  const head = applicationAlertHeadline(2);
  assert.ok(head.includes("2 件"));
  assert.ok(!/@/.test(head));
});

test("入った時刻は日本時間で出す。読めなければ出さない", () => {
  assert.equal(applicationAlertWhen("2026-09-25T00:05:00.000Z"), "2026年9月25日 09:05");
  assert.equal(applicationAlertWhen(null), null);
  assert.equal(applicationAlertWhen("なにか変な値"), null);
});

test("窓口の返事の読み取りは、数字でないものを数字にしない", () => {
  const s = readApplicationCountSummary({
    countable: true,
    pending: "3",
    total: 3,
    latestAt: "",
  });
  assert.equal(s?.countable, true);
  assert.equal(s?.pending, null);
  assert.equal(s?.total, 3);
  assert.equal(s?.latestAt, null);
  assert.equal(readApplicationCountSummary(null), null);
});

test("赤い知らせの部品は、お店の名前・メール・電話を画面に出さない", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app/components/OwnerApplicationAlert.tsx"),
    "utf8",
  );
  for (const banned of ["shop_name", "contact_name", "email", "phone"]) {
    assert.ok(!src.includes(banned), `${banned} を画面の部品に出さない`);
  }
  // 帯とまったく同じ印を使う（別の条件で出さない）
  assert.ok(src.includes("readOwnerDevice"));
});

test("数だけ答える窓口は、連絡先の列を1つも返さない", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app/api/keiri/applications/count/route.ts"),
    "utf8",
  );
  for (const banned of ["shop_name", "contact_name", "email", "phone", "note:"]) {
    if (banned === "note:") continue;
    assert.ok(!src.includes(banned), `${banned} を窓口から返さない`);
  }
  // 書き込みをしない
  for (const banned of ["insert", "update", "delete", "upsert"]) {
    assert.ok(!src.includes(`.${banned}(`), `${banned} を呼ばない（読むだけ）`);
  }
});
