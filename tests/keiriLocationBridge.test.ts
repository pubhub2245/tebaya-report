/**
 * 「出店場所ごとの利益を足した額」と「今月の利益」のつなぎ（2026-10-03・kp226-b2）。
 *
 * ■ なぜこのテストが要るか
 *   B2 が本番のお試し版で見つけた形：
 *   場所ごとの利益は 駅前広場 90,300 ＋ 商店街 41,500 ＝ 131,800円 なのに、
 *   上の「今月の利益」は 37,300円。表の下の説明は「家賃は入れていません」だけで、
 *   家賃 60,000 を引いても 71,800円。残り 34,500円（誰かが立て替えた分）の
 *   説明がどこにも無く、**ページが間違っているように見えていました。**
 *
 * ■ ここで守ること
 *   ① 場所の利益の合計 −（立替＋外注費＋家賃）＝ 今月の利益 が、1円の違いもなく成り立つ
 *   ② 画面に出す式は lib が作る（画面に数字や式を直書きしていない）
 *   ③ お試し版と本物の経理画面の両方に、その式が出ている
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  locationProfitBridge,
  locationProfitBridgeLine,
  summarizeByLocation,
  summarizeMonth,
} from "../lib/keiri/aggregate";
import {
  demoAdvances,
  demoReports,
  demoSettings,
} from "../lib/keiri/demo";
import { GENERIC_TEMPLATE } from "../lib/keiri/templates/generic";

const YM = "2026-10";

function demoBridge() {
  const reports = demoReports(YM);
  const settings = demoSettings(YM);
  const advances = demoAdvances(YM);
  const summary = summarizeMonth({
    ym: YM,
    reports,
    template: GENERIC_TEMPLATE,
    settings,
    advances,
  });
  const byLocation = summarizeByLocation({ ym: YM, reports });
  return { summary, byLocation, bridge: locationProfitBridge({ byLocation, summary }) };
}

test("場所の利益の合計から、場所別に入れていないお金を引くと、今月の利益にぴったり合う", () => {
  const { bridge, summary } = demoBridge();
  assert.equal(bridge.matches, true, "足し引きが合っていない");
  assert.equal(
    bridge.locationProfit - bridge.deductionTotal,
    summary.profit,
    "1円でもずれたら、画面に出している式が嘘になる",
  );
});

test("お試し版の数字（B2 が本番で見た数字）でそのまま成り立つ", () => {
  const { bridge } = demoBridge();
  assert.equal(bridge.locationProfit, 131800);
  assert.equal(bridge.monthProfit, 37300);
  // 引く中身は 立替 34,500 ＋ 家賃 60,000（外注費は0なので行に出さない）
  assert.equal(bridge.deductionTotal, 94500);
  const labels = bridge.deductions.map((d) => d.label);
  assert.ok(labels.includes("誰かが立て替えた分"), "立替の行が無い");
  assert.ok(labels.includes("家賃（事務所）"), "家賃の行が無い");
  assert.ok(!labels.includes("外注費"), "0円の行は出さない");
  assert.ok(!labels.includes("その他"), "説明のつかない差があってはいけない");
});

test("画面に出す1行は、金額を書き写さずに作られている", () => {
  const { bridge } = demoBridge();
  const line = locationProfitBridgeLine(bridge);
  assert.equal(
    line,
    "場所の利益の合計 131,800 − 誰かが立て替えた分 34,500 − 家賃（事務所） 60,000 ＝ 今月の利益 37,300",
  );
});

test("説明のつかない差が出たら「その他」に出して隠さない", () => {
  const summary = {
    expenseTotal: 100000,
    expenseFromRegister: 40000,
    payroll: 10000,
    expenseFromAdvance: 20000,
    outsourcing: 0,
    rent: 25000,
    // 売上 150,000 − 経費 100,000。場所の利益 150,000 から 50,000 を引いた額に合う
    profit: 100000,
  } as unknown as Parameters<typeof locationProfitBridge>[0]["summary"];
  const byLocation = [
    { profit: 150000 },
  ] as unknown as Parameters<typeof locationProfitBridge>[0]["byLocation"];
  const bridge = locationProfitBridge({ byLocation, summary });
  const other = bridge.deductions.find((d) => d.label === "その他");
  assert.ok(other, "説明のつかない差が「その他」に出ていない");
  assert.equal(other?.yen, 5000);
  assert.equal(bridge.locationProfit - bridge.deductionTotal, 100000);
  assert.equal(bridge.matches, true);
});

test("お試し版と本物の経理画面の両方に、この式が出ている", () => {
  for (const path of ["app/keiri/demo/board.tsx", "app/keiri/page.tsx"]) {
    const page = readFileSync(path, "utf8");
    assert.ok(
      page.includes("locationProfitBridgeLine"),
      `${path} に式の1行が出ていない`,
    );
  }
});

test("「立替」の言葉が、2つの意味で同じに読めないようにしてある", () => {
  // まだ返していない分（まだ払っていないお金）と、今月ぶん全部（月の経費）を書き分ける
  for (const path of ["app/keiri/demo/board.tsx", "app/keiri/page.tsx"]) {
    const page = readFileSync(path, "utf8");
    assert.ok(
      page.includes("まだ返していない立替"),
      `${path} の「まだ払っていないお金」の内訳が「立替」のままになっている`,
    );
    assert.ok(
      page.includes("今月ぶん全部"),
      `${path} の月の経費の内訳に「今月ぶん全部」が無い`,
    );
  }
});
