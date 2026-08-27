/**
 * 出店場所の名寄せのテスト。
 *
 * ここが狂うと「同じ場所が別々の店として集計される」「別の場所が1つにまとめられる」
 * という、売上ランキングが丸ごと嘘になる事故につながる。
 * 実データに出てきた34通りの書き方を、そのまま固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalLocationName,
  sameLocation,
  isEventLocation,
  CANONICAL,
} from "../lib/locationName";

/* ---------- ながやま系 ---------- */

test("ながやま：スペースの有無・「店」の有無を吸収する", () => {
  for (const raw of ["ながやま 三股店", "ながやま三股店", "ながやま三股", "三股"]) {
    assert.equal(canonicalLocationName(raw), CANONICAL.nagayamaMimata, raw);
  }
  for (const raw of ["ながやま 若葉店", "ながやま若葉店"]) {
    assert.equal(canonicalLocationName(raw), CANONICAL.nagayamaWakaba, raw);
  }
  for (const raw of ["ながやま 山田店", "ながやま山田店"]) {
    assert.equal(canonicalLocationName(raw), CANONICAL.nagayamaYamada, raw);
  }
  for (const raw of ["ながやま 都北店", "ながやま都北店"]) {
    assert.equal(canonicalLocationName(raw), CANONICAL.nagayamaTohoku, raw);
  }
});

/* ---------- 同じ地名が2つある場所（一番の事故ポイント） ---------- */

test("志比田：ながやま と PASIO は別の場所として扱う", () => {
  assert.equal(canonicalLocationName("ながやま 志比田店"), CANONICAL.nagayamaShibita);
  assert.equal(canonicalLocationName("PASIO志比田店"), CANONICAL.pasioShibita);
  assert.equal(canonicalLocationName("PASIO 志比田店"), CANONICAL.pasioShibita);
  assert.equal(canonicalLocationName("パシオ志比田"), CANONICAL.pasioShibita);
  assert.notEqual(
    canonicalLocationName("ながやま 志比田店"),
    canonicalLocationName("パシオ志比田"),
  );
});

test("鷹尾：ながやま と PASIO は別の場所として扱う", () => {
  assert.equal(canonicalLocationName("ながやま鷹尾店"), CANONICAL.nagayamaTakao);
  assert.equal(canonicalLocationName("ながやま 鷹尾店"), CANONICAL.nagayamaTakao);
  assert.equal(canonicalLocationName("パシオ鷹尾"), CANONICAL.pasioTakao);
  assert.equal(canonicalLocationName("パシオ 鷹尾"), CANONICAL.pasioTakao);
  assert.notEqual(
    canonicalLocationName("ながやま鷹尾店"),
    canonicalLocationName("パシオ鷹尾"),
  );
});

test("PASIOの「たかお店」はひらがなでも鷹尾に揃える", () => {
  assert.equal(canonicalLocationName("パシオ たかお店"), CANONICAL.pasioTakao);
});

test("高城（たかじょう）は鷹尾（たかお）と混ぜない", () => {
  assert.equal(canonicalLocationName("PASIO高城店"), CANONICAL.pasioTakajo);
  assert.equal(canonicalLocationName("パシオ高城"), CANONICAL.pasioTakajo);
  assert.notEqual(
    canonicalLocationName("PASIO高城店"),
    canonicalLocationName("パシオ鷹尾"),
  );
});

/* ---------- その他の店 ---------- */

test("マンガ倉庫：「都城店」付きも同じ場所", () => {
  assert.equal(canonicalLocationName("マンガ倉庫"), CANONICAL.mangaSoko);
  assert.equal(canonicalLocationName("マンガ倉庫都城店"), CANONICAL.mangaSoko);
});

test("AZ：表記ゆれ3種類をまとめる", () => {
  for (const raw of ["AZ", "AZ隼人", "AZ 隼人（はやと）", "AZはやと"]) {
    assert.equal(canonicalLocationName(raw), CANONICAL.azHayato, raw);
  }
});

test("PASIO早鈴・ニシムタ・ヒロセマルシェ・朝市・BIG OPUS", () => {
  assert.equal(canonicalLocationName("PASIO早鈴店"), CANONICAL.pasioHayasuzu);
  assert.equal(canonicalLocationName("パシオ早鈴"), CANONICAL.pasioHayasuzu);
  assert.equal(canonicalLocationName("ニシムタ"), CANONICAL.nishimuta);
  assert.equal(canonicalLocationName("ヒロセマルシェ"), CANONICAL.hiroseMarche);
  assert.equal(canonicalLocationName("にくる朝市"), CANONICAL.nikuru);
  assert.equal(canonicalLocationName("ニクルの朝市"), CANONICAL.nikuru);
  assert.equal(canonicalLocationName("まるまる朝市"), CANONICAL.marumaru);
  assert.equal(canonicalLocationName("BIG OPUS"), CANONICAL.bigOpus);
  assert.equal(canonicalLocationName("イオンモール"), CANONICAL.aeon);
});

/* ---------- 単発のお祭りは、まとめずに残す ---------- */

test("お祭り・単発イベントは1つずつ別物として残す", () => {
  assert.equal(canonicalLocationName("高鍋祭り"), "高鍋祭り");
  assert.equal(canonicalLocationName("さどわらん祭り"), "さどわらん祭り");
  assert.equal(canonicalLocationName("盆地祭り"), "盆地祭り");
  assert.equal(canonicalLocationName("都城イベント（栄町公園）"), "都城イベント（栄町公園）");
  assert.notEqual(canonicalLocationName("高鍋祭り"), canonicalLocationName("盆地祭り"));
});

/* ---------- 壊れた入力 ---------- */

test("空・null・空白だけは空文字にする（落ちない）", () => {
  assert.equal(canonicalLocationName(""), "");
  assert.equal(canonicalLocationName(null), "");
  assert.equal(canonicalLocationName(undefined), "");
  assert.equal(canonicalLocationName("   "), "");
});

/* ---------- 判定の入り口 ---------- */

test("sameLocation：書き方が違っても同じ場所なら true", () => {
  assert.equal(sameLocation("ながやま 三股店", "ながやま三股"), true);
  assert.equal(sameLocation("PASIO高城店", "パシオ鷹尾"), false);
});

test("isEventLocation：ランク判定から外すもの", () => {
  assert.equal(isEventLocation("まるまる朝市"), true);
  assert.equal(isEventLocation("高鍋祭り"), true);
  assert.equal(isEventLocation("BIG OPUS"), true);
  assert.equal(isEventLocation("ヒロセマルシェ"), true);
  assert.equal(isEventLocation("ながやま三股"), false);
});

/* ---------- 実データ全34種類が解決できること ---------- */

test("実データに出てきた34通りの書き方が、すべて意図どおりに揃う", () => {
  const 実データ: [string, string][] = [
    ["ながやま 三股店", CANONICAL.nagayamaMimata],
    ["ながやま三股店", CANONICAL.nagayamaMimata],
    ["PASIO高城店", CANONICAL.pasioTakajo],
    ["ニシムタ", CANONICAL.nishimuta],
    ["ながやま 志比田店", CANONICAL.nagayamaShibita],
    ["ながやま 若葉店", CANONICAL.nagayamaWakaba],
    ["ながやま若葉店", CANONICAL.nagayamaWakaba],
    ["ながやま鷹尾店", CANONICAL.nagayamaTakao],
    ["ながやま 鷹尾店", CANONICAL.nagayamaTakao],
    ["PASIO早鈴店", CANONICAL.pasioHayasuzu],
    ["マンガ倉庫", CANONICAL.mangaSoko],
    ["マンガ倉庫都城店", CANONICAL.mangaSoko],
    ["ながやま 山田店", CANONICAL.nagayamaYamada],
    ["ながやま山田店", CANONICAL.nagayamaYamada],
    ["ながやま 都北店", CANONICAL.nagayamaTohoku],
    ["ながやま都北店", CANONICAL.nagayamaTohoku],
    ["パシオ鷹尾", CANONICAL.pasioTakao],
    ["パシオ 鷹尾", CANONICAL.pasioTakao],
    ["パシオ たかお店", CANONICAL.pasioTakao],
    ["イオンモール", CANONICAL.aeon],
    ["PASIO 志比田店", CANONICAL.pasioShibita],
    ["PASIO志比田店", CANONICAL.pasioShibita],
    ["パシオ志比田", CANONICAL.pasioShibita],
    ["BIG OPUS", CANONICAL.bigOpus],
    ["にくる朝市", CANONICAL.nikuru],
    ["まるまる朝市", CANONICAL.marumaru],
    ["AZ隼人", CANONICAL.azHayato],
    ["AZ", CANONICAL.azHayato],
    ["AZ 隼人（はやと）", CANONICAL.azHayato],
    ["ヒロセマルシェ", CANONICAL.hiroseMarche],
    ["高鍋祭り", "高鍋祭り"],
    ["さどわらん祭り", "さどわらん祭り"],
    ["盆地祭り", "盆地祭り"],
    ["都城イベント（栄町公園）", "都城イベント（栄町公園）"],
  ];
  for (const [raw, expected] of 実データ) {
    assert.equal(canonicalLocationName(raw), expected, `${raw} → ${expected}`);
  }

  // 34通りの書き方が、18の場所＋単発イベント4つ の計22に収まること
  const 結果 = new Set(実データ.map(([raw]) => canonicalLocationName(raw)));
  assert.equal(結果.size, 22);
});
