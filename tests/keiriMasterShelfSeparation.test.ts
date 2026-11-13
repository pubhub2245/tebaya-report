import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcMasterShelfSeparation,
  type MasterShelfRead,
} from "../lib/keiri/masterShelfSeparation";

const SHOP = "bec74fef-6293-4c50-8c1c-a8d77bc34262";
const OTHER = "11111111-2222-4333-8444-555555555555";

const shelf = (
  table: string,
  label: string,
  tebaya: { id: string; tenant_id: string | null }[],
  otherShop: { id: string; tenant_id: string | null }[],
  readable = true,
): MasterShelfRead => ({ table, label, readable, tebaya, otherShop });

test("よその店の本物の行がある棚で混ざりが無ければ、逆向きを『確かめた』と言う", () => {
  const r = calcMasterShelfSeparation({
    shelves: [
      shelf("locations", "出店場所", [{ id: "a", tenant_id: null }], [{ id: "z", tenant_id: SHOP }]),
      shelf(
        "sale_products",
        "商品と単価",
        [{ id: "b", tenant_id: null }],
        [
          { id: "p1", tenant_id: SHOP },
          { id: "p2", tenant_id: SHOP },
        ],
      ),
    ],
    otherShopId: SHOP,
  });
  assert.equal(r.measurable, true);
  assert.equal(r.clean, true);
  assert.equal(r.otherShopRows, 3);
  assert.equal(r.shelvesWithRealRows, 2);
  assert.equal(r.strayRows, 0);
  assert.equal(r.provenTebayaHidesOtherShop, true);
  assert.match(r.summary, /本物の行で確かめました/);
});

test("よその店の行が1行も無ければ、0件を証拠にしない", () => {
  const r = calcMasterShelfSeparation({
    shelves: [shelf("locations", "出店場所", [{ id: "a", tenant_id: null }], [])],
    otherShopId: SHOP,
  });
  assert.equal(r.clean, true);
  assert.equal(r.shelvesWithRealRows, 0);
  assert.equal(r.provenTebayaHidesOtherShop, false);
  assert.match(r.summary, /証拠にはなりません/);
});

test("手羽屋の読みに印つきの行が混ざっていたら、混ざりとして数える", () => {
  const r = calcMasterShelfSeparation({
    shelves: [
      shelf(
        "locations",
        "出店場所",
        [
          { id: "a", tenant_id: null },
          { id: "z", tenant_id: SHOP },
        ],
        [{ id: "z", tenant_id: SHOP }],
      ),
    ],
    otherShopId: SHOP,
  });
  assert.equal(r.clean, false);
  assert.equal(r.provenTebayaHidesOtherShop, false);
  assert.equal(r.shelves[0].strayStampedInTebaya, 1);
  assert.equal(r.shelves[0].overlap, 1);
  assert.match(r.summary, /混ざっていました/);
});

test("よその店の読みに別の店の行が混ざっていたら、混ざりとして数える", () => {
  const r = calcMasterShelfSeparation({
    shelves: [
      shelf(
        "sale_products",
        "商品と単価",
        [{ id: "a", tenant_id: null }],
        [{ id: "x", tenant_id: OTHER }],
      ),
    ],
    otherShopId: SHOP,
  });
  assert.equal(r.clean, false);
  assert.equal(r.shelves[0].strayWrongShopInOtherShop, 1);
  assert.equal(r.provenTebayaHidesOtherShop, false);
});

test("読めなかった棚は『漏れていない』に寄せない（数に入れず、名前だけ残す）", () => {
  const r = calcMasterShelfSeparation({
    shelves: [
      shelf("locations", "出店場所", [{ id: "a", tenant_id: null }], [{ id: "z", tenant_id: SHOP }]),
      shelf("staff_members", "担当者", [], [], false),
    ],
    otherShopId: SHOP,
  });
  assert.equal(r.measured, 1);
  assert.deepEqual(r.unreadable, ["担当者"]);
  assert.equal(r.clean, true);
  assert.equal(r.provenTebayaHidesOtherShop, true);
  assert.match(r.summary, /読めなかった棚が 1 つあります/);
  assert.equal(r.shelves[1].clean, null);
});

test("1本も読めなければ、合格にも不合格にもしない", () => {
  const r = calcMasterShelfSeparation({
    shelves: [shelf("locations", "出店場所", [], [], false)],
    otherShopId: SHOP,
  });
  assert.equal(r.measurable, false);
  assert.equal(r.clean, null);
  assert.equal(r.provenTebayaHidesOtherShop, false);
  assert.match(r.summary, /合格にも不合格にもしていません/);
});
