/**
 * サーバー側の鍵を貼り直す1枚（/keiri/key）と窓口（/api/keiri/keycheck）のテスト。
 *
 * ここが狂うと、
 * ・壊れているのに「使えます」と出して、控え（バックアップ）が取れていないことに気づけない
 * ・直っているのに「直してください」と出して、じゅんの手を無駄に使う
 * のどちらかが起きる。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  KEY_BLOCKED,
  KEY_FIX_STEPS,
  keyFixHeadline,
  keyFixLevel,
  keyFixNeeded,
} from "../lib/keiri/keyFix";

test("4通りに分かれる（未設定・壊れている・直して動いている・そのまま使える）", () => {
  assert.equal(keyFixLevel({ configured: false, usable: false }), "missing");
  assert.equal(keyFixLevel({ configured: true, usable: false }), "broken");
  assert.equal(keyFixLevel({ configured: true, usable: true, repaired: true }), "repaired");
  assert.equal(keyFixLevel({ configured: true, usable: true }), "ok");
});

test("そのまま使えるときだけ、じゅんの手を出さない", () => {
  assert.equal(keyFixNeeded("ok"), false);
  assert.equal(keyFixNeeded("broken"), true);
  assert.equal(keyFixNeeded("missing"), true);
  assert.equal(keyFixNeeded("repaired"), true);
});

test("見出しは4通りそれぞれ別の言葉で、やることが分かる", () => {
  const all = (["ok", "repaired", "broken", "missing"] as const).map(keyFixHeadline);
  assert.equal(new Set(all).size, 4);
  assert.match(keyFixHeadline("ok"), /やることはありません/);
  assert.match(keyFixHeadline("broken"), /貼り直して/);
  assert.match(keyFixHeadline("missing"), /登録して/);
});

test("止まっているものの1つ目は、毎日の控え（バックアップ）", () => {
  assert.ok(KEY_BLOCKED.length >= 3);
  assert.match(KEY_BLOCKED[0].what, /控え|バックアップ/);
});

test("手は4手で、どれも「どこで何をするか」が書いてある", () => {
  assert.equal(KEY_FIX_STEPS.length, 4);
  for (const s of KEY_FIX_STEPS) {
    assert.ok(s.where.length > 0, "どこでやるかが書いてあること");
    assert.ok(s.what.length > 10, "何をするかが書いてあること");
  }
  // 出し直し（Redeploy）を飛ばすと、貼り直しても効かない
  assert.ok(KEY_FIX_STEPS.some((s) => /Redeploy|出し直/.test(s.what)));
});

test("1枚と窓口のどこにも、鍵の値を出す言葉を書いていない", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  for (const f of [
    join(__dirname, "..", "app", "keiri", "key", "page.tsx"),
    join(__dirname, "..", "app", "api", "keiri", "keycheck", "route.ts"),
  ]) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      !/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(src),
      `鍵の値を直接さわっている：${f}`,
    );
  }
});
