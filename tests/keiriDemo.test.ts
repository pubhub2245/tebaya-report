/**
 * お試し版（/keiri/demo）の見張り。
 *
 * ■ ここで固定していること（崩すと売り物として嘘になる）
 *   ① お試し版の画面は、**データの倉庫につなぐ部品を1つも読み込まない**
 *      ＝ 誰が何を入れても保存されず、本物のお店の数字にも触れない。
 *   ② 計算を**写し取っていない**（本物と同じ lib/keiri の関数だけを呼ぶ）。
 *   ③ 対応表は**汎用**を使う（手羽屋だけの言葉を、よそのお店に見せない）。
 *   ④ 「まだ払っていないお金」は**給与・外注費・家賃の3つだけ**だと画面に書いてある。
 *   ⑤ お試し版が公開ページの一覧に入っていて、紹介ページから来られる。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NEUTRAL_OUTSOURCING_ACCOUNT_LABEL } from "@/lib/keiri";
import {
  DEMO_SHOP_NAME,
  demoInputProblem,
  demoInputToReport,
  demoNumber,
  demoOpeningDate,
  demoPayments,
  demoReports,
  demoSettings,
  demoTodayJst,
  emptyDemoInput,
  sortDemoReports,
} from "../lib/keiri/demo";
import {
  JOURNAL_HEADERS,
  buildJournalRows,
  calcCashPosition,
  calcUnpaid,
  summarizeMonth,
  templateFor,
  toCsv,
} from "../lib/keiri";
import { MF_HEADERS, toMoneyForwardCsv } from "../lib/keiri/moneyforward";
import { GENERIC_TEMPLATE } from "../lib/keiri/templates/generic";
import { KEIRI_PUBLIC_PAGES } from "../app/keiri/components/nav";

const ROOT = path.join(__dirname, "..");
const DEMO_DIR = path.join(ROOT, "app", "keiri", "demo");

function demoSourceFiles(): { name: string; text: string }[] {
  return fs
    .readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(DEMO_DIR, f), "utf8") }));
}

// ------------------------------------------------------------------
// ① 倉庫につなぐ部品を読み込んでいないこと（いちばん大事な見張り）
// ------------------------------------------------------------------

test("お試し版の画面は、データの倉庫につなぐ部品をひとつも読み込まない", () => {
  const files = demoSourceFiles();
  assert.ok(files.length >= 2, "お試し版のファイルが見つからない");
  for (const f of files) {
    // import 行だけを見る（説明の文章に「supabase」と書くのは構わない）
    const imports = f.text
      .split("\n")
      .filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line));
    for (const line of imports) {
      assert.ok(
        !/supabase/i.test(line),
        `${f.name} が倉庫につなぐ部品を読み込んでいる：${line.trim()}`,
      );
    }
    assert.ok(
      !/require\(\s*["'][^"']*supabase/i.test(f.text),
      `${f.name} が倉庫につなぐ部品を読み込んでいる（require）`,
    );
    // fetch でこっそり送っていないことも見る
    assert.ok(
      !/\bfetch\s*\(/.test(f.text),
      `${f.name} が外に何かを送っている（fetch）`,
    );
  }
});

test("お試し版は、本物と同じ計算の関数を呼んでいる（写し取っていない）", () => {
  const board = demoSourceFiles().find((f) => f.name === "board.tsx");
  assert.ok(board, "board.tsx が無い");
  for (const fn of ["summarizeMonth", "calcCashPosition", "calcUnpaid", "summarizeByLocation"]) {
    assert.ok(board!.text.includes(fn), `本物の関数 ${fn} を呼んでいない`);
  }
  // 利益や現金を自前で足し引きしていないこと（写し取りの典型）
  assert.ok(
    !/sales\s*-\s*expenseTotal/.test(board!.text),
    "board.tsx が利益を自分で計算している（本物の関数を使うこと）",
  );
});

// ------------------------------------------------------------------
// ② 数字の材料
// ------------------------------------------------------------------

test("お試し版の設定：数え始めはその月の1日、外注費の決まりは持たない", () => {
  const s = demoSettings("2026-09");
  assert.equal(s.opening_date, "2026-09-01");
  assert.equal(demoOpeningDate("2026-09"), "2026-09-01");
  assert.equal(s.opening_balance, 50000);
  // 外注費（Alpha）は手羽屋だけの決まり。よそのお店に見せない
  assert.equal(s.outsourcing_rate, 0);
  assert.equal(s.rent_start_month, "2026-09");
});

test("最初から入っている日報は3件で、すべてその月の中にある", () => {
  const reports = demoReports("2026-09");
  assert.equal(reports.length, 3);
  for (const r of reports) assert.ok(r.date.startsWith("2026-09-"));
  assert.equal(demoPayments().length, 0);
});

test("お試し版の3つの数字が、本物の関数で計算できる", () => {
  const ym = "2026-09";
  const settings = demoSettings(ym);
  const reports = demoReports(ym);
  const payments = demoPayments();
  const template = templateFor(GENERIC_TEMPLATE.code);

  const summary = summarizeMonth({ ym, reports, template, settings });
  const cash = calcCashPosition({ reports, payments, settings });
  const unpaid = calcUnpaid({ reports, payments, settings, currentYm: ym });

  // 売上 82,000 + 64,000 + 95,000
  assert.equal(summary.sales, 241000);
  // 現金 = 50,000 + 241,000 − 日報の経費明細の合計（75,400）
  assert.equal(cash.expenses, 75400);
  assert.equal(cash.balance, 50000 + 241000 - 75400);
  // 未払い = 給与 32,000 + 家賃 60,000（外注費は 0）
  assert.equal(unpaid.payroll, 32000);
  assert.equal(unpaid.outsourcing, 0);
  assert.equal(unpaid.rent, 60000);
  assert.equal(unpaid.total, 92000);
});

test("お試し版の経費は、汎用の対応表できちんと振り分けられる（雑費に落ちない）", () => {
  const ym = "2026-09";
  const summary = summarizeMonth({
    ym,
    reports: demoReports(ym),
    template: templateFor(GENERIC_TEMPLATE.code),
    settings: demoSettings(ym),
  });
  assert.deepEqual(summary.unmatched, []);
  assert.equal(summary.expenseByAccount.purchase, 49500); // 肉18,000＋野菜9,500＋肉22,000
  assert.equal(summary.expenseByAccount.booth_fee, 17700); // 場代8,200＋9,500
  assert.equal(summary.expenseByAccount.vehicle, 5000); // ガソリン
});

// ------------------------------------------------------------------
// ③ 入力の受け取り
// ------------------------------------------------------------------

test("入力の掃除：カンマ・単位つき・マイナスは 0 にする", () => {
  assert.equal(demoNumber("82,000円"), 82000);
  assert.equal(demoNumber("-100"), 100); // 記号を落とすので符号は残らない
  assert.equal(demoNumber(""), 0);
  assert.equal(demoNumber("あ"), 0);
});

test("空のまま押しても足せない。1つでも入っていれば足せる", () => {
  const empty = emptyDemoInput("2026-09-20");
  assert.ok(demoInputProblem(empty));
  assert.equal(demoInputProblem({ ...empty, sales: "50000" }), null);
  assert.equal(demoInputProblem({ ...empty, expense1Name: "肉", expense1Amount: "3000" }), null);
  assert.ok(demoInputProblem({ ...empty, date: "" }));
});

test("0円の経費は行ごと落とす（嘘の記録を作らない）", () => {
  const input = {
    ...emptyDemoInput("2026-09-20"),
    sales: "50,000",
    labor: "8000",
    expense1Name: "肉 仕入れ",
    expense1Amount: "3000",
    expense2Name: "場代",
    expense2Amount: "",
  };
  const r = demoInputToReport(input);
  assert.equal(r.sales_amount, 50000);
  assert.equal(r.labor, 8000);
  assert.deepEqual(r.expenses, [{ description: "肉 仕入れ", amount: 3000 }]);
});

test("足した日報は日付の順に並び直す", () => {
  const ym = "2026-09";
  const added = demoInputToReport({ ...emptyDemoInput(`${ym}-05`), sales: "10000" });
  const sorted = sortDemoReports([...demoReports(ym), added]);
  assert.deepEqual(
    sorted.map((r) => r.date),
    [`${ym}-03`, `${ym}-05`, `${ym}-08`, `${ym}-14`],
  );
});

test("日報を足すと、3つの数字が動く", () => {
  const ym = "2026-09";
  const settings = demoSettings(ym);
  const template = templateFor(GENERIC_TEMPLATE.code);
  const before = summarizeMonth({ ym, reports: demoReports(ym), template, settings });
  const added = demoInputToReport({
    ...emptyDemoInput(`${ym}-20`),
    sales: "100000",
    labor: "8000",
    expense1Name: "肉 仕入れ",
    expense1Amount: "20000",
  });
  const after = summarizeMonth({ ym, reports: [...demoReports(ym), added], template, settings });
  assert.equal(after.sales - before.sales, 100000);
  assert.equal(after.profit - before.profit, 100000 - 8000 - 20000);
  assert.equal(after.reportCount - before.reportCount, 1);
});

// ------------------------------------------------------------------
// ④ 画面に書いてあること
// ------------------------------------------------------------------

test("画面に「架空のお店」と「保存しない」が必ず書いてある", () => {
  const all = demoSourceFiles()
    .map((f) => f.text)
    .join("\n");
  assert.ok(all.includes("架空"), "架空のお店だと書いていない");
  assert.ok(/保存[もされ]*ませ|保存されません/.test(all), "保存しないと書いていない");
  assert.ok(DEMO_SHOP_NAME.includes("架空"), "デモの店名に「架空」が入っていない");
});

test("「まだ払っていないお金」が給与・外注費・家賃の3つだけだと画面に書いてある", () => {
  const all = demoSourceFiles()
    .map((f) => f.text)
    .join("\n");
  assert.ok(
    all.includes("給与・外注費・家賃の3つだけ"),
    "未払いが3つだけであることを画面に書いていない",
  );
  assert.ok(all.includes("仕入れの掛け"), "仕入れの掛けが入らないことを書いていない");
});

// ------------------------------------------------------------------
// ⑤ 入口
// ------------------------------------------------------------------

test("お試し版が公開ページの一覧に入っている（検索とページ一覧に載る）", () => {
  const found = KEIRI_PUBLIC_PAGES.find((p) => p.path === "/keiri/demo");
  assert.ok(found, "/keiri/demo が公開ページの一覧に無い");
});

test("紹介ページの一番上から、お試し版へ来られる", () => {
  const casePage = fs.readFileSync(
    path.join(ROOT, "app", "keiri", "case", "page.tsx"),
    "utf8",
  );
  assert.ok(casePage.includes('href="/keiri/demo"'), "紹介ページにお試し版へのボタンが無い");
  // ページの頭の説明文にも「事例1号」の文字があるので、実際に画面に出る所で切る
  const header = casePage.slice(0, casePage.indexOf(">事例1号<"));
  assert.ok(
    header.includes('href="/keiri/demo"'),
    "お試し版のボタンが、紹介ページの一番上（事例より前）に無い",
  );
});

test("日本時間の今日を出す（世界標準時のままにしない）", () => {
  // 日本時間では翌日になっている時刻
  assert.equal(demoTodayJst(new Date("2026-09-19T16:30:00Z")), "2026-09-20");
  assert.equal(demoTodayJst(new Date("2026-09-19T00:30:00Z")), "2026-09-19");
});

// ------------------------------------------------------------------
// ⑥ スマホで横にずれない（2026-09-19 実機幅390pxで実測して見つけた）
// ------------------------------------------------------------------

test("経費の行の入力欄は、スマホの幅でも横にはみ出さない作りにしてある", () => {
  // ★ じゅんが送る8通は、ほとんどスマホで開かれる。
  //   横に並べた2つの入力欄は、min-w-0 が無いと画面より広くなり、
  //   ページ全体が横にずれる（390px で 9px はみ出していた）。
  //   お試し版は「買う前に触ってみる」唯一の場所なので、ここが崩れて見えると申し込みが落ちる。
  const board = fs.readFileSync(
    path.join(ROOT, "app", "keiri", "demo", "board.tsx"),
    "utf8",
  );
  const row = board.slice(board.indexOf("function DemoExpenseRow"));
  assert.ok(row.includes("min-w-0 flex-1"), "経費の内容の入力欄から min-w-0 が消えている");
  assert.ok(row.includes("shrink-0"), "経費の金額の入力欄から shrink-0 が消えている");
  assert.ok(!row.includes('className="flex-1 rounded-lg'), "min-w-0 の無い flex-1 が残っている");
});

/**
 * お試し版（/keiri/demo）は、申し込みを考えている方が最初に触る画面。
 * 「科目ごとの金額」に手羽屋だけの呼び名（外注費（Alpha））が出ると、
 * この料金のほかに知らない会社への支払いがあるように読めてしまう。
 * 2026-09-24 に本番で出ていたので直した。
 */
test("お試し版の科目の表に、よその会社の名前（Alpha）を出さない", () => {
  const src = fs.readFileSync("app/keiri/demo/board.tsx", "utf8");
  assert.ok(
    !src.includes("Alpha"),
    "お試し版の画面に Alpha の文字が入っています",
  );
  assert.ok(
    src.includes("NEUTRAL_OUTSOURCING_ACCOUNT_LABEL"),
    "外注費の科目名を、手羽屋以外向けの呼び名に差し替えていません",
  );
  assert.equal(NEUTRAL_OUTSOURCING_ACCOUNT_LABEL, "外注費");
});

// ------------------------------------------------------------------
// ⑦ 会計ソフトに渡すCSVを、買う前にその場で確かめられる（2026-09-24・kp131）
//
//   月15,000円の「重いほう」は、毎月の締め（要約1枚 ＋ 会計ソフト用CSV）です。
//   ところがお試し版は、そのCSVだけ**文章で「本物ではできます」と書いてあるだけ**で、
//   触ってみられる唯一の場所で触れませんでした。値上げの根拠そのものが
//   確かめられない状態だったので、実物を書き出せるようにしました。
//
//   ここで固定していること：
//     ① CSV は本物と同じ関数（buildJournalRows / toCsv / toMoneyForwardCsv）で作る
//        ＝ お試し版に書き写さない（写すと、本物を直したとき片方だけ古くなる）
//     ② 日報を1件足すと、CSVの行が増える（見どころそのもの）
//     ③ マネーフォワードの形は27列
//     ④ 画面に「本物だけの機能」としてCSVを挙げていない（自分で自分に嘘をつかない）
//     ⑤ 倉庫にも外にも何も送らない（①の見張りと合わせて、fetch も supabase も無い）
// ------------------------------------------------------------------

test("お試し版のCSVは、本物と同じ関数で作っている（写し取っていない）", () => {
  const board = demoSourceFiles().find((f) => f.name === "board.tsx");
  assert.ok(board, "board.tsx が無い");
  for (const fn of ["buildJournalRows", "toCsv", "toMoneyForwardCsv", "encodeCsv"]) {
    assert.ok(board!.text.includes(fn), `本物の関数 ${fn} を呼んでいない`);
  }
  // CSVの中身を画面に書き写していないこと（写し取りの典型）
  assert.ok(
    !/["'`]日付,借方/.test(board!.text),
    "board.tsx にCSVの見出し行が直書きされている（JOURNAL_HEADERS を使うこと）",
  );
  assert.ok(
    board!.text.includes("JOURNAL_HEADERS"),
    "見出しを本物の定義（JOURNAL_HEADERS）から出していない",
  );
});

test("お試し版に、実際に書き出せるボタンが置いてある", () => {
  const board = demoSourceFiles().find((f) => f.name === "board.tsx");
  assert.ok(board!.text.includes("仕訳のCSVを書き出す"), "仕訳CSVのボタンが無い");
  assert.ok(board!.text.includes("27列・UTF-8"), "マネーフォワード用（UTF-8）のボタンが無い");
  assert.ok(board!.text.includes("27列・Shift_JIS"), "マネーフォワード用（Shift_JIS）のボタンが無い");
});

test("お試し版の日報から、本物の関数で仕訳が作れる。日報を1件足すと行が増える", () => {
  const ym = "2026-09";
  const settings = demoSettings(ym);
  const reports = demoReports(ym);
  const payments = demoPayments();
  const template = templateFor(GENERIC_TEMPLATE.code);

  const rows = buildJournalRows({ ym, reports, payments, template, settings });
  assert.ok(rows.length > 0, "仕訳が1行も作れていない");
  // 借方と貸方の合計は必ず一致する（貸借が合わないCSVは会計ソフトが受け取らない）
  const debit = rows.reduce((a, r) => a + r.debitAmount, 0);
  const credit = rows.reduce((a, r) => a + r.creditAmount, 0);
  assert.equal(debit, credit);

  // 日報を1件足すと行が増える（お試し版の見どころ）
  const added = sortDemoReports([
    ...reports,
    demoInputToReport({
      ...emptyDemoInput(`${ym}-20`),
      date: `${ym}-20`,
      location: "駅前広場",
      sales: "80000",
      labor: "8000",
      expense1Name: "肉 仕入れ",
      expense1Amount: "18000",
    }),
  ]);
  const rows2 = buildJournalRows({ ym, reports: added, payments, template, settings });
  assert.ok(
    rows2.length > rows.length,
    `日報を足しても仕訳が増えていない（${rows.length} → ${rows2.length}）`,
  );

  // そのまま読める形と、マネーフォワードの27列。どちらも本物と同じ形
  // toCsv は Excel で文字化けしないように先頭に目印（BOM）を付けるので、そこを外して見る
  const csv = toCsv(rows).replace(/^\uFEFF/, "");
  assert.equal(csv.split("\r\n")[0], JOURNAL_HEADERS.join(","));
  const mf = toMoneyForwardCsv(rows);
  assert.equal(mf.split("\n")[0].split(",").length, MF_HEADERS.length);
  assert.equal(MF_HEADERS.length, 27);
});

test("お試し版は「CSVは本物だけ」と書いていない（自分で自分に嘘をつかない）", () => {
  const page = fs.readFileSync(path.join(DEMO_DIR, "page.tsx"), "utf8");
  assert.ok(
    !/本物ではこのほかに[^。]*CSV/.test(page),
    "お試し版でCSVを書き出せるのに、「本物ではこのほかにCSV」と書いたままになっている",
  );
});

// ------------------------------------------------------------------
// ⑧ 申し込みへの入口が、心の動く所にある（2026-09-24・kp134）
//
//   お試し版は「買う前に手で触れる唯一の場所」です。9/24 15:04 の実測で、
//   申し込みへの入口が**ページ中ほどと一番下の2か所だけ**だと分かりました。
//   いちばん心が動くのは「会計ソフト用のCSVを自分の手で書き出せた直後」なので、
//   そこと、1画面目（ページの見出しのすぐ下）にも入口を置きます。
//   kp133 で紹介ページに入れた直しと同じ考え方です。
//   新しい約束・新しい価格の言葉は足していないことも、ここで固定します。
// ------------------------------------------------------------------

test("お試し版の1画面目（見出しのすぐ下）から、お申し込みへ行ける", () => {
  const page = fs.readFileSync(path.join(DEMO_DIR, "page.tsx"), "utf8");
  const headerEnd = page.indexOf("</header>");
  assert.ok(headerEnd > 0, "見出しの範囲が取れていない");
  const header = page.slice(0, headerEnd);
  assert.ok(
    header.includes('href="/keiri/apply"'),
    "お試し版の1画面目（見出しの中）に、お申し込みへの入口が無い",
  );
  assert.ok(
    header.includes("もうお決まりの方は、お申し込みへ進む"),
    "もう決めている人のための近道の文が無い",
  );
});

test("CSVを書き出すボタンのすぐ下に、お申し込みへの入口がある", () => {
  const board = fs.readFileSync(path.join(DEMO_DIR, "board.tsx"), "utf8");
  const buttonAt = board.indexOf("仕訳のCSVを書き出す");
  assert.ok(buttonAt > 0, "仕訳CSVのボタンが見つからない");
  // ボタンから、その節の終わり（次の節の見出し）までの間に入口があること
  const nextSectionAt = board.indexOf("出店場所ごとの成績", buttonAt);
  assert.ok(nextSectionAt > buttonAt, "CSVの節の終わりが見つからない");
  const csvSection = board.slice(buttonAt, nextSectionAt);
  assert.ok(
    csvSection.includes('href="/keiri/apply"'),
    "CSVを書き出した直後に、お申し込みへの入口が無い",
  );
  assert.ok(
    csvSection.includes("この形で毎月お届けします"),
    "書き出したものと申し込みのつながりを説明する文が無い",
  );
});

test("お試し版に足した入口は、新しい約束も新しい価格も足していない", () => {
  const files = demoSourceFiles();
  for (const f of files) {
    // 画面に出る所だけを見る（説明書きのコメントは読み手には見えないので外す）
    const visible = f.text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // 価格は lib/keiri/caseNumbers の priceSummaryLine から出す（画面に直書きしない）
    assert.ok(
      !/15,?000\s*円/.test(visible),
      `${f.name} の画面に価格が直書きされている（priceSummaryLine を使うこと）`,
    );
    // 「初月無料」「返金保証」「今だけ」のような、下の申し込み枠に無い約束を足していないこと
    assert.ok(
      !/初月無料|返金保証|今だけ|キャンペーン/.test(visible),
      `${f.name} に、申し込み枠に無い約束が書かれている`,
    );
  }
  // お支払いが発生しない旨は、入口のそばに必ず添える（紹介ページと同じ書き方）
  const page = fs.readFileSync(path.join(DEMO_DIR, "page.tsx"), "utf8");
  const board = fs.readFileSync(path.join(DEMO_DIR, "board.tsx"), "utf8");
  for (const [name, text] of [["page.tsx", page], ["board.tsx", board]] as const) {
    assert.ok(
      text.includes("この画面でお支払いは発生しません"),
      `${name} の入口に「この画面でお支払いは発生しません」が無い`,
    );
  }
});
