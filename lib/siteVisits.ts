/**
 * 「サイトに来た人の数」を数えるための、計算だけのファイル。
 *
 * ■ なぜ作ったか（2026-09-18 じゅんの答え c8）
 *   ページを作る側はだいたいやり切ったので、次の目安を
 *   「作ったページの本数」から「サイトに来た人の数（週）」に移すことになった。
 *   ところが、いまはどのサイトにも訪問を数える仕組みが無い。
 *   お金のかかる外部サービスは使わず、すでにある倉庫（Supabase）に
 *   1行ずつ足すだけの、いちばん小さい作りで数える。
 *
 * ■ 置き場所をここ1つにした理由
 *   5つのサイトそれぞれに数える仕組みを持たせると、鍵を5か所に配ることになる。
 *   鍵は1か所（このアプリ）だけに置き、ほかの4サイトからは
 *   「来ました」という合図だけを送ってもらう。
 *
 * ■ 集めないもの（大事）
 *   IPアドレス・ブラウザの種類（UA）・お客さんを見分ける印は**保存しない**。
 *   保存するのは「どのサイトの・どのページが・いつ開かれたか」だけ。
 *   ロボット（検索エンジンの巡回など）は数えないが、その判定に使ったUAも保存しない。
 */

/** 数える対象のサイト。ここに無い名前の合図は捨てる */
export const KNOWN_SITES = [
  "playmiyazaki",
  "ai-tools-navi",
  "endo",
  "mh-build-roadmap",
  "keiri",
] as const;

export type SiteKey = (typeof KNOWN_SITES)[number];

/** 合図を送ってよいサイトの住所（ここ以外からの合図はブラウザ側で止まる） */
export const ALLOWED_ORIGINS = [
  "https://playmiyazaki.com",
  "https://www.playmiyazaki.com",
  "https://playmiyazaki.vercel.app",
  "https://ai-tools-navi-delta.vercel.app",
  "https://shisha-booking.vercel.app",
  "https://mh-build-roadmap.vercel.app",
  "https://tebaya-report.vercel.app",
] as const;

export function isKnownSite(value: unknown): value is SiteKey {
  return (
    typeof value === "string" &&
    (KNOWN_SITES as readonly string[]).includes(value)
  );
}

/** 送り主の住所が許した一覧に入っているか */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin.trim());
}

/**
 * ページの場所（パス）をきれいにする。
 * ・先頭に / が無ければ足す
 * ・「?」より後ろ（検索語などが入りうる部分）は捨てる
 * ・長すぎるものは切る
 */
export function cleanPath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  let p = raw.trim();
  if (!p) return "/";
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 200) p = p.slice(0, 200);
  return p || "/";
}

/**
 * どこから来たか（ref）は、**住所の「ドメイン名」だけ**に減らす。
 * 個人が分かる細かいURLは残さない。同じサイト内の移動は null。
 */
export function refHost(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    if (!host) return null;
    if ((ALLOWED_ORIGINS as readonly string[]).some((o) => o.endsWith(host))) {
      return null; // 自分のサイト同士の移動は「外から来た」ではない
    }
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/**
 * 合言葉（?from=card や utm_campaign）のまわりに付いてきた「余分な記号」を落とす文字。
 *
 * ■ なぜ要るか（2026-09-28・司令室 kp195）
 *   9/27 の夜、紙の札から来た3件が合言葉 **card`**（末尾にバッククォート）で
 *   記録されていた。紙のQR自体は正しく `?from=card` で、読み戻しても
 *   1文字も違わない（9/27 に実測ずみ）。つまり記号は**外から付いてきた**もので、
 *   文章の中に書かれた住所（`…?from=card` のような囲み記号つき）を
 *   そのまま写して開くと、最後の記号まで一緒に付いてくる。
 *   このまま貯めると、2週間あとに「card」だけを数えたときに**0件に見える**。
 *
 * ■ どう直すか
 *   合言葉の**前と後ろだけ**から、住所の一部になりえない記号を削る。
 *   真ん中は触らない（`spring_2026.a` のような正しい合言葉を壊さないため）。
 */
const CAMPAIGN_EDGE_JUNK = new Set([
  "`",
  "'",
  '"',
  "\u2018",
  "\u2019",
  "\u201c",
  "\u201d",
  "<",
  ">",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "\uff08", // （
  "\uff09", // ）
  "\u300c", // 「
  "\u300d", // 」
  ",",
  ";",
  ":",
  "!",
  "?",
  ".",
  "\u3001", // 、
  "\u3002", // 。
  "\uff01", // ！
  "\uff1f", // ？
  "*",
  "|",
  "\\",
  "/",
]);

/** 合言葉の前後から、余分な記号と空白を取り除く（真ん中は触らない） */
export function trimCampaignEdges(value: string): string {
  let s = value.trim();
  let before = "";
  while (s !== before) {
    before = s;
    while (s.length > 0 && CAMPAIGN_EDGE_JUNK.has(s[0])) s = s.slice(1);
    while (s.length > 0 && CAMPAIGN_EDGE_JUNK.has(s[s.length - 1]))
      s = s.slice(0, -1);
    s = s.trim();
  }
  return s;
}

/** SNSなどの合言葉（utm_campaign）。無ければ null */
export function cleanCampaign(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = trimCampaignEdges(raw).slice(0, 80);
  return c || null;
}

/**
 * 合言葉ごとの数をまとめる（どの紙・どの投稿から来たかの答え合わせ用）。
 *
 * 古い記録に混じった `card\`` のような形も、上の掃除を通してから数えるので
 * **`card` と同じ1つとして合算される**（kp195）。合言葉が無い訪問は数えない。
 */
export function summarizeCampaigns(
  rows: { site: string; campaign?: string | null }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = cleanCampaign(r.campaign);
    if (!key) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * ロボットかどうか。判定に使うだけで、この文字列は保存しない。
 * 検索エンジンの巡回を「人が来た」と数えてしまうと目安にならないため。
 */
export function looksLikeBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // 名乗らないものは人として数えない
  const ua = userAgent.toLowerCase();
  const marks = [
    "bot",
    "crawler",
    "spider",
    "slurp",
    "headless",
    "preview",
    "monitor",
    "curl",
    "wget",
    "python-requests",
    "axios",
    "go-http-client",
    "lighthouse",
    "pingdom",
    "vercel-screenshot",
  ];
  return marks.some((m) => ua.includes(m));
}

export type VisitRow = {
  site: SiteKey;
  path: string;
  campaign: string | null;
  ref_host: string | null;
};

/**
 * 送られてきた合図を、倉庫に入れられる1行に整える。
 * 整えられない（知らないサイト・ロボット）ときは null。
 */
export function toVisitRow(input: {
  site?: unknown;
  path?: unknown;
  campaign?: unknown;
  ref?: unknown;
  userAgent?: string | null;
}): VisitRow | null {
  if (!isKnownSite(input.site)) return null;
  if (looksLikeBot(input.userAgent)) return null;
  return {
    site: input.site,
    path: cleanPath(input.path),
    campaign: cleanCampaign(input.campaign),
    ref_host: refHost(input.ref),
  };
}

/** その日を含む週の月曜日（YYYY-MM-DD・日本時間） */
export function weekStart(at: Date): string {
  const jst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const dow = jst.getUTCDay(); // 0=日
  const back = dow === 0 ? 6 : dow - 1;
  jst.setUTCDate(jst.getUTCDate() - back);
  return jst.toISOString().slice(0, 10);
}

export type VisitSummary = {
  /** 直近7日の、サイトごとの訪問数 */
  last7days: Record<string, number>;
  /** 週（月曜はじまり）ごと・サイトごとの訪問数。新しい週が先 */
  weeks: { weekStart: string; sites: Record<string, number> }[];
};

/**
 * 倉庫から取り出した行を、週ごと・サイトごとに数えてまとめる。
 * 画面にも司令室にも、この形だけを見せる（1行ずつの記録は外に出さない）。
 */
export function summarize(
  rows: { site: string; at: string }[],
  now: Date,
): VisitSummary {
  const last7days: Record<string, number> = {};
  const byWeek = new Map<string, Record<string, number>>();
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  for (const r of rows) {
    const t = new Date(r.at);
    if (Number.isNaN(t.getTime())) continue;
    if (t.getTime() >= cutoff) {
      last7days[r.site] = (last7days[r.site] ?? 0) + 1;
    }
    const w = weekStart(t);
    const bucket = byWeek.get(w) ?? {};
    bucket[r.site] = (bucket[r.site] ?? 0) + 1;
    byWeek.set(w, bucket);
  }

  const weeks = [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, sites]) => ({ weekStart, sites }));

  return { last7days, weeks };
}

/**
 * 「日ごと・サイトごとに数えた結果」だけを受け取って、まとめ直す。
 *
 * ■ なぜ2通りあるか（2026-09-19）
 *   訪問の棚（site_visits）は「入れることだけ許す郵便ポスト」の形にしてある。
 *   そのため**1行ずつ読み出すことができない**（読む許可がそもそも無い）。
 *   サーバー側の合鍵が使えれば 1行ずつ読めるので summarize() を使い、
 *   使えないときは倉庫側の集計だけを返す窓口（site_visits_summary）から
 *   「日ごとの数」を受け取って、この関数でまとめる。
 *   どちらの道でも、外に出るのは**合計だけ**でページ名や来た元は出ない。
 *
 * ■ 1つだけ違うところ（正直に書く）
 *   1行ずつ読む道の「直近7日」は **いまから 7×24時間**。
 *   こちらは日ごとにしか数えられないので **今日を含む7日ぶん（日本時間）**。
 *   数え方が違うので、境目の日は1日ぶんずれることがある。
 */
export function summarizeDaily(
  rows: { site: string; day: string; hits: number }[],
  now: Date,
): VisitSummary {
  const last7days: Record<string, number> = {};
  const byWeek = new Map<string, Record<string, number>>();
  // 今日を含めて7日ぶん（日本時間の日付で比べる）
  const from = jstDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));

  for (const r of rows) {
    if (typeof r.site !== "string" || !r.site) continue;
    const day = typeof r.day === "string" ? r.day.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const hits = Number(r.hits);
    if (!Number.isFinite(hits) || hits <= 0) continue;

    if (day >= from) {
      last7days[r.site] = (last7days[r.site] ?? 0) + hits;
    }
    // その日の昼を代表にして週（月曜はじまり）を出す
    const w = weekStart(new Date(`${day}T12:00:00+09:00`));
    const bucket = byWeek.get(w) ?? {};
    bucket[r.site] = (bucket[r.site] ?? 0) + hits;
    byWeek.set(w, bucket);
  }

  const weeks = [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, sites]) => ({ weekStart, sites }));

  return { last7days, weeks };
}

/** その時刻の「日本時間での日付」（YYYY-MM-DD） */
export function jstDay(at: Date): string {
  return new Date(at.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
