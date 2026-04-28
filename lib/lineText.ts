import { yen, slashDate } from "./format";
import type { FormState, InventoryStatus } from "./formState";

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

  const unitInfo = f.unit_number ? ` ${f.unit_number}番隊` : "";

  const parts = [
    `🍗 手羽屋 業務報告（${slashDate(f.date)}${unitInfo}）`,
    SEP,
    `👤 担当：${f.staff_name}`,
    `📍 出店：${f.location}`,
    "",
    "📊 売上",
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
    "📦 残り在庫",
    `・手羽先：${f.remaining.tebasaki}本`,
    `・餃子：${f.remaining.gyoza}個`,
    `・ポテト：${f.remaining.potato}袋`,
    `・トルネード：${f.remaining.tornado}本`,
    `・ねぎ塩：${f.remaining.negishio}パック`,
  ];

  if (expLines) {
    parts.push(SEP, "立替経費", expLines);
  }

  if (f.handover && f.handover.trim()) {
    parts.push(SEP, "引き継ぎ事項", f.handover.trim());
  }

  // 片付けチェック引継ぎ情報
  const cleanupSection = generateCleanupSection(f);
  if (cleanupSection) {
    parts.push(SEP, cleanupSection);
  }

  return parts.join("\n");
}

function generateCleanupSection(f: FormState): string {
  const inv = f.cleanup_inventory;
  const tasks = f.cleanup_tasks;

  // Check if any cleanup data was entered
  const hasInventory = Object.values(inv).some((v) => v !== "");
  const hasTasks = Object.values(tasks).some((v) => v);
  if (!hasInventory && !hasTasks) return "";

  const lines: string[] = ["🔄 次の出店者へ引継ぎ"];

  // 要補充（△ or ×）
  if (hasInventory) {
    const statusLabel: Record<string, string> = {
      "×": "ほぼなし",
      "△": "ストックなし",
    };
    const warnings = Object.entries(inv)
      .filter(([, v]) => v === "×" || v === "△")
      .map(([name, status]) => `・${name}（${status}：${statusLabel[status as string]}）`);

    if (warnings.length > 0) {
      lines.push("", "⚠️ 要補充");
      lines.push(...warnings);
    }
  }

  // 未完了タスク
  if (hasTasks) {
    const incomplete = Object.entries(tasks)
      .filter(([, done]) => !done)
      .map(([name]) => `・${name}`);

    const complete = Object.entries(tasks)
      .filter(([, done]) => done)
      .map(([name]) => name);

    if (incomplete.length > 0) {
      lines.push("", "⚠️ 未完了");
      lines.push(...incomplete);
    }

    if (complete.length > 0) {
      lines.push("", "✅ 完了済み");
      lines.push(complete.join("・"));
    }
  }

  return lines.join("\n");
}
