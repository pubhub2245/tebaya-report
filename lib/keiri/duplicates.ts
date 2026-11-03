/**
 * 同じ支払いが「日報の経費」と「立替台帳」の2か所に書かれていないかを見つける（2026-10-03・f1-5）。
 *
 * ■ なぜ要るか（9月の実データで分かったこと）
 *   CLAUDE.md 5-4b は「同じ支払いを2か所に登録しないこと」を決まりの前提にしています。
 *   ところが9月の手羽屋の実データでは、立替台帳の9月の行 98,571円 のうち **90,571円** が
 *   9/12 の日報の経費行と金額までそのまま一致していました（同じ支払いが2か所にある）。
 *   両方を足すと、**その月の経費がその分だけ多く出ます。**
 *   決まりを文書に書くだけでは防げないので、**画面で気づけるようにします。**
 *
 * ■ ここでやらないこと（CLAUDE.md の考え方に合わせる）
 *   ① **金額を勝手に直さない。**どちらを消すかは人が決めることで、
 *      片方を黙って落とすと「経理が勝手に経費を減らした」ことになります。
 *      レシートの税込の直し（4-12）と同じで、**説明のつかない差は直さずに人に見せる**。
 *   ② **黙って隠さない。**疑いが1件でもあれば、月の経費のそばに出します。
 *   ③ **決めつけない。**「疑い」としてしか言いません（同じ金額の別の支払いはあり得ます）。
 *
 * ■ 疑いと見なす条件（厳しめにしてある。空振りより見逃しを嫌うが、騒ぎすぎない）
 *   ・金額が1円まで同じ
 *   ・日付が1か月（31日）以内
 *   ・説明に2文字以上の同じ言葉（店名・品名など）が入っている
 *   3つすべてに当たったときだけ疑いにします。1つの行は1回だけ組にします。
 */

import type { AdvanceSource, KeiriAdvance, KeiriReport } from "./types";
import { amountOf, expenseItemsOf } from "./classify";

/** 疑いの1組 */
export type DuplicateSuspect = {
  amount: number;
  /**
   * 日報の側。
   * ★`id`（元の行の番号）と `lineIndex`（経費の何行目か）は、
   *   「こちらは数えない」の印をどの行に付けるかを決めるのに使います（kp230）。
   *   読めなかった古い読み方では空になり、そのときは印を付けられません（出すだけ）。
   */
  report: {
    date: string;
    description: string;
    id?: string | number | null;
    lineIndex: number;
  };
  /** 立替台帳の側（`id` と `source` の組で1行を指す） */
  advance: {
    date: string;
    description: string;
    id?: string | number | null;
    source?: AdvanceSource;
  };
  /** 日付のへだたり（日数） */
  dayGap: number;
  /** 同じ言葉（これが一致の根拠） */
  sharedWords: string[];
  /**
   * 2つとも同じ月に入っているか。
   * true なら、その月の経費が**この金額だけ多く**出ている。
   * false（月をまたいでいる）なら、どちらの月に入れるかの話になる。
   */
  sameMonth: boolean;
};

export type DuplicateCheck = {
  suspects: DuplicateSuspect[];
  /** 同じ月の中で二重に入っている疑いの合計（経費がこの分だけ多く出ているおそれ） */
  doubleCountedTotal: number;
  /** 月をまたいでいる疑いの合計（どちらの月に入れるかで動く額） */
  crossMonthTotal: number;
};

/** 説明から「言葉」を取り出す（2文字以上のかたまりだけ） */
export function descriptionWords(text: string): string[] {
  const cleaned = String(text ?? "")
    // 日付・番号・単位のような、どの行にも出てくる飾りは落とす
    .replace(/[0-9０-９]+/g, " ")
    .replace(/[（）()【】\[\]・,，.。、\/×〜~※No#＃-]/g, " ");
  const out = new Set<string>();
  for (const w of cleaned.split(/\s+/)) {
    const t = w.trim();
    // 「立替」「円」「個」のような、どこにでも出る言葉は根拠にしない
    if (t.length >= 2 && !STOP_WORDS.has(t)) out.add(t);
  }
  return Array.from(out);
}

/** これだけが一致しても「同じ支払い」の根拠にはしない言葉 */
const STOP_WORDS = new Set([
  "立替",
  "未確定",
  "精査中",
  "手羽屋",
  "もも屋",
  "その他",
  "ほか",
  "一式",
  "合計",
]);

/**
 * 2つの言葉が「同じもの」を指しているか。
 * 同じ言葉のほか、**どちらかがもう一方の頭から始まっている**ときも同じとみなす
 * （「ダイソー」と「ダイソーニトリモール」。店名の書き方のゆれを拾うため）。
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** YYYY-MM-DD の2つの日の差（日数） */
function dayGapOf(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((ta - tb) / 86400000));
}

/**
 * 同じ支払いが2か所にある疑いを探す。
 *
 * @param ym 見る月（YYYY-MM）
 * @param reports 日報（その月のぶんだけを見る）
 * @param advances 立替台帳（月をまたいだ書き方も拾うため、前後の月も渡してよい）
 * @param maxDayGap 何日以内を同じ支払いとみなすか（既定31日）。
 *   月をまたいだ書き方（立替台帳は 8/28・日報は 9/12 のような形）も拾うため、
 *   1か月ぶん見ます。金額が1円まで同じで、同じ言葉も入っていることが条件なので、
 *   期間を広げても関係ない行が組になりにくいようにしてあります。
 */
export function findDuplicateExpenses(params: {
  ym: string;
  reports: KeiriReport[];
  advances: KeiriAdvance[];
  maxDayGap?: number;
}): DuplicateCheck {
  const { ym, reports, advances } = params;
  const maxDayGap = params.maxDayGap ?? 31;

  // 日報の側（その月の経費明細をぜんぶ1行ずつに開く）
  const reportLines: {
    date: string;
    description: string;
    amount: number;
    id?: string | number | null;
    lineIndex: number;
  }[] = [];
  for (const r of reports) {
    if (!String(r.date ?? "").startsWith(ym)) continue;
    // ★何行目かは expenseItemsOf で開いた順（0から）。印を付ける場所と同じ数え方にそろえる
    expenseItemsOf(r.expenses).forEach((item, lineIndex) => {
      reportLines.push({
        date: r.date,
        description: String(item.description ?? ""),
        amount: amountOf(item),
        id: r.id ?? null,
        lineIndex,
      });
    });
  }

  const usedAdvance = new Set<number>();
  const suspects: DuplicateSuspect[] = [];

  for (const line of reportLines) {
    if (line.amount <= 0) continue;
    const lineWords = descriptionWords(line.description);
    let best: { i: number; gap: number; shared: string[] } | null = null;

    advances.forEach((a, i) => {
      if (usedAdvance.has(i)) return;
      if ((Number(a.amount) || 0) !== line.amount) return;
      const gap = dayGapOf(line.date, String(a.date ?? ""));
      if (gap > maxDayGap) return;
      const shared = descriptionWords(String(a.description ?? "")).filter((w) =>
        lineWords.some((lw) => sameWord(lw, w)),
      );
      if (shared.length === 0) return;
      // 日付が近い組を優先する
      if (!best || gap < best.gap) best = { i, gap, shared };
    });

    if (!best) continue;
    const found = best as { i: number; gap: number; shared: string[] };
    usedAdvance.add(found.i);
    const a = advances[found.i];
    suspects.push({
      amount: line.amount,
      report: {
        date: line.date,
        description: line.description,
        id: line.id ?? null,
        lineIndex: line.lineIndex,
      },
      advance: {
        date: String(a.date ?? ""),
        description: String(a.description ?? ""),
        id: a.id ?? null,
        source: a.source,
      },
      dayGap: found.gap,
      sharedWords: found.shared,
      sameMonth: String(a.date ?? "").startsWith(ym),
    });
  }

  suspects.sort((x, y) => y.amount - x.amount);
  return {
    suspects,
    doubleCountedTotal: suspects
      .filter((s) => s.sameMonth)
      .reduce((t, s) => t + s.amount, 0),
    crossMonthTotal: suspects
      .filter((s) => !s.sameMonth)
      .reduce((t, s) => t + s.amount, 0),
  };
}

/* ------------------------------------------------------------------
 * 同じ日報が2回 入っていないか（2026-11-03・f1-1／f1-5）
 *
 * ■ なぜ要るか（10月の実データで分かったこと）
 *   10/11 と 10/12 が、**同じ日・同じ出店先・同じ担当・同じ売上・同じ経費**で
 *   2行ずつ入っていました（どちらも 10/13 の朝に続けて入力されたもの）。
 *   二重ぶんは売上 45,050円・経費 10,317円。
 *   上の findDuplicateExpenses は「経費と立替の二重」だけを見ているので、
 *   **同じ日報が2回 入った形は、どこも見ていませんでした**（締めの窓口は「0件」と答えます）。
 *   売上がそのまま多く出るので、月の締めの数字が狂います。
 *
 * ■ ここでやらないこと（上と同じ考え方）
 *   ① **金額を勝手に直さない・片方を黙って落とさない。** どちらを消すかは人が決めること
 *      （管理者ページの日報一覧 →「編集」。集計から外すだけなら CLAUDE.md 4-14 のスイッチ）
 *   ② **決めつけない。**「疑い」としてしか言いません
 *   ③ 1円も書き込みません
 *
 * ■ 疑いと見なす条件（2026-11-03 09:58 B2 が実データから出した決まりに合わせています）
 *   同じ月・同じお店の区分の中で、**日・号車・出店先・担当・売上・経費の合計**が
 *   すべて同じ行が2つ以上あるとき。保存した時刻の差は問いません。
 *   ★**号車が違えば別物**（同じ日に2台で出ただけ）なので数えません。
 *     号車が読めなかったときは、その欄を空として比べます（決めつけずに「疑い」として出す）。
 *   ★売上も経費も人件費も0の行は数えません
 *     （金額が動かないので、二重でも締めの数字は狂わないため）。
 *   8月以降の実データで、この形に当たるのは 10/11 と 10/12 の2組だけでした。
 * ------------------------------------------------------------------ */

/** 同じ日報が2回 入っている疑いの1組 */
export type DuplicateReportGroup = {
  date: string;
  shop: string | null;
  /** 号車（読めなければ空文字） */
  unit: string;
  location: string | null;
  staff: string | null;
  /** 同じ中身の行が何行あるか（2以上） */
  count: number;
  /** 1行ぶんの売上 */
  sales: number;
  /** 1行ぶんの経費（明細の合計） */
  expenseTotal: number;
  /** 1行ぶんの人件費 */
  labor: number;
  /** それぞれの行の番号（読めないデータでは空が入る） */
  ids: (string | number | null)[];
  /** 余分に入っている売上（1行ぶん × 余分な行数） */
  extraSales: number;
  /** 余分に入っている経費 */
  extraExpense: number;
};

export type DuplicateReportCheck = {
  groups: DuplicateReportGroup[];
  /** 余分に入っている行数の合計（Σ 行数−1） */
  extraReports: number;
  /** 余分に入っている売上の合計（この分だけ月の売上が多く出ている） */
  extraSalesTotal: number;
  /** 余分に入っている経費の合計 */
  extraExpenseTotal: number;
};

function textKey(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * 同じ日報が2回 入っている疑いを探す。
 *
 * @param ym 見る月（YYYY-MM）。その月の行だけを見る
 * @param reports 日報（月の外の行が混ざっていてもよい）
 */
export function findDuplicateReports(params: {
  ym: string;
  reports: KeiriReport[];
}): DuplicateReportCheck {
  const ym = String(params.ym ?? "");
  const buckets = new Map<string, KeiriReport[]>();
  for (const r of params.reports ?? []) {
    const date = String(r.date ?? "");
    if (!date.startsWith(`${ym}-`)) continue;
    const sales = Number(r.sales_amount) || 0;
    const labor = Number(r.labor) || 0;
    const expenseTotal = expenseItemsOf(r.expenses).reduce((t, x) => t + amountOf(x), 0);
    // 金額がまったく動かない行は、二重でも締めの数字が狂わないので数えない
    if (sales === 0 && expenseTotal === 0 && labor === 0) continue;
    const key = [
      date,
      textKey(r.shop),
      // ★号車が違えば別物（同じ日に2台で出ただけ）
      textKey(r.unit_number),
      textKey(r.location),
      textKey(r.staff_name),
      sales,
      expenseTotal,
    ].join("\u0001");
    const got = buckets.get(key);
    if (got) got.push(r);
    else buckets.set(key, [r]);
  }

  const groups: DuplicateReportGroup[] = [];
  for (const rows of buckets.values()) {
    if (rows.length < 2) continue;
    const first = rows[0];
    const sales = Number(first.sales_amount) || 0;
    const labor = Number(first.labor) || 0;
    const expenseTotal = expenseItemsOf(first.expenses).reduce((t, x) => t + amountOf(x), 0);
    const extra = rows.length - 1;
    groups.push({
      date: String(first.date ?? ""),
      shop: first.shop ?? null,
      unit: textKey(first.unit_number),
      location: first.location ?? null,
      staff: first.staff_name ?? null,
      count: rows.length,
      sales,
      expenseTotal,
      labor,
      ids: rows.map((r) => r.id ?? null),
      extraSales: sales * extra,
      extraExpense: expenseTotal * extra,
    });
  }
  groups.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    groups,
    extraReports: groups.reduce((t, g) => t + (g.count - 1), 0),
    extraSalesTotal: groups.reduce((t, g) => t + g.extraSales, 0),
    extraExpenseTotal: groups.reduce((t, g) => t + g.extraExpense, 0),
  };
}
