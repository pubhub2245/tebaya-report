/**
 * 同じ支払いが「日報の経費」と「立替台帳」の2か所に書かれていないかの見つけ方
 * （lib/keiri/duplicates.ts・2026-10-03・f1-5）。
 *
 * ■ なぜ要るか
 *   CLAUDE.md 5-4b は「同じ支払いを2か所に登録しないこと」を前提にしています。
 *   ところが実データでは、立替台帳の行と日報の経費行が金額までそのまま一致している
 *   （同じ支払いが2か所にある）ことがありました。両方足すと月の経費が多く出ます。
 *
 * ■ ここで守ること
 *   ① **金額を直さない。**この関数は「疑い」を返すだけで、合計を変えない
 *   ② 決めつけない。金額が同じだけ・日が近いだけでは組にしない（同じ言葉も要る）
 *   ③ 1つの立替の行を、2つの日報の行に二重に当てない
 *   ※ 数字は作り物です（実在のお店の金額は置きません）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  descriptionWords,
  findDuplicateExpenses,
  sameWord,
} from "../lib/keiri/duplicates";
import { summarizeMonth } from "../lib/keiri/aggregate";
import { GENERIC_TEMPLATE } from "../lib/keiri/templates/generic";
import type { KeiriAdvance, KeiriReport } from "../lib/keiri/types";

const YM = "2026-11";

function advance(date: string, amount: number, description: string): KeiriAdvance {
  return {
    date,
    amount,
    description,
    payer: "オーナー",
    settled: false,
    settledDate: null,
    source: "field",
  };
}

test("金額が同じ・日が近い・同じ言葉が入っている行は、疑いとして出す", () => {
  const reports: KeiriReport[] = [
    {
      date: `${YM}-12`,
      location: "駅前広場",
      staff_name: null,
      sales_amount: 50000,
      labor: 0,
      expenses: [{ description: "容器・おしぼり（まる商店）", amount: 9989 }],
    },
  ];
  const advances = [advance(`${YM}-11`, 9989, "おしぼり・容器ほか（まる商店）")];
  const c = findDuplicateExpenses({ ym: YM, reports, advances });
  assert.equal(c.suspects.length, 1);
  assert.equal(c.suspects[0].amount, 9989);
  assert.equal(c.suspects[0].dayGap, 1);
  assert.equal(c.suspects[0].sameMonth, true);
  assert.equal(c.doubleCountedTotal, 9989);
  assert.equal(c.crossMonthTotal, 0);
});

test("月をまたいだ書き方（台帳は前の月・日報は今月）も拾い、別に数える", () => {
  const reports: KeiriReport[] = [
    {
      date: `${YM}-12`,
      location: "お祭り会場",
      staff_name: null,
      sales_amount: 0,
      labor: 0,
      expenses: [{ description: "秋祭り 出店料（3区画）", amount: 385000 }],
    },
  ];
  const advances = [advance("2026-10-28", 385000, "秋祭り 出店料 3区画ぶん（振込）")];
  const c = findDuplicateExpenses({ ym: YM, reports, advances });
  assert.equal(c.suspects.length, 1);
  assert.equal(c.suspects[0].sameMonth, false);
  assert.equal(c.doubleCountedTotal, 0, "別の月の分を今月の二重に数えない");
  assert.equal(c.crossMonthTotal, 385000);
});

test("金額が同じでも、説明に同じ言葉が無ければ組にしない", () => {
  const reports: KeiriReport[] = [
    {
      date: `${YM}-12`,
      location: null,
      staff_name: null,
      sales_amount: 0,
      labor: 0,
      expenses: [{ description: "肉 仕入れ", amount: 5000 }],
    },
  ];
  const advances = [advance(`${YM}-12`, 5000, "ガソリン")];
  assert.equal(findDuplicateExpenses({ ym: YM, reports, advances }).suspects.length, 0);
});

test("1つの立替の行を、2つの日報の行に二重に当てない", () => {
  const reports: KeiriReport[] = [
    {
      date: `${YM}-12`,
      location: null,
      staff_name: null,
      sales_amount: 0,
      labor: 0,
      expenses: [
        { description: "高速代（北線）", amount: 890 },
        { description: "高速代（南線）", amount: 890 },
      ],
    },
  ];
  const advances = [advance(`${YM}-12`, 890, "高速代 行き")];
  const c = findDuplicateExpenses({ ym: YM, reports, advances });
  assert.equal(c.suspects.length, 1, "立替1件に対して疑いは1組まで");
  assert.equal(c.doubleCountedTotal, 890);
});

test("日が離れすぎている行は組にしない", () => {
  const reports: KeiriReport[] = [
    {
      date: `${YM}-28`,
      location: null,
      staff_name: null,
      sales_amount: 0,
      labor: 0,
      expenses: [{ description: "容器（まる商店）", amount: 3000 }],
    },
  ];
  const advances = [advance("2026-09-01", 3000, "容器（まる商店）")];
  assert.equal(findDuplicateExpenses({ ym: YM, reports, advances }).suspects.length, 0);
});

test("店名の書き方のゆれ（頭が同じ）も同じ言葉として拾う", () => {
  assert.equal(sameWord("ダイソー", "ダイソーニトリモール"), true);
  assert.equal(sameWord("ダイソー", "ダイソー"), true);
  assert.equal(sameWord("肉", "肉屋"), false, "2文字より短い言葉は根拠にしない");
  assert.equal(sameWord("キャノーラ油", "ガソリン"), false);
});

test("説明から取り出す言葉は、2文字以上で、どこにでも出る言葉を除く", () => {
  const w = descriptionWords("建材 4個×1,380（ハンズマン吉尾店 No.3644）（立替・じゅん）");
  assert.ok(w.includes("建材"));
  assert.ok(w.includes("ハンズマン吉尾店"));
  assert.ok(!w.includes("立替"), "「立替」は一致の根拠にしない");
  assert.ok(!w.some((x) => /^[0-9]+$/.test(x)), "数字だけの言葉は使わない");
});

test("疑いを見つけても、月の経費の合計は1円も変わらない", () => {
  const reports: KeiriReport[] = [
    {
      date: `${YM}-12`,
      location: null,
      staff_name: null,
      sales_amount: 50000,
      labor: 0,
      expenses: [{ description: "容器（まる商店）", amount: 9989 }],
    },
  ];
  const advances = [advance(`${YM}-12`, 9989, "容器（まる商店）")];
  const settings = {
    opening_date: `${YM}-01`,
    opening_balance: 0,
    outsourcing_rate: 0,
    monthly_rent: 0,
    rent_start_month: YM,
  };
  const before = summarizeMonth({
    ym: YM,
    reports,
    template: GENERIC_TEMPLATE,
    settings,
    advances,
  });
  const c = findDuplicateExpenses({ ym: YM, reports, advances });
  const after = summarizeMonth({
    ym: YM,
    reports,
    template: GENERIC_TEMPLATE,
    settings,
    advances,
  });
  assert.equal(c.suspects.length, 1);
  assert.equal(before.expenseTotal, after.expenseTotal);
  assert.equal(after.expenseTotal, 9989 * 2, "疑いがあっても合計は勝手に減らさない");
});

test("本物の経理画面に、この疑いを出す場所がある", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("app/keiri/page.tsx", "utf8");
  assert.ok(page.includes("findDuplicateExpenses"), "画面が疑いを出していない");
  assert.ok(
    page.includes("同じ支払いが2か所に書かれている疑い"),
    "見出しの文が無い",
  );
});
