import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KEIRI_SETUP_FIELDS,
  keiriSetupHandoffLine,
  keiriStartSteps,
} from "../lib/keiri/offer";
import { PLAN_DOES } from "../lib/keiri/plan50k";

/**
 * 「初期設定は、誰がどこまでやるのか」を 3ページで食い違わせない（2026-10-06・B2 の検査）。
 *
 * ■ なぜ固定するか
 *   /keiri/plan は「ぜんぶこちら側で入れ終えた状態でお渡しします」、
 *   /keiri/case は「入れていただくのは3つだけです」と書いてあり、中身が逆でした。
 *   両方を読んだ店主は「自分が入れるのか、待てばいいのか」が分からず、
 *   **待ってしまう店主は画面が出ないまま止まります**（③お店が自分で使い始められる の肝）。
 */

test("3ページに出す1文は、入口をこちらが渡すこと・3つだけ入れることの両方を言う", () => {
  const line = keiriSetupHandoffLine();
  assert.ok(line.includes("入口"), "入口（リンク）を渡すことを言っていない");
  for (const f of KEIRI_SETUP_FIELDS) {
    assert.ok(line.includes(f), `入れていただく項目が抜けている：${f}`);
  }
  assert.ok(line.includes("こちらで一緒に入れます"), "分からない人の逃げ道が書いていない");
});

test("入口が届くまでの日数は約束しない（守れない約束を作らない）", () => {
  // ★見るのは「入口（初期設定）」のことを言っている3か所だけ。
  //   お支払いのご案内（手順2）の「通常1営業日以内」は、こちらから電話する話なので別。
  const all = [
    keiriSetupHandoffLine(),
    keiriStartSteps().find((s) => s.n === "3")?.body ?? "",
    PLAN_DOES.find((p) => p.title.includes("はじめの設定"))?.body ?? "",
  ].join("\n");
  for (const words of ["1営業日", "翌営業日", "即日", "24時間以内"]) {
    assert.ok(!all.includes(words), `日数を約束してはいけない：${words}`);
  }
});

test("月5万円の説明と、申し込みの手順3が、同じことを言っている", () => {
  const plan = PLAN_DOES.find((p) => p.title.includes("はじめの設定"));
  assert.ok(plan, "「はじめの設定」の行が無い");
  const step3 = keiriStartSteps().find((s) => s.n === "3");
  assert.ok(step3, "手順3が無い");

  // どちらも「入口はこちらが用意する」と言う
  assert.ok(plan!.body.includes("入口"), "月5万円の側に入口の話が無い");
  assert.ok(step3!.body.includes("入口"), "手順3に入口の話が無い");

  // どちらも「お店が入れるのは3つだけ」と言う（どちらかが「ぜんぶこちらで」と言わない）
  for (const f of KEIRI_SETUP_FIELDS) {
    assert.ok(plan!.body.includes(f), `月5万円の側に項目が抜けている：${f}`);
    assert.ok(step3!.body.includes(f), `手順3に項目が抜けている：${f}`);
  }
  assert.ok(
    !plan!.body.includes("こちら側で入れ終えた状態"),
    "「ぜんぶこちらで入れ終えた状態」は手順3と逆のことを言ってしまう",
  );
});
