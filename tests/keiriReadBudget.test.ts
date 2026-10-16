/**
 * 「倉庫が応えない日に、ページが1分ちかく白いままにならない」ことのテスト。
 *
 * ■ なぜこのテストが要るか（2026-10-16・kp255・f4-1・f5-1）
 *   倉庫（Supabase）へ届かない状態で月の数字を1回 読むと、
 *   答えが返るまで **63.2秒** かかっていた。
 *   原因は通信の遅さではなく、**倉庫をつなぐ部品が同じ問い合わせを4回 試す**こと
 *   （あいだに 1秒→2秒→4秒 待つ＝1つの棚で 7.1秒。棚は9回ぶんで 63.2秒）。
 *   紹介ページ・お試し版・見本は店主に見せる所なので、白いままが一番こわい。
 *
 * ■ ここで固定すること
 *   ① 線に当たったら、待つのをやめて「読めませんでした」の形を返す（**数字は作らない**）
 *   ② ふだん（すぐ返る）は今までどおり素通し。線で勝手に切らない
 *   ③ 線に当たったあとに倉庫が失敗しても、迷子の例外にならない
 *   ④ 線を0以下にしたら今までどおり最後まで待つ（逃げ道を残しておく）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { raceWithDeadline, KEIRI_READ_BUDGET_MS } from "../lib/keiri/readBudget";

test("本番で使う線は10秒（ふだんの読み 0.7〜1.5秒・やり直し込み 7.1秒 より長い）", () => {
  assert.equal(KEIRI_READ_BUDGET_MS, 10_000);
  assert.ok(KEIRI_READ_BUDGET_MS > 7_100, "一瞬の不調で4回 試し直す 7.1秒 を切ってはいけない");
});

test("すぐ返るときは素通し（ふだんの日は今までどおり）", async () => {
  const got = await raceWithDeadline(Promise.resolve("本物の数字"), 10_000, () => "控え");
  assert.equal(got.value, "本物の数字");
  assert.equal(got.timedOut, false);
});

test("線に当たったら、待つのをやめて控えの形を返す", async () => {
  const neverEnding = new Promise<string>(() => {});
  const got = await raceWithDeadline(neverEnding, 30, () => "控え");
  assert.equal(got.value, "控え");
  assert.equal(got.timedOut, true);
});

test("線に当たったあとに倉庫が失敗しても、迷子の例外にならない", async () => {
  let stray: unknown = null;
  const onStray = (e: unknown) => {
    stray = e;
  };
  process.on("unhandledRejection", onStray);
  try {
    const late = new Promise<string>((_resolve, reject) => {
      setTimeout(() => reject(new Error("倉庫が落ちた")), 20);
    });
    const got = await raceWithDeadline(late, 5, () => "控え");
    assert.equal(got.timedOut, true);
    await new Promise((r) => setTimeout(r, 60)); // 失敗が返ってくるのを待つ
    assert.equal(stray, null, "迷子の例外が出てはいけない");
  } finally {
    process.off("unhandledRejection", onStray);
  }
});

test("線を0以下にしたら、今までどおり最後まで待つ", async () => {
  const slowish = new Promise<string>((resolve) => setTimeout(() => resolve("本物"), 20));
  const got = await raceWithDeadline(slowish, 0, () => "控え");
  assert.equal(got.value, "本物");
  assert.equal(got.timedOut, false);
});

test("かかった時間を返す（あとから測れるように）", async () => {
  let clock = 1_000;
  const got = await raceWithDeadline(
    new Promise<string>(() => {}),
    5,
    () => {
      clock = 1_400;
      return "控え";
    },
    () => clock,
  );
  assert.equal(got.timedOut, true);
  assert.equal(got.elapsedMs, 400);
});

/* ------------------------------------------------------------------
 * 読む所（lib/keiri/loadMonthServer.ts）に本当に線が付いているか
 * ------------------------------------------------------------------ */
import { loadKeiriMonthServer } from "../lib/keiri/loadMonthServer";

/** 何も返してこない倉庫のまね（返事が来ない日） */
function silentDb() {
  const q: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return () => {}; // 返事をしない
        return () => q;
      },
    },
  );
  return { from: () => q, rpc: () => new Promise(() => {}) } as unknown;
}

test("倉庫が返事をしない日は、線で待つのをやめて『読めませんでした』を返す", async () => {
  const t = Date.now();
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "tebaya",
    db: silentDb(),
    budgetMs: 40,
  });
  const ms = Date.now() - t;
  assert.ok(ms < 2_000, `線で戻っている（実測 ${ms}ms）`);
  assert.equal(data.readTimedOut, true);
  // ★「0件だった」と取り違えない形になっているか
  assert.equal(data.reportsUnreadable, true);
  assert.equal(data.reports.length, 0);
  assert.equal(data.advancesUnreadable, true);
  assert.equal(data.registerUnreadable, true);
  assert.equal(data.settingsMissing, true);
  assert.equal(data.cashShelfMissing, true, "確かめていない棚を『ある』と言わない");
});

test("ふだんの日（倉庫が答える）は readTimedOut を付けない＝今までどおり", async () => {
  const ok: any = {
    select: () => ok,
    eq: () => ok,
    is: () => ok,
    gte: () => ok,
    lte: () => ok,
    not: () => ok,
    or: () => ok,
    order: () => ok,
    limit: () => ok,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res: (v: { data: unknown[]; error: null }) => void) => res({ data: [], error: null }),
  };
  const data = await loadKeiriMonthServer({
    ym: "2026-09",
    businessCode: "tebaya",
    db: { from: () => ok, rpc: () => Promise.resolve({ data: null, error: { code: "PGRST202" } }) } as unknown,
  });
  assert.equal(data.readTimedOut, undefined);
  assert.equal(data.reportsUnreadable, false);
});
