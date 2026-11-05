/**
 * 「帳簿が読めなかったとき、画面に何を出すか」のテスト（2026-11-05・f1-4）。
 *
 * ここが狂うと、
 *   ・倉庫（データのしまい場所）が眠っているだけなのに、じゅんが
 *     「自分のやり方が悪いのか」と考えて止まる
 *   ・読めていないのに数字を出し、金庫を数えた1分が
 *     **作られた数字との差**を探す時間に変わる
 * のどちらも起きる。実際に 2026-11-05 18:05 に倉庫が止まったときの形を固定しておく。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  describeKeiriReadFailure,
  describeKeiriWriteFailure,
  mayShowKeiriNumbers,
} from "../lib/keiri/readFailure";
import {
  CASH_COUNT_DRAFT_KEY,
  cashCountDraftNotice,
  cashCountDraftValue,
  readCashCountDraft,
} from "../lib/keiri/cashCountDraft";

test("倉庫まで届かないときは『つながりません』として、押し直せることを言う", () => {
  for (const raw of [
    "TypeError: Failed to fetch",
    "fetch failed",
    "NetworkError when attempting to fetch resource.",
    "connect ETIMEDOUT 1.2.3.4:443",
    "503 Service Unavailable",
    "倉庫につながりません",
  ]) {
    const f = describeKeiriReadFailure(raw);
    assert.equal(f.kind, "asleep", raw);
    assert.ok(f.retry, raw);
    assert.match(f.title, /つながりません/);
    // お金の心配をさせない／数字を出していないことを必ず言う
    assert.ok(f.lines.some((l) => l.includes("お金はかかっていません")), raw);
    assert.ok(f.lines.some((l) => l.includes("数字はいっさい出していません")), raw);
    // 金庫の1分を無駄にしないよう、あとでよいと言う
    assert.ok(f.lines.some((l) => l.includes("金庫を数える1分")), raw);
  }
});

test("棚が読めなかったときは『0円として計算しない』理由を言う", () => {
  const f = describeKeiriReadFailure("日報を読めませんでした。少し待ってから開き直してください。");
  assert.equal(f.kind, "shelf");
  assert.ok(f.retry);
  assert.ok(f.lines.some((l) => l.includes("0円として計算")));
});

test("合言葉が合わないときは押し直させない（入り直してもらう）", () => {
  const f = describeKeiriReadFailure(
    "この画面を開く合言葉が合いませんでした。いったん「ログアウト」して、入り直してください。",
  );
  assert.equal(f.kind, "password");
  assert.equal(f.retry, false);
  assert.ok(f.lines.some((l) => l.includes("ログアウト")));
});

test("理由が分からないときも、数字は出さないと言う", () => {
  for (const raw of ["", null, undefined, "なにかよく分からない理由"]) {
    const f = describeKeiriReadFailure(raw);
    assert.ok(f.lines.some((l) => l.includes("数字はいっさい出していません")), String(raw));
  }
  assert.equal(describeKeiriReadFailure("なにかよく分からない理由").kind, "unknown");
});

test("出す文に、鍵や住所のような値は入らない（英語の原文をそのまま出さない）", () => {
  const f = describeKeiriReadFailure(
    "TypeError: Failed to fetch https://vtuyebyjbvjmucqpkxug.supabase.co/rest/v1/keiri_reports?apikey=abc",
  );
  const all = [f.title, ...f.lines].join("\n");
  assert.ok(!all.includes("supabase"));
  assert.ok(!all.includes("apikey"));
  assert.ok(!all.includes("Failed to fetch"));
});

test("読めなかったら、数字は1つも出さない", () => {
  assert.equal(mayShowKeiriNumbers(null), true);
  assert.equal(mayShowKeiriNumbers(""), true);
  assert.equal(mayShowKeiriNumbers("TypeError: Failed to fetch"), false);
  assert.equal(mayShowKeiriNumbers("日報を読めませんでした"), false);
});

test("残せなかったときは、押し直せることと『金額は画面に残っている』ことを言う", () => {
  const m = describeKeiriWriteFailure("TypeError: Failed to fetch", "記録");
  assert.match(m, /記録できませんでした/);
  assert.match(m, /入れた金額はこの画面に残してあります/);
  assert.match(m, /もう一度 押してください/);
  assert.ok(!m.includes("Failed to fetch"));
  // 倉庫のせいでないときは、理由をそのまま見せる（直せないと困るため）
  assert.match(
    describeKeiriWriteFailure("permission denied for table keiri_cash_events", "記録"),
    /permission denied/,
  );
});

test("入れかけの金額は控えるが、空のときは控えない", () => {
  assert.equal(cashCountDraftValue({ on: "2026-11-05", yen: "" }), null);
  assert.equal(cashCountDraftValue({ on: "", yen: "123000" }), null);
  const v = cashCountDraftValue({ on: "2026-11-05", yen: "123000" });
  assert.ok(v);
  assert.deepEqual(readCashCountDraft(v), { on: "2026-11-05", yen: "123000" });
  // 0円も控える（「数えたら0円だった」を捨てないため）
  assert.deepEqual(
    readCashCountDraft(cashCountDraftValue({ on: "2026-11-05", yen: "0" })),
    { on: "2026-11-05", yen: "0" },
  );
});

test("控えが壊れていても、画面は何も戻さない（落ちない）", () => {
  for (const raw of [null, undefined, "", "   ", "{", "[]", '{"on":"2026-11-5","yen":"1"}', '{"on":"2026-11-05"}', '{"on":"2026-11-05","yen":"  "}']) {
    assert.equal(readCashCountDraft(raw), null, String(raw));
  }
});

test("戻したときの文は『まだ残っていない』と言う", () => {
  const notice = cashCountDraftNotice({ on: "2026-11-05", yen: "123000" });
  assert.match(notice, /11月5日/);
  assert.match(notice, /123000円/);
  assert.match(notice, /まだ記録には残っていません/);
});

test("控えの置き場の名前は、ほかの控えと混ざらない", () => {
  assert.equal(CASH_COUNT_DRAFT_KEY, "keiri.cashCount.draft.v1");
});
