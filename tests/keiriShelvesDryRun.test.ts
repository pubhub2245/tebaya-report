/**
 * 貼り紙（倉庫に1回だけ流す1枚）を直したら、**下見を走らせ直す**ことを縛る試験。
 *                                            （2026-10-22・B／f1-4・f3-4・f5-4）
 *
 * ■ なぜ要るのか（やさしい説明）
 *   仕上げの残り3つ（金庫の突き合わせ・お店ごとに分かれているか・2軒目を入れる手順）は、
 *   どれも「じゅんが貼り紙を1回 貼る」ことを待っています。押すのは**1回**なので、
 *   途中で止まると2分がむだになり、気づくのは翌日です。
 *   そこで、貼る前に同じ形の空の倉庫で通す「下見」（tools/check-shelves-sql.sh）があり、
 *   その結果を /keiri/sql に出しています。
 *
 *   ところが下見は**手で走らせる道具**です。貼り紙だけ直して走らせ忘れると、
 *   画面には「○月○日に3回 通してあります」と出たまま、中身は確かめていないものに変わります。
 *
 *   そこで下見を通したときの貼り紙の**指紋**（SHA-256）を控え、
 *   いまの貼り紙の指紋と合わなければ、ここで落ちるようにしました。
 *   ＝ 貼り紙を直したら、下見を走らせて指紋を書き直すまで本番に出せません。
 *
 * ■ 指紋は公開情報です
 *   貼り紙の文そのものは /keiri/sql にそのまま出しています。
 *   鍵・合言葉・金額はここに1文字も入りません。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SHELF_SQL_DRYRUN,
  dryRunCoversSheet,
  dryRunSheetState,
} from "../lib/keiri/shelves";

const SHEET = join(
  process.cwd(),
  "supabase",
  "migrations",
  "keiri_shelves_20261005.sql",
);

function sheetSha(): string {
  return createHash("sha256")
    .update(readFileSync(SHEET, "utf8"), "utf8")
    .digest("hex");
}

test("下見の記録は、いまの貼り紙そのものを通した結果になっている", () => {
  const now = sheetSha();
  assert.equal(
    now,
    SHELF_SQL_DRYRUN.sheetSha256,
    [
      "貼り紙（supabase/migrations/keiri_shelves_20261005.sql）が、",
      "下見を通したあとに変わっています。",
      "",
      "やること（順番どおり）：",
      "  1) bash tools/check-shelves-sql.sh を走らせて「OK」を確かめる",
      "  2) lib/keiri/shelves.ts の SHELF_SQL_DRYRUN を書き直す",
      `     ・sheetSha256 を ${now} にする`,
      "     ・at（下見をした日）・checks（OK の件数）も合わせる",
      "",
      "じゅんが押すのは1回だけです。確かめていない1枚を出さないための試験です。",
    ].join("\n"),
  );
});

test("指紋が合えば「いまの貼り紙のもの」、合わなければ そう言う", () => {
  assert.equal(dryRunCoversSheet(SHELF_SQL_DRYRUN.sheetSha256), true);
  // 大文字で渡しても同じ答え（書き写し方で結果が変わらないこと）
  assert.equal(dryRunCoversSheet(SHELF_SQL_DRYRUN.sheetSha256.toUpperCase()), true);
  assert.equal(dryRunCoversSheet("f".repeat(64)), false);
  assert.equal(dryRunSheetState(SHELF_SQL_DRYRUN.sheetSha256).matches, true);
  assert.equal(dryRunSheetState("0".repeat(64)).matches, false);
});

test("指紋が読めないときは、合否を作らず null で返す", () => {
  for (const bad of [null, undefined, "", "みじかい", "zz".repeat(32), 12345]) {
    assert.equal(dryRunCoversSheet(bad), false, `${String(bad)} は指紋ではない`);
    assert.equal(
      dryRunSheetState(bad).matches,
      null,
      `${String(bad)} のときは「分からない」と返す`,
    );
  }
});

test("下見の記録は、外に出してよい事実だけ（鍵・合言葉・金額を含まない）", () => {
  const text = JSON.stringify(SHELF_SQL_DRYRUN);
  for (const ng of ["SUPABASE", "SERVICE_ROLE", "eyJ", "password", "PASSWORD"]) {
    assert.ok(!text.includes(ng), `下見の記録に ${ng} が入っている`);
  }
  assert.ok(SHELF_SQL_DRYRUN.checks > 0, "確かめた件数が入っている");
  assert.equal(SHELF_SQL_DRYRUN.steps.length, 12, "貼り紙は12 本");
});
