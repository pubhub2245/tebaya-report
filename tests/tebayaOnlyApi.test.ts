import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TEBAYA_ONLY_MESSAGES,
  decideTebayaOnlyWindow,
  type TebayaOnlyWindow,
} from "../lib/tebayaOnlyApi";

/**
 * 設営後チェック・意見箱の返信の窓口を、手羽屋のときだけに絞る（f3-4・2026-10-25）。
 *
 * いちばん大事なのは **手羽屋の登録・返信・LINE 投稿が1つも止まらないこと**。
 * 印が送られてこない（古い画面がそのまま開かれている）ときも、今までどおり通る。
 */

const WINDOWS: TebayaOnlyWindow[] = [
  "setup-check",
  "setup-check-line",
  "feedback-reply",
];

const SHOP = "11111111-2222-4333-8444-555555555555";

test("手羽屋（印が空）は、3つの窓口ぜんぶ今までどおり通る", () => {
  for (const w of WINDOWS) {
    for (const v of [null, undefined, "", "   ", "tebaya"]) {
      const r = decideTebayaOnlyWindow(v, w);
      assert.equal(r.allow, true, `${w}：手羽屋として扱われていない（${String(v)}）`);
      assert.equal(r.message, null);
    }
  }
});

test("よその店だとはっきり名乗ったときだけ、何もしない", () => {
  for (const w of WINDOWS) {
    const r = decideTebayaOnlyWindow(SHOP, w);
    assert.equal(r.allow, false, `${w}：よその店を通してしまっている`);
    assert.equal(r.message, TEBAYA_ONLY_MESSAGES[w]);
  }
});

test("大文字で名乗っても、同じお店として断る", () => {
  const r = decideTebayaOnlyWindow(SHOP.toUpperCase(), "setup-check");
  assert.equal(r.allow, false);
});

test("断りの1行は日本語で、英語のエラーを出さない", () => {
  for (const w of WINDOWS) {
    const m = TEBAYA_ONLY_MESSAGES[w];
    assert.ok(/[ぁ-んァ-ヶ一-龠]/.test(m), `${w}：日本語になっていない`);
    assert.ok(!/error|Error|failed/.test(m), `${w}：英語のエラーが混ざっている`);
  }
});

/* ---------- 窓口の側（裏口がふさがっているか） ---------- */

const ROUTES: { file: string; why: string }[] = [
  {
    file: "app/api/setup-check/create/route.ts",
    why: "よその店の開店前のレジ金・担当者が手羽屋の記録に混ざります",
  },
  {
    file: "app/api/setup-check/post-line/route.ts",
    why: "よその店の文が手羽屋のスタッフのLINEグループに飛びます",
  },
  {
    file: "app/api/feedback/[id]/replies/route.ts",
    why: "よその店の返信が手羽屋の意見箱に混ざります",
  },
];

test("3つの窓口が、この判定を通している", () => {
  for (const { file, why } of ROUTES) {
    const src = readFileSync(file, "utf8");
    assert.ok(
      src.includes("decideTebayaOnlyWindow"),
      `${file} が門を通っていません（${why}）`,
    );
    assert.ok(
      src.includes("403"),
      `${file} が断るときに 403 を返していません`,
    );
  }
});

test("LINE へ流す窓口は、LINE に送る前に断っている", () => {
  const src = readFileSync("app/api/setup-check/post-line/route.ts", "utf8");
  const gate = src.indexOf("decideTebayaOnlyWindow");
  const send = src.indexOf("sendLineGroupMessage(");
  assert.ok(gate > -1 && send > gate, "送ってから断っても取り消せません");
});

/* ---------- 画面の側（いまどのお店かを名乗っているか） ---------- */

const CLIENTS = [
  "app/setup-check/_components/SetupCheckForm.tsx",
  "app/setup-check/_components/LineTextPreview.tsx",
  "app/feedback/[id]/_components/ReplyThread.tsx",
];

test("3つの画面が、いまどのお店かを名乗って窓口を呼んでいる", () => {
  for (const file of CLIENTS) {
    const src = readFileSync(file, "utf8");
    assert.ok(
      /tenant_id:\s*currentShopScope\(\)/.test(src),
      `${file} が「どのお店か」を送っていません`,
    );
  }
});
