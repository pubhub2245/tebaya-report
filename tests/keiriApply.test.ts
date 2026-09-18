/**
 * 経理パッケージの「お申し込み」の受け取りを固定する。
 *
 * ここが狂うと、申し込みが黙って消えるか、誰にも届かない知らせが出る。
 * 最初の1件を取るための入り口なので、ゆるくしない。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  KEIRI_APPLY_LIMITS,
  keiriApplyNotificationText,
  normalizeKeiriApplication,
} from "../lib/keiri/apply";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

function ok(input: Parameters<typeof normalizeKeiriApplication>[0]) {
  const r = normalizeKeiriApplication(input);
  assert.equal(r.ok, true, `通るはずが弾かれた: ${JSON.stringify(r)}`);
  assert.equal("spam" in r && r.spam, false);
  return (r as { ok: true; spam: false; value: ReturnType<typeof Object> }).value as {
    shop_name: string;
    contact_name: string;
    email: string;
    phone: string | null;
    note: string | null;
  };
}

test("ふつうの申し込みは通る。前後の空白は落とす", () => {
  const v = ok({
    shopName: "  屋台 手羽屋  ",
    contactName: "川畑 潤一郎",
    email: " you@example.com ",
    phone: "090-0000-0000",
    note: "月末の締めが大変です",
  });
  assert.equal(v.shop_name, "屋台 手羽屋");
  assert.equal(v.email, "you@example.com");
  assert.equal(v.phone, "090-0000-0000");
  assert.equal(v.note, "月末の締めが大変です");
});

test("任意の欄は空なら null（空の文字を控えに残さない）", () => {
  const v = ok({ shopName: "A店", contactName: "山田", email: "a@b.jp" });
  assert.equal(v.phone, null);
  assert.equal(v.note, null);
});

test("全角の空白だけの入力は「入っていない」と数える", () => {
  const r = normalizeKeiriApplication({
    shopName: "　　",
    contactName: "山田",
    email: "a@b.jp",
  });
  assert.equal(r.ok, false);
  assert.ok(
    (r as { ok: false; errors: string[] }).errors.some((m) => m.includes("お店の名前")),
  );
});

test("必須が3つとも空なら、足りないものを3つとも教える", () => {
  const r = normalizeKeiriApplication({});
  assert.equal(r.ok, false);
  const errors = (r as { ok: false; errors: string[] }).errors;
  assert.equal(errors.length, 3);
  assert.ok(errors.some((m) => m.includes("お店の名前")));
  assert.ok(errors.some((m) => m.includes("お名前")));
  assert.ok(errors.some((m) => m.includes("メールアドレス")));
});

test("メールアドレスの形がおかしいものは断る", () => {
  for (const bad of ["abc", "a@b", "a b@c.jp", "@example.com", "a@.jp", "a@b."]) {
    const r = normalizeKeiriApplication({
      shopName: "A店",
      contactName: "山田",
      email: bad,
    });
    assert.equal(r.ok, false, `通してはいけない: ${bad}`);
  }
});

test("長すぎる貼り付けは断る（上限ちょうどは通す）", () => {
  const justFit = "あ".repeat(KEIRI_APPLY_LIMITS.shopName);
  ok({ shopName: justFit, contactName: "山田", email: "a@b.jp" });

  const tooLong = "あ".repeat(KEIRI_APPLY_LIMITS.shopName + 1);
  const r = normalizeKeiriApplication({
    shopName: tooLong,
    contactName: "山田",
    email: "a@b.jp",
  });
  assert.equal(r.ok, false);
});

test("囮の欄が埋まっていたら機械。成功の顔をして、誰にも知らせない", () => {
  const r = normalizeKeiriApplication({
    shopName: "A店",
    contactName: "山田",
    email: "a@b.jp",
    website: "http://spam.example",
  });
  assert.equal(r.ok, true);
  assert.equal((r as { ok: true; spam: boolean }).spam, true);
  // 値を持たない＝この先の「知らせる・控える」に進みようがない
  assert.equal("value" in r, false);
});

test("文字でないもの（数値・オブジェクト）が来ても落ちない", () => {
  const r = normalizeKeiriApplication({
    shopName: 123,
    contactName: { a: 1 },
    email: null,
  });
  assert.equal(r.ok, false);
});

test("知らせの本文に、折り返しに要るものが全部入っている", () => {
  const text = keiriApplyNotificationText({
    application: {
      shop_name: "屋台 手羽屋",
      contact_name: "川畑 潤一郎",
      email: "you@example.com",
      phone: "090-0000-0000",
      note: "月末の締めが大変です",
    },
    priceLabel: "月額15,000円（税込）／1店舗",
    at: new Date("2026-09-19T01:34:00+09:00"),
  });
  assert.ok(text.includes("お申し込みが1件入りました"));
  assert.ok(text.includes("屋台 手羽屋"));
  assert.ok(text.includes("川畑 潤一郎"));
  assert.ok(text.includes("you@example.com"));
  assert.ok(text.includes("090-0000-0000"));
  assert.ok(text.includes("月末の締めが大変です"));
  assert.ok(text.includes("月額15,000円（税込）／1店舗"));
  // 日本時間で出す（世界標準時のまま出すと9時間ずれた時刻が届く）
  assert.ok(text.includes("2026/09/19"), text);
});

test("任意の欄が無いときは、その行を出さない（空の行を送らない）", () => {
  const text = keiriApplyNotificationText({
    application: {
      shop_name: "A店",
      contact_name: "山田",
      email: "a@b.jp",
      phone: null,
      note: null,
    },
    priceLabel: "月額15,000円（税込）／1店舗",
  });
  assert.ok(!text.includes("電話："));
  assert.ok(!text.includes("ひとこと："));
});

test("申し込みページは公開ページの一覧に入っている（sitemap と robots に載る）", () => {
  const paths = KEIRI_PUBLIC_PAGES.map((p) => p.path);
  assert.ok(paths.includes("/keiri/apply"));
  // 紹介ページのすぐ後ろに置く（読み終えた人が次に押す所なので）
  assert.equal(paths.indexOf("/keiri/apply"), paths.indexOf("/keiri/case") + 1);
});
