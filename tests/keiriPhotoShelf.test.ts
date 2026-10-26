/**
 * レシート写真の置き場が、お店ごとに分かれているかの決まり（f3-4・2026-10-26）。
 *
 * ここで固定したいのは2つだけ：
 *  ① **手羽屋の写真の住所が1文字も変わらないこと**（印が空＝今までどおり）
 *  ② **「0件」を『閉まっている』と言わないこと**（置き場が空なのか鍵が効いているのか
 *     外から見分けられないため。言い切ると f3-4 を嘘で合格にしてしまう）
 */
import test from "node:test";
import assert from "node:assert/strict";

import { makeObjectPath, photoFolderForTenant } from "../lib/receiptImage";
import { judgePhotoShelf, type ShelfListOutcome } from "../lib/keiri/photoShelf";

const SHOP = "2f1c9a84-0000-4000-8000-0000000000aa";

function outcome(folder: string, items: number | null, denied = false): ShelfListOutcome {
  return { folder, items, error: items === null ? "断られました" : null, denied };
}

test("手羽屋（印が空）の写真の住所は今までどおり", () => {
  assert.equal(photoFolderForTenant("report", null), "report");
  assert.equal(photoFolderForTenant("report", ""), "report");
  assert.equal(photoFolderForTenant("report", undefined), "report");
  assert.match(makeObjectPath("report", "image/jpeg"), /^report\/\d{4}-\d{2}\/.+\.jpg$/);
  assert.match(
    makeObjectPath("advance", "image/jpeg", null),
    /^advance\/\d{4}-\d{2}\/.+\.jpg$/,
  );
});

test("申し込んだお店の写真は、そのお店のフォルダに入る", () => {
  assert.equal(photoFolderForTenant("keiri", SHOP), `t/${SHOP}/keiri`);
  assert.match(
    makeObjectPath("report", "image/png", SHOP),
    new RegExp(`^t/${SHOP}/report/\\d{4}-\\d{2}/.+\\.png$`),
  );
});

test("変な文字が入った印では、よそのフォルダに届かない（手羽屋と同じ所に倒す）", () => {
  assert.equal(photoFolderForTenant("report", "../../other"), "report");
  assert.equal(photoFolderForTenant("report", "t/xxx"), "report");
  assert.equal(photoFolderForTenant("report", "短い"), "report");
});

test("1件でも一覧が返れば『まだ開いている』", () => {
  const v = judgePhotoShelf({
    outcomes: [outcome("", 3), outcome("report", 0)],
    knownPhotos: null,
    separatedByFolder: true,
  });
  assert.equal(v.listable, true);
});

test("写真があるのに0件なら『閉まっている』", () => {
  const v = judgePhotoShelf({
    outcomes: [outcome("", 0), outcome("report", 0)],
    knownPhotos: 4,
    separatedByFolder: true,
  });
  assert.equal(v.listable, false);
});

test("はっきり断られたら『閉まっている』（写真の枚数が分からなくてもよい）", () => {
  const v = judgePhotoShelf({
    outcomes: [outcome("", null, true)],
    knownPhotos: null,
    separatedByFolder: true,
  });
  assert.equal(v.listable, false);
});

test("0件だけで写真の枚数が分からないときは『分かりません』（閉まったことにしない）", () => {
  const v = judgePhotoShelf({
    outcomes: [outcome("", 0), outcome("report", 0)],
    knownPhotos: null,
    separatedByFolder: true,
  });
  assert.equal(v.listable, null);
  assert.match(v.note, /見分けられません/);
});

test("聞けなかったときも『分かりません』", () => {
  const v = judgePhotoShelf({
    outcomes: [outcome("", null), outcome("report", null)],
    knownPhotos: 9,
    separatedByFolder: true,
  });
  assert.equal(v.listable, null);
});
