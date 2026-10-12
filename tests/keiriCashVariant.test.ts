import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCashVariants,
  cashVariantWindow,
  pickCashVariant,
} from "../lib/keiri/cashVariant";
import { advanceReadRange, advanceRepaidEarlierRange } from "../lib/keiri/advanceRange";
import { calcCashPosition } from "../lib/keiri";
import type { KeiriAdvance, KeiriPayment, KeiriReport, KeiriSettings } from "../lib/keiri/types";

/**
 * 「金庫の現金の数え方が2通りあるとき、どちらに合うかを画面が自分で言う」決まりを固定する
 * （2026-10-12・kp250・f1-4）。
 *
 * ■ なぜ要るのか
 *   前の月までに立て替えて今月 返したお金は、立て替えた日が読む期間の外なので
 *   読まれず、金庫の計算から引かれていない（手羽屋の9月は9行・493,700円）。
 *   そのままじゅんが金庫を数えると「金庫のほうが49万円 少ない／書き忘れを探してください」と出る。
 *   書き忘れが1件も無いのに探し物をさせてしまうので、
 *   **数え方のちがいなら、そう言う**ようにした。
 *
 * ■ ここで守りたいこと
 *   ① 2通りの金額が同じ月では、選択肢を出さない（画面に何も増えない）
 *   ② 合った側を名指しする。合わなければ「どちらでもない」と正直に言う
 *   ③ 「返した日で引く」側の立替は、**月の経費には1円も入れない**
 *   ④ 外に出す形（窓口）では金額を1円も返さない
 */

const SETTINGS: KeiriSettings = {
  opening_date: "2026-09-10",
  opening_balance: 145000,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

const REPORTS: KeiriReport[] = [
  {
    date: "2026-09-15",
    location: "ながやま鷹尾",
    staff_name: "じゅん",
    shop: "手羽屋",
    sales_amount: 50000,
    labor: 0,
    expenses: [{ description: "氷", amount: 1000 }],
  } as unknown as KeiriReport,
];

const PAYMENTS: KeiriPayment[] = [];

/** 8月に立て替えて9月に返した立替（ふだんの期間では読まれない行） */
const REPAID_EARLIER: KeiriAdvance[] = [
  {
    id: 1,
    date: "2026-08-20",
    amount: 493700,
    description: "出店料",
    payer: "じゅん",
    settled: true,
    settledDate: "2026-09-20",
    source: "owner",
    account: null,
    skipReason: null,
  },
];

test("① 2通りの金額が同じなら、選択肢は出さない", () => {
  const variants = buildCashVariants({ screenBalance: 194000, withRepaidBalance: 194000 });
  assert.equal(variants.length, 1);
  const pick = pickCashVariant({ variants, counted: 194000 });
  assert.equal(pick.hasChoice, false);
  assert.equal(pick.match, "single");
  // 読めなかった（null）ときも1つだけ
  assert.equal(
    buildCashVariants({ screenBalance: 194000, withRepaidBalance: null }).length,
    1,
  );
  // 残高そのものが出せないときは空
  assert.equal(buildCashVariants({ screenBalance: null, withRepaidBalance: 1 }).length, 0);
});

test("② 金庫の金額が「返した分も引く」側に合えば、そちらを名指しする", () => {
  const variants = buildCashVariants({ screenBalance: 1004399, withRepaidBalance: 510699 });
  assert.equal(variants.length, 2);

  const hit = pickCashVariant({ variants, counted: 510699 });
  assert.equal(hit.hasChoice, true);
  assert.equal(hit.match, "withEarlierRepaid");
  assert.equal(hit.matched?.balance, 510699);
  // 近い順に並ぶ（合った側が先頭）
  assert.equal(hit.rows[0].variant.key, "withEarlierRepaid");
  assert.ok(hit.lines.some((l) => l.includes("合いました")));
  // 「書き忘れを探してください」とは言わず、探す必要が無いと言う
  assert.ok(hit.lines.some((l) => l.includes("書き忘れを探す必要はありません")));

  const now = pickCashVariant({ variants, counted: 1004399 });
  assert.equal(now.match, "nowScreen");
  assert.ok(now.lines.some((l) => l.includes("このまま進めて大丈夫")));
});

test("② おつりの誤差（1,000円未満）までは合ったとみなす／外れたら正直に言う", () => {
  const variants = buildCashVariants({ screenBalance: 1004399, withRepaidBalance: 510699 });
  assert.equal(pickCashVariant({ variants, counted: 510000 }).match, "withEarlierRepaid");
  // 1,000円 ちょうどは合わない
  assert.equal(pickCashVariant({ variants, counted: 509699 }).match, "neither");

  const miss = pickCashVariant({ variants, counted: 300000 });
  assert.equal(miss.match, "neither");
  assert.equal(miss.matched, null);
  assert.ok(miss.lines.some((l) => l.includes("どちらにも合いませんでした")));
});

test("③ 「返した日で引く」側の立替は、現金だけを動かし 月の経費には入れない", () => {
  const base = calcCashPosition({
    reports: REPORTS,
    payments: PAYMENTS,
    settings: SETTINGS,
    advances: [],
  });
  const withRepaid = calcCashPosition({
    reports: REPORTS,
    payments: PAYMENTS,
    settings: SETTINGS,
    advances: REPAID_EARLIER,
  });
  // 現金は返した額ぶんだけ減る
  assert.equal(base.balance - withRepaid.balance, 493700);
  // 月の経費（日報の経費の合計）は1円も変わらない
  assert.equal(base.expenses, withRepaid.expenses);
  assert.equal(base.sales, withRepaid.sales);
});

test("③ 読む条件は、ふだんの期間の始まりより前に立て替えた行だけを拾う", () => {
  const range = advanceReadRange({ ym: "2026-09", openingDate: "2026-09-10" });
  const repaid = advanceRepaidEarlierRange(range);
  // ふだんの期間は月初から（上は区切らない）
  assert.equal(range.from, "2026-09-01");
  assert.equal(range.to, null);
  // ＝ 立て替えた日が 2026-09-01 より前・返した日が 2026-09-01 以降
  assert.equal(repaid.advancedBefore, "2026-09-01");
  assert.equal(repaid.repaidFrom, "2026-09-01");
  assert.equal(repaid.repaidTo, null);
});

test("④ 外に出す形では、金額を1円も返さない", () => {
  const w = cashVariantWindow({
    extraRows: [
      { settledInMonth: true },
      { settledInMonth: true },
      { settledInMonth: false },
    ],
    readable: true,
  });
  assert.equal(w.differs, true);
  assert.equal(w.extraRows, 3);
  assert.equal(w.repaidRows, 2);
  assert.ok(!/\d{3},\d{3}/.test(JSON.stringify(w)));

  // 返した行が無ければ「ちがいなし」
  const none = cashVariantWindow({ extraRows: [{ settledInMonth: false }], readable: true });
  assert.equal(none.differs, false);

  // 読めなかったときは「0件」と取り違えない
  const unread = cashVariantWindow({ extraRows: [], readable: false });
  assert.equal(unread.readable, false);
  assert.equal(unread.differs, false);
  assert.ok(unread.note.includes("読めなかった"));
});

/**
 * 外から確かめる窓口（/api/keiri/cashcheck）の筋書きを固定する（2026-10-12・kp250・f1-4）。
 * ★検査役（B2）は合言葉の内側の経理画面を開けないので、ここが唯一の確かめ口になる。
 */
test("⑤ 外から確かめる筋書きが、4通りとも正しく出る", async () => {
  const { buildCashVariantCheck, checkVariantCases, buildCashCheck } = await import(
    "../lib/keiri/cashCheckScenario"
  );
  const v = buildCashVariantCheck();
  assert.equal(checkVariantCases(v).length, 0, "筋書きの検算に不合格が無い");
  assert.equal(v.cases.length, 4);
  assert.equal(v.balances.nowScreen - v.balances.withEarlierRepaid, v.repaidEarlierYen);
  // ④（分かれていない月）は行が1行も増えない
  assert.equal(v.cases[3].lines.length, 0);

  // 窓口そのものも、この検算を自分で通している
  const whole = buildCashCheck({ countedYen: null });
  assert.equal(whole.ok, true, whole.problems.join(" / "));
  assert.equal(whole.variants.cases.length, 4);
});
