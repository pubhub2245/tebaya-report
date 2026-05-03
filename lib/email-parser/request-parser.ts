/**
 * じゅんさん→大田原さん向け「出店希望日メール」の本文パーサー。
 *
 * 入力: メール本文（plain text）
 * 出力: 月ごとに店舗別の出店希望日（YYYY-MM-DD）配列に整形。
 *
 * 解析ルール:
 *   1. `【〇月 出店希望日】` または `【〇月 追加出店希望日】` のヘッダーで月ブロックを区切る
 *   2. ブロック内の `・店舗名 N/N、N/N、N/N` 形式の行から店舗・日付を抽出
 *   3. 全角数字/スラッシュ/空白/カンマを半角に正規化
 *   4. 店舗名の表記揺れ（わかば店→若葉店, 高尾店→鷹尾店, 三又店→三股店 等）を吸収
 *   5. 同月の「希望」「追加希望」ブロックが両方ある場合は同じバケットへマージ
 *
 * エラー方針: 例外を投げず、warnings に記録して該当行/値だけ除外する。
 */

export const NAGAYAMA_STORES = [
  "志比田店",
  "若葉店",
  "山田店",
  "鷹尾店",
  "三股店",
  "都北店",
] as const;

export type CanonicalStore = (typeof NAGAYAMA_STORES)[number];

export interface ParsedRequestMonth {
  year: number;
  month: number;
  requests: Array<{
    store: CanonicalStore;
    dates: string[]; // ISO "YYYY-MM-DD"、昇順
  }>;
}

export interface ParsedRequest {
  months: ParsedRequestMonth[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 表記揺れエイリアス
// ---------------------------------------------------------------------------

const STORE_ALIASES: Record<string, CanonicalStore> = {
  // 志比田
  志比田店: "志比田店",
  志比田: "志比田店",
  // 若葉
  若葉店: "若葉店",
  若葉: "若葉店",
  わかば店: "若葉店",
  わかば: "若葉店",
  ワカバ店: "若葉店",
  ワカバ: "若葉店",
  // 山田
  山田店: "山田店",
  山田: "山田店",
  // 鷹尾
  鷹尾店: "鷹尾店",
  鷹尾: "鷹尾店",
  高尾店: "鷹尾店",
  高尾: "鷹尾店",
  たかお店: "鷹尾店",
  たかお: "鷹尾店",
  タカオ店: "鷹尾店",
  // 三股
  三股店: "三股店",
  三股: "三股店",
  三又店: "三股店",
  三又: "三股店",
  // 都北
  都北店: "都北店",
  都北: "都北店",
};

// ---------------------------------------------------------------------------
// 正規表現
// ---------------------------------------------------------------------------

const HEADER_RE = /【\s*(\d+)月\s*(?:追加)?出店希望日\s*】/;
// 行頭の「・」または「•」「-」のあとに 店舗名（非空白）+ 空白 + 日付列
const STORE_LINE_RE = /^[・•\-]\s*(\S+?)\s+(.+)$/;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** 全角数字・スラッシュ・空白・カンマを半角へ */
function fullToHalf(s: string): string {
  return s
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/／/g, "/")
    .replace(/　/g, " ")
    .replace(/，/g, ",");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * ヘッダーの月から年を推定する。
 * - opts.defaultYear が指定されていればそれを使用
 * - 未指定なら現在年。ただし header 月が現在月より前なら翌年（来年の予定メールという解釈）
 */
function inferYear(headerMonth: number, defaultYear: number | undefined): number {
  if (defaultYear !== undefined) return defaultYear;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (headerMonth < currentMonth) return currentYear + 1;
  return currentYear;
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

export function parseRequestEmail(
  emailBody: string,
  opts?: { defaultYear?: number },
): ParsedRequest {
  const warnings: string[] = [];

  if (!emailBody || emailBody.trim() === "") {
    return { months: [], warnings };
  }

  type Bucket = {
    year: number;
    month: number;
    requestsMap: Map<CanonicalStore, Set<string>>;
  };

  const buckets: Bucket[] = [];
  let currentBucket: Bucket | null = null;

  const lines = emailBody.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = fullToHalf(rawLine).trim();
    if (!line) continue;

    // ヘッダー行か？
    const headerMatch = line.match(HEADER_RE);
    if (headerMatch) {
      const headerMonth = parseInt(headerMatch[1], 10);
      if (!Number.isFinite(headerMonth) || headerMonth < 1 || headerMonth > 12) {
        warnings.push(`不正な月のヘッダーを無視: '${headerMatch[0]}'`);
        currentBucket = null;
        continue;
      }
      const year = inferYear(headerMonth, opts?.defaultYear);
      // 同じ year-month の既存バケットがあれば再利用（「追加出店希望日」併記対応）
      let existing = buckets.find(
        (b) => b.year === year && b.month === headerMonth,
      );
      if (!existing) {
        existing = {
          year,
          month: headerMonth,
          requestsMap: new Map(),
        };
        buckets.push(existing);
      }
      currentBucket = existing;
      continue;
    }

    // ヘッダー外の行は無視（ヘッダーがまだ無ければ何もしない）
    if (!currentBucket) continue;

    const storeMatch = line.match(STORE_LINE_RE);
    if (!storeMatch) continue;

    const rawStoreName = storeMatch[1];
    const datesStr = storeMatch[2];

    const canonical = STORE_ALIASES[rawStoreName];
    if (!canonical) {
      warnings.push(`未知の店舗名 '${rawStoreName}' を除外`);
      continue;
    }
    if (canonical !== rawStoreName) {
      warnings.push(`店舗名 '${rawStoreName}' を '${canonical}' に正規化`);
    }

    // 日付パース
    const parts = datesStr
      .split(/[、,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const dateSet =
      currentBucket.requestsMap.get(canonical) ?? new Set<string>();

    for (const part of parts) {
      const dm = part.match(/^(\d+)\/(\d+)$/);
      if (!dm) {
        warnings.push(`日付形式が不明 '${part}' を除外`);
        continue;
      }
      const dateMonth = parseInt(dm[1], 10);
      const dateDay = parseInt(dm[2], 10);
      if (dateMonth !== currentBucket.month) {
        warnings.push(
          `'${part}' の月がヘッダー(${currentBucket.month}月)と不一致のため除外`,
        );
        continue;
      }
      const maxDay = daysInMonth(currentBucket.year, currentBucket.month);
      if (dateDay < 1 || dateDay > maxDay) {
        warnings.push(`無効な日付 '${part}' を除外`);
        continue;
      }
      const iso = `${currentBucket.year}-${pad2(currentBucket.month)}-${pad2(dateDay)}`;
      dateSet.add(iso);
    }

    currentBucket.requestsMap.set(canonical, dateSet);
  }

  if (buckets.length === 0) {
    warnings.push(
      "月ブロックのヘッダー（【○月 出店希望日】）が見つかりませんでした",
    );
  }

  const months: ParsedRequestMonth[] = buckets.map((b) => ({
    year: b.year,
    month: b.month,
    requests: Array.from(b.requestsMap.entries()).map(([store, dates]) => ({
      store,
      dates: Array.from(dates).sort(),
    })),
  }));

  return { months, warnings };
}
