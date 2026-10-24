import { yen, slashDate } from "./format";
import type { FormState, InventoryStatus } from "./formState";
import { diffReasonLabel, type SalesBreakdown } from "./salesBreakdown";
import { calcActualProfit, calcGrossProfit, sumExpenses } from "./money";
import {
  ACTUAL_ONLY_NOTE,
  showsEstimatedGrossProfit,
} from "./grossProfitRule";
import { TEBAYA_SCOPE, type TenantScope } from "./tenantScope";

const SEP = "━━━━━━━━━━━━━━";

export function generateLineText(
  f: FormState,
  cumulative: number,
  breakdown?: SalesBreakdown,
  /**
   * 粗利に使う日当（円）。渡さないときは今までどおり「入っていなければ ¥10,000」。
   *
   * ★なぜ渡せるようにしたか（2026-10-22・f3-4）
   *   ¥10,000 は**手羽屋の既定の日当**です。経理パッケージを申し込んだお店が
   *   日当を空のまま出すと、保存した金額（0円）とこの文の金額（¥10,000）が
   *   食い違い、そのお店の文に手羽屋の金額が出ます。
   *   保存する金額（lib/staffWage.ts の laborToSave）をそのまま渡せば、
   *   文と帳簿が必ず同じになります。手羽屋は渡しても答えが変わりません。
   */
  laborAmount?: number,
  /**
   * どのお店として出している日報か。渡さないときは手羽屋＝**今までと同じ文**。
   *
   * ★なぜ渡せるようにしたか（2026-10-23・f3-4）
   *   「粗利（現場評価）」の原価概算25%・場代概算10% は**手羽屋の見込みの率**です。
   *   経理パッケージを申し込んだお店の文に出すと、そのお店が決めていない率で
   *   粗利が出ます。よそのお店では、実際に出たお金（日当・レジから払った経費）
   *   だけで粗利を出します（→ lib/grossProfitRule.ts）。
   */
  scope: TenantScope = TEBAYA_SCOPE,
): string {
  const sales = f.sales_amount || 0;
  // 粗利の計算は lib/money.ts に集約（tests/money.test.ts で検証済み）
  const usedLabor =
    typeof laborAmount === "number" ? laborAmount : f.labor || 10000;
  const { food, rent, labor, costTotal, profit } = calcGrossProfit(
    sales,
    usedLabor,
  );
  const expensesTotal = sumExpenses(f.expenses);
  // よそのお店に出す粗利（新しい率を作らず、実際に出たお金だけで計算する）
  const actual = calcActualProfit(sales, usedLabor, expensesTotal);
  const showEstimate = showsEstimatedGrossProfit(scope);

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
    ...(showEstimate
      ? [
          `原価概算（Food）：${yen(food)}（売上の25%）`,
          `日当（Labor）：${yen(labor)}`,
          `場代(Rent)：${yen(rent)}`,
          `経費合計：${yen(costTotal)}`,
          `粗利：${yen(profit)}`,
        ]
      : [
          ACTUAL_ONLY_NOTE,
          `日当：${yen(actual.labor)}`,
          `レジから払った経費：${yen(actual.expenses)}`,
          `出たお金の合計：${yen(actual.costTotal)}`,
          `粗利：${yen(actual.profit)}`,
        ]),
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
