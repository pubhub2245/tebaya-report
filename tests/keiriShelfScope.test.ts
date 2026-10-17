import assert from "node:assert/strict";
import test from "node:test";

import {
  PENDING_SHELVES,
  SHARED_SHELVES,
  decideShelfScoped,
  shelfNote,
  summarizeShelfScopes,
  type ShelfScopeReport,
} from "../lib/keiri/shelfScope";
import { f34Verdict, type LiveShelfReport } from "../lib/keiri/copyProbe";
import type { TenantReadGuardReport } from "../lib/keiri/tenantReadGuard";

/**
 * 「日報いがいの棚も、お店ごとに分かれているか」の判定を固定する
 * （f3-4・kp253 ③・2026-10-17）。
 *
 * ■ なぜ試験で縛るのか
 *   f3-4 の合否は、長いあいだ **日報の棚と写し（控え）の2つだけ**を見ていました。
 *   そのため貼り紙を流した日に、金庫の記録・数えない印・経理の設定・払った記録・
 *   立替の2つ（ぜんぶで6つ）が開いたままでも **「合格」と出る**作りでした。
 *   ここで「6つ揃うまで合格にしない」を固定します。
 */

function shelf(p: Partial<ShelfScopeReport> & { table: string }): ShelfScopeReport {
  return {
    label: "試験用",
    exists: true,
    hasColumn: true,
    windowReady: true,
    foreignRows: 0,
    scoped: true,
    note: "試験用",
    window: `${p.table}_window`,
    ...p,
  };
}

test("棚がまだ無ければ、漏れようがないので分かれている扱い", () => {
  assert.equal(
    decideShelfScoped({ exists: false, foreignRows: null, windowReady: false }),
    true,
  );
});

test("よその店の行が1行でも公開の鍵で読めたら、分かれていない", () => {
  assert.equal(
    decideShelfScoped({ exists: true, foreignRows: 1, windowReady: true }),
    false,
  );
});

test("窓口があれば締まっている。無ければ『行が0件でも』締まっていない", () => {
  assert.equal(decideShelfScoped({ exists: true, foreignRows: 0, windowReady: true }), true);
  assert.equal(decideShelfScoped({ exists: true, foreignRows: 0, windowReady: false }), false);
});

test("聞けなかったときは null（分からないまま合格にしない）", () => {
  assert.equal(decideShelfScoped({ exists: null, foreignRows: null, windowReady: null }), null);
  assert.equal(decideShelfScoped({ exists: true, foreignRows: 0, windowReady: null }), null);
});

test("まとめは、漏れている棚とまだ締めていない棚を分けて数える", () => {
  const sum = summarizeShelfScopes([
    shelf({ table: "a" }),
    shelf({ table: "b", windowReady: false, scoped: false }),
    shelf({ table: "c", foreignRows: 3, scoped: false }),
  ]);
  assert.deepEqual(sum.leaking, ["c"]);
  assert.deepEqual(sum.pending, ["b", "c"]);
  assert.equal(sum.allScoped, false);
});

test("6つぜんぶ締まって初めて allScoped", () => {
  const sum = summarizeShelfScopes(PENDING_SHELVES.map((p) => shelf({ table: p.table })));
  assert.equal(sum.allScoped, true);
  assert.deepEqual(sum.pending, []);
});

/* ---- f3-4 の合否に効くこと（ここが今回の本題） -------------------------- */

const readable: LiveShelfReport = {
  table: "daily_reports",
  readable: true,
  note: "手羽屋の行は読めます",
};

function guard(separated: boolean | null): TenantReadGuardReport {
  return {
    anonVisible: separated === false ? 1 : 0,
    windowReady: separated === true ? true : null,
    viaWindow: separated === true ? 1 : null,
    separated,
    note: "試験用",
    policy: "keiri_only_tebaya_rows_readable",
    window: "keiri_tenant_reports",
  };
}

const allScoped = summarizeShelfScopes(
  PENDING_SHELVES.map((p) => shelf({ table: p.table })),
);
const oneOpen = summarizeShelfScopes(
  PENDING_SHELVES.map((p, i) =>
    i === 0 ? shelf({ table: p.table, windowReady: false, scoped: false }) : shelf({ table: p.table }),
  ),
);
const leaking = summarizeShelfScopes(
  PENDING_SHELVES.map((p, i) =>
    i === 0 ? shelf({ table: p.table, foreignRows: 2, scoped: false }) : shelf({ table: p.table }),
  ),
);

test("日報が閉まっても、ほかの棚が1つでも開いていれば合格にしない", () => {
  const v = f34Verdict(true, readable, guard(true), oneOpen);
  assert.equal(v.pass, false);
  assert.equal(v.otherShelvesScoped, false);
  assert.match(v.line, /あと 1 つ/);
});

test("ほかの棚でよその店の行が読めたら、いちばん重い不合格", () => {
  const v = f34Verdict(true, readable, guard(true), leaking);
  assert.equal(v.pass, false);
  assert.match(v.line, /不合格/);
});

test("日報も写しも、ほかの棚もぜんぶ締まって初めて合格", () => {
  const v = f34Verdict(true, readable, guard(true), allScoped);
  assert.equal(v.pass, true);
  assert.equal(v.otherShelvesScoped, true);
});

test("棚の話を渡さない昔の呼び方は、今までどおり動く（null のまま）", () => {
  const v = f34Verdict(true, readable, guard(true));
  assert.equal(v.pass, true);
  assert.equal(v.otherShelvesScoped, null);
});

test("やりすぎ（手羽屋の行が読めない）は、棚の話より先に出す", () => {
  const v = f34Verdict(true, { ...readable, readable: false }, guard(true), oneOpen);
  assert.equal(v.pass, false);
  assert.match(v.line, /やりすぎ/);
});

test("やさしい1行は、まだ締めていない棚に『2軒目の前に締めること』と書く", () => {
  const note = shelfNote(PENDING_SHELVES[0], {
    table: PENDING_SHELVES[0].table,
    label: PENDING_SHELVES[0].label,
    exists: true,
    hasColumn: true,
    windowReady: false,
    foreignRows: 0,
    scoped: false,
  });
  assert.match(note, /2軒目のお店に数字が入る前に締めること/);
});

/* ------------------------------------------------------------------ *
 *  「お店ごとに分ける必要が無い」と決めた棚（2026-10-17・B／kp253 ③③）
 * ------------------------------------------------------------------ */

test("分けない棚は、理由つきで名前が残っている（合否には入れない）", () => {
  const tables = SHARED_SHELVES.map((s) => s.table);
  // 2026-10-17 に倉庫の台帳を数えて見つかった「印の欄が無い棚」のうち、
  // お店の数字が1文字も入らないものだけがここに入る。
  for (const t of ["keiri_account_mapping", "cash_settings", "pre_registered_expenses"]) {
    assert.ok(tables.includes(t), `${t} の決めが残っていません`);
  }
  for (const s of SHARED_SHELVES) {
    assert.ok(s.why.length > 10, `${s.table} の理由が書かれていません`);
    // 締める棚と二重に並べない（どちらなのか分からなくなる）
    assert.ok(
      !PENDING_SHELVES.some((p) => p.table === s.table),
      `${s.table} が「締める棚」と「分けない棚」の両方に入っています`,
    );
  }
});

test("立替は、中身が入っている経営側（advance_expenses）も締める棚に入っている", () => {
  // 2026-10-17 実測：立替の棚は2つあり、51行 入っているのは advance_expenses の方。
  // 空の keiri_advance_expenses だけ締めても意味がないので、両方を並べておく。
  const tables = PENDING_SHELVES.map((p) => p.table);
  assert.ok(tables.includes("advance_expenses"), "立替（経営・本物の棚）がありません");
  assert.ok(tables.includes("keiri_advance_expenses"), "立替（現場）がありません");
});

test("まとめには、分けない棚が理由つきで入る", () => {
  const r = summarizeShelfScopes([shelf({ table: "advance_expenses" })]);
  assert.equal(r.shared.length, SHARED_SHELVES.length);
  assert.ok(r.how.includes("shared"), "分けない棚の扱いが説明に書かれていません");
});
