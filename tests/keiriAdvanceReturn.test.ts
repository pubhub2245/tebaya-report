import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildJournalRows,
  calcCashPosition,
  summarizeMonth,
  TEBAYA_TEMPLATE,
  type KeiriSettings,
} from "../lib/keiri";
import { normalizeOwnerAdvance } from "../lib/keiri/advances";

/**
 * 「前の月に立て替えて、今月 返した立替」を、どの月に数えるかを固定する
 * （2026-10-15・kp250・f1-2／f1-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   同じ6件の立替から、**2通りの9月**が読めていました。
 *   ・経費を「立て替えた日」で数えるか、「返した日」で数えるか
 *   ・金庫から引くのを「立て替えた日」にするか、「返した日」にするか
 *   読み方が2つあると、月の経費と金庫の残高が人によって変わります（CLAUDE.md 4-1）。
 *
 * ■ 決めたこと（1つだけ）
 *   ・**経費** … 立て替えた日の月に入れる（CLAUDE.md 5-4b のまま）
 *   ・**金庫の現金** … 返した日に引く。返した日が数え始めの日より後なら、
 *     立て替えた日がいつでも引く（「○日以内」のような線は引かない）
 *   ・**返した日が数え始めの日より前** … 起点の金庫にもう含まれているので引かない
 *
 * ■ 下の6件と期待値は、B2 の材料（meta/keiri-material-tatekae-henkin-1015）と同じ値です。
 *   架空のお店（数え始め 2026-09-10・起点の金庫 100,000円）で、日報は0件。
 */

const settings: KeiriSettings = {
  opening_date: "2026-09-10",
  opening_balance: 100000,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

/** A〜F の6件（立て替えた日／金額／返した日） */
const advances = [
  // A 前の月に立替 → 今月 返した
  { date: "2026-08-20", amount: 5000, description: "食材", settled: true, settled_date: "2026-09-15" },
  // B ずっと前に立替 → 今月 返した（「○日以内」の線は使わないので、これも引く）
  { date: "2026-06-25", amount: 8000, description: "消耗品", settled: true, settled_date: "2026-09-15" },
  // C 今月 立替 → 今月 返した（二重に引かない）
  { date: "2026-09-12", amount: 3000, description: "食材", settled: true, settled_date: "2026-09-20" },
  // D 今月 立替 → 来月 返す（経費は今月・金庫はまだ動かない）
  { date: "2026-09-25", amount: 4000, description: "食材", settled: true, settled_date: "2026-10-03" },
  // E 数え始め（9/10）より前に返した＝起点の金庫にもう入っている
  { date: "2026-08-01", amount: 6000, description: "食材", settled: true, settled_date: "2026-09-05" },
  // F まだ返していない
  { date: "2026-08-28", amount: 2000, description: "食材", settled: false, settled_date: null },
].map(normalizeOwnerAdvance);

const summary = summarizeMonth({
  ym: "2026-09",
  reports: [],
  template: TEBAYA_TEMPLATE,
  settings,
  advances,
});

const cash = calcCashPosition({
  reports: [],
  payments: [],
  settings,
  advances,
  asOf: "2026-09-30",
});

test("9月の経費に入るのは「9月に立て替えた分」だけ（C 3,000 ＋ D 4,000）", () => {
  assert.equal(summary.expenseFromAdvance, 7000);
  assert.equal(summary.expenseTotal, 7000);
  // A・B・E・F は 9月の経費では0円（返した月に経費を動かさない）
  assert.equal(summary.advanceCount, 2);
});

test("9月の金庫から引くのは「9月に返した分」だけ（A 5,000＋B 8,000＋C 3,000）", () => {
  assert.equal(cash.advancesSettled, 16000);
  // D は10月に返すので引かない。E は数え始めより前なので引かない。F は返していない
  assert.equal(cash.balance, 100000 - 16000);
});

test("ずっと前（6月）の立替でも、9月に返したなら9月の金庫から引く", () => {
  // 「○日以内しか見ない」という線は引かない＝ B の 8,000円も必ず引く
  const onlyB = calcCashPosition({
    reports: [],
    payments: [],
    settings,
    advances: [advances[1]],
    asOf: "2026-09-30",
  });
  assert.equal(onlyB.advancesSettled, 8000);
});

test("返した日が数え始めより前なら、二重に引かない（E）", () => {
  const onlyE = calcCashPosition({
    reports: [],
    payments: [],
    settings,
    advances: [advances[4]],
    asOf: "2026-09-30",
  });
  assert.equal(onlyE.advancesSettled, 0);
  assert.equal(onlyE.balance, 100000);
});

test("会計ソフト向けの表も、発生は立て替えた日・返金は返した日で並ぶ", () => {
  const rows = buildJournalRows({
    ym: "2026-09",
    reports: [],
    payments: [],
    settings,
    template: TEBAYA_TEMPLATE,
    advances,
  });
  // 立替の発生（相手は未払金）は C・D の2行だけ＝経費の月と同じ
  const accrued = rows.filter((r) => r.note.includes("立替") && !r.note.includes("返金"));
  assert.equal(accrued.length, 2);
  assert.deepEqual(
    accrued.map((r) => r.date),
    ["2026-09-12", "2026-09-25"],
  );
  const refunds = rows.filter((r) => r.note.includes("返金"));
  assert.deepEqual(
    refunds.map((r) => r.date),
    ["2026-09-05", "2026-09-15", "2026-09-15", "2026-09-20"],
  );
});

/**
 * ★いまの形（直っていません・2026-10-15 18:3x に見つけた食い違い）
 *
 *   会計ソフト向けの表は「返した日がその月なら」返金の行を作りますが、
 *   金庫の数え方は「**数え始めの日より後に返した分だけ**」を引きます。
 *   ＝ 数え始めより前に返した立替（上の E・9/05）だけ、
 *   **表には出るのに金庫からは引かない**という差が出ます（この例では 6,000円）。
 *
 *   手羽屋の数え始めは 2026-09-10 なので、9/01〜9/09 に返した立替があると
 *   9月の表の行数が変わります。**どちらに寄せるかを決めて直す前に、
 *   手羽屋の9月の行数（いま124行）が変わらないことを本番で確かめる必要があるため、
 *   この回では直していません**（司令室に1件 置いてあります）。
 *   ここは「気づかないうちに増減しないための見張り」です。直したらこの試験を書き換えること。
 */
test("【いまの形・見張り】表の返金と、金庫から引く額が、起点より前の分だけ食い違う", () => {
  const rows = buildJournalRows({
    ym: "2026-09",
    reports: [],
    payments: [],
    settings,
    template: TEBAYA_TEMPLATE,
    advances,
  });
  const refundTotal = rows
    .filter((r) => r.note.includes("返金"))
    .reduce((s, r) => s + r.creditAmount, 0);
  assert.equal(refundTotal, 22000); // A 5,000＋B 8,000＋C 3,000＋E 6,000
  assert.equal(cash.advancesSettled, 16000); // E を引かない（起点より前に返した）
  assert.equal(refundTotal - cash.advancesSettled, 6000);
});

/**
 * ■ 画面がどちらを出すかは、ここでは決めません（2026-10-15 18:3x）
 *   「前の月までに立て替えて今月 返した分」を金庫から引くかどうかは、
 *   じゅんが金庫を数えた金額（kp245・f1-4）で決まります。
 *   いまの画面は**2通りを並べて、合った側を言う**作りで（lib/keiri/cashVariant.ts）、
 *   そこに店主向けの言葉も入っています。ここで同じ説明をもう1つ作ると、
 *   同じことを2か所で言うことになるので作りません（CLAUDE.md 4-1 と同じ考え方）。
 *   ★この試験が固定しているのは**計算する所の決まり**です。
 */
