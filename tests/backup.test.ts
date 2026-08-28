/**
 * バックアップの「制限時間」のテスト。
 *
 * ■ なぜこのテストが要るか
 *   2026-08-27の夜、実際に事故が起きた。
 *   バックアップが18MBのコピーに時間を使い切り、
 *   **同じ枠で動いていた毎日の集計処理まで道連れで止まった**（1日ぶん実行されず）。
 *
 *   Vercel の処理には60秒の上限があり、超えると問答無用で強制終了される。
 *   だからバックアップは「残り時間を見て、間に合わない分は諦める」必要がある。
 *   ここが壊れると同じ事故がまた起きるので、動きを固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBackup, CRITICAL_TABLES } from "../lib/backup";

/**
 * 偽のデータベース。
 * 1テーブルあたり delayMs だけ時間がかかるふりをする。
 */
function fakeDb(opts: { delayMs: number }) {
  const touched: string[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const db = {
    from(table: string) {
      return {
        // 読み取り（select）。await されたときに時間を消費する
        select() {
          const p = (async () => {
            if (table !== "table_snapshots") {
              touched.push(table);
              await sleep(opts.delayMs);
            }
            return { data: [], error: null };
          })();
          return Object.assign(p, {
            order: () => p,
            in: () => Object.assign(p, { order: () => p }),
          });
        },
        async upsert() {
          return { error: null };
        },
        delete() {
          const p = Promise.resolve({ error: null });
          return { in: () => ({ in: () => p }) };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, touched };
}

test("制限時間に余裕があれば、全テーブルの控えを取る", async () => {
  const { db, touched } = fakeDb({ delayMs: 0 });
  const r = await runBackup(db, { budgetMs: 5_000 });

  assert.equal(r.backed_up, CRITICAL_TABLES.length);
  assert.equal(r.timedOut, false);
  assert.deepEqual(r.skipped, []);
  assert.equal(touched.length, CRITICAL_TABLES.length);
});

test("制限時間を使い切ったら、そこで打ち切る（呼び出し元を道連れにしない）", async () => {
  // 1テーブル20msかかる設定で、制限時間を50msにする
  const { db, touched } = fakeDb({ delayMs: 20 });
  const started = Date.now();
  const r = await runBackup(db, { budgetMs: 50 });
  const elapsed = Date.now() - started;

  assert.equal(r.timedOut, true, "時間切れとして記録される");
  assert.ok(r.skipped.length > 0, "諦めたテーブルの名前が残る");
  assert.ok(
    touched.length < CRITICAL_TABLES.length,
    "全部には手を付けない",
  );
  // 制限時間を大きく超えない（1テーブルぶんの超過は許容する）
  assert.ok(elapsed < 50 + 20 * 3, `制限時間の近くで止まる（実際 ${elapsed}ms）`);
});

test("打ち切っても、取れた分は取れたと記録される", async () => {
  const { db } = fakeDb({ delayMs: 20 });
  const r = await runBackup(db, { budgetMs: 50 });

  assert.ok(r.backed_up > 0, "取れた分はある");
  assert.equal(r.backed_up + r.skipped.length, CRITICAL_TABLES.length);
  assert.equal(r.ok, false, "全部取れていないので ok は false");
});

test("大事なものから先に取る（日報が先頭）", () => {
  // 時間切れのとき後ろから諦めるので、並び順そのものが安全装置になっている
  assert.equal(CRITICAL_TABLES[0], "daily_reports");
});

test("制限時間が最初から0でも落ちない（全部諦めるだけ）", async () => {
  const { db, touched } = fakeDb({ delayMs: 0 });
  const r = await runBackup(db, { budgetMs: 0 });

  assert.equal(touched.length, 0);
  assert.equal(r.backed_up, 0);
  assert.equal(r.timedOut, true);
  assert.equal(r.skipped.length, CRITICAL_TABLES.length);
});
