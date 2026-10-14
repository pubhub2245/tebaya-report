import assert from "node:assert/strict";
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
 * いま使っている日報の棚が公開の読み取りで読めるなら、分かれていない。
 */
test("写しが全部閉まっても、日報の棚が読めるなら『まだ閉まっていない』と言う", () => {
  const note = f34Note(true, {
    table: "daily_reports",
    readable: true,
    note: "読めます",
  });
  assert.match(note, /日報の棚そのものが公開の鍵で読めます/);
  assert.match(note, /f3-4 はここで閉まりません/);
  assert.match(note, /kp239/);
});

test("両方 閉まったときだけ『棚の鍵の分は閉まっている』と言う", () => {
  const note = f34Note(true, {
    table: "daily_reports",
    readable: false,
    note: "読めません",
  });
  assert.match(note, /公開の鍵では読めません/);
  assert.doesNotMatch(note, /閉まりません/);
});

test("聞けなかったときは、分からないまま合格にしない", () => {
  const note = f34Note(true, { table: "daily_reports", readable: null, note: "？" });
  assert.match(note, /分からないまま合格にしないこと/);
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
