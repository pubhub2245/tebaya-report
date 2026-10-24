import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  COPY_SUFFIXES,
  KNOWN_COPY_DATES,
  LIVE_TABLES,
  copyCandidateNames,
} from "../lib/keiri/copyCandidates";
import {
  COPY_CLOSED,
  COPY_OPEN,
  isCopyTableName,
  isForeignTable,
  verdictFromAnonRead,
} from "../lib/keiri/copyTables";
import { KNOWN_COPY_TABLES, f34Note, sweepNote } from "../lib/keiri/copyProbe";
import {
  TENANT_READ_POLICY,
  TENANT_READ_WINDOW,
  decideSeparated,
  guardNote,
} from "../lib/keiri/tenantReadGuard";

/**
 * 「写しの名前を組み立てて片っぱしから聞く」ところを固定する（f3-4・2026-10-14）。
 *
 * いちばん大事なのは **いま使っている棚を聞きに行かないこと**。
 * 取り違えると、鍵をかける相手の一覧に、手羽屋が毎日使う棚が混ざる。
 */

test("組み立てた名前は、ぜんぶ『写しのかたち』を通っている", () => {
  const names = copyCandidateNames(KNOWN_COPY_TABLES);
  assert.ok(names.length > 100, `組み立てた名前が少なすぎる：${names.length}`);
  for (const n of names) {
    assert.equal(isCopyTableName(n), true, `写しのかたちでない名前が混ざった：${n}`);
    assert.equal(isForeignTable(n), false, `別のアプリの棚が混ざった：${n}`);
  }
});

test("いま使っている棚そのものは、名前が写しのかたちでなければ聞かない", () => {
  const names = new Set(copyCandidateNames());
  for (const live of LIVE_TABLES) {
    if (isCopyTableName(live)) continue; // table_snapshots は名前が写しのかたち
    assert.equal(names.has(live), false, `いま使っている棚を聞こうとしている：${live}`);
  }
  // 日報・シフト・出店場所・経理の設定は、絶対に聞く相手に入っていないこと
  for (const live of ["daily_reports", "shifts", "locations", "keiri_settings"]) {
    assert.equal(names.has(live), false, live);
  }
});

test("名前が写しのかたちをしている『いま使っている棚』は、1回 聞いておく", () => {
  // table_snapshots は毎日の控えが入っている棚。鍵が効いているはずだが、
  // 外から確かめたことが一度も無かった（だから聞く相手に入れる）
  assert.equal(isCopyTableName("table_snapshots"), true);
  assert.ok(copyCandidateNames().includes("table_snapshots"));
});

test("すでに分かっている写しは、必ず聞く相手に入る", () => {
  const names = copyCandidateNames(KNOWN_COPY_TABLES);
  for (const t of KNOWN_COPY_TABLES) assert.ok(names.includes(t), t);
});

test("語尾と日付の組み合わせが作られている（取りこぼしを防ぐ）", () => {
  const names = copyCandidateNames();
  assert.ok(names.includes("daily_reports_backup"));
  assert.ok(names.includes("daily_reports_bak"));
  assert.ok(names.includes("deleted_daily_reports"));
  for (const d of KNOWN_COPY_DATES) {
    assert.ok(names.includes(`daily_reports_backup_${d}`), d);
  }
  assert.ok(COPY_SUFFIXES.includes("_backup"));
});

test("同じ名前は1回だけ・名前順に並ぶ（毎回 同じ順番で聞ける）", () => {
  const names = copyCandidateNames(["daily_reports_backup", "daily_reports_backup"]);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, [...names].sort());
});

test("聞いた結果の1行は、開いている写しを先に言う", () => {
  const found = sweepNote({
    asked: 160,
    total: 160,
    open: ["expenses_backup"],
    unknown: [],
    nextFrom: null,
  });
  assert.match(found, /新しく見つかった写しが 1 つ/);
  assert.match(found, /expenses_backup/);

  const clean = sweepNote({
    asked: 160,
    total: 160,
    open: [],
    unknown: [],
    nextFrom: null,
  });
  assert.match(clean, /ぜんぶ聞き終えました/);
  assert.match(clean, /ほかに開いている写しは見つかりませんでした/);

  const partial = sweepNote({ asked: 80, total: 160, open: [], unknown: [], nextFrom: 80 });
  assert.match(partial, /\?from=80/);
});

/**
 * 写しを閉めただけで f3-4 を合格にしないこと（2026-10-14）。
 *
 * ★2026-10-15 に見方を直した。**手羽屋の行（印が空）は、貼り紙⑧を流したあとも
 *   公開の鍵で読める**（お店ごとの入室がまだ無いため。CLAUDE.md 4-8）。
 *   f3-4 が聞いているのは「よその店のデータが見えないか」なので、
 *   判定は**印が付いた行**だけで行う。
 */
const LIVE_READABLE = { table: "daily_reports", readable: true, note: "読めます" } as const;

test("よその店の行が公開の鍵で見えるなら『まだ閉まっていない』と言う", () => {
  const note = f34Note(true, LIVE_READABLE, {
    anonVisible: 3,
    windowReady: false,
    viaWindow: null,
    separated: false,
    note: "公開の鍵で、よその店の日報が 3 行 読めます。貼り紙⑧（/keiri/sql）を1回 流すと読めなくなります",
    policy: TENANT_READ_POLICY,
    window: TENANT_READ_WINDOW,
  });
  assert.match(note, /よその店の日報が 3 行 読めます/);
  assert.match(note, /貼り紙⑧/);
});

test("手羽屋の行が読めるだけでは『閉まっていない』と言わない（2026-10-15）", () => {
  const note = f34Note(true, LIVE_READABLE, {
    anonVisible: 0,
    windowReady: true,
    viaWindow: 1,
    separated: true,
    note: "よその店の日報は、公開の鍵では1行も読めません",
    policy: TENANT_READ_POLICY,
    window: TENANT_READ_WINDOW,
  });
  assert.match(note, /公開の鍵では読めません/);
  assert.doesNotMatch(note, /閉まりません/);
});

test("よその店の行が1行も無いときは、閉まったことにしない", () => {
  const note = f34Note(true, LIVE_READABLE, {
    anonVisible: 0,
    windowReady: true,
    viaWindow: 0,
    separated: null,
    note: "よその店の行が1行も無いので、隠れているかどうかは まだ試せていません",
    policy: TENANT_READ_POLICY,
    window: TENANT_READ_WINDOW,
  });
  assert.match(note, /まだ試せていません/);
  assert.doesNotMatch(note, /閉まっています（f3-4/);
});

test("聞けなかったときは、分からないまま合格にしない", () => {
  const note = f34Note(true, { table: "daily_reports", readable: null, note: "？" });
  assert.match(note, /分からないまま合格にしないこと/);
});

/* ---------- ⑧の判定そのもの（lib/keiri/tenantReadGuard.ts） ---------- */

test("公開の鍵で よその店の行が1行でも見えたら、分かれていない", () => {
  assert.equal(decideSeparated({ anonVisible: 1, windowReady: true, viaWindow: 1 }), false);
});

test("窓口では見えるのに公開の鍵では見えない、が揃ったときだけ『分かれている』", () => {
  assert.equal(decideSeparated({ anonVisible: 0, windowReady: true, viaWindow: 2 }), true);
});

test("よその店の行が1行も無いときは、分かれているとも言わない（null）", () => {
  assert.equal(decideSeparated({ anonVisible: 0, windowReady: true, viaWindow: 0 }), null);
  assert.equal(decideSeparated({ anonVisible: 0, windowReady: false, viaWindow: null }), null);
});

test("公開の鍵で聞けなかったときは、分かれているとも言わない（null）", () => {
  assert.equal(decideSeparated({ anonVisible: null, windowReady: true, viaWindow: 5 }), null);
});

test("まだ流れていないときの1行には、何をすればよいかが書いてある", () => {
  const note = guardNote({
    anonVisible: 2,
    windowReady: false,
    viaWindow: null,
    separated: false,
  });
  assert.match(note, /貼り紙⑧/);
  // 手羽屋の行は読めたままで正しい、と必ず添える（取り違え防止）
  assert.match(note, /手羽屋の行＝印が空は、今までどおり読めます/);
});

/**
 * 聞き方の落とし穴を固定する（2026-10-14 18:5x に本番で踏んだもの）。
 * ・無い棚を「読めました」と取り違えない
 * ・鍵が効いている棚は「0件」と答えるので、1件以上のときだけ「開いている」と言う
 */
test("行が0件なら『開いている』とは言わない（鍵が効いているか、空の棚）", () => {
  const v = verdictFromAnonRead({ table: "table_snapshots", ok: true, rows: 0 });
  assert.equal(v.state, COPY_CLOSED);
  assert.match(v.note, /中身は返ってきません/);
});

test("行が1件以上あったときだけ『まだ読めます』と言う", () => {
  const v = verdictFromAnonRead({
    table: "daily_reports_backup_20260902",
    ok: true,
    rows: 13,
  });
  assert.equal(v.state, COPY_OPEN);
});

test("行数が分からないときは、今までどおり『読めた＝開いている』", () => {
  const v = verdictFromAnonRead({ table: "x_backup", ok: true });
  assert.equal(v.state, COPY_OPEN);
  const n = verdictFromAnonRead({ table: "x_backup", ok: true, rows: null });
  assert.equal(n.state, COPY_OPEN);
});

test("そんな棚はありません（42P01）は、閉まっている側に入れる", () => {
  const v = verdictFromAnonRead({
    table: "agenda_items_snapshot_20260902",
    ok: false,
    code: "42P01",
    message: 'relation "public.agenda_items_snapshot_20260902" does not exist',
  });
  assert.equal(v.state, COPY_CLOSED);
  assert.match(v.note, /ありません/);
});

/* ------------------------------------------------------------------ *
 *  材料の一覧に抜けが無いかを、機械で見張る（2026-10-24・f3-4）
 * ------------------------------------------------------------------ */

/**
 * ★なぜこの見張りを足したか
 *
 *   写しが開いていないかは /api/keiri/copies で確かめていますが、
 *   聞く相手は **LIVE_TABLES（いま使っている棚の名前）から組み立てて**います。
 *   つまり **一覧に無い棚は、その写しも一度も聞かれません**。
 *   2026-10-24 に数え直したところ **4つ抜けて**いました
 *   （event_plans / prep_products / prep_session_items / prep_carryovers）。
 *   ＝「開いている写しはありません」という答えが、そのぶん不完全でした。
 *
 *   抜けは目では見つからないので、**コードが実際に読み書きしている棚**を
 *   機械で数え上げて、一覧と突き合わせます。
 */
function tablesUsedInCode(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) {
        for (const m of readFileSync(p, "utf8").matchAll(/\.from\("([a-z0-9_]+)"\)/g)) {
          out.add(m[1]);
        }
      }
    }
  };
  walk("lib");
  walk("app");
  return out;
}

test("コードが読み書きしている棚は、ぜんぶ写しを探す材料に入っている", () => {
  const live = new Set<string>(LIVE_TABLES);
  const missing = [...tablesUsedInCode()]
    .filter((t) => !isForeignTable(t)) // 別のアプリの棚（pkmn_…）は触らない
    .filter((t) => !live.has(t))
    .sort();
  assert.deepEqual(
    missing,
    [],
    "この棚の『写し』は一度も聞かれていません（LIVE_TABLES に足してください）：\n" +
      missing.join("\n"),
  );
});

test("材料にだけある棚は、理由が分かっているものだけ", () => {
  const used = tablesUsedInCode();
  const extra = [...LIVE_TABLES].filter((t) => !used.has(t)).sort();
  assert.deepEqual(extra, [
    // 経費は daily_reports の中の欄（CLAUDE.md 4-2）。棚として読む所は無いが、
    // 昔 expenses という棚があった可能性があるので写しは聞いておく
    "expenses",
    // 2026-08-27 に消した棚（CLAUDE.md 4-11）。控え（deleted_tasks_…）が残る
    "tasks",
  ]);
});
