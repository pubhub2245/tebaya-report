/**
 * 「置き場の一覧は閉まっているか」を目印の画像で見分ける決まりのテスト
 * （f3-4・2026-10-27・lib/keiri/photoMarker.ts）。
 *
 * ■ ここで守るのは4点
 *   ① 目印があるのに一覧が0件 … **閉まっている**と言ってよい
 *   ② 一覧に1件でも返った … **開いている**（直すこと）
 *   ③ 目印が無い／置かせてもらえない／聞けない … **分かりません**のまま（閉まったことにしない）
 *   ④ 目印は本物のレシートの置き場所と混ざらない（別のフォルダ・決め打ちの名前）
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  judgeMarkerList,
  markerIsThere,
  PHOTO_MARKER_FOLDER,
  PHOTO_MARKER_PATH,
  photoMarkerBytes,
  readsAsAlreadyThere,
  readsAsDenied,
} from "../lib/keiri/photoMarker";
import { PHOTO_PREFIXES, PHOTO_TENANT_PREFIX } from "../lib/keiri/photoShelf";

test("目印があるのに一覧が0件なら、閉まっている", () => {
  for (const marker of ["placed", "already"] as const) {
    const v = judgeMarkerList({ marker, listed: 0 });
    assert.equal(v.listable, false, `${marker} のときに閉まっていると言えていません`);
    assert.ok(v.note.includes("閉まっています"));
  }
});

test("一覧に1件でも返ったら、開いている（目印があるかに関わらず）", () => {
  for (const marker of ["placed", "already", "unknown", "denied"] as const) {
    const v = judgeMarkerList({ marker, listed: 1 });
    assert.equal(v.listable, true, `${marker} のときに開いていると言えていません`);
  }
});

test("目印が無い・置かせてもらえない・聞けないときは『分かりません』のまま", () => {
  assert.equal(judgeMarkerList({ marker: "unknown", listed: 0 }).listable, null);
  assert.equal(judgeMarkerList({ marker: "denied", listed: 0 }).listable, null);
  assert.equal(judgeMarkerList({ marker: "already", listed: null }).listable, null);
});

test("目印があると言い切れるのは、置いた回とすでにあった回だけ", () => {
  assert.equal(markerIsThere("placed"), true);
  assert.equal(markerIsThere("already"), true);
  assert.equal(markerIsThere("denied"), false);
  assert.equal(markerIsThere("unknown"), false);
});

test("倉庫の断りの文を、『すでにある』と『置かせてもらえない』に読み分ける", () => {
  assert.equal(readsAsAlreadyThere("The resource already exists", 409), true);
  assert.equal(readsAsAlreadyThere("Duplicate", null), true);
  assert.equal(readsAsAlreadyThere("new row violates row-level security policy", 403), false);
  assert.equal(readsAsDenied("new row violates row-level security policy", null), true);
  assert.equal(readsAsDenied("Unauthorized", 401), true);
  assert.equal(readsAsDenied("The resource already exists", 409), false);
});

test("目印は、本物のレシートの置き場所と混ざらない", () => {
  for (const prefix of [...PHOTO_PREFIXES, PHOTO_TENANT_PREFIX]) {
    assert.notEqual(
      PHOTO_MARKER_FOLDER,
      prefix,
      "目印のフォルダが、本物のレシートの置き場所と同じです",
    );
  }
  assert.ok(PHOTO_MARKER_PATH.startsWith(`${PHOTO_MARKER_FOLDER}/`));
});

test("目印の中身は、1×1の透明な PNG（小さいこと）", () => {
  const bytes = photoMarkerBytes();
  assert.ok(bytes.length > 0 && bytes.length < 200, `${bytes.length} バイトでした`);
  // PNG の先頭8バイト
  assert.deepEqual(
    Array.from(bytes.slice(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
    "PNG の形になっていません",
  );
});
