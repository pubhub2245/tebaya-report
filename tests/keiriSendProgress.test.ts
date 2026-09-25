/**
 * 「送る1枚」の控え（kp171）の決めごとを固定する。
 *
 * 崩れると起きること：
 *   ・控えが帯（印が要る道）に戻り、印を付けていない じゅんには控えが1つも残らない
 *   ・誰でも開ける住所に、送り先8軒の呼び名や連絡先が出る
 *   ・帯の控えと数が食い違い、どちらが本当か分からなくなる
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OUTREACH_SENT_KEY,
  OUTREACH_SHOPS,
  markNextSent,
  nextShop,
  sentProgress,
  undoLastSent,
} from "../lib/keiri/outreach";

const page = readFileSync(
  new URL("../app/keiri/send/page.tsx", import.meta.url),
  "utf8",
);
const progress = readFileSync(
  new URL("../app/keiri/send/SendProgress.tsx", import.meta.url),
  "utf8",
);

test("送った軒数の控えが、送る1枚そのものに載っている", () => {
  assert.ok(page.includes("<SendProgress />"), "1枚に控えの部品が載っていること");
  assert.ok(
    progress.includes("送りました（1軒）"),
    "押すところ（送りました）があること",
  );
});

/**
 * ここが今回いちばん大事な戻り止め。
 * この1枚は「印（kp150）が要らない道」として作ったので、
 * 控えの付け方を帯（＝印が要る道）に案内し直してはいけない。
 */
test("控えの付け方を「ホームの帯」に案内し直していない", () => {
  assert.ok(
    !page.includes("ホームに出る帯（管理者の合言葉を入れた端末にだけ出ます）で付けられます"),
    "印の要る道へ案内し直していないこと",
  );
  assert.ok(
    !progress.includes("管理者の合言葉"),
    "控えの部品が合言葉を求めていないこと",
  );
});

test("控えは帯とまったく同じ1か所に置く（数が食い違わない）", () => {
  assert.ok(
    progress.includes("OUTREACH_SENT_KEY"),
    "帯と同じ置き場を使っていること（別に持たない）",
  );
  assert.equal(OUTREACH_SENT_KEY, "keiri-outreach-sent.v1");
});

test("誰でも開ける住所なので、お店の呼び名・連絡先・値段は出さない", () => {
  for (const shop of OUTREACH_SHOPS) {
    assert.ok(
      !progress.includes(shop.label),
      `控えにお店の呼び名「${shop.label}」を出さないこと`,
    );
  }
  assert.ok(!progress.includes("15,000"), "控えに値段を出さないこと");
  // import の "@/lib/..." に当たらないよう、本物のメールの形だけを見る
  assert.ok(
    !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(progress),
    "控えに連絡先（メール）を出さないこと",
  );
});

test("控えは倉庫に送らず、この端末の中だけに残す", () => {
  assert.ok(!progress.includes("fetch("), "外へ送らないこと");
  assert.ok(!progress.includes("supabase"), "倉庫を読み書きしないこと");
});

test("数え方：送るたびに1軒ずつ増え、8軒で止まる", () => {
  let sent: string[] = [];
  assert.deepEqual(sentProgress(sent), { done: 0, total: 8, remaining: 8 });

  for (let i = 1; i <= OUTREACH_SHOPS.length; i += 1) {
    sent = markNextSent(sent);
    assert.equal(sentProgress(sent).done, i, `${i}軒目で ${i} になること`);
  }
  // 全部送りおわったら、それ以上は増えない
  const full = markNextSent(sent);
  assert.equal(sentProgress(full).done, OUTREACH_SHOPS.length);
  assert.equal(nextShop(full), null);
});

test("印を足す順番は、帯が名指しするのと同じ1軒", () => {
  const sent: string[] = [];
  const named = nextShop(sent);
  assert.ok(named, "まだ送っていなければ帯は1軒を名指しする");
  assert.deepEqual(markNextSent(sent), [named!.id]);
});

test("押し間違えは1つ取り消せる（0軒より減らない）", () => {
  let sent = markNextSent(markNextSent([]));
  assert.equal(sentProgress(sent).done, 2);
  sent = undoLastSent(sent);
  assert.equal(sentProgress(sent).done, 1);
  sent = undoLastSent(sent);
  assert.equal(sentProgress(sent).done, 0);
  assert.deepEqual(undoLastSent(sent), []);
});
