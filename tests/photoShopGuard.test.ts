/**
 * 「よその店の数字が手羽屋の側へ流れないか」を固定する試験（2026-11-11・f3-4）。
 *
 * ■ この試験が落ちたときに読むもの
 *   答えにそのまま理由が出ます（lib/photoShopGuard.ts の reason）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkPhotoShopGuard } from "../lib/photoShopGuard";

const PAGE = "app/report/photo/page.tsx";

test("写真日報の画面は、よその店では手羽屋だけの3つを動かさない（本物のファイルで確かめる）", () => {
  const r = checkPhotoShopGuard(readFileSync(PAGE, "utf8"));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.before.length, 0, r.reason);
  assert.equal(r.missing.length, 0, r.reason);
  assert.equal(r.after.length >= 3, true, r.reason);
});

test("止める1行が消されたら落ちる", () => {
  const r = checkPhotoShopGuard(
    ["await save();", "await recalcRankForLocation(location);", "fetch('/api/line/send-report');", "watchCostsFromReport({});"].join("\n"),
  );
  assert.equal(r.ok, false);
  assert.equal(r.gateLine, null);
  assert.match(r.reason, /手羽屋のスタッフのLINEに流れます/);
});

test("止める1行があっても「ここで終わり」が無ければ落ちる", () => {
  const r = checkPhotoShopGuard(
    ["if (shop) {", "  setStep('done');", "}", "await recalcRankForLocation(location);", "watchCostsFromReport({});", "fetch('/api/line/send-report');"].join("\n"),
  );
  assert.equal(r.ok, false);
  assert.equal(r.gateReturns, false);
});

test("手羽屋だけの処理が止める1行より前にあったら落ちる", () => {
  const r = checkPhotoShopGuard(
    [
      "fetch('/api/line/send-report');",
      "if (shop) {",
      "  return;",
      "}",
      "await recalcRankForLocation(location);",
      "watchCostsFromReport({});",
    ].join("\n"),
  );
  assert.equal(r.ok, false);
  assert.equal(r.before.length, 1);
  assert.match(r.reason, /より\*\*前\*\*にあります/);
});

test("呼び出しの名前が変わって空振りしたときも落ちる（黙って通らない）", () => {
  const r = checkPhotoShopGuard(["if (shop) {", "  return;", "}"].join("\n"));
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 3);
  assert.match(r.reason, /見張りの対象が見つかりませんでした/);
});
