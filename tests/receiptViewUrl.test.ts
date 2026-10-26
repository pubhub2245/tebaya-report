/**
 * レシート写真を「窓口ごしに見せる」住所の作り方（f3-4・2026-10-26）。
 *
 * ここで固定したいのは4つ：
 *  ① **手羽屋の写真が、今までどおり映ること**（記録の住所は1文字も書き換えない）
 *  ② 写真が記録に埋め込まれている昔の形（data:…）は、置き場を通さずそのまま映すこと
 *  ③ 置き場の**外へ出る道**（`..` など）を窓口が受け取らないこと
 *  ④ よその店の写真は、そのお店として開いているときだけ見えること
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  RECEIPT_VIEW_PATH,
  isAllowedPhotoPath,
  receiptObjectPath,
  receiptViewSrc,
  tenantOfPhotoPath,
} from "../lib/receiptViewUrl";

const SHOP = "2f1c9a84-0000-4000-8000-0000000000aa";
const BASE = "https://vtuyebyjbvjmucqpkxug.supabase.co/storage/v1/object/public/receipts";

test("置き場の住所から、置き場の中の道だけを取り出す", () => {
  assert.equal(receiptObjectPath(`${BASE}/report/2026-09/abc.jpg`), "report/2026-09/abc.jpg");
  assert.equal(
    receiptObjectPath(
      "https://vtuyebyjbvjmucqpkxug.supabase.co/storage/v1/object/sign/receipts/report/2026-09/abc.jpg?token=xxx",
    ),
    "report/2026-09/abc.jpg",
  );
  // 道そのものを渡されてもよい
  assert.equal(receiptObjectPath("advance/2026-09/abc.jpg"), "advance/2026-09/abc.jpg");
  // 置き場の住所ではないもの・埋め込みの写真は読み替えない
  assert.equal(receiptObjectPath("https://example.com/photo.jpg"), null);
  assert.equal(receiptObjectPath("data:image/jpeg;base64,AAAA"), null);
  assert.equal(receiptObjectPath(""), null);
  assert.equal(receiptObjectPath(null), null);
});

test("写真が記録に埋め込まれている昔の形は、そのまま映す（置き場を通さない）", () => {
  const embedded = "data:image/jpeg;base64,AAAA";
  assert.equal(receiptViewSrc(embedded), embedded);
  // よその置き場の住所もそのまま（勝手に読み替えない）
  assert.equal(receiptViewSrc("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(receiptViewSrc(null), "");
});

test("手羽屋の写真は、窓口ごしの住所になる（記録の住所は書き換えない）", () => {
  const src = receiptViewSrc(`${BASE}/report/2026-09/abc.jpg`);
  assert.equal(src, `${RECEIPT_VIEW_PATH}?p=report%2F2026-09%2Fabc.jpg`);
  // 手羽屋は「どの店か」を名乗らない（＝印が空のまま）
  assert.ok(!src.includes("&t="));
});

test("よその店の写真は、そのお店として開いているときだけ窓口に名乗る", () => {
  const path = `t/${SHOP}/keiri/2026-10/abc.jpg`;
  assert.equal(tenantOfPhotoPath(path), SHOP);
  assert.equal(tenantOfPhotoPath("report/2026-09/abc.jpg"), null);

  const src = receiptViewSrc(`${BASE}/${path}`, SHOP);
  assert.ok(src.startsWith(`${RECEIPT_VIEW_PATH}?p=`));
  assert.ok(src.endsWith(`&t=${SHOP}`));
});

test("置き場の外へ出る道・変な文字は受け取らない", () => {
  assert.equal(isAllowedPhotoPath("report/2026-09/abc.jpg"), true);
  assert.equal(isAllowedPhotoPath("advance/2026-09/abc.png"), true);
  assert.equal(isAllowedPhotoPath(`t/${SHOP}/keiri/2026-10/abc.jpg`), true);

  assert.equal(isAllowedPhotoPath("report/../../etc/passwd"), false);
  assert.equal(isAllowedPhotoPath("/report/2026-09/abc.jpg"), false);
  assert.equal(isAllowedPhotoPath("report//abc.jpg"), false);
  assert.equal(isAllowedPhotoPath("report"), false, "フォルダだけでは写真ではない");
  assert.equal(isAllowedPhotoPath("secret/2026-09/abc.jpg"), false, "知らないフォルダは通さない");
  assert.equal(isAllowedPhotoPath(`t/${SHOP}/abc.jpg`), false, "お店のフォルダは頭が要る");
  assert.equal(isAllowedPhotoPath("t/notanid/report/abc.jpg"), false);
  assert.equal(isAllowedPhotoPath("report/2026-09/abc.jpg?token=x"), false, "?以降は窓口が落とす");
  assert.equal(isAllowedPhotoPath(""), false);
  assert.equal(isAllowedPhotoPath(null), false);
});

test("通さない道は、読み替えずにそのまま返す（黙って窓口の住所を作らない）", () => {
  const weird = `${BASE}/secret/2026-09/abc.jpg`;
  assert.equal(receiptViewSrc(weird), weird);
});
