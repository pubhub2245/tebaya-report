import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCashOpeningGapWindow,
  cashOpeningGapExplains,
  cashOpeningGapFit,
  cashOpeningGapLines,
  diffCausesToShow,
  expensesBeforeOpening,
} from "../lib/keiri/cashOpeningGap";
import { buildCashOpeningGapCheck } from "../lib/keiri/cashCheckScenario";
import type { KeiriReport } from "../lib/keiri/types";

/**
 * 「数え始めの日より前に払った経費」の検算（2026-10-28・kp265・f1-4）。
 *
 * ★ここで固定しているのは **手羽屋の9月の実データで見つかった4件**です
 *   （9/4 12,960円・9/7 8,640円・9/8 12,960円・9/9 12,960円＝合わせて 47,520円。
 *   どれも恵比寿商事の仕入で、売上0円の日）。数え始めは 2026-09-10 です。
 *   金額を決め打ちで画面に書かないことを、ここで担保します。
 */
const OPENING = "2026-09-10";

function report(date: string, items: Array<Record<string, unknown>>): KeiriReport {
  return {
    date,
    location: "ながやま三股",
    staff_name: "イデ",
    shop: "手羽屋",
    sales_amount: 0,
    labor: 0,
    expenses: items,
  } as unknown as KeiriReport;
}

/** 手羽屋の9月（数え始めの前に仕入4件・数え始めの日とそのあとにも経費） */
const SEPT: KeiriReport[] = [
  report("2026-09-04", [{ description: "恵比寿商事 仕入", amount: 12960 }]),
  report("2026-09-07", [{ description: "恵比寿商事 仕入", amount: 8640 }]),
  report("2026-09-08", [{ description: "恵比寿商事 仕入", amount: 12960 }]),
  report("2026-09-09", [{ description: "恵比寿商事 仕入", amount: 12960 }]),
  report("2026-09-10", [{ description: "恵比寿商事 仕入", amount: 12960 }]),
  report("2026-09-15", [{ description: "ガソリン", amount: 5000 }]),
];

test("手羽屋の9月の実データで 47,520円・4件・9/4〜9/9 と出る", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  assert.equal(gap.total, 47520);
  assert.equal(gap.count, 4);
  assert.equal(gap.firstDate, "2026-09-04");
  assert.equal(gap.lastDate, "2026-09-09");
});

test("数え始めの日そのもの（9/10）は数えない（現金にもう入っているため）", () => {
  const gap = expensesBeforeOpening({
    reports: [report("2026-09-10", [{ description: "仕入", amount: 1000 }])],
    openingDate: OPENING,
  });
  assert.equal(gap.count, 0);
  assert.equal(gap.total, 0);
});

test("立替・現金以外は金庫から出ていないので、ズレの理由に数えない", () => {
  const gap = expensesBeforeOpening({
    reports: [
      report("2026-09-05", [
        { description: "仕入（立替）", amount: 3000 },
        { description: "PayPay で支払い", amount: 2000 },
        { description: "仕入", amount: 1000 },
      ]),
    ],
    openingDate: OPENING,
  });
  assert.equal(gap.count, 1);
  assert.equal(gap.total, 1000);
  assert.equal(gap.otherCount, 2);
  assert.equal(gap.otherTotal, 5000);
});

test("当てはまる行が無ければ、画面に1行も出さない", () => {
  const gap = expensesBeforeOpening({ reports: [], openingDate: OPENING });
  assert.deepEqual(cashOpeningGapLines(gap, 47520), []);
  assert.equal(cashOpeningGapExplains(gap, 47520), false);
  assert.equal(buildCashOpeningGapWindow({ gap, diff: 47520 }).shown, false);
});

test("数え始めの日が読めないときは 0件（推測で数えない）", () => {
  assert.equal(expensesBeforeOpening({ reports: SEPT, openingDate: null }).count, 0);
  assert.equal(expensesBeforeOpening({ reports: SEPT, openingDate: "" }).count, 0);
});

test("差が 47,520円 ぴったりなら『ぴったり同じ』と言う", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  assert.equal(cashOpeningGapFit(gap, 47520), "exact");
  const lines = cashOpeningGapLines(gap, 47520);
  assert.equal(lines[0], "数え始めの日より前に払った経費　47,520円（4件・9月4日〜9月9日）");
  assert.ok(lines[lines.length - 1].includes("ぴったり同じ金額です"));
  assert.equal(cashOpeningGapExplains(gap, 47520), true);
});

test("1,000円 未満のちがいなら『ほぼ同じ』", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  assert.equal(cashOpeningGapFit(gap, 47000), "near");
  assert.ok(cashOpeningGapLines(gap, 47000).join("／").includes("ほぼ同じ金額です"));
});

test("金庫のほうが多いとき（マイナス）は説明にしない", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  assert.equal(cashOpeningGapFit(gap, -47520), "no");
  assert.equal(cashOpeningGapExplains(gap, -47520), false);
});

test("差が大きくちがえば説明にしない（言い切らない）", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  assert.equal(cashOpeningGapFit(gap, 300000), "no");
  assert.equal(cashOpeningGapLines(gap, 300000).length, 2);
});

test("まだ数えていない（差が無い）ときは、説明の2行だけ", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  assert.equal(cashOpeningGapLines(gap, null).length, 2);
  assert.equal(cashOpeningGapFit(gap, null), "no");
});

test("金額を外に出さない（窓口は件数と日付だけ）", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  const w = buildCashOpeningGapWindow({ gap, diff: 47520 });
  assert.equal(w.count, 4);
  assert.equal(w.firstDate, "2026-09-04");
  assert.equal(w.lastDate, "2026-09-09");
  assert.equal(w.fit, "exact");
  assert.equal(w.shown, true);
  assert.ok(!JSON.stringify(w).includes("47520"));
  assert.ok(!JSON.stringify(w).includes("47,520"));
});

test("差が 1,000円 未満なら、窓口も『行は出ない』と言う", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  const w = buildCashOpeningGapWindow({ gap, diff: 300 });
  assert.equal(w.shown, false);
  assert.ok(w.note.includes("行は出ません"));
});

/* 外から確かめる筋書き（架空のお店・/api/keiri/cashcheck の openingGap） */
test("架空のお店の筋書きが、自分の検算で合格する", () => {
  const c = buildCashOpeningGapCheck();
  assert.deepEqual(c.problems, []);
  assert.equal(c.ok, true);
  assert.equal(c.count, 3);
  assert.equal(c.total, 12000);
  assert.equal(c.cases.length, 5);
  // ① 理由が分かっているときは「探し物」を出さない
  assert.equal(c.cases[0].fit, "exact");
  assert.equal(c.cases[0].causes.length, 0);
  // ② 別の大きさの差なら、今までどおり原因3つを出す
  assert.equal(c.cases[1].fit, "no");
  assert.equal(c.cases[1].causes.length, 3);
  // 画面に箱が出るのは「差が 1,000円 以上」のときだけ
  assert.equal(c.cases[0].shown, true);
  assert.equal(c.cases[1].shown, true);
  assert.equal(c.cases[3].shown, false);
  assert.equal(c.cases[4].shown, false);
});

test("筋書きに手羽屋の実データを入れない（架空の金額だけ）", () => {
  const c = buildCashOpeningGapCheck();
  const s = JSON.stringify(c);
  assert.ok(!s.includes("47,520"));
  assert.ok(!s.includes("47520"));
  assert.ok(!s.includes("手羽屋の9月"));
});

test("よくある原因を出すかの決め方は1か所（数え方のちがいが先に説明したら出さない）", () => {
  const gap = expensesBeforeOpening({ reports: SEPT, openingDate: OPENING });
  const causes = ["あ", "い", "う"];
  // 数え方のちがいで説明がついたら出さない
  assert.deepEqual(
    diffCausesToShow({ causes, variantMatched: true, gap, diff: 300000 }),
    [],
  );
  // 数え始めの日より前の経費で説明がついたら出さない
  assert.deepEqual(
    diffCausesToShow({ causes, variantMatched: false, gap, diff: 47520 }),
    [],
  );
  // どちらでも説明がつかなければ、今までどおり出す
  assert.deepEqual(
    diffCausesToShow({ causes, variantMatched: false, gap, diff: 300000 }),
    causes,
  );
});
