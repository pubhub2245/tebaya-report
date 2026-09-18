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

/** SNSなどの合言葉（utm_campaign）。無ければ null */
export function cleanCampaign(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().slice(0, 80);
  return c || null;
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
