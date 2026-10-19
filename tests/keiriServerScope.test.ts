/**
 * サーバー側で経理の数字を読むとき、**よそのお店のものを読まない**かの確かめ
 * （lib/keiri/loadMonthServer.ts・2026-10-05・kp239・f3-4）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   「事例ページ」と「外から確かめる窓口」は、ブラウザではなく**サーバー側**で
 *   同じ数字を読みます。ここが手羽屋だけを見る形に固まっていると、
 *   お店が増えたときに **よその店の画面に手羽屋の立替（お金）が混ざります**。
 *   とくに立替の2つの棚には「どの店のものか」の欄がまだ無いので、
 *   読んだ時点で混ざります。
 *
 * ■ ここで守ること
 *   ① 何も渡さなければ、**これまでと1行も変わらない**（手羽屋＝印が空のものだけ）
 *   ② よそのお店として読むときは、立替の2つの棚を**読まない**（画面側と同じ決まり）
 *   ③ 読まなかったことを「0件だった」と取り違えない（飛ばした印を返す）
 *   ※ 数字は作り物です（実在のお店の金額は置きません）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { businessCodeMatchesScope, loadKeiriMonthServer } from "../lib/keiri/loadMonthServer";

type Call = { table: string; filters: string[] };

/** 倉庫のふり。どの棚に、どんな絞り込みで聞いたかだけを覚える */
function fakeDb(
  rowsByTable: Record<string, unknown[]> = {},
  rpcImpl?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: any },
) {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  function from(table: string) {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const q: any = {
      select: () => q,
      eq: (c: string, v: string) => (call.filters.push(`eq:${c}=${v}`), q),
      is: (c: string, _v: null) => (call.filters.push(`is:${c}=null`), q),
      gte: () => q,
      gt: () => q,
      lt: (c: string, v: string) => (call.filters.push(`lt:${c}<${v}`), q),
      lte: () => q,
      order: () => Promise.resolve({ data: rowsByTable[table] ?? [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => void) =>
        res({ data: rowsByTable[table] ?? [], error: null }),
    };
    return q;
  }
  const rpc = (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(
      rpcImpl
        ? rpcImpl(fn, args)
        : { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
    );
  };
  return { db: { from, rpc } as unknown, calls, rpcCalls };
}

const tableNames = (calls: Call[]) => calls.map((c) => c.table);

test("何も渡さなければ、これまでどおり手羽屋（印が空）のものだけを読む", async () => {
  const { db, calls } = fakeDb();
  await loadKeiriMonthServer({ ym: "2026-09", businessCode: "tebaya", db });

  const reports = calls.find((c) => c.table === "keiri_reports");
  assert.ok(reports, "日報の棚に聞いている");
  assert.ok(reports!.filters.includes("is:tenant_id=null"), "印が空のものだけに絞っている");

  const cash = calls.find((c) => c.table === "keiri_cash_events");
  assert.ok(cash!.filters.includes("is:tenant_id=null"));

  assert.ok(tableNames(calls).includes("keiri_advance_expenses"), "手羽屋は立替を読む");
  assert.ok(tableNames(calls).includes("advance_expenses"), "手羽屋は経営側の立替も読む");
});

test("よそのお店として読むときは、立替の2つの棚を読まない（混ざらない）", async () => {
  const other = "11111111-2222-3333-4444-555555555555";
  const { db, calls } = fakeDb();
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: `t_${other}`,
    scope: other,
    db,
  });

  const reports = calls.find((c) => c.table === "keiri_reports");
  assert.ok(reports!.filters.includes(`eq:tenant_id=${other}`), "そのお店の印のものだけ");

  assert.equal(tableNames(calls).includes("keiri_advance_expenses"), false);
  assert.equal(tableNames(calls).includes("advance_expenses"), false);
  assert.equal(data.advances.length, 0);
  assert.equal(data.advancesSkipped, true, "読まなかったことを返す（0件と取り違えない）");
  assert.equal(data.advancesUnreadable, false, "読めなかったのではなく、読まないと決めた");
});

test("手羽屋のときは「飛ばした」印が立たない", async () => {
  const { db } = fakeDb();
  const data = await loadKeiriMonthServer({ ym: "2026-09", businessCode: "tebaya", db });
  assert.equal(data.advancesSkipped, false);
});

test("業態コードと、どのお店かの印が食い違っていないかを見分けられる", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assert.equal(businessCodeMatchesScope("tebaya", null), true);
  assert.equal(businessCodeMatchesScope(`t_${id}`, id), true);
  assert.equal(businessCodeMatchesScope("tebaya", id), false, "手羽屋のコードでよその店は読まない");
  assert.equal(businessCodeMatchesScope(`t_${id}`, null), false);
});

/**
 * 「前の月までに立て替えて、この月に返した立替」を**別の入れ物**で読む
 * （2026-10-12・kp250・f1-4）。
 *
 * ★この行は金庫の数え方を2通り出すためだけに使い、月の経費・利益・CSVには入れません。
 *   よその店として読むときは、上の②と同じ決まりで**読みません**（立替の棚に印が無いため）。
 */
test("前の月に立て替えて今月 返した立替を、別の入れ物で読む（手羽屋のときだけ）", async () => {
  const { db, calls } = fakeDb();
  const data = await loadKeiriMonthServer({ ym: "2026-09", businessCode: "tebaya", db });

  const owner = calls.filter((c) => c.table === "advance_expenses");
  assert.equal(owner.length, 2, "経営側の立替の棚に2回 聞く（ふだんの分と、前の月に立て替えた分）");
  const extra = owner.find((c) => c.filters.some((f) => f.startsWith("lt:date<")));
  assert.ok(extra, "立て替えた日が期間より前の行に絞っている");
  assert.ok(extra!.filters.includes("eq:settled=true"), "返し終わった行だけに絞っている");
  // 別の入れ物なので、ふだんの立替には混ざらない
  assert.ok(Array.isArray(data.advancesRepaidEarlier));

  const otherId = "11111111-2222-3333-4444-555555555555";
  const other = fakeDb();
  const o = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: `t_${otherId}`,
    scope: otherId,
    db: other.db,
  });
  assert.equal(
    other.calls.filter((c) => c.table === "advance_expenses").length,
    0,
    "よその店として読むときは、立替の棚に1回も聞かない",
  );
  assert.equal(o.advancesRepaidEarlier.length, 0);
});

/* ------------------------------------------------------------------ *
 *  よその店の日報は「倉庫の窓口ごし」に読む（2026-10-15・kp251・f3-4）
 *
 *  貼り紙⑧を流すと、日報の棚は「印が空の行だけ 読んでよい」になる。
 *  手羽屋（印が空）は今までどおりだが、**よその店の行は公開の鍵では読めない**。
 *  そこで、そのお店の日報は窓口（keiri_tenant_reports）ごしに読む。
 * ------------------------------------------------------------------ */

const OTHER_SHOP = "11111111-2222-3333-4444-555555555555";

/** 窓口が返す1行（作り物。実在のお店の金額ではありません） */
const WINDOW_ROW = {
  id: "r1",
  date: "2026-09-07",
  location: "【テスト】テスト広場",
  staff_name: "【テスト】テスト太郎",
  shop: "手羽屋",
  sales_amount: 1000,
  labor: 0,
  expenses: [],
  unit_number: 1,
  register_total: 30000,
};

test("合言葉を渡すと、よその店の日報は窓口ごしに読む（棚に直接は聞かない）", async () => {
  const hash = "a".repeat(64);
  const { db, calls, rpcCalls } = fakeDb({}, () => ({ data: [WINDOW_ROW], error: null }));
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "t_abc",
    scope: OTHER_SHOP,
    monthOnly: true,
    tenantReadHash: hash,
    db,
  });

  const reportWindow = rpcCalls.filter((c) => c.fn === "keiri_tenant_reports");
  assert.equal(reportWindow.length, 1, "日報の窓口は1回だけ呼ぶ（日報とレジ金を同じ1回で受け取る）");
  // ★窓口に渡すのは合言葉（戻せない形）だけ。**お店の番号は渡さない**（kp239 ②）
  assert.equal(reportWindow[0].args.p_password_hash, hash);
  for (const c of rpcCalls) {
    assert.ok(
      !JSON.stringify(c.args).includes(OTHER_SHOP),
      `お店の番号を窓口（${c.fn}）に渡していない`,
    );
    assert.equal(c.args.p_password_hash, hash, `${c.fn} にも合言葉だけを渡している`);
  }

  assert.equal(data.reports.length, 1);
  assert.equal(data.reports[0].date, "2026-09-07");
  assert.equal(data.reportsUnreadable, false);
  // レジ金も同じ返事から作る（もう一度 棚に聞かない）
  assert.equal(data.registerCloses.length, 1);
  assert.equal(data.registerCloses[0].amount, 30000);
  // 日報の棚・軽い日報の棚には1回も聞いていない
  assert.ok(!tableNames(calls).includes("keiri_reports"));
  assert.ok(!tableNames(calls).includes("daily_reports"));
  // 立替は今までどおり読まない（混ざらない）
  assert.equal(data.advancesSkipped, true);
});

test("窓口がまだ無い倉庫では、今までどおり棚を読む（流す前と同じ）", async () => {
  const { db, calls } = fakeDb({ keiri_reports: [] });
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "t_abc",
    scope: OTHER_SHOP,
    monthOnly: true,
    tenantReadHash: "b".repeat(64),
    db,
  });
  assert.ok(tableNames(calls).includes("keiri_reports"), "窓口が無ければ棚に聞く");
  assert.equal(data.reports.length, 0);
});

test("手羽屋として読むときは、窓口を1回も呼ばない（読み方は今までどおり）", async () => {
  const { db, rpcCalls, calls } = fakeDb({}, () => ({ data: [WINDOW_ROW], error: null }));
  await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "tebaya",
    tenantReadHash: "c".repeat(64),
    db,
  });
  assert.equal(rpcCalls.length, 0);
  assert.ok(tableNames(calls).includes("keiri_reports"));
});

test("テストの店の印でも窓口ごしに読める（2軒目を入れる手順・f5-4）", async () => {
  const { db, rpcCalls } = fakeDb({}, () => ({ data: [WINDOW_ROW], error: null }));
  await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "t_abc",
    scope: OTHER_SHOP,
    monthOnly: true,
    tenantReadTestMark: "test-b2-kensa-1006",
    db,
  });
  assert.equal(rpcCalls.filter((c) => c.fn === "keiri_tenant_reports").length, 1);
  for (const c of rpcCalls) {
    assert.equal(c.args.p_test_mark, "test-b2-kensa-1006");
    assert.equal(c.args.p_password_hash, null);
  }
});

/* ------------------------------------------------------------------ *
 *  日報いがいの棚も「倉庫の窓口ごし」に読む（2026-10-18・kp253 ③・f3-4）
 *
 *  貼り紙⑪⑫を流すと、経理の設定・払った記録・金庫の記録・
 *  「数えない」の印も「印が空の行だけ 読んでよい」になる。
 *  このとき**よその店が直に読むと、エラーではなく0件で返ってくる**。
 *  ＝ 数え始めの日・期首残高・給与・金庫の記録が黙って消え、
 *     現金残高と利益がずれる（CLAUDE.md の「0件と取り違えない」に反する）。
 *  なので、よその店として読むときは窓口ごしに聞く。
 * ------------------------------------------------------------------ */

/** 窓口ごとに違う返事を作る（作り物。実在のお店の金額ではありません） */
function windowImpl(byFn: Record<string, unknown[]>) {
  return (fn: string) =>
    fn in byFn
      ? { data: byFn[fn], error: null }
      : { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
}

test("よその店の経理の設定・払った記録・金庫・「数えない」印も、窓口ごしに読む", async () => {
  const hash = "d".repeat(64);
  const { db, calls, rpcCalls } = fakeDb(
    {},
    windowImpl({
      keiri_tenant_reports: [WINDOW_ROW],
      keiri_tenant_settings: [
        {
          opening_date: "2026-09-01",
          opening_balance: 50000,
          outsourcing_rate: 0,
          monthly_rent: 0,
          rent_start_month: "",
          memo: null,
        },
      ],
      keiri_tenant_payments: [
        { id: "p1", paid_on: "2026-09-10", amount: 20000, kind: "salary", memo: null },
        { id: "p2", paid_on: "2026-09-20", amount: 30000, kind: "salary", memo: null },
      ],
      keiri_tenant_cash_events: [
        { id: "c1", kind: "count", happened_on: "2026-09-30", amount: 70000, actor: null, note: null },
      ],
      keiri_tenant_expense_ignores: [
        {
          id: "i1",
          source: "report",
          ref_id: "r1",
          line_index: 0,
          amount: 1000,
          paid_on: "2026-09-07",
          reason: "二重",
          undone_at: null,
        },
      ],
    }),
  );

  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "t_abc",
    scope: OTHER_SHOP,
    monthOnly: true,
    tenantReadHash: hash,
    db,
  });

  // 4つの棚には**直に聞いていない**（聞くと0件で返り、数字が黙って消える）
  for (const shelf of [
    "keiri_settings",
    "keiri_payments",
    "keiri_cash_events",
    "keiri_expense_ignores",
  ]) {
    assert.equal(tableNames(calls).includes(shelf), false, `${shelf} に直に聞いていない`);
  }
  // 窓口はそれぞれ1回だけ
  for (const fn of [
    "keiri_tenant_settings",
    "keiri_tenant_payments",
    "keiri_tenant_cash_events",
    "keiri_tenant_expense_ignores",
  ]) {
    assert.equal(rpcCalls.filter((c) => c.fn === fn).length, 1, `${fn} を1回だけ呼ぶ`);
  }

  // 窓口の返事が、そのまま数字になっている
  assert.equal(data.settingsMissing, false);
  assert.equal(data.settings.opening_balance, 50000);
  assert.equal(data.settings.opening_date, "2026-09-01");
  assert.equal(data.payments.length, 2);
  assert.equal(data.payments[0].paid_on, "2026-09-20", "新しい順にそろえる（棚と同じ並び）");
  assert.equal(data.cashEvents.length, 1);
  assert.equal(data.cashEvents[0].amount, 70000);
  assert.equal(data.cashShelfMissing, false);
  assert.equal(data.ignores.length, 1);
  assert.equal(data.ignoreShelf, "ready");
});

test("窓口がまだ無いあいだは、日報いがいの棚も今までどおり直に読む（流す前と同じ）", async () => {
  const { db, calls } = fakeDb({}, windowImpl({}));
  await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "t_abc",
    scope: OTHER_SHOP,
    monthOnly: true,
    tenantReadHash: "e".repeat(64),
    db,
  });
  for (const shelf of [
    "keiri_settings",
    "keiri_payments",
    "keiri_cash_events",
    "keiri_expense_ignores",
  ]) {
    assert.ok(tableNames(calls).includes(shelf), `${shelf} に今までどおり聞く`);
  }
});

test("手羽屋として読むときは、日報いがいの窓口も1回も呼ばない（読み方は今までどおり）", async () => {
  const { db, rpcCalls, calls } = fakeDb({}, windowImpl({ keiri_tenant_settings: [] }));
  await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "tebaya",
    tenantReadHash: "f".repeat(64),
    db,
  });
  assert.equal(rpcCalls.length, 0, "手羽屋は窓口を1回も呼ばない");
  for (const shelf of [
    "keiri_settings",
    "keiri_payments",
    "keiri_cash_events",
    "keiri_expense_ignores",
  ]) {
    assert.ok(tableNames(calls).includes(shelf), `手羽屋は ${shelf} を今までどおり直に読む`);
  }
});

/* ------------------------------------------------------------------ *
 *  窓口で読めなかったとき、**棚から直に読み直さない**
 *  （2026-10-19・kp253 ③・f3-3・f3-4）
 *
 *  貼り紙⑪⑫のあと、よその店の行を公開の鍵で聞くと
 *  **エラーではなく「0件」**で返ります。0件をそのまま使うと、
 *  数え始めの日・期首残高が既定値に、給与・金庫・「数えない」印が空になり、
 *  そのお店の**現金残高と利益がまちがったまま**出ます。
 * ------------------------------------------------------------------ */

/** 窓口はあるが答えられない（＝「まだ無い」ではない）ときの返事 */
function windowBroken() {
  return () => ({ data: null, error: { code: "57014", message: "canceling statement" } });
}

test("よその店：窓口が答えられないときは、棚を直に読み直さず「読めません」と返す", async () => {
  const { db, calls } = fakeDb({}, windowBroken());
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "t_abc",
    scope: OTHER_SHOP,
    monthOnly: true,
    tenantReadHash: "a".repeat(64),
    db,
  });

  for (const shelf of [
    "keiri_settings",
    "keiri_payments",
    "keiri_cash_events",
    "keiri_expense_ignores",
  ]) {
    assert.equal(
      tableNames(calls).includes(shelf),
      false,
      `${shelf} を直に読み直さない（0件で返るため）`,
    );
  }

  assert.equal(data.settingsUnreadable, true, "数え始めと期首残高は「読めません」");
  assert.equal(data.paymentsUnreadable, true, "払った記録は「読めません」（0円にしない）");
  assert.equal(data.cashUnreadable, true, "金庫の記録は「読めません」（数えていないにしない）");
  assert.equal(data.ignoresUnreadable, true, "「数えない」の印は「読めません」");
  assert.equal(data.payments.length, 0);
  assert.equal(data.cashEvents.length, 0);
  assert.equal(data.ignores.length, 0);
  assert.equal(data.ignoreShelf, "unknown", "印の棚を「ある」と言い切らない");
});

test("よその店：合言葉もテストの印も無いときは、棚を直に読み直さない", async () => {
  const { db, calls, rpcCalls } = fakeDb({}, windowImpl({}));
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "t_abc",
    scope: OTHER_SHOP,
    monthOnly: true,
    db,
  });
  assert.equal(rpcCalls.length, 0, "聞く相手が無いので窓口も呼ばない");
  for (const shelf of [
    "keiri_settings",
    "keiri_payments",
    "keiri_cash_events",
    "keiri_expense_ignores",
  ]) {
    assert.equal(tableNames(calls).includes(shelf), false, `${shelf} を直に読み直さない`);
  }
  assert.equal(data.settingsUnreadable, true);
  assert.equal(data.paymentsUnreadable, true);
  assert.equal(data.cashUnreadable, true);
  assert.equal(data.ignoresUnreadable, true);
});

test("手羽屋：窓口が答えられなくても「読めません」は立たない（読み方は今までどおり）", async () => {
  const { db, calls } = fakeDb({}, windowBroken());
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "tebaya",
    tenantReadHash: "b".repeat(64),
    db,
  });
  for (const shelf of [
    "keiri_settings",
    "keiri_payments",
    "keiri_cash_events",
    "keiri_expense_ignores",
  ]) {
    assert.ok(tableNames(calls).includes(shelf), `手羽屋は ${shelf} を今までどおり直に読む`);
  }
  assert.equal(data.settingsUnreadable, false);
  assert.equal(data.paymentsUnreadable, false);
  assert.equal(data.cashUnreadable, false);
  assert.equal(data.ignoresUnreadable, false);
});
