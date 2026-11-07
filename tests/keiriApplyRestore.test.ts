/**
 * 「控えが棚に残らなかったお申し込みを、取りこぼさない」を固定する（f2-1）。
 *
 * ここが狂うと、倉庫が止まっている日に入ったお申し込みが、
 * 誰にも気づかれないまま消える（知らせの文は本物とまったく同じなので、
 * 受け取った人は「棚に残ったのか」が分からない）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEIRI_APPLY_LIMITS, type KeiriApplication } from "../lib/keiri/apply";
import {
  APPLY_RESTORE_MAX_URL,
  APPLY_RESTORE_PARAM,
  APPLY_RESTORE_PATH,
  APPLY_SAVE_FAILURE_TITLE,
  applyRestoreUrl,
  applySaveFailureNoticeText,
  decodeApplyRestore,
  encodeApplyRestore,
} from "../lib/keiri/applyRestore";

const ORIGIN = "https://tebaya-report.vercel.app";

function app(over: Partial<KeiriApplication> = {}): KeiriApplication {
  return {
    shop_name: "居酒屋 たぬき",
    contact_name: "山田 太郎",
    email: "tanuki@example.com",
    phone: "090-1111-2222",
    note: "来月からお願いしたいです",
    campaign: null,
    ...over,
  } as KeiriApplication;
}

test("入れた中身は、リンクに乗せて そのまま戻ってくる（日本語も崩れない）", () => {
  const a = app();
  const back = decodeApplyRestore(encodeApplyRestore(a));
  assert.ok(back, "戻せなかった");
  assert.equal(back.shopName, a.shop_name);
  assert.equal(back.contactName, a.contact_name);
  assert.equal(back.email, a.email);
  assert.equal(back.phone, a.phone);
  assert.equal(back.note, a.note);
});

test("任意の欄が空のお申し込みでも、必ず入れていただく2つは戻る", () => {
  const a = app({ contact_name: "", email: "", note: null });
  const back = decodeApplyRestore(encodeApplyRestore(a));
  assert.ok(back);
  assert.equal(back.shopName, "居酒屋 たぬき");
  assert.equal(back.phone, "090-1111-2222");
  assert.equal(back.contactName, "");
  assert.equal(back.email, "");
  assert.equal(back.note, "");
});

test("読めない合言葉は null（画面は今までどおり空で開く）", () => {
  for (const bad of [null, undefined, "", "!!!!", "YWJj", "e30"]) {
    assert.equal(decodeApplyRestore(bad as string | null), null, `null になっていない: ${bad}`);
  }
});

test("長い貼り付けは欄ごとの上限で切る（画面を壊されない）", () => {
  const long = "あ".repeat(5000);
  const raw = encodeApplyRestore({
    shop_name: long,
    contact_name: long,
    email: long,
    phone: long,
    note: long,
  });
  const back = decodeApplyRestore(raw);
  // 長すぎる合言葉そのものは受けない（上限を超えたら null）
  if (back) {
    assert.ok(back.shopName.length <= KEIRI_APPLY_LIMITS.shopName);
    assert.ok(back.note.length <= KEIRI_APPLY_LIMITS.note);
  } else {
    assert.ok(raw.length > APPLY_RESTORE_MAX_URL);
  }
});

test("入れ直しのリンクは、お申し込みの画面＋?prefill= の形になる", () => {
  const url = applyRestoreUrl(ORIGIN, app());
  assert.ok(url, "リンクが作れなかった");
  assert.ok(url.startsWith(`${ORIGIN}${APPLY_RESTORE_PATH}?${APPLY_RESTORE_PARAM}=`), url);
  assert.ok(url.length <= APPLY_RESTORE_MAX_URL);
  const raw = new URL(url).searchParams.get(APPLY_RESTORE_PARAM);
  assert.equal(decodeApplyRestore(raw)?.shopName, "居酒屋 たぬき");
});

test("ひとことが長すぎてリンクが伸びるときは、リンクを付けない（null）", () => {
  const url = applyRestoreUrl(ORIGIN, {
    ...app(),
    note: "あ".repeat(KEIRI_APPLY_LIMITS.note),
  });
  assert.equal(url, null);
});

test("住所の頭が無いときはリンクを作らない", () => {
  assert.equal(applyRestoreUrl("", app()), null);
});

test("2通目の文は「棚に残っていない」と はっきり言い、中身とリンクを載せる", () => {
  const a = app();
  const url = applyRestoreUrl(ORIGIN, a);
  const text = applySaveFailureNoticeText({
    application: a,
    restoreUrl: url,
    at: new Date("2026-11-07T00:40:00Z"),
    reason: "倉庫（データのしまい場所）につながりませんでした",
  });
  assert.ok(text.startsWith(APPLY_SAVE_FAILURE_TITLE), text);
  assert.match(text, /棚の1行が残っていません/);
  assert.match(text, /唯一の控えです。消さないでください/);
  assert.match(text, /居酒屋 たぬき/);
  assert.match(text, /090-1111-2222/);
  assert.match(text, /倉庫（データのしまい場所）につながりませんでした/);
  assert.ok(url && text.includes(url), "入れ直しのリンクが入っていない");
  // 日本時間で出す（2026-11-07 09:40）
  assert.match(text, /2026\/11\/07 09:40/);
  // 本物の知らせの見出しは入れない（取り違えないため）
  assert.ok(!text.includes("【経理パッケージ お申し込みが1件入りました】"), text);
});

test("リンクを作れなかったときは、打ち直しの道を文に残す", () => {
  const text = applySaveFailureNoticeText({ application: app(), restoreUrl: null });
  assert.match(text, /リンクは付けられませんでした/);
  assert.match(text, /\/keiri\/apply/);
});

test("2通目に、鍵・合言葉・つなぎ先の値を1文字も入れない", () => {
  const text = applySaveFailureNoticeText({
    application: app(),
    restoreUrl: applyRestoreUrl(ORIGIN, app()),
    reason: "倉庫（データのしまい場所）につながりませんでした",
  });
  for (const ng of ["SUPABASE", "service_role", "supabase.co", "ANTHROPIC", "LINE_CHANNEL"]) {
    assert.ok(!text.includes(ng), `${ng} が入っている`);
  }
  // 鍵の形（.で3つに分かれた長い文字列）が1つも無いこと
  assert.ok(
    !/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text),
    "鍵の形の文字列が入っている",
  );
});

test("受け口は、控えが残らなかったときだけ2通目を送る（本物の知らせは待たせない）", () => {
  const src = readFileSync("app/api/keiri/apply/route.ts", "utf8");
  // 知らせと控えは今までどおり同時に走らせる（控えを待ってから知らせを作らない）
  assert.match(src, /Promise\.all\(\[\s*\n\s*notifyApplication/);
  // 2通目の条件：試しではない・1通目は届いた・控えは残らなかった
  assert.match(src, /!test && notified && savedResult === false/);
  // 試しの1通では送らない
  assert.ok(!/savedResult === false[\s\S]{0,80}\|\| test/.test(src));
});

test("お申し込みの画面は、住所の中身で欄を埋める（打ち直しをお願いしない）", () => {
  const src = readFileSync("app/keiri/apply/ApplyForm.tsx", "utf8");
  assert.match(src, /decodeApplyRestore/);
  assert.match(src, /useState<Entered>\(\(\) => readPrefill\(\) \?\? EMPTY\)/);
  // 埋めるだけ。開いただけで送らない
  assert.ok(!/readPrefill\(\)[\s\S]{0,200}fetch\(/.test(src));
});

test("下見（dryRun）で、2通目の中身を外から読める（何も送らず・何も書かない）", () => {
  const src = readFileSync("app/api/keiri/apply/route.ts", "utf8");
  // 下見の返事に、2通目の文と入れ直しのリンクが入る
  assert.match(src, /saveFailureNotice:\s*\{/);
  assert.match(src, /sentNow:\s*false/);
  // 下見はここで必ず終わる（知らせも控えも出さない）
  const dry = src.slice(src.indexOf("if (dryRun) {"));
  const after = dry.slice(0, dry.indexOf("\n  }"));
  assert.ok(!/sendLineGroupMessageDetailed|notifyApplication|saveApplication/.test(after), after);
});
