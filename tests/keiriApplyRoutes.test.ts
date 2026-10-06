/**
 * お申し込みの「道」のテスト（lib/keiri/applyRoutes.ts・kp236・f2-3）。
 *
 * ★ここで守るのは5点。どれも「どの道から来たかが消えない」ための守りです。
 *   ① 道は6つ。**それぞれ別の合言葉**が付いている（同じ合言葉が2つあると数え分けられない）
 *   ② 一覧の合言葉は、それぞれの入口のファイルの値と同じ（ここで打ち直していない）
 *   ③ どの入口の行き先にも、自分の合言葉が付いている
 *   ④ どの道から申し込んでも、控えの「ひとこと」に ［どこから：◯◯］ が残る
 *   ⑤ その1行から、道を読み戻せる
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  APPLY_ROUTES,
  applyRouteLabel,
  applyRouteOf,
  routeFromNote,
  routeNoteMarkFor,
} from "../lib/keiri/applyRoutes";
import { CARD_FROM_KEY, CARD_TAKEAWAY_URL } from "../lib/keiri/card";
import { README_CASE_URL, README_FROM_KEY } from "../lib/keiri/readmeLink";
import {
  ONSITE_FROM_KEY,
  SHOW_APPLY_HREF,
  SHOW_FROM_KEY,
  SHOW_TAKEAWAY_URL,
} from "../lib/keiri/show";
import { APP_CASE_HREF, APP_FROM_KEY } from "../lib/keiri/appLink";
import { TRIAL_APPLY_HREF, TRIAL_FROM_KEY } from "../lib/keiri/trial";
import { normalizeKeiriApplication } from "../lib/keiri/apply";

test("道は6つで、それぞれ別の合言葉が付いている", () => {
  assert.equal(APPLY_ROUTES.length, 6);
  const keys = APPLY_ROUTES.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "同じ合言葉が2つあります");
  for (const r of APPLY_ROUTES) {
    assert.ok(r.key.trim().length > 0, "合言葉が空です");
    assert.ok(r.label.trim().length > 0, "呼び名が空です");
    assert.ok(r.where.trim().length > 0, "どこの入口か書かれていません");
  }
});

test("一覧の合言葉は、それぞれの入口のファイルの値と同じ", () => {
  const keys = APPLY_ROUTES.map((r) => r.key);
  for (const k of [
    CARD_FROM_KEY,
    SHOW_FROM_KEY,
    TRIAL_FROM_KEY,
    APP_FROM_KEY,
    README_FROM_KEY,
    ONSITE_FROM_KEY,
  ]) {
    assert.ok(keys.includes(k), `一覧に ${k} がありません`);
  }
});

test("どの入口の行き先にも、自分の合言葉が付いている", () => {
  assert.ok(CARD_TAKEAWAY_URL.includes(`from=${CARD_FROM_KEY}`));
  assert.ok(SHOW_TAKEAWAY_URL.includes(`from=${SHOW_FROM_KEY}`));
  assert.ok(SHOW_APPLY_HREF.includes(`from=${SHOW_FROM_KEY}`));
  assert.ok(TRIAL_APPLY_HREF.includes(`from=${TRIAL_FROM_KEY}`));
  assert.ok(APP_CASE_HREF.includes(`from=${APP_FROM_KEY}`));
  assert.ok(README_CASE_URL.includes(`from=${README_FROM_KEY}`));
});

test("どの道から申し込んでも、控えのひとことに ［どこから：◯◯］ が残る", () => {
  for (const r of APPLY_ROUTES) {
    const parsed = normalizeKeiriApplication({
      shopName: "試しの店",
      phone: "0986-00-0000",
      campaign: r.key,
    });
    assert.ok(parsed.ok, `${r.key} で入力が通りませんでした`);
    if (!parsed.ok) continue;
    const note = parsed.value.note ?? "";
    assert.ok(
      note.includes(`［どこから：${r.key}］`),
      `${r.key} の控えに道が残っていません：${note}`,
    );
    // 棚の「どこから来たか」の欄は 'form' のままなので、道はひとことの側で残る
    assert.equal(parsed.value.campaign, r.key);
    assert.equal(routeFromNote(note), r.key);
    assert.equal(routeNoteMarkFor(r.key), `［どこから：${r.key}］`);
  }
});

test("店主が書いたひとことがあっても、道の1行は消えない", () => {
  const parsed = normalizeKeiriApplication({
    shopName: "試しの店",
    phone: "0986-00-0000",
    note: "来週の火曜なら店にいます",
    campaign: "card",
  });
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const note = parsed.value.note ?? "";
  assert.ok(note.includes("来週の火曜なら店にいます"));
  assert.equal(routeFromNote(note), "card");
});

test("道が無い・知らない合言葉のときは、決めつけない", () => {
  const parsed = normalizeKeiriApplication({
    shopName: "試しの店",
    phone: "0986-00-0000",
  });
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(routeFromNote(parsed.value.note), null);
  assert.equal(applyRouteOf(null), null);
  assert.equal(applyRouteOf("しらない道"), null);
  assert.equal(applyRouteLabel(null), "どこから来たか分かりません");
  // 知らない合言葉は「ほかの道」とまとめず、そのまま出す
  assert.equal(applyRouteLabel("nazo"), "nazo");
  assert.equal(applyRouteLabel("card"), "紙の札（QR）");
});

test("「下見だけ」は、知らせも控えも出す前に引き返している", () => {
  // ★受け口（app/api/keiri/apply/route.ts）の中身をそのまま読んで確かめます。
  //   下見のつもりで叩いたのにスタッフのLINEへ飛んだ、を起こさないための守りです。
  const src = readFileSync("app/api/keiri/apply/route.ts", "utf-8");
  const dryRunAt = src.indexOf("if (dryRun) {");
  const sendAt = src.indexOf("await Promise.all([");
  assert.ok(dryRunAt > 0, "下見の道が見つかりません");
  assert.ok(sendAt > 0, "知らせと控えを出す所が見つかりません");
  assert.ok(
    dryRunAt < sendAt,
    "下見の引き返しが、知らせと控えを出す所より後ろにあります",
  );
  // 下見は test のときだけ効く（本物の申し込みでは絶対に効かない）
  assert.ok(src.includes("const dryRun = test &&"));
});
