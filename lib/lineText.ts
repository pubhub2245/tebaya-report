import { yen, slashDate } from "./format";
import type { FormState, InventoryStatus } from "./formState";
import { diffReasonLabel, type SalesBreakdown } from "./salesBreakdown";
import { calcGrossProfit, sumExpenses } from "./money";

const SEP = "━━━━━━━━━━━━━━";

export function generateLineText(
  f: FormState,
  cumulative: number,
  breakdown?: SalesBreakdown,
): string {
  const sales = f.sales_amount || 0;
  // 粗利の計算は lib/money.ts に集約（tests/money.test.ts で検証済み）
  const { food, rent, labor, costTotal, profit } = calcGrossProfit(
    sales,
    f.labor || 10000,
  );
  const expensesTotal = sumExpenses(f.expenses);

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

  const shopLabel = f.shop === "もも屋" ? "🍖 もも屋" : "🍗 手羽屋";

  const parts = [
    `${shopLabel} 業務報告（${slashDate(f.date)}${unitInfo}）`,
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
    "📦 使用本数",
  ];

  // 商品ごとの本数（商品マスタ連動・両店共通）。主力商品も momo_counts に入っている。
  for (const [name, n] of Object.entries(f.momo_counts || {})) {
    if ((n as number) > 0) parts.push(`・${name}：${n}個`);
  }
  // 限定商品（手羽屋のみ・任意）
  if (f.shop !== "もも屋") {
    const limitedName = (f.limited_product_name ?? "").trim();
    if (limitedName) {
      const cnt =
        f.limited_product_count > 0
          ? `${f.limited_product_count}本`
          : "（本数未入力）";
      parts.push(`・限定商品 ${limitedName}：${cnt}`);
    }
  }

  // お客さんの組数
  if ((f.customer_groups || 0) > 0) {
    parts.push(`・組数：${f.customer_groups}組`);
  }


  // 売上と内訳の突き合わせ結果
  if (breakdown) {
    if (breakdown.matched) {
      parts.push(`・内訳合計：${yen(breakdown.total)}（売上と一致）`);
    } else {
      const sign = breakdown.diff > 0 ? "+" : "";
      const reason = diffReasonLabel(f.breakdown_diff_reason);
      const note = (f.breakdown_diff_note ?? "").trim();
      parts.push(
        `・内訳合計：${yen(breakdown.total)}（差額 ${sign}${yen(breakdown.diff)}）`,
        `・差額の理由：${reason}${note ? `／${note}` : ""}`,
      );
    }
  }

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
      lines.push("", "🛒 買い出しが必要な品");
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
