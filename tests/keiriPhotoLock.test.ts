/**
 * 「レシート写真の置き場を閉める」1押しの決まり（f3-4・2026-10-26）。
 *
 * ここで固定したいのは3つだけ：
 *  ① **鍵より先に閉めない**こと（先に閉めると、手羽屋のレシート写真が1枚も映らなくなる）
 *  ② **確かめてから閉める**こと（期限つきの住所で読めないなら閉めない）
 *  ③ **読めなくなったら、その場で元に戻した と正直に言う**こと（閉まったことにしない）
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  describePhotoLock,
  photoLockHeadline,
  photoLockState,
  photoLockWhy,
  type PhotoLockSteps,
} from "../lib/keiri/photoLock";

function steps(over: Partial<PhotoLockSteps> = {}): PhotoLockSteps {
  return {
    keyUsable: true,
    bucketWasPublic: true,
    sampleFound: true,
    signedBefore: true,
    closed: true,
    publicAfter: false,
    signedAfter: true,
    rolledBack: false,
    ...over,
  };
}

test("鍵が使えないあいだは『閉められます』と言わない", () => {
  assert.equal(photoLockState({ keyUsable: false, bucketPublic: true, viewWindow: true }), "nokey");
  // 窓口が通っていなければ、鍵があっても ready にしない
  assert.equal(
    photoLockState({ keyUsable: true, bucketPublic: true, viewWindow: false }),
    "unknown",
  );
  // 分からないときも ready にしない
  assert.equal(photoLockState({ keyUsable: true, bucketPublic: null, viewWindow: true }), "unknown");
});

test("閉められるとき・もう閉まっているときを言い分ける", () => {
  assert.equal(photoLockState({ keyUsable: true, bucketPublic: true, viewWindow: true }), "ready");
  assert.equal(photoLockState({ keyUsable: true, bucketPublic: false, viewWindow: true }), "locked");
  // 閉まっていれば、鍵が壊れていても「閉まっている」（置き場の設定の話なので）
  assert.equal(photoLockState({ keyUsable: false, bucketPublic: false, viewWindow: true }), "locked");
});

test("4通りとも、見出しと理由が空にならない", () => {
  for (const s of ["nokey", "ready", "locked", "unknown"] as const) {
    assert.ok(photoLockHeadline(s).length > 5, s);
    assert.ok(photoLockWhy(s).length > 5, s);
  }
});

test("確かめてから閉めたときだけ、閉まったと言う", () => {
  const ok = describePhotoLock(steps());
  assert.equal(ok.ok, true);
  assert.equal(ok.changed, true);
  assert.match(ok.said, /非公開/);
});

test("鍵が使えないときは、何もせず何も変えない", () => {
  const r = describePhotoLock(steps({ keyUsable: false }));
  assert.equal(r.ok, false);
  assert.equal(r.changed, false);
  assert.match(r.said, /鍵/);
});

test("閉める前の確かめで読めなければ、閉めない", () => {
  const r = describePhotoLock(steps({ signedBefore: false, closed: false, publicAfter: null, signedAfter: null }));
  assert.equal(r.ok, false);
  assert.equal(r.changed, false);
  assert.match(r.said, /閉めていません/);
});

test("閉めたあと読めなくなったら、元に戻した と言う（閉まったことにしない）", () => {
  const r = describePhotoLock(steps({ signedAfter: false, publicAfter: false, rolledBack: true }));
  assert.equal(r.ok, false);
  assert.equal(r.changed, false);
  assert.match(r.said, /元に戻しました/);
});

test("もう非公開なら、何もしていないと言う（成功あつかい）", () => {
  const r = describePhotoLock(steps({ bucketWasPublic: false }));
  assert.equal(r.ok, true);
  assert.equal(r.changed, false);
  assert.match(r.said, /もう非公開/);
});

test("設定を読めなかったときは触らない", () => {
  const r = describePhotoLock(steps({ bucketWasPublic: null }));
  assert.equal(r.ok, false);
  assert.equal(r.changed, false);
  assert.match(r.said, /読めなかった/);
});

test("写真が1枚も無いときは、確かめを省いたと正直に書く", () => {
  const r = describePhotoLock(steps({ sampleFound: false, signedBefore: null, signedAfter: null }));
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.match(r.said, /写真が1枚も無い/);
});

test("閉める操作が通らなければ、設定は変わっていないと言う", () => {
  const r = describePhotoLock(steps({ closed: false, publicAfter: null, signedAfter: null }));
  assert.equal(r.ok, false);
  assert.equal(r.changed, false);
  assert.match(r.said, /通りませんでした/);
});

test("閉めたのに非公開を確かめられなければ、合格にしない", () => {
  const r = describePhotoLock(steps({ publicAfter: null }));
  assert.equal(r.ok, false);
  assert.match(r.said, /確かめられませんでした/);
});

/* ------------------------------------------------------------------ *
 *  2026-10-28 追加（f3-4）：毎日の処理に相乗りさせる門
 *
 *  置き場を閉められるのは、サーバー側の鍵が直ったあとです。その鍵を直すのも
 *  じゅんの1分なので、これまでは「鍵を直す」→「もう一度ひらいてボタンを押す」で
 *  じゅんの手が2回 要りました。毎日の処理の最後に相乗りさせると、
 *  鍵が直った次の晩にこちら側で閉まります（じゅんの手は1回だけ）。
 *
 *  守ること：
 *    ① 鍵が使えないときは、たたきにも行かない（毎晩むだに通信しない）
 *    ② 時間がのこっていなければ何もしない（本来の集計とバックアップを道連れにしない）
 * ------------------------------------------------------------------ */
import { PHOTO_LOCK_MIN_BUDGET_MS, shouldRunPhotoLock } from "../lib/keiri/photoLock";

test("鍵が使えないときは、閉めに行かない（理由を言う）", () => {
  const g = shouldRunPhotoLock({ keyUsable: false, budgetMs: 60_000 });
  assert.equal(g.run, false);
  assert.match(g.skipped!, /鍵/);
});

test("時間がのこっていなければ見送る（明日また見る）", () => {
  const g = shouldRunPhotoLock({
    keyUsable: true,
    budgetMs: PHOTO_LOCK_MIN_BUDGET_MS - 1,
  });
  assert.equal(g.run, false);
  assert.match(g.skipped!, /見送り/);
});

test("鍵が使えて時間もあれば、閉めに行く", () => {
  const g = shouldRunPhotoLock({
    keyUsable: true,
    budgetMs: PHOTO_LOCK_MIN_BUDGET_MS,
  });
  assert.equal(g.run, true);
  assert.equal(g.skipped, null);
});
