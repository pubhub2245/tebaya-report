/**
 * 写真だけの日報（lib/photoReport.ts）のテスト。
 *
 * 現場は数字を打たないので、ここが狂うと売上・経費がそのまま間違って残る。
 * とくに「金額を勝手に作らない」「場代はマスタどおり」を固定する。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyReportRow,
  buildPhotoReportDraft,
  buildSlipPrompt,
  combineSlips,
  matchMemoToProducts,
  parseSlipText,
  photoReportLineText,
  receiptToExpenses,
  resolveNewPlace,
  type Slip,
} from "../lib/photoReport";
import type { SaleProduct } from "../lib/salesBreakdown";

const PRODUCTS: SaleProduct[] = [
  { id: 1, shop: "手羽屋", name: "手羽先", price: 200, kind: "primary", is_active: true, sort_order: 0 },
  { id: 2, shop: "手羽屋", name: "手羽餃子", price: 300, kind: "normal", is_active: true, sort_order: 10 },
  { id: 3, shop: "手羽屋", name: "ポテト", price: 350, kind: "normal", is_active: true, sort_order: 20 },
  { id: 5, shop: "手羽屋", name: "オールスター", price: 1300, kind: "normal", is_active: true, sort_order: 40 },
];

const memo = (items: { name: string; count: number }[], total: number) => ({
  items,
  total,
  flavors: {},
  warnings: [],
  lastCumulative: 0,
  unreadable: "",
  raw: "",
});

test("指示文：商品マスタの名前が入り、累計は売上ではないと念押ししている", () => {
  const p = buildSlipPrompt(["手羽先", "手羽餃子"]);
  assert.match(p, /- 手羽先\n- 手羽餃子/);
  assert.match(p, /売上ではありません/);
  assert.match(p, /cumulative/);
});

test("AIの返事を読む：累計は合計と別の欄に入る。数字の余計な文字は外す", () => {
  const r = parseSlipText(
    'はい\n{"slips":[{"items":[{"name":"手羽先","flavor":"しお","count":"6本","amount":"1,200"}],"total":"¥1,200","cumulative":"¥15,550","unreadable":""}]}',
  );
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].items, [{ name: "手羽先", flavor: "しお", count: 6, amount: 1200 }]);
  assert.equal(r[0].total, 1200);
  assert.equal(r[0].cumulative, 15550);
});

test("AIの返事が壊れていたら空（数字を作らない）", () => {
  assert.deepEqual(parseSlipText("読めませんでした"), []);
});

/* 2026-11-09 に別チャットで実際に読んだ1日ぶん（5枚・売上27,700円）と同じ合計になる伝票 */
const T = (flavor: string, count: number) => ({ name: "手羽先", flavor, count, amount: count * 200 });
const I = (name: string, count: number, price: number) => ({ name, flavor: "", count, amount: count * price });
const DAY: Slip[] = [
  { items: [T("しお", 6), T("タレ", 8), T("のり", 2), I("手羽餃子", 4, 300)], total: 4400, cumulative: 4400, unreadable: "" },
  { items: [T("しお", 6), T("タレ", 9), T("のり", 2), I("手羽餃子", 5, 300), I("オールスター", 1, 1300)], total: 6200, cumulative: 10600, unreadable: "" },
  { items: [T("しお", 6), T("タレ", 9), T("のり", 2), I("手羽餃子", 4, 300), I("ポテト", 1, 350)], total: 4950, cumulative: 15550, unreadable: "" },
  { items: [T("しお", 6), T("タレ", 9), T("のり", 3), I("手羽餃子", 4, 300), I("オールスター", 1, 1300)], total: 6100, cumulative: 21650, unreadable: "" },
  { items: [T("しお", 6), T("タレ", 8), T("のり", 2), I("手羽餃子", 4, 300), I("ポテト", 1, 350), I("オールスター", 1, 1300)], total: 6050, cumulative: 27700, unreadable: "" },
];

test("伝票5枚：売上は合計の足し算（累計は足さない）で、答え合わせが全部合う", () => {
  const m = combineSlips(DAY, PRODUCTS);
  assert.equal(m.total, 27700); // 累計を足していたら 79,900 になる
  assert.deepEqual(m.warnings, []);
  assert.equal(m.lastCumulative, 27700);
  assert.deepEqual(m.flavors, { しお: 30, タレ: 43, のり: 11 });
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "まるまる朝市",
    products: PRODUCTS,
    memo: m,
    receiptExpenses: [],
    boothFeeRule: { type: "none" },
    cumulativeBefore: 0,
  });
  assert.deepEqual(d.counts, { 手羽先: 84, 手羽餃子: 21, オールスター: 3, ポテト: 2 });
  assert.equal(d.breakdown.matched, true); // 16,800＋6,300＋700＋3,900＝27,700
  assert.equal(d.mismatch, null);
});

test("撮った順がばらばらでも、累計の小さい順に並べて答え合わせする", () => {
  const m = combineSlips([DAY[3], DAY[0], DAY[4], DAY[2], DAY[1]], PRODUCTS);
  assert.equal(m.total, 27700);
  assert.deepEqual(m.warnings, []);
});

test("伝票を1枚撮り忘れたら知らせる。売上は撮った分のまま（作らない）", () => {
  const m = combineSlips([DAY[0], DAY[1], DAY[3], DAY[4]], PRODUCTS);
  assert.equal(m.total, 22750);
  assert.ok(m.warnings.some((w) => /¥4,950 少ないです（撮り忘れ/.test(w)));
  assert.ok(m.warnings.some((w) => /累計 ¥10,600 と ¥21,650 のあいだ/.test(w)));
});

test("最初の伝票を撮り忘れたら知らせる", () => {
  const m = combineSlips(DAY.slice(1), PRODUCTS);
  assert.ok(m.warnings.some((w) => /撮り忘れの伝票はありませんか/.test(w)));
});

test("1枚の中で行の合計と合計欄が違えば知らせる（読み違いの発見）", () => {
  // 合計欄を 4,500 と読んだが累計は 4,400 → 最後の累計と合わないので、あやしい1枚を伝える
  const bad: Slip = { ...DAY[0], total: 4500, cumulative: 4400 };
  const m = combineSlips([bad], PRODUCTS);
  assert.ok(m.warnings.some((w) => /1枚目の伝票：行の合計 ¥4,400 と合計欄 ¥4,500/.test(w)));
  assert.equal(m.total, 4500); // 合計欄のまま
});

test("本番の1件目（11/9）：1枚目に累計なし＋途中の累計を読み違えても、最後が合えば知らせない", () => {
  const slips: Slip[] = [
    { ...DAY[0], cumulative: 0 }, // 1枚目は累計を書いていない
    DAY[1],
    { ...DAY[2], cumulative: 15950 }, // 15,550 を 15,950 と読み違えた
    DAY[3],
    DAY[4],
  ];
  const m = combineSlips(slips, PRODUCTS);
  assert.equal(m.total, 27700);
  assert.deepEqual(m.warnings, []);
});

test("味の書かれていない手羽先は『味不明』として数える（本数の合計と味の合計をそろえる）", () => {
  const m = combineSlips(
    [{ items: [T("しお", 3), { name: "手羽先", flavor: "", count: 2, amount: 400 }], total: 1000, cumulative: 0, unreadable: "" }],
    PRODUCTS,
  );
  assert.deepEqual(m.flavors, { しお: 3, 味不明: 2 });
});

test("累計が書かれていない伝票だけなら、つながりの確認はしない", () => {
  const m = combineSlips(DAY.map((sl) => ({ ...sl, cumulative: 0 })), PRODUCTS);
  assert.equal(m.total, 27700);
  assert.deepEqual(m.warnings, []);
});

test("答え合わせが合わないときは、日報の下書きにも知らせが出る", () => {
  const m = combineSlips([DAY[0], DAY[1], DAY[3], DAY[4]], PRODUCTS);
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "まるまる朝市",
    products: PRODUCTS,
    memo: m,
    receiptExpenses: [],
    boothFeeRule: { type: "none" },
    cumulativeBefore: 0,
  });
  assert.match(d.mismatch ?? "", /撮り忘れ/);
});

test("味ごとに書かれた手羽先は主力商品にまとめる。知らない名前は残す", () => {
  const m = matchMemoToProducts(
    [
      { name: "塩", count: 40 },
      { name: "タレ", count: 30 },
      { name: "のり塩", count: 10 },
      { name: "手羽餃子", count: 5 },
      { name: "からあげ", count: 2 },
    ],
    PRODUCTS,
  );
  assert.deepEqual(m.counts, { 手羽先: 80, 手羽餃子: 5 });
  assert.deepEqual(m.unmatched, [{ name: "からあげ", count: 2 }]);
});

test("メモの合計が売上。本数×単価と合っていれば警告なし", () => {
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "ニシムタ",
    products: PRODUCTS,
    memo: memo([{ name: "手羽先", count: 100 }, { name: "手羽餃子", count: 10 }], 23000),
    receiptExpenses: [],
    boothFeeRule: { type: "fixed", amount: 5000 },
    cumulativeBefore: 0,
  });
  assert.equal(d.sales, 23000);
  assert.equal(d.mismatch, null);
  assert.equal(d.breakdown.matched, true);
  // 場代は自動で1行
  assert.deepEqual(
    d.expenses.map((e) => [e.description, e.amount, e.booth_fee]),
    [["場代", 5000, true]],
  );
});

test("合わないときは知らせるが、売上の金額は直さない", () => {
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "ながやま鷹尾",
    products: PRODUCTS,
    memo: memo([{ name: "手羽先", count: 100 }], 20400),
    receiptExpenses: [],
    boothFeeRule: { type: "percent", rate: 10 },
    cumulativeBefore: 0,
  });
  assert.equal(d.sales, 20400);
  assert.match(d.mismatch ?? "", /¥400 多い/);
  // ながやまは売上の10%（1円未満切り捨て）
  assert.equal(d.expenses[0].amount, 2040);
});

test("合計が読めなければ本数×単価を売上にする。どちらも無ければ保存させない", () => {
  const a = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "マンガ倉庫",
    products: PRODUCTS,
    memo: memo([{ name: "ポテト", count: 2 }], 0),
    receiptExpenses: [],
    boothFeeRule: { type: "none" },
    cumulativeBefore: 0,
  });
  assert.equal(a.sales, 700);
  assert.equal(a.expenses.length, 0); // マンガ倉庫は場代の行を作らない
  const b = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "マンガ倉庫",
    products: PRODUCTS,
    memo: memo([], 0),
    receiptExpenses: [],
    boothFeeRule: { type: "none" },
    cumulativeBefore: 0,
  });
  assert.equal(b.salesMissing, true);
});

test("レシート1枚の品物すべてに同じ写真と立替者が付く", () => {
  const rows = receiptToExpenses(
    { items: [{ name: "油", amount: 1080 }, { name: "塩", amount: 216 }] },
    "data:photo",
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.receipt_image_url === "data:photo" && r.paid_by === "ゆうや"));
  // 品名が読めずに合計だけのとき
  assert.deepEqual(
    receiptToExpenses({ amount: 980 }, "p").map((r) => r.amount),
    [980],
  );
});

test("保存する行：日当0円・本数は互換カラムにも入る・累計に足す", () => {
  const d = buildPhotoReportDraft({
    date: "2026-11-08",
    location: "ニシムタ",
    products: PRODUCTS,
    memo: memo([{ name: "手羽先", count: 100 }, { name: "手羽餃子", count: 10 }], 23000),
    receiptExpenses: receiptToExpenses({ items: [{ name: "油", amount: 1000 }] }, "p"),
    boothFeeRule: { type: "fixed", amount: 5000 },
    cumulativeBefore: 500000,
  });
  const text = photoReportLineText({
    date: "2026-11-08",
    location: "ニシムタ",
    staffName: "ゆうや",
    draft: d,
    flavors: { しお: 40, タレ: 60 },
  });
  const row = buildDailyReportRow({
    date: "2026-11-08",
    location: "ニシムタ",
    staffName: "ゆうや",
    draft: d,
    products: PRODUCTS,
    cumulativeBefore: 500000,
    expensesForSave: d.expenses,
    lineText: text,
    cleanupInventory: {},
    cleanupTasks: {},
    slipImages: ["https://example/slip1.jpg"],
  });
  assert.equal(row.labor, 0);
  assert.equal(row.remaining_tebasaki, 100);
  assert.equal(row.remaining_gyoza, 10);
  assert.equal(row.cumulative_sales, 523000);
  assert.equal(row.shop, "手羽屋");
  assert.equal(row.tenant_id, null);
  assert.match(text, /売上：¥23,000/);
  assert.match(text, /経費：¥6,000/);
  assert.match(text, /差引：¥17,000/);
  assert.match(text, /手羽先の味：しお40・タレ60/);
  assert.equal(row.handover, "伝票の写真（1枚）：\nhttps://example/slip1.jpg");
});

test("新しい出店先：マスタにある場所は名寄せして既存を使う（2つ作らない）", () => {
  const p = resolveNewPlace("ながやま 鷹尾店", ["ながやま鷹尾", "ニシムタ"]);
  assert.deepEqual(p, { name: "ながやま鷹尾", isNew: false, masterRow: null });
});

test("新しい出店先：無ければマスタに足す。お祭りはランク判定から外す", () => {
  const a = resolveNewPlace("  高鍋祭り ", ["ニシムタ"]);
  assert.equal(a?.name, "高鍋祭り");
  assert.equal(a?.isNew, true);
  assert.deepEqual(a?.masterRow, { name: "高鍋祭り", is_active: true, rank_locked: true });
  const b = resolveNewPlace("ハッピー都城店", ["ニシムタ"]);
  assert.equal(b?.masterRow?.rank_locked, false);
  assert.equal(resolveNewPlace("   ", []), null);
});

test("新しい出店先の日はLINEに場代未登録の知らせが出る", () => {
  const d = buildPhotoReportDraft({
    date: "2026-11-10",
    location: "高鍋祭り",
    products: PRODUCTS,
    memo: memo([{ name: "手羽先", count: 10 }], 2000),
    receiptExpenses: [],
    boothFeeRule: { type: "none" },
    cumulativeBefore: 0,
  });
  const t = photoReportLineText({ date: "2026-11-10", location: "高鍋祭り", staffName: "ゆうや", draft: d, newPlace: true });
  assert.match(t, /🆕 新しい出店先/);
  assert.equal(d.expenses.length, 0); // 場代の行は作らない（嘘の0円を残さない）
});
