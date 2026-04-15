import { yen, slashDate } from "./format";
import type { FormState } from "./formState";

const SEP = "━━━━━━━━━━━━━━";

export function generateLineText(f: FormState, cumulative: number): string {
  const sales = f.sales_amount || 0;
  const food = Math.round(sales * 0.25);
  const labor = f.labor || 10000;
  const rent = Math.round(sales * 0.1);
  const expensesTotal = f.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const costTotal = food + labor + rent;
  const profit = sales - costTotal;

  const coins: [string, number, number][] = [
    ["10円", f.coins.c10, 10],
    ["50円", f.coins.c50, 50],
    ["100円", f.coins.c100, 100],
    ["500円", f.coins.c500, 500],
    ["1,000円", f.coins.b1000, 1000],
    ["5,000円", f.coins.b5000, 5000],
    ["10,000円", f.coins.b10000, 10000],
  ];
  const registerTotal = coins.reduce((s, [, n, v]) => s + n * v, 0);

  const coinLines = coins
    .filter(([, n]) => n > 0)
    .map(
      ([label, n, v]) =>
        `${label} × ${n}枚 ＝ ${yen(n * v)}`
    )
    .join("\n");

  const expLines = f.expenses.length
    ? f.expenses
        .map(
          (e, i) =>
            `${i + 1}. ${e.description || "(内容未入力)"}：${yen(e.amount || 0)}`
        )
        .join("\n") + `\n経費合計：${yen(expensesTotal)}`
    : "";

  const parts = [
    "【営業後 日報】",
    `日付：${slashDate(f.date)}`,
    `場所: ${f.location}`,
    `担当：${f.staff_name}`,
    SEP,
    "■ 売上",
    `本日売上：${yen(sales)}`,
    `累計売上：${yen(cumulative)}`,
    SEP,
    "■ 粗利（現場評価）",
    `原価概算（Food）：${yen(food)}（売上の25%）`,
    `日当（Labor）：${yen(labor)}`,
    `場代(Rent)：${yen(rent)}`,
    `経費合計：${yen(costTotal)}`,
    `粗利：${yen(profit)}`,
    SEP,
    "レジ確認",
    coinLines || "(金種入力なし)",
    `レジ合計：${yen(registerTotal)}（${f.register_ok ? "確認OK" : "差異あり"}）`,
    SEP,
    "手羽先.手羽餃子残り本数",
    `・手羽 ×${f.remaining.tebasaki}`,
    `・手羽ギョーザ ×${f.remaining.gyoza}`,
    `・ねぎ塩 ×${f.remaining.negishio}`,
    `・ポテト ×${f.remaining.potato}`,
    `・トルネードポテト ×${f.remaining.tornado}`,
  ];

  if (expLines) {
    parts.push(SEP, "立替経費", expLines);
  }

  if (f.handover && f.handover.trim()) {
    parts.push(SEP, "引き継ぎ事項", f.handover.trim());
  }

  return parts.join("\n");
}
