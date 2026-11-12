import { test } from "node:test";
import assert from "node:assert/strict";
import { calcRealSeparation, monthRangeJst } from "../lib/keiri/realTenantSeparation";

const SHOP = "bec74fef-6293-4c50-8c1c-a8d77bc34262";
const OTHER = "11111111-2222-4333-8444-555555555555";

test("倉庫が読めていないときは、合格にも不合格にもしない（separated は null）", () => {
  const r = calcRealSeparation({ measurable: false, tebaya: [], otherShop: [], otherShopId: SHOP });
  assert.equal(r.separated, null);
  assert.match(r.summary, /数えられませんでした/);
});

test("本物の行が1件も無い月は、0件を『両方の向きの証拠』として出さない", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [{ id: "a", tenant_id: null }],
    otherShop: [],
    otherShopId: SHOP,
  });
  assert.equal(r.separated, true);
  assert.equal(r.measuredAgainstRealRows, false);
  // 2026-11-12：片方の向き（よその店として読むと手羽屋の行が出ない）は本物で確かめたが、
  // 逆向きはまだ確かめていない、と分けて言う
  assert.equal(r.provenDirections, 1);
  assert.match(r.summary, /まだ確かめられていないのは逆向き/);
});

test("本物の行で混ざりが無ければ、そう言う（本物で数えた印が付く）", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [
      { id: "a", tenant_id: null },
      { id: "b", tenant_id: null },
    ],
    otherShop: [{ id: "c", tenant_id: SHOP }],
    otherShopId: SHOP,
  });
  assert.equal(r.separated, true);
  assert.equal(r.measuredAgainstRealRows, true);
  assert.equal(r.tebayaRows, 2);
  assert.equal(r.otherShopRows, 1);
  assert.equal(r.overlap, 0);
  assert.match(r.summary, /本物の行で数えました/);
});

test("手羽屋の読みに印つきの行が混ざっていたら、不合格にする", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [
      { id: "a", tenant_id: null },
      { id: "c", tenant_id: SHOP },
    ],
    otherShop: [{ id: "c", tenant_id: SHOP }],
    otherShopId: SHOP,
  });
  assert.equal(r.separated, false);
  assert.equal(r.strayStampedInTebaya, 1);
  // 同じ行が両方の読みに出たことも数える
  assert.equal(r.overlap, 1);
  assert.match(r.summary, /混ざっています/);
});

test("よその店の読みに手羽屋の行（印が空）が混ざっていたら、不合格にする", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [{ id: "a", tenant_id: null }],
    otherShop: [
      { id: "c", tenant_id: SHOP },
      { id: "d", tenant_id: null },
    ],
    otherShopId: SHOP,
  });
  assert.equal(r.separated, false);
  assert.equal(r.strayTebayaInOtherShop, 1);
});

test("よその店の読みに『別の店』の行が混ざっていたら、不合格にする", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [{ id: "a", tenant_id: null }],
    otherShop: [
      { id: "c", tenant_id: SHOP },
      { id: "e", tenant_id: OTHER },
    ],
    otherShopId: SHOP,
  });
  assert.equal(r.separated, false);
  assert.equal(r.strayWrongShopInOtherShop, 1);
});

test("印の書き方が大文字・小文字で違っても、同じお店として数える", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [],
    otherShop: [{ id: "c", tenant_id: SHOP.toUpperCase() }],
    otherShopId: SHOP,
  });
  assert.equal(r.strayWrongShopInOtherShop, 0);
  assert.equal(r.separated, true);
});

test("月の範囲は日本時間で数える（月初の朝に前の月へずれない）", () => {
  // 2026-12-01 00:30 日本時間（= 2026-11-30 15:30 UTC）
  const r = monthRangeJst(new Date("2026-11-30T15:30:00Z"));
  assert.equal(r.ym, "2026-12");
  assert.equal(r.start, "2026-12-01");
  assert.equal(r.end, "2026-12-31");
  assert.equal(r.label, "2026年12月");
  // うるう年でない2月の月末
  const feb = monthRangeJst(new Date("2027-02-10T00:00:00Z"));
  assert.equal(feb.end, "2027-02-28");
});

// ── 向きごとに「本物の行で確かめたか」を分ける（2026-11-12・f3-4）──
// 11/11 は「その店の行がまだ無い＝作り話と同じ強さ」と1つにまとめていたが、
// よその店として読んだときに出てこなかった相手は「本物の手羽屋の行」なので、
// その向きだけは本物の行で確かめられている。

test("よその店の行が0件でも、手羽屋の行が有れば『片方の向きは本物で確かめた』と言う", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [
      { id: "a", tenant_id: null },
      { id: "b", tenant_id: null },
    ],
    otherShop: [],
    otherShopId: SHOP,
  });
  assert.equal(r.provenOtherShopHidesTebaya, true);
  assert.equal(r.provenTebayaHidesOtherShop, false);
  assert.equal(r.provenDirections, 1);
  // 「作り話と同じ強さ」とは言わない
  assert.match(r.strengthNote, /1つを、本物の行で確かめました/);
  assert.match(r.summary, /片方の向きは本物の行で確かめられました/);
});

test("両方の読みが0件なら、どちらの向きも確かめていないと言う", () => {
  const r = calcRealSeparation({ measurable: true, tebaya: [], otherShop: [], otherShopId: SHOP });
  assert.equal(r.provenDirections, 0);
  assert.match(r.strengthNote, /どちらの向きも確かめられていません/);
});

test("両方に本物の行があれば、2つの向きとも確かめたと言う", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [{ id: "a", tenant_id: null }],
    otherShop: [{ id: "c", tenant_id: SHOP }],
    otherShopId: SHOP,
  });
  assert.equal(r.provenDirections, 2);
  assert.match(r.strengthNote, /2つの向きとも/);
});

test("混ざっている月は、向きの数を立てない（合格に見せない）", () => {
  const r = calcRealSeparation({
    measurable: true,
    tebaya: [{ id: "a", tenant_id: null }],
    otherShop: [{ id: "b", tenant_id: null }],
    otherShopId: SHOP,
  });
  assert.equal(r.separated, false);
  assert.equal(r.provenDirections, 0);
  assert.match(r.strengthNote, /混ざっていました/);
});

test("倉庫が読めない日は、向きの数を立てない", () => {
  const r = calcRealSeparation({
    measurable: false,
    tebaya: [{ id: "a", tenant_id: null }],
    otherShop: [],
    otherShopId: SHOP,
  });
  assert.equal(r.provenDirections, 0);
  assert.equal(r.separated, null);
});
