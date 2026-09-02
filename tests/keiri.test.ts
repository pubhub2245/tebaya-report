/**
 * 経理の計算のテスト。
 *
 * ★ここで固定しているのは docs/keiri.md 5章の定義です。
 *   とくに「利益は発生分を引く／現金は払った分だけを引く」の区別は、
 *   壊すと『今の現金』が実際の手元のお金と合わなくなります。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyExpense,
  normalizeText,
  calcOutsourcing,
  calcCashPosition,
  calcUnpaid,
  calcRentAccrued,
  rentForMonth,
  monthsInRange,
  summarizeByLocation,
  summarizeMonth,
  monthEnd,
  buildJournalRows,
  toCsv,
  expenseSlices,
  UNSET_LOCATION,
  TEBAYA_TEMPLATE,
  templateFor,
  type KeiriReport,
  type KeiriPayment,
  type KeiriSettings,
} from "../lib/keiri";

const T = TEBAYA_TEMPLATE;

const SETTINGS: KeiriSettings = {
  opening_date: "2026-08-10",
  opening_balance: 0,
  outsourcing_rate: 0.1,
  monthly_rent: 35000,
  rent_start_month: "2026-08",
};

/** 家賃を数えない設定（家賃を入れる前の動きが変わっていないか確かめる用） */
const NO_RENT: KeiriSettings = { ...SETTINGS, monthly_rent: 0 };

/* ---------- 文字の揃え方 ---------- */

test("normalizeText: 前後の空白を落とし、全角英数を半角小文字にする", () => {
  assert.equal(normalizeText("  ＥＴＣ  "), "etc");
  assert.equal(normalizeText("OPPテープ"), "oppテープ");
  assert.equal(normalizeText(null), "");
});

/* ---------- 経費の振り分け（実データの書き方で確かめる） ---------- */

test("classifyExpense: 実データの書き方が正しい科目に入る", () => {
  const cases: [string, string][] = [
    ["場代", "booth_fee"],
    ["さどわらん祭り（場代）", "booth_fee"],
    ["惣菜テナント料", "booth_fee"],
    ["肉代", "purchase"],
    ["手羽代(8/8)", "purchase"],
    ["牛豚合挽きミンチ(5:5)", "purchase"],
    ["ポテト×2", "purchase"],
    ["片栗粉×4", "purchase"],
    ["キャノーラ油（一斗缶）", "purchase"],
    ["レジ袋", "supplies"],
    ["スターパック 中深 100枚 3コ×単480", "supplies"],
    ["キッチンペーパー", "supplies"],
    ["ハニー UシンガーニトリルSRB 黒M 10", "supplies"],
    ["コピー代", "supplies"],
    ["ラミネート×2", "supplies"],
    ["一ツ葉有料道路×2", "vehicle"],
    ["高速代(ラウワン)", "vehicle"],
    ["1番隊ガソリン代", "vehicle"],
    ["8/11(交通費)", "vehicle"],
  ];
  for (const [text, account] of cases) {
    const got = classifyExpense(text, T);
    assert.equal(got.account, account, `${text} → ${got.account}`);
    assert.equal(got.matched, true, `${text} が対応表に当たっていない`);
  }
});

test("classifyExpense: 順番が大事（オイル交換は油ではなく車両費）", () => {
  assert.equal(classifyExpense("オイル交換", T).account, "vehicle");
  assert.equal(classifyExpense("オイル代（6/14、フリード）", T).account, "vehicle");
  // 交通費が先に当たるので、肉の受け取りでも車両費になる
  assert.equal(classifyExpense("交通費(肉の受け取り、現場)", T).account, "vehicle");
});

test("classifyExpense: 当たらないものは雑費（matched=false）", () => {
  for (const text of ["さとみさん研修給", "検便", "前日マイナス分", "", null]) {
    const got = classifyExpense(text, T);
    assert.equal(got.account, "misc");
    assert.equal(got.matched, false);
  }
});

test("classifyExpense: 人件費・外注費・家賃には自動で振り分けない（現金残高を壊さないため）", () => {
  for (const text of [
    "仕込み時給(なぎさ)",
    "さとみさん研修給",
    "7/3(かずき)給与補填",
    "事務所の家賃",
    "家賃",
  ]) {
    const got = classifyExpense(text, T);
    assert.notEqual(got.account, "payroll", text);
    assert.notEqual(got.account, "outsourcing", text);
    assert.notEqual(got.account, "rent", text);
  }
});

/* ---------- 外注費（Alpha） ---------- */

test("calcOutsourcing: 売上高 × 率。端数は四捨五入", () => {
  assert.equal(calcOutsourcing(767850, 0.1), 76785);
  assert.equal(calcOutsourcing(1005, 0.1), 101); // 100.5 → 101
  assert.equal(calcOutsourcing(0, 0.1), 0);
});

/* ---------- 月次のまとめ ---------- */

const REPORTS: KeiriReport[] = [
  {
    date: "2026-08-05", // 期首日より前。月次には入るが、現金・未払いには入らない
    location: "ながやま三股",
    staff_name: "じゅん",
    sales_amount: 40000,
    labor: 10000,
    expenses: [{ description: "場代", amount: 3000 }],
  },
  {
    date: "2026-08-15",
    location: "ながやま三股",
    staff_name: "かずき",
    sales_amount: 60000,
    labor: 12000,
    expenses: [
      { description: "肉代", amount: 8000 },
      { description: "レジ袋", amount: 500 },
      { description: "検便", amount: 1881 }, // 対応表に無い → 雑費
    ],
  },
  {
    date: "2026-08-20",
    location: "", // 場所が空 → 「未設定」
    staff_name: "イデ",
    sales_amount: 30000,
    labor: 8000,
    expenses: [{ description: "高速代", amount: 1200 }],
  },
  {
    date: "2026-09-01", // 別の月
    location: "PASIO高城",
    staff_name: "なぎさ",
    sales_amount: 50000,
    labor: 9000,
    expenses: [{ description: "場代", amount: 2000 }],
  },
];

test("summarizeMonth: 科目ごとに足し、人件費と外注費を自動で足す", () => {
  const s = summarizeMonth({
    ym: "2026-08",
    reports: REPORTS,
    template: T,
    settings: NO_RENT,
  });
  assert.equal(s.reportCount, 3);
  assert.equal(s.sales, 130000);
  assert.equal(s.expenseByAccount.booth_fee, 3000);
  assert.equal(s.expenseByAccount.purchase, 8000);
  assert.equal(s.expenseByAccount.supplies, 500);
  assert.equal(s.expenseByAccount.vehicle, 1200);
  assert.equal(s.expenseByAccount.misc, 1881);
  assert.equal(s.expenseByAccount.communication, 0);
  // 人件費＝日報の日当の合計
  assert.equal(s.expenseByAccount.payroll, 30000);
  assert.equal(s.payroll, 30000);
  // 外注費＝その月の売上 × 10%
  assert.equal(s.expenseByAccount.outsourcing, 13000);
  assert.equal(s.outsourcing, 13000);
  // 経費合計と利益
  assert.equal(s.expenseTotal, 3000 + 8000 + 500 + 1200 + 1881 + 30000 + 13000);
  assert.equal(s.profit, 130000 - s.expenseTotal);
});

test("summarizeMonth: 対応表に当たらなかった明細を件数つきで返す", () => {
  const s = summarizeMonth({
    ym: "2026-08",
    reports: REPORTS,
    template: T,
    settings: NO_RENT,
  });
  assert.equal(s.unmatched.length, 1);
  assert.equal(s.unmatched[0].description, "検便");
  assert.equal(s.unmatched[0].amount, 1881);
});

test("summarizeMonth: 計上日は日報の date（別の月は入らない）", () => {
  const s = summarizeMonth({
    ym: "2026-09",
    reports: REPORTS,
    template: T,
    settings: NO_RENT,
  });
  assert.equal(s.sales, 50000);
  assert.equal(s.reportCount, 1);
});

test("expenseSlices: 金額0の科目はグラフに出さない", () => {
  const s = summarizeMonth({
    ym: "2026-08",
    reports: REPORTS,
    template: T,
    settings: NO_RENT,
  });
  const keys = expenseSlices(s).map((x) => x.key);
  assert.ok(!keys.includes("communication"));
  assert.ok(keys.includes("payroll"));
  assert.ok(keys.includes("outsourcing"));
});

/* ---------- 今の現金 ---------- */

const PAYMENTS: KeiriPayment[] = [
  { paid_on: "2026-09-05", amount: 20000, kind: "payroll" },
  { paid_on: "2026-09-05", amount: 5000, kind: "outsourcing" },
  { paid_on: "2026-08-01", amount: 99999, kind: "payroll" }, // 期首日より前 → 数えない
];

test("calcCashPosition: 期首日以降の売上を足し、経費と支払った分を引く", () => {
  const c = calcCashPosition({
    reports: REPORTS,
    payments: PAYMENTS,
    settings: SETTINGS,
  });
  // 8/5 の日報は期首日（8/10）より前なので入らない
  assert.equal(c.sales, 60000 + 30000 + 50000);
  assert.equal(c.expenses, 8000 + 500 + 1881 + 1200 + 2000);
  assert.equal(c.paid, 25000);
  assert.equal(c.balance, 0 + c.sales - c.expenses - c.paid);
});

test("calcCashPosition: 人件費と外注費は『払った分だけ』引く（発生分は引かない）", () => {
  const c = calcCashPosition({
    reports: REPORTS,
    payments: [],
    settings: SETTINGS,
  });
  // 支払いが1件も無ければ、日当（発生分）は現金から引かれない
  const withPay = calcCashPosition({
    reports: REPORTS,
    payments: PAYMENTS,
    settings: SETTINGS,
  });
  assert.equal(c.balance - withPay.balance, 25000);
});

/* ---------- まだ払っていないお金 ---------- */

test("calcUnpaid: 発生の累計 − 支払いの累計（どちらも期首日以降）", () => {
  const u = calcUnpaid({
    reports: REPORTS,
    payments: PAYMENTS,
    settings: NO_RENT,
    currentYm: "2026-09",
  });
  // 給与の発生：8/15(12000) + 8/20(8000) + 9/1(9000) = 29000
  assert.equal(u.payrollAccrued, 29000);
  assert.equal(u.payrollPaid, 20000);
  assert.equal(u.payroll, 9000);
  // 外注費の発生：8月(90000×10%=9000) + 9月(50000×10%=5000) = 14000
  assert.equal(u.outsourcingAccrued, 14000);
  assert.equal(u.outsourcingPaid, 5000);
  assert.equal(u.outsourcing, 9000);
  assert.equal(u.total, 18000);
});

/* ---------- 家賃（事務所） ---------- */

test("monthsInRange: 月をならべる（年またぎも正しい）", () => {
  assert.deepEqual(monthsInRange("2026-08", "2026-08"), ["2026-08"]);
  assert.deepEqual(monthsInRange("2026-11", "2027-02"), [
    "2026-11",
    "2026-12",
    "2027-01",
    "2027-02",
  ]);
  assert.deepEqual(monthsInRange("2026-09", "2026-08"), [], "逆順は空");
  assert.deepEqual(monthsInRange("", "2026-08"), []);
});

test("rentForMonth: 数え始める月より前は0円、以降は毎月きまった額", () => {
  assert.equal(rentForMonth("2026-07", SETTINGS), 0);
  assert.equal(rentForMonth("2026-08", SETTINGS), 35000);
  assert.equal(rentForMonth("2026-09", SETTINGS), 35000);
  assert.equal(rentForMonth("2027-03", SETTINGS), 35000);
});

test("summarizeMonth: 家賃は日報に無くても毎月自動で計上される", () => {
  const s = summarizeMonth({
    ym: "2026-08",
    reports: REPORTS,
    template: T,
    settings: SETTINGS,
  });
  assert.equal(s.rent, 35000);
  assert.equal(s.expenseByAccount.rent, 35000);
  // 家賃なしの場合とくらべて、経費合計と利益がちょうど家賃のぶんだけ動く
  const noRent = summarizeMonth({
    ym: "2026-08",
    reports: REPORTS,
    template: T,
    settings: NO_RENT,
  });
  assert.equal(s.expenseTotal - noRent.expenseTotal, 35000);
  assert.equal(noRent.profit - s.profit, 35000);
});

test("summarizeMonth: 数え始める月より前の月には家賃を入れない", () => {
  const s = summarizeMonth({
    ym: "2026-08",
    reports: REPORTS,
    template: T,
    settings: { ...SETTINGS, rent_start_month: "2026-09" },
  });
  assert.equal(s.rent, 0);
});

test("calcRentAccrued: 数え始める月から今月までの月数ぶん", () => {
  assert.equal(calcRentAccrued(SETTINGS, "2026-08"), 35000);
  assert.equal(calcRentAccrued(SETTINGS, "2026-09"), 70000);
  assert.equal(calcRentAccrued(SETTINGS, "2026-12"), 175000);
  // 期首日より前から数え始める設定でも、期首の月からしか数えない
  assert.equal(
    calcRentAccrued({ ...SETTINGS, rent_start_month: "2026-01" }, "2026-09"),
    70000,
  );
});

test("calcUnpaid: 家賃も『発生の累計 − 払った累計』で出す", () => {
  const u = calcUnpaid({
    reports: REPORTS,
    payments: [
      ...PAYMENTS,
      { paid_on: "2026-09-01", amount: 35000, kind: "rent" },
    ],
    settings: SETTINGS,
    currentYm: "2026-09",
  });
  assert.equal(u.rentAccrued, 70000); // 8月分＋9月分
  assert.equal(u.rentPaid, 35000);
  assert.equal(u.rent, 35000);
  assert.equal(u.total, u.payroll + u.outsourcing + u.rent);
});

test("calcCashPosition: 家賃は『払った分だけ』現金から引く（発生分は引かない）", () => {
  const noPay = calcCashPosition({
    reports: REPORTS,
    payments: [],
    settings: SETTINGS,
  });
  const withRent = calcCashPosition({
    reports: REPORTS,
    payments: [{ paid_on: "2026-09-01", amount: 35000, kind: "rent" }],
    settings: SETTINGS,
  });
  assert.equal(noPay.balance - withRent.balance, 35000);
});

/* ---------- 場所別 ---------- */

test("summarizeByLocation: 場所が空のものは「未設定」にまとめる", () => {
  const rows = summarizeByLocation({ ym: "2026-08", reports: REPORTS });
  const names = rows.map((r) => r.location);
  assert.ok(names.includes(UNSET_LOCATION));
  const mimata = rows.find((r) => r.location === "ながやま三股")!;
  assert.equal(mimata.sales, 100000);
  assert.equal(mimata.expenses, 3000 + 8000 + 500 + 1881);
  assert.equal(mimata.payroll, 22000);
  assert.equal(mimata.costTotal, mimata.expenses + mimata.payroll);
  assert.equal(mimata.profit, mimata.sales - mimata.costTotal);
});

test("summarizeByLocation: 書き方のゆれは名寄せで揃える", () => {
  const rows = summarizeByLocation({
    ym: "2026-08",
    reports: [
      { date: "2026-08-11", location: "ながやま 三股店", sales_amount: 1000 },
      { date: "2026-08-12", location: "ながやま三股", sales_amount: 2000 },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sales, 3000);
});

/* ---------- 月末の日付 ---------- */

test("monthEnd: うるう年も正しく出る", () => {
  assert.equal(monthEnd("2026-08"), "2026-08-31");
  assert.equal(monthEnd("2026-09"), "2026-09-30");
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
});

/* ---------- 仕訳CSV ---------- */

test("buildJournalRows: 売上・経費・人件費・外注費・支払いが決めた形で出る", () => {
  const rows = buildJournalRows({
    ym: "2026-08",
    reports: REPORTS,
    payments: PAYMENTS,
    template: T,
    settings: SETTINGS,
  });

  const sale = rows.find((r) => r.creditAccount === "売上高")!;
  assert.equal(sale.debitAccount, "現金");
  assert.equal(sale.date, "2026-08-05");
  assert.equal(sale.debitAmount, 40000);

  const expense = rows.find((r) => r.note === "肉代")!;
  assert.equal(expense.debitAccount, "仕入（材料）");
  assert.equal(expense.creditAccount, "現金");

  const labor = rows.find((r) => r.debitAccount === "人件費")!;
  assert.equal(labor.creditAccount, "未払金");

  const out = rows.filter((r) => r.debitAccount === "外注費（Alpha）");
  assert.equal(out.length, 1, "外注費は月末に1行だけ");
  assert.equal(out[0].date, "2026-08-31");
  assert.equal(out[0].creditAccount, "未払金");
  assert.equal(out[0].debitAmount, 13000);

  const rentRows = rows.filter((r) => r.debitAccount === "家賃（事務所）");
  assert.equal(rentRows.length, 1, "家賃は月末に1行だけ");
  assert.equal(rentRows[0].date, "2026-08-31");
  assert.equal(rentRows[0].creditAccount, "未払金");
  assert.equal(rentRows[0].debitAmount, 35000);
  assert.equal(rentRows[0].note, "事務所の家賃（毎月）");

  // 8月に払った記録は 8/1 の1件（期首日より前でもCSVにはその月の実績として出す）
  const paid = rows.filter((r) => r.debitAccount === "未払金");
  assert.equal(paid.length, 1);
  assert.equal(paid[0].creditAccount, "現金");
  assert.equal(paid[0].date, "2026-08-01");

  // 借方と貸方の金額は必ず同じ
  for (const r of rows) assert.equal(r.debitAmount, r.creditAmount);
});

test("buildJournalRows: 家賃の支払いは 未払金 ／ 現金 で出る", () => {
  const rows = buildJournalRows({
    ym: "2026-08",
    reports: [],
    payments: [
      { paid_on: "2026-08-05", amount: 35000, kind: "rent", memo: "8月分" },
    ],
    template: T,
    settings: SETTINGS,
  });
  const paid = rows.find((r) => r.note.startsWith("家賃の支払い"))!;
  assert.equal(paid.debitAccount, "未払金");
  assert.equal(paid.creditAccount, "現金");
  assert.equal(paid.debitAmount, 35000);
  assert.equal(paid.note, "家賃の支払い（8月分）");
});

test("toCsv: 先頭にBOMが付き、列は決めた6つ", () => {
  const csv = toCsv([
    {
      date: "2026-08-01",
      debitAccount: "現金",
      debitAmount: 100,
      creditAccount: "売上高",
      creditAmount: 100,
      note: "売上 ながやま三股",
    },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff, "BOMが無いとExcelで文字化けする");
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], "日付,借方科目,借方金額,貸方科目,貸方金額,摘要");
  assert.equal(lines[1], "2026-08-01,現金,100,売上高,100,売上 ながやま三股");
});

test("toCsv: カンマや引用符が入っていても行が壊れない", () => {
  const csv = toCsv([
    {
      date: "2026-08-01",
      debitAccount: "消耗品費",
      debitAmount: 100,
      creditAccount: "現金",
      creditAmount: 100,
      note: 'ラップ,ペーパー"まとめ買い"',
    },
  ]);
  const line = csv.slice(1).split("\r\n")[1];
  assert.equal(
    line,
    '2026-08-01,消耗品費,100,現金,100,"ラップ,ペーパー""まとめ買い"""',
  );
});

/* ---------- 業態テンプレの差し替え ---------- */

test("templateFor: 知らない業態コードでも落ちない（手羽屋テンプレに戻す）", () => {
  assert.equal(templateFor("tebaya").code, "tebaya");
  assert.equal(templateFor("しらない業態").code, "tebaya");
  assert.equal(templateFor(null).code, "tebaya");
});
