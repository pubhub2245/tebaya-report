/**
 * 経理の画面が「どのお店の帳簿を読むか」の決め方のテスト（kp239・f3-4）。
 *
 * ■ ここが狂うと何が起きるか
 *   お店として入っているのに、**手羽屋の売上・経費・利益が画面に出ます。**
 *   2026-10-07 までは、読む相手を「端末の控え（localStorage）」で決めていて、
 *   その控えが空のときは手羽屋と見なしていたため、実際にそうなる道がありました。
 *   ここは「入室の印だけで決める」ことを固定します。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  KEIRI_SHOP_AUTH_KEY,
  decideReadSource,
  effectiveKeiriScope,
  readAuthedKeiriScope,
  readWindowOutcome,
} from "../lib/keiri/readSource";

/** 作り物の置き場（sessionStorage のかわり） */
function store(entries: Record<string, string>) {
  return { getItem: (k: string) => (k in entries ? entries[k] : null) };
}

const SHOP = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

test("入室の印があれば、そのお店として読む", () => {
  assert.equal(readAuthedKeiriScope(store({ [KEIRI_SHOP_AUTH_KEY]: SHOP })), SHOP);
});

test("入室の印が無ければ手羽屋（今までどおり）", () => {
  assert.equal(readAuthedKeiriScope(store({})), null);
});

test("印の形がおかしければ手羽屋に倒す（変な値でよその棚を触らない）", () => {
  assert.equal(readAuthedKeiriScope(store({ [KEIRI_SHOP_AUTH_KEY]: "../tebaya" })), null);
  assert.equal(readAuthedKeiriScope(store({ [KEIRI_SHOP_AUTH_KEY]: "" })), null);
});

test("端末の控え（日報の印）は、読む相手に使わない", () => {
  // 入室の印はお店、端末の控えは空／よその番号。読む相手は入室の印のほうだけ。
  const s = store({ [KEIRI_SHOP_AUTH_KEY]: SHOP, "keiri-tenant-id": OTHER });
  assert.equal(readAuthedKeiriScope(s), SHOP);
  // 控えが空でも手羽屋に倒れない（ここが 2026-10-07 に直した所）
  const s2 = store({ [KEIRI_SHOP_AUTH_KEY]: SHOP });
  assert.equal(readAuthedKeiriScope(s2), SHOP);
  assert.equal(decideReadSource(readAuthedKeiriScope(s2)), "server");
});

test("置き場が読めない端末でも落ちない（手羽屋に倒す）", () => {
  const broken = {
    getItem() {
      throw new Error("使えません");
    },
  };
  assert.equal(readAuthedKeiriScope(broken), null);
});

test("お店はサーバー側の窓口から、手羽屋は今までどおりブラウザから読む", () => {
  assert.equal(decideReadSource(SHOP), "server");
  assert.equal(decideReadSource(null), "browser");
});

test("窓口の返事：合言葉が合わないときは、ブラウザ直読みに落とさない", () => {
  assert.deepEqual(readWindowOutcome(401, { ok: false }), { kind: "denied" });
  assert.deepEqual(readWindowOutcome(403, { ok: false }), { kind: "denied" });
});

test("窓口の返事：窓口が無い・通信できないときだけ、今までどおりに戻る", () => {
  assert.deepEqual(readWindowOutcome(503, { ok: false, fallback: true }), {
    kind: "unavailable",
  });
  assert.deepEqual(readWindowOutcome(0, null), { kind: "unavailable" });
  assert.deepEqual(readWindowOutcome(500, null), { kind: "unavailable" });
});

test("窓口の返事：200 でも ok が付いていなければ、読めたことにしない", () => {
  assert.deepEqual(readWindowOutcome(200, { ok: false }), { kind: "unavailable" });
  assert.deepEqual(readWindowOutcome(200, { ok: true }), { kind: "ok" });
});

/* ------------------------------------------------------------------ *
 *  「お店として入っているのに、手羽屋と見なされる」をふさいだか
 * ------------------------------------------------------------------ */

test("入室の印が無ければ、端末の控えをそのまま返す＝手羽屋は1文字も変わらない", () => {
  const none = store({});
  // 手羽屋（控えも空）
  assert.equal(effectiveKeiriScope(null, none), null);
  // 控えにお店が入っている端末（これまでどおりそのお店）
  assert.equal(effectiveKeiriScope(SHOP, none), SHOP);
  // 控えが変な値（これまでどおり手羽屋に倒す）
  assert.equal(effectiveKeiriScope("tebaya" as never, none), null);
});

test("端末の控えが空でも、入室の印があればそのお店として扱う（手羽屋に倒さない）", () => {
  const authed = store({ [KEIRI_SHOP_AUTH_KEY]: SHOP });
  assert.equal(effectiveKeiriScope(null, authed), SHOP);
});

test("食い違ったときは、入室の印（合言葉で入ったほう）を採る", () => {
  const authed = store({ [KEIRI_SHOP_AUTH_KEY]: SHOP });
  assert.equal(effectiveKeiriScope(OTHER, authed), SHOP);
});

test("締める側にしか倒れない（手羽屋として入っている端末が、お店にされることはない）", () => {
  // 入室の印が無い＝手羽屋。どんな控えでも答えは控えのまま
  for (const dev of [null, SHOP, OTHER]) {
    assert.equal(effectiveKeiriScope(dev, store({})), dev);
  }
});
