/**
 * レシート写真の置き場まわりのテスト。
 *
 * 写真の判定を間違えると、
 *   ・すでに置き場にある写真をもう一度アップロードしてしまう
 *   ・古い写真を「もう移した」と勘違いして重いまま残す
 * といった事故になるので、判定部分だけを固定しておく。
 *
 * ※ 実際のアップロードはブラウザ／サーバーの通信が必要なのでここでは試さない。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isEmbeddedImage, dataUrlToBlob } from "../lib/receiptImage";

test("isEmbeddedImage: data: で始まるものだけが『埋め込み』", () => {
  assert.equal(isEmbeddedImage("data:image/jpeg;base64,AAAA"), true);
  assert.equal(isEmbeddedImage("data:image/png;base64,AAAA"), true);
});

test("isEmbeddedImage: 置き場の住所（URL）は埋め込みではない", () => {
  assert.equal(
    isEmbeddedImage("https://example.supabase.co/storage/v1/object/public/receipts/a.jpg"),
    false,
  );
});

test("isEmbeddedImage: 空・null・undefined は埋め込みではない", () => {
  assert.equal(isEmbeddedImage(""), false);
  assert.equal(isEmbeddedImage(null), false);
  assert.equal(isEmbeddedImage(undefined), false);
});

test("dataUrlToBlob: 中身と種類を正しく取り出す", () => {
  // "hi" を base64 にしたもの
  const blob = dataUrlToBlob("data:image/jpeg;base64,aGk=");
  assert.equal(blob.type, "image/jpeg");
  assert.equal(blob.size, 2);
});

test("dataUrlToBlob: 種類の指定が無ければ jpeg として扱う", () => {
  const blob = dataUrlToBlob("data:;base64,aGk=");
  assert.equal(blob.type, "image/jpeg");
});

test("dataUrlToBlob: 壊れた文字列はエラーにする（黙って空にしない）", () => {
  assert.throws(() => dataUrlToBlob("これは画像ではありません"));
  assert.throws(() => dataUrlToBlob("data:image/jpeg;base64"));
});
