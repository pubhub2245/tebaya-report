import assert from "node:assert/strict";
import test from "node:test";

import { judgeKeyShape } from "../lib/keiri/keyShape";

const REF = "vtuyebyjbvjmucqpkxug";

/** 試験用のにせ鍵を組み立てる（**本物の鍵は1文字も書きません**） */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return [b64({ alg: "HS256", typ: "JWT" }), b64(payload), "ZmFrZXNpZ25hdHVyZQ"].join(".");
}

test("何も入れていないときは、ok にしない", () => {
  const v = judgeKeyShape("", REF);
  assert.equal(v.ok, false);
  assert.equal(v.kind, "empty");
});

test("この倉庫の service_role の鍵なら ok", () => {
  const v = judgeKeyShape(fakeJwt({ role: "service_role", ref: REF }), REF);
  assert.equal(v.ok, true);
  assert.equal(v.kind, "service_role");
});

test("前後の空白と引用符が付いていても、中身が合っていれば ok（付いていたことは知らせる）", () => {
  const v = judgeKeyShape(`  "${fakeJwt({ role: "service_role", ref: REF })}"  `, REF);
  assert.equal(v.ok, true);
  assert.equal(v.trimmed, true);
});

test("公開用の鍵（anon）は ok にしない", () => {
  const v = judgeKeyShape(fakeJwt({ role: "anon", ref: REF }), REF);
  assert.equal(v.ok, false);
  assert.equal(v.kind, "anon");
});

test("別の倉庫の service_role は ok にしない", () => {
  const v = judgeKeyShape(fakeJwt({ role: "service_role", ref: "yosonokurako0000000" }), REF);
  assert.equal(v.ok, false);
  assert.equal(v.kind, "other_project");
});

test("倉庫の名前が分からないときは、倉庫の一致を確かめずに ok", () => {
  const v = judgeKeyShape(fakeJwt({ role: "service_role", ref: "nandemo" }), "");
  assert.equal(v.ok, true);
  assert.equal(v.kind, "service_role");
});

test("本番で起きた形（日本語の説明文を貼った）を、鍵ではないと言う", () => {
  const v = judgeKeyShape("Project Settings の API から\nservice_role の値をコピーします。", REF);
  assert.equal(v.ok, false);
  assert.equal(v.kind, "not_a_key");
  assert.ok(v.reasons[0].includes("日本語が"));
  assert.ok(v.reasons[0].includes("改行が"));
});

test("新しい形の秘密の鍵（sb_secret_）は ok、公開用（sb_publishable_）は ok にしない", () => {
  assert.equal(judgeKeyShape("sb_secret_abcdefgh1234", REF).ok, true);
  assert.equal(judgeKeyShape("sb_secret_abcdefgh1234", REF).kind, "secret_new");
  assert.equal(judgeKeyShape("sb_publishable_abcdefgh1234", REF).ok, false);
  assert.equal(judgeKeyShape("sb_publishable_abcdefgh1234", REF).kind, "publishable");
});

test("見分けた結果に、入れた文字そのものは1文字も入らない", () => {
  const key = fakeJwt({ role: "service_role", ref: REF });
  const v = judgeKeyShape(key, REF);
  const dumped = JSON.stringify(v);
  assert.ok(!dumped.includes(key));
  assert.ok(!dumped.includes(key.slice(0, 24)));
  assert.equal(v.length, key.length);
});

test("「.」で3つに分かれていても、中身が読めなければ鍵ではない", () => {
  const v = judgeKeyShape("abc.def.ghi", REF);
  assert.equal(v.ok, false);
  assert.equal(v.kind, "not_a_key");
});
