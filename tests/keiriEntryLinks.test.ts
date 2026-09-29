/**
 * 申し込みに来る「入口」4本の住所を、1か所でまとめて見張る（kp201・2026-09-29）。
 *
 * ■ なぜ要るか
 *   9/27 夜に紙の札から来た3回の記録が、合言葉 `card` ではなく
 *   **末尾に記号 ` が1つ多い形**で残っていました。倉庫のコードは正しく、
 *   記号は文章の中の住所を写したときに外から付いたものでしたが（kp195）、
 *   「住所に余計な1文字が混じっても誰も気づかない」状態そのものが危ないままでした。
 *   QRは番地の1文字が違えば別の場所へ行くか、開けません。
 *   ですので**入口の住所に余計な文字が入った瞬間に、検算で止まる**ようにします。
 *
 * ■ 見張るもの（入口は4本だけ。増えたらここに足す）
 *   ①紙の札（card）②その場で見せる1枚（show）③お試し（trial）④日報アプリ（app）
 *
 * ■ 何を確かめるか
 *   1. 住所に使ってよい文字だけで出来ていること（記号 ` ・空白・引用符が入ったら落ちる）
 *   2. 合言葉が4本とも違うこと（同じだと、どの入口から来たか分けられない）
 *   3. 住所に書いた合言葉が、受け取る側の掃除（cleanCampaign）を通しても
 *      1文字も変わらないこと＝そのまま数え分けられること
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CARD_FROM_KEY, CARD_TAKEAWAY_URL } from "../lib/keiri/card";
import { SHOW_FROM_KEY, SHOW_TAKEAWAY_URL } from "../lib/keiri/show";
import { TRIAL_APPLY_HREF, TRIAL_FROM_KEY } from "../lib/keiri/trial";
import { APP_CASE_HREF, APP_FROM_KEY } from "../lib/keiri/appLink";
import { cleanCampaign } from "../lib/siteVisits";

type Entry = { name: string; href: string; key: string };

const ENTRIES: Entry[] = [
  { name: "紙の札（/keiri/card のQR）", href: CARD_TAKEAWAY_URL, key: CARD_FROM_KEY },
  { name: "見せる1枚（/keiri/show のQR）", href: SHOW_TAKEAWAY_URL, key: SHOW_FROM_KEY },
  { name: "お試し（/keiri/demo の押し所）", href: TRIAL_APPLY_HREF, key: TRIAL_FROM_KEY },
  { name: "日報アプリ（ホーム・管理者ページ）", href: APP_CASE_HREF, key: APP_FROM_KEY },
];

/** 住所に出てよい文字（RFC 3986 の範囲）。記号 ` ・空白・引用符・全角は入らない */
const SAFE_URL = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;

test("入口の住所に余計な文字が混じっていない", () => {
  for (const e of ENTRIES) {
    assert.match(e.href, SAFE_URL, `${e.name}の住所に使えない文字が入っている：${e.href}`);
    assert.ok(!e.href.includes("`"), `${e.name}の住所に記号 \` が入っている：${e.href}`);
    assert.equal(e.href.trim(), e.href, `${e.name}の住所の前後に空白がある`);
  }
});

test("入口はどれも ご案内ページ（/keiri/case）へ行く", () => {
  for (const e of ENTRIES) {
    assert.ok(
      e.href.includes("/keiri/case?from="),
      `${e.name}の行き先がご案内ページの合言葉付きではない：${e.href}`,
    );
  }
});

test("合言葉は入口ごとに違う（4本とも別の名前）", () => {
  const keys = ENTRIES.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, `合言葉が重なっている：${keys.join(" / ")}`);
  for (const key of keys) {
    assert.match(key, /^[a-z]+$/, `合言葉は小文字の英字だけにする：${key}`);
  }
});

test("住所に書いた合言葉が、そのまま数え分けられる", () => {
  for (const e of ENTRIES) {
    const written = new URL(e.href, "https://example.invalid").searchParams.get("from");
    assert.equal(written, e.key, `${e.name}の住所の合言葉が決めごとと違う`);
    assert.equal(
      cleanCampaign(written),
      e.key,
      `${e.name}の合言葉が、受け取る側の掃除で形が変わってしまう`,
    );
  }
});
