/**
 * 「金庫の突き合わせを、外から確かめる窓口」のテスト（f1-4・kp233）。
 *
 * ここが狂うと、検査役に「差の言葉も原因3つも正しく出ます」と言いながら
 * 実際は出ていない、という事故になる。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCashCheck,
  cashCheckBaseDate,
  cashCheckCountedOn,
  cashCheckPosition,
  cashCheckYm,
  checkCases,
} from "../lib/keiri/cashCheckScenario";
import { DIFF_CAUSES, DIFF_CAUSES_OVER, NEAR_ENOUGH_YEN } from "../lib/keiri/cashCheck";

/** 今日を固定して、いつ実行しても同じ答えになるようにする */
const TODAY = "2026-10-10";
/**
 * ★比べる相手も、同じ「今日」から出す（2026-11-01・f1-4）。
 *   読み込んだときの本当の今日から出した定数と比べていたため、
 *   月が替わった日（11/1）にこの試験が落ちていました。
 */
const BASE = cashCheckBaseDate(TODAY);

test("6通りそろっていて、検算が通る", () => {
  const r = buildCashCheck({ today: TODAY });
  assert.equal(r.cases.length, 6);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
});

test("ぴったりのときは、原因を出さない", () => {
  const r = buildCashCheck({ today: TODAY });
  const c = r.cases[0];
  assert.equal(c.diff, 0);
  assert.equal(c.direction, "ぴったり");
  assert.equal(c.causes.length, 0);
  assert.match(c.verdict, /ぴったり/);
});

test("1,000円 未満のズレは「ほぼ合っている」で、原因を出さない", () => {
  const c = buildCashCheck({ today: TODAY }).cases[1];
  assert.ok(c.diff !== null && Math.abs(c.diff) < NEAR_ENOUGH_YEN);
  assert.equal(c.causes.length, 0);
  assert.match(c.verdict, /ほぼ合っています/);
});

test("金庫のほうが少ないときは、向きの言葉と原因3つが出る", () => {
  const c = buildCashCheck({ today: TODAY }).cases[2];
  assert.ok(c.diff !== null && c.diff > 0);
  assert.equal(c.direction, "金庫のほうが少ない");
  assert.deepEqual([...c.causes], [...DIFF_CAUSES]);
  assert.match(c.verdict, /金庫のほうが .* 少ないです/);
  // 差の行には必ず向きの言葉が入る（記号だけにしない）
  assert.match(c.lines[2], /金庫のほうが少ない/);
});

test("金庫のほうが多いときは、向きの言葉と『多い側の』原因3つが出る", () => {
  // ★2026-11-04・f1-4：ここは以前「少ない側と同じ3つ」を固定していました。
  //   返した立替・銀行に入れたお金は、どちらも金庫を減らす側なので、
  //   多い側では起こりえません（起こりえない探し物を渡していた）。
  const c = buildCashCheck({ today: TODAY }).cases[3];
  assert.ok(c.diff !== null && c.diff < 0);
  assert.equal(c.direction, "金庫のほうが多い");
  assert.deepEqual([...c.causes], [...DIFF_CAUSES_OVER]);
  assert.notDeepEqual([...c.causes], [...DIFF_CAUSES]);
  assert.match(c.verdict, /金庫のほうが .* 多いです/);
});

test("まだ1回も数えていないときは、差も原因も出さない", () => {
  const c = buildCashCheck({ today: TODAY }).cases[4];
  assert.equal(c.computed, null);
  assert.equal(c.counted, null);
  assert.equal(c.lines.length, 0);
  assert.equal(c.causes.length, 0);
  assert.match(c.verdict, /金庫を1回数えて/);
});

test("久しく数えていないときは、その一言が出る", () => {
  const c = buildCashCheck({ today: TODAY }).cases[5];
  assert.ok(c.stale && c.stale.includes("最後に数えたのは"));
});

/**
 * 2026-11-01 追加（f1-4）：⑥の場面が、**いつ開いても**成立すること。
 * 本番で実測したところ、月が替わった直後（11/1）は数えた日から27日しか
 * たっておらず「久しく数えていません」が出ていなかった（検算は空で返っていた）。
 */
test("⑥は、月のどこで開いても『久しく数えていません』が出る（検算も拾う）", () => {
  for (const day of ["01", "02", "03", "10", "15", "28"]) {
    for (const ym of ["2026-01", "2026-03", "2026-11", "2027-02"]) {
      const r = buildCashCheck({ today: `${ym}-${day}` });
      const six = r.cases[5];
      assert.ok(
        six.stale && six.stale.includes("最後に数えたのは"),
        `${ym}-${day} で ⑥ の一言が出ていません`,
      );
      assert.deepEqual(r.problems, [], `${ym}-${day} で検算に問題が出ました`);
    }
  }
});

test("⑥の一言が落ちたら、検算が名前を出して拾う", () => {
  const six = buildCashCheck({ today: TODAY }).cases[5];
  const broken = { ...six, stale: null };
  const found = checkCases([broken]);
  assert.ok(found.some((m) => m.includes("久しく数えていません")), found.join(" / "));
});

test("金額を指定すると7通りになり、計算上との差がそのまま出る", () => {
  const computed = cashCheckPosition().balance;
  const r = buildCashCheck({ today: TODAY, countedYen: computed - 10000 });
  assert.equal(r.cases.length, 7);
  const c = r.cases[6];
  assert.equal(c.counted, computed - 10000);
  assert.equal(c.diff, 10000);
  assert.equal(r.ok, true);
});

test("検算は、つじつまが合っていない行をちゃんと見つける", () => {
  const r = buildCashCheck({ today: TODAY });
  const broken = { ...r.cases[2], direction: "金庫のほうが多い" };
  assert.ok(checkCases([broken]).length > 0);
  const noCause = { ...r.cases[2], causes: [] as string[] };
  assert.ok(checkCases([noCause]).length > 0);
});

test("架空のお店の数字で、手羽屋の実データを読みに行かない", () => {
  const r = buildCashCheck({ today: TODAY });
  assert.equal(r.ym, cashCheckYm(BASE));
  assert.match(r.shopName, /架空/);
  assert.equal(r.cases[0].countedOn, cashCheckCountedOn(BASE));
  // 「計算上の現金は、こう数えています」の明細が出ている（数え方を1つに固定する行）
  assert.ok(r.howComputed.length >= 3);
  assert.match(r.howComputed[r.howComputed.length - 1], /＝ 計算上の現金/);
});
