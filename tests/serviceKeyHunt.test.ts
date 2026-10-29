/**
 * 「本物の鍵が、よその名前の欄に入っていないか探す」しくみのテスト（f3-4・2026-10-29・kp267）。
 *
 * ■ ここで必ず守ること
 *   ・使うのは「形の確かめ（. で3つ／role が service_role／ref がこの倉庫）」を
 *     **そのまま**通ったものだけ。全角を直した値・ブラウザにも配られる名前・
 *     新しい形（sb_secret_…）は**使わない**。
 *   ・名前いがいは何も外に出さない（値は返さない）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { describeKeyHunt, skipReason } from "../lib/keiri/keyHunt";
import {
  SERVICE_KEY_NAME,
  alternateServiceKey,
  findServiceKeyCandidates,
} from "../lib/supabaseServer";

const URL_OK = "https://vtuyebyjbvjmucqpkxug.supabase.co";

/** 試験用の鍵を組み立てる（本物の鍵はどこにも書かない） */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.QUJDZGVmMTIzNDU2Nzg5MC1fYWJj`;
}

const GOOD = jwt({ iss: "supabase", ref: "vtuyebyjbvjmucqpkxug", role: "service_role" });
const ANON = jwt({ iss: "supabase", ref: "vtuyebyjbvjmucqpkxug", role: "anon" });
const OTHER = jwt({ iss: "supabase", ref: "someoneelsewarehouse", role: "service_role" });
const SECRET_STYLE = `sb_secret_${"a".repeat(40)}`;

/** 半角の英数字を全角にする（貼り付けのしそこないを再現する） */
function toWide(s: string): string {
  return s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

test("よその欄に本物が入っていれば、名前だけを見つける（値は返さない）", () => {
  const env = {
    [SERVICE_KEY_NAME]: "これは鍵ではありません（日本語の文章）",
    SUPABASE_SERVICE_KEY: GOOD,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
    SHORT: "abc",
  };
  const found = findServiceKeyCandidates(env, URL_OK);
  assert.deepEqual(
    found.map((c) => c.name),
    ["SUPABASE_SERVICE_KEY"],
  );
  assert.equal(found[0].usable, true);
  // 値はどこにも含まれない
  assert.equal(JSON.stringify(found).includes(GOOD), false);
  const picked = alternateServiceKey(env, URL_OK);
  assert.equal(picked?.name, "SUPABASE_SERVICE_KEY");
  assert.equal(picked?.key, GOOD);
});

test("公式の欄そのものは、探す相手にしない（二重に数えない）", () => {
  const env = { [SERVICE_KEY_NAME]: GOOD };
  assert.deepEqual(findServiceKeyCandidates(env, URL_OK), []);
  assert.equal(alternateServiceKey(env, URL_OK), null);
});

test("通常の鍵・よその倉庫の鍵・短い値は、候補にしない", () => {
  const env = { A: ANON, B: OTHER, C: "x".repeat(39) };
  assert.deepEqual(findServiceKeyCandidates(env, URL_OK), []);
  assert.equal(alternateServiceKey(env, URL_OK), null);
});

test("ブラウザにも配られる名前に入っていたら、見つけても使わない", () => {
  const env = { NEXT_PUBLIC_SERVICE: GOOD };
  const found = findServiceKeyCandidates(env, URL_OK);
  assert.equal(found.length, 1);
  assert.equal(found[0].publicName, true);
  assert.equal(alternateServiceKey(env, URL_OK), null);
  assert.match(skipReason(found[0]) ?? "", /ブラウザにも配られる名前/);
});

test("新しい形（sb_secret_…）は、見つけたと言うだけで使わない", () => {
  const env = { SUPABASE_SECRET_KEY: SECRET_STYLE };
  const found = findServiceKeyCandidates(env, URL_OK);
  assert.equal(found.length, 1);
  assert.equal(found[0].secretStyle, true);
  assert.equal(alternateServiceKey(env, URL_OK), null);
  assert.match(skipReason(found[0]) ?? "", /どの倉庫のものか/);
});

test("全角が混ざった値は、公式の欄いがいでは使わない（直して使うのは公式の欄だけ）", () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY_OLD: toWide(GOOD) };
  const found = findServiceKeyCandidates(env, URL_OK);
  assert.equal(found.length, 1);
  assert.equal(found[0].repaired, true);
  assert.equal(found[0].usable, false);
  assert.equal(alternateServiceKey(env, URL_OK), null);
  assert.match(skipReason(found[0]) ?? "", /公式の欄いがいでは/);
});

test("言葉：見つかった時・1つも無い時・公式が元気な時で言い分ける", () => {
  const good = describeKeyHunt(
    [
      {
        name: "SUPABASE_SERVICE_KEY",
        usable: true,
        repaired: false,
        publicName: false,
        secretStyle: false,
      },
    ],
    false,
  );
  assert.equal(good.found, true);
  assert.deepEqual(good.usableNames, ["SUPABASE_SERVICE_KEY"]);
  assert.match(good.headline, /よその欄（SUPABASE_SERVICE_KEY）に入っていました/);

  const none = describeKeyHunt([], false);
  assert.equal(none.found, false);
  assert.match(none.headline, /鍵の形をしたものは1つもありませんでした/);
  assert.match(none.headline, /じゅんの1分/);

  const healthy = describeKeyHunt([], true);
  assert.equal(healthy.found, false);
  assert.match(healthy.headline, /探す必要はありません/);
});
