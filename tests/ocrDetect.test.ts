/**
 * 「どの経費がレシート読み取り（OCR）で入力されたか」を見分ける判定のテスト。
 *
 * ★ここが緩すぎると、手入力の行まで8〜10%増やしてしまい、経費が水増しされます。
 *   だから「迷ったら手入力とみなす（触らない）」を固定します。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TEBAYA_TEMPLATE } from "../lib/keiri";
import {
  looksLikeOcrText,
  looksHandTyped,
  decideRate,
  toTaxIncluded,
  proposeFix,
  proposeFixesForReport,
  type ExpenseRowRef,
} from "../lib/keiri/ocrDetect";

const T = TEBAYA_TEMPLATE;

/* ---------- レシート特有の書式かどうか ---------- */

test("looksLikeOcrText: レシートの商品行はレシート由来とみなす（実データの書き方）", () => {
  const yes = [
    "鶏がらスープの素 10コ×単298", // 単価つき
    "ユニックス 0-80AGナ（2コ×単798）",
    "火乃国 片栗粉 北海 1kg 3コ", // 「コ」つき
    "キッチンバサミ DH-8001", // 型番
    "キッチンボックス NF-4",
    "花王 チェリーナ 4.5L", // 半角スペース
    "ドレッシングボトル ホワイト",
    "透明ゴミ袋_45L厚手", // アンダースコア
    "ニューイージーバッグバイオ25L半透", // 規格＋長い名前
    "80gオールシーズンチョコ",
  ];
  for (const d of yes) assert.equal(looksLikeOcrText(d), true, d);
});

test("looksLikeOcrText: 現場の手入力はレシート由来とみなさない（触らない）", () => {
  const no = [
    "場代",
    "肉代",
    "手羽代(8/8)",
    "ポテト×2",
    "ニラ×3",
    "片栗粉×4",
    "片栗粉1キロ×3", // 「キロ」は規格の単位に入れていない
    "はし（150本入り）", // 「本」も入れていない
    "スプーン（100本入り）",
    "コピー50円×7", // 「円」も入れていない
    "プリント代（¥50×5）",
    "ラミネートフィルム（A4）×3",
    "買物袋Mサイズ",
    "都城市ゴミ袋×2",
    "交通費(遠方)",
    "8/11(交通費)",
    "さとみさん研修給",
    "ゴミ袋（都城のやつ）",
    "おろし生姜（大）（仕込み用）",
    "",
    null,
  ];
  for (const d of no) assert.equal(looksLikeOcrText(d), false, String(d));
});

test("looksHandTyped: 現場が必ず手で書く言葉を見分ける", () => {
  for (const d of ["場代", "肉代", "1番隊ガソリン代", "検便", "レジ袋", "さとみさん研修"])
    assert.equal(looksHandTyped(d), true, d);
  for (const d of ["火乃国 片栗粉 北海 1kg 3コ", "花王 チェリーナ 4.5L"])
    assert.equal(looksHandTyped(d), false, d);
});

/* ---------- 税率 ---------- */

test("decideRate: 仕入の食品は8%、それ以外は10%", () => {
  assert.equal(decideRate("火乃国 片栗粉 北海 1kg 3コ", T).rate, 8);
  assert.equal(decideRate("VPSトマトケチャップ チューブ 1kg × 2コ", T).rate, 8);
  assert.equal(decideRate("花王 チェリーナ 4.5L", T).rate, 10);
  assert.equal(decideRate("スターパック 大深 100枚", T).rate, 10);
  assert.equal(decideRate("レギュラー P04", T).rate, 10); // 車両費
});

test("decideRate: 酒類かもしれないものは税率を決めない（酒類は10%）", () => {
  assert.equal(decideRate("一番搾り（1ケース）", T).rate, null);
  assert.equal(decideRate("氷結レモン（1ケース）", T).rate, null);
  // 料理酒は調味料なので食品（8%）
  assert.equal(decideRate("料理酒", T).rate, 8);
});

test("decideRate: 食品か容器・道具か分からないものは決めない", () => {
  // 「氷」で仕入に入るが、実際は氷を作る道具かもしれない → 決めない
  assert.equal(decideRate("ザ・氷プレート", T).rate, null);
  // 容器だとはっきり分かるものは消耗品費として10%でよい
  assert.equal(decideRate("ドレッシングボトル ホワイト", T).rate, 10);
});

test("decideRate: 科目が分からない（雑費）ものは決めない", () => {
  assert.equal(decideRate("源清田 中国産おろしにん", T).rate, null);
});

/* ---------- 税込にする ---------- */

test("toTaxIncluded: 1円未満は四捨五入", () => {
  assert.equal(toTaxIncluded(1592, 8), 1719); // 1719.36 → 1719
  assert.equal(toTaxIncluded(980, 10), 1078);
  assert.equal(toTaxIncluded(298, 8), 322); // 321.84 → 322
  assert.equal(toTaxIncluded(0, 8), 0);
});

/* ---------- 1行ぶんの修正案 ---------- */

const row = (over: Partial<ExpenseRowRef>): ExpenseRowRef => ({
  date: "2026-05-27",
  location: "ながやま三股",
  index: 0,
  description: "",
  amount: 0,
  receipt_image_url: null,
  ...over,
});

test("proposeFix: 手入力の行は対象外（null）＝1円も触らない", () => {
  assert.equal(proposeFix(row({ description: "場代", amount: 3000 }), T), null);
  assert.equal(proposeFix(row({ description: "肉代", amount: 12960 }), T), null);
});

test("proposeFix: 写真がある行は『確実』だが修正案は出さない（再OCR待ち）", () => {
  const p = proposeFix(
    row({ description: "何でもよい", amount: 1000, receipt_image_url: "https://x" }),
    T,
  )!;
  assert.equal(p.confidence, "確実");
  assert.equal(p.evidence, "a");
  assert.equal(p.after, null);
  assert.equal(p.diff, null);
});

test("proposeFix: レシート書式の行は税率をかけた修正案を出す", () => {
  const p = proposeFix(
    row({ description: "火乃国 片栗粉 北海 1kg 3コ", amount: 1194 }),
    T,
  )!;
  assert.equal(p.confidence, "ほぼ確実");
  assert.equal(p.evidence, "b");
  assert.equal(p.rate, 8);
  assert.equal(p.after, 1290);
  assert.equal(p.diff, 96);
});

test("proposeFix: 税率が決まらない行は『不明』で修正案なし", () => {
  const p = proposeFix(
    row({ description: "源清田 中国産おろしにん", amount: 698 }),
    T,
  )!;
  assert.equal(p.confidence, "不明");
  assert.equal(p.after, null);
});

/* ---------- 日報1件ぶん（写真つき行の直後） ---------- */

test("proposeFixesForReport: 写真つき行の直後の行は『不明（要確認）』として拾う", () => {
  const rows: ExpenseRowRef[] = [
    row({ index: 0, description: "レシートの1行目", amount: 500, receipt_image_url: "https://x" }),
    row({ index: 1, description: "銀印純正ごま油(濃口)", amount: 1980 }), // 手入力に見えるが直後
    row({ index: 2, description: "場代", amount: 3000 }), // 明らかに手入力 → ここで打ち切り
    row({ index: 3, description: "かちわり氷", amount: 376 }), // 打ち切り後なので対象外
  ];
  const out = proposeFixesForReport(rows, T);
  assert.equal(out.length, 2);
  assert.equal(out[0].evidence, "a");
  assert.equal(out[1].evidence, "c");
  assert.equal(out[1].confidence, "不明");
  assert.equal(out[1].after, null, "根拠cだけの行は勝手に直さない");
});

test("proposeFixesForReport: 写真が1枚も無い日報では、書式で当たった行だけ", () => {
  const rows: ExpenseRowRef[] = [
    row({ index: 0, description: "場代", amount: 3000 }),
    row({ index: 1, description: "花王 チェリーナ 4.5L", amount: 1680 }),
    row({ index: 2, description: "ポテト×2", amount: 730 }),
  ];
  const out = proposeFixesForReport(rows, T);
  assert.equal(out.length, 1);
  assert.equal(out[0].description, "花王 チェリーナ 4.5L");
  assert.equal(out[0].rate, 10);
});
