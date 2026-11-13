import assert from "node:assert/strict";
import test from "node:test";

import {
  PENDING_SHELVES,
  SHARED_SHELVES,
  decideShelfScoped,
  decideWindowReady,
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


/* ------------------------------------------------------------------ *
 *  倉庫まで届かなかったときは「ある」と答えない（2026-11-07・B／f3-4）
 *
 *  ■ なぜこの試験が要るのか（本番で実際に起きていた）
 *    2026-11-07、倉庫が眠っているあいだ 貼り紙の⑩⑪⑫⑬ が
 *    **「流れています」**と答えていました（/api/keiri/shelves で実測・4／13）。
 *    倉庫が起きていた 10-31 の実測は 0／13 なので、この4本は
 *    倉庫が止まったせいで出た嘘です。原因は窓口を呼んで返ってきた
 *    「TypeError: fetch failed」を "引数ちがいで断られた＝窓口はある" と
 *    読んでいたこと＝**止まっているのに合格**。
 *    f3-4 を嘘の合格にする筋なので、ここで固定します。
 * ------------------------------------------------------------------ */

test("窓口の答え：届いた＝ある／窓口が無い＝まだ／届かなかった＝測れません", () => {
  // 返事が来た
  assert.equal(decideWindowReady(null), true);
  // その名前の窓口が無い（PostgREST / Postgres のどちらの言い方でも）
  assert.equal(decideWindowReady({ code: "PGRST202" }), false);
  assert.equal(decideWindowReady({ code: "42883" }), false);
  assert.equal(
    decideWindowReady({ message: "Could not find the function public.keiri_tenant_settings" }),
    false,
  );
  // 倉庫まで届かなかった＝**null**（ここが 2026-11-07 の直し）
  for (const message of [
    "TypeError: fetch failed",
    "fetch failed",
    "FetchError: request to https://… failed, reason: ECONNREFUSED",
    "connect ETIMEDOUT",
    "socket hang up",
    "502 Bad Gateway",
    "倉庫につながりません",
  ]) {
    assert.equal(decideWindowReady({ message }), null, `「${message}」を「ある」にしています`);
  }
  // 本当に断られた（引数ちがい・権限なし）＝窓口そのものはある（今までどおり）
  assert.equal(
    decideWindowReady({ code: "PGRST203", message: "Could not choose the best candidate function" }),
    true,
  );
  assert.equal(decideWindowReady({ code: "42501", message: "permission denied for function" }), true);
});

test("届かなかった窓口は、棚の判定でも「締まっている」にならない", () => {
  // 倉庫が眠っている日の形：棚も聞けない（exists:null）・窓口も届かない（null）
  assert.equal(
    decideShelfScoped({ exists: null, foreignRows: null, windowReady: decideWindowReady({ message: "TypeError: fetch failed" }) }),
    null,
    "倉庫が眠っている日に「締まっている」と答えています",
  );
});

/* ------------------------------------------------------------------ *
 *  倉庫が眠っている日に「まだ締めていない棚が N つ」と断定しない
 *  （2026-11-08・f3-4）
 * ------------------------------------------------------------------ */

/**
 * ■ なぜ縛るか（11/8 に本番で実測した形）
 *   倉庫（データのしまい場所）が眠っていた日、棚ごとの答えは9本とも
 *   「聞けませんでした。分からないまま合格にしないこと」で正しかったのに、
 *   **まとめだけ**が `allScoped: false` ＋
 *   「日報のほかに、**まだ締めていない棚が 9 つあります**」と断定していました。
 *   1本も聞いていないのに「締めていない」と言う＝嘘になりうる形です。
 */
const allUnknown = summarizeShelfScopes(
  PENDING_SHELVES.map((p) =>
    shelf({
      table: p.table,
      exists: null,
      hasColumn: null,
      windowReady: null,
      foreignRows: null,
      scoped: null,
    }),
  ),
);

test("1本も聞けなかった日は allScoped が null（締めていないとも言わない）", () => {
  assert.equal(allUnknown.allScoped, null);
  assert.deepEqual(allUnknown.pending, []);
  assert.equal(allUnknown.unknown.length, PENDING_SHELVES.length);
  assert.match(allUnknown.summary, /聞けませんでした/);
  // ★「まだ締めていない棚が N つ」とは言わないこと
  assert.doesNotMatch(allUnknown.summary, /まだ締めていない棚/);
});

test("聞けた棚と聞けなかった棚が混ざる日は、分けて数える", () => {
  const sum = summarizeShelfScopes([
    shelf({ table: "a" }),
    shelf({ table: "b", windowReady: false, scoped: false }),
    shelf({ table: "c", exists: null, windowReady: null, foreignRows: null, scoped: null }),
  ]);
  assert.deepEqual(sum.pending, ["b"]);
  assert.deepEqual(sum.unknown, ["c"]);
  assert.equal(sum.allScoped, false, "聞けた棚に締めていないものがあるなら false");
  assert.match(sum.summary, /まだ締めていない棚が 1 つ/);
  assert.match(sum.summary, /ほかに 1 つは聞けませんでした/);
});

test("棚を1本も聞けなかった日は、f3-4 の合否も付けない（あと N つ と言わない）", () => {
  const v = f34Verdict(true, readable, guard(true), allUnknown);
  assert.equal(v.pass, null);
  assert.equal(v.otherShelvesScoped, null);
  assert.match(v.line, /まだ分かりません/);
  assert.doesNotMatch(v.line, /あと/);
});

test("写しを1つも聞けなかった日も、f3-4 の合否を付けない", () => {
  const v = f34Verdict(null, readable, guard(true), allScoped);
  assert.equal(v.pass, null);
  assert.equal(v.copiesClosed, null);
  assert.match(v.line, /写しを1つも聞けませんでした/);
});

test("漏れの数え方には日報の棚が入っている（お金の行を数え落とさない・2026-11-13）", async () => {
  const { LEAK_SHELVES, PENDING_SHELVES: PS, REPORTS_SHELF } = await import(
    "../lib/keiri/shelfScope"
  );
  assert.ok(LEAK_SHELVES.some((p) => p.table === "daily_reports"));
  assert.equal(LEAK_SHELVES.length, PS.length + 1);
  assert.equal(REPORTS_SHELF.table, "daily_reports");
  // 締める工事の一覧（PENDING_SHELVES）には日報を足していない
  assert.ok(!PS.some((p) => p.table === "daily_reports"));
});
