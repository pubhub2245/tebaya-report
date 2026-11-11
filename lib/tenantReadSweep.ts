/**
 * 「どの店のものか」の印がある棚を、**絞らずに読んでいる所が増えていないか**を
 * 機械で数える、ただ1か所のファイル（2026-11-11・f3-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   よその店のデータが見えないか（f3-4）の見張りは、これまで2つありました：
 *     ・書き込む所の見張り … lib/tenantWriteSweep.ts（印の欄が**無い**棚に書く所）
 *     ・読む所の見張り     … tests/tenantTables.test.ts（印の欄が**ある**棚を読む所）
 *   ところが読む所の見張りは **ファイル単位**でした。
 *   lib/tenantTables.ts にも、その事実がそのまま書いてあります：
 *     「見張りは**ファイル単位**なので、同じファイルの中に印が1つでもあると、
 *       そのファイル全体が『絞っている』側に数えられます」
 *   ＝ **1か所でも絞っている大きなファイル（日報の画面・経理の画面など）の中に、
 *     絞り忘れた読みを1つ足しても、試験は通ってしまいます。**
 *   読み忘れは画面に何も出ないので、次に誰かが目で数え直すまで分かりません。
 *   いままで取り落としを「1日1つずつ手で見つけて足していた」のが、まさにこの形です。
 *
 * ■ どう直すか
 *   **読む所を1か所ずつ（ファイル単位ではなく `.from(…)` 単位で）数えます。**
 *   絞っていない読みが増えたら、その場で試験が落ちて「どのファイルの何行目か」が出ます。
 *
 * ■ 「絞っている」と数える印（これ以外は絞っていないものとして数える）
 *   ① applyTenantScope（lib/tenantScope.ts）を通している
 *   ② tenant_id の列を直に指している（.is("tenant_id", null) など）
 *   ③ business_type_code で引いている
 *      … 経理の棚（keiri_settings / keiri_payments / keiri_advance_expenses）は
 *        お店ごとの合い札（手羽屋は 'tebaya'、よその店は 't_<お店の番号>'）で
 *        分かれています（lib/tenantScope.ts の businessCodeForScope）。
 *        ＝ この欄で引いている読みは、そのお店のぶんしか返りません。
 *   ④ 棚ごとの係（scopeShiftsQuery など）を通している
 *
 * ■ ここが大事（これは「塞ぐ道具」ではありません）
 *   すでに開いている所を閉じる仕事ではなく、**増えたことに気づく**ための道具です。
 *   いま許してある所は下の一覧（ALLOWED_UNSCOPED_READS）に、**なぜ許してよいか**を
 *   1行ずつ書いてあります。
 *
 * ■ 守ること
 *   ・金額・鍵・合言葉・お店の名前は1文字も持ちません（ファイルの名前と棚の名前だけ）。
 *   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE）の中身は1行も変えていません。
 */

import { TENANT_SCOPED_TABLES } from "@/lib/tenantTables";

/** 1件の読み（棚の名前が文字で書かれていないときは table が null） */
export type ReadHit = { table: string | null; line: number; scoped: boolean };

/** いま許してある読み（path と table の組で1件） */
export type AllowReadEntry = { path: string; table: string; why: string };

/**
 * いま許してある「絞らずに読んでいる所」。
 * ★ここに足すときは、必ず **なぜ許してよいか** を書くこと。
 *   書けないなら、それは許してよい読みではありません。
 */
export const ALLOWED_UNSCOPED_READS: readonly AllowReadEntry[] = [
  // ── 印の欄がまだ無い棚（貼り紙 ④⑩ で足します） ─────────────────
  {
    path: "lib/keiri/loadMonthServer.ts",
    table: "advance_expenses",
    why:
      "立替（経営）の棚には「どの店のものか」の欄がまだありません" +
      "（/keiri/sql の貼り紙 ④⑩ で足します）。足すまでは絞る欄が無いので絞れません",
  },
  {
    path: "lib/keiri/loadMonth.ts",
    table: "advance_expenses",
    why: "同上（立替（経営）の棚に印の欄がまだ無い）",
  },

  // ── 1件だけを番号で引く（よその店の行は一覧に出ない） ──────────────
  {
    path: "app/components/EditReportModal.tsx",
    table: "daily_reports",
    why:
      "日報1枚の経費の明細を、その日報の番号で1件だけ引く（CLAUDE.md 4-2）。" +
      "番号は絞って読んだ一覧から来るので、よその店の行は渡ってこない",
  },

  // ── 数えるだけ・あるか無いかだけ（中身を返さない） ────────────────
  {
    path: "app/api/keiri/diagnose/route.ts",
    table: "keiri_applications",
    why:
      "外から1回で状態を見る読むだけの窓口。お申し込みは『何件あるか』だけを数えており、" +
      "どのお店の行かは1行も読まない（中身を返さない）",
  },
  {
    path: "lib/shiftScope.ts",
    table: "shifts",
    why:
      "「出店予定の棚に『どの店か』の欄があるか」を確かめるだけの問い合わせ" +
      "（limit(1) で、返るのは欄の有無＝エラーかどうかだけ）。中身は使わない",
  },
];

const FROM_RE = /\.from\(\s*("([a-z_0-9]+)"|[A-Za-z_$][A-Za-z_0-9$]*)\s*\)/g;
const WRITE_RE = /\.\s*(insert|upsert|update|delete)\s*\(/;
/** 「絞っている」と数える印（上の①〜④） */
const SCOPE_RE =
  /applyTenantScope|tenant_id|TENANT_COLUMN|business_type_code|scopeShiftsQuery|scope[A-Za-z]*Query/;
/** 絞っている印を、`.from(` の**手前**まで何文字さかのぼって探すか */
const LOOKBEHIND = 200;

/**
 * ソース1枚から「印のある棚への読み」を1か所ずつ拾う。
 *
 * ■ 数え方（取り違えないために）
 *   `.from("棚")` を見つけたら、**次の `.from(` が出てくるまで**のあいだを1か所と見ます。
 *   そのあいだに `.select(` があって書き込み（insert/upsert/update/delete）が無ければ「読み」です。
 *   絞っている印は `.from(` の手前にも書かれるので（applyTenantScope(…) で包む形）、
 *   **手前は前の読みにかぶらない範囲だけ**さかのぼって探します。
 *   `.storage.from(` は写真の置き場なので数えません（棚ではありません）。
 */
export function findTableReads(source: string): ReadHit[] {
  const marks: { at: number; end: number; table: string | null }[] = [];
  const re = new RegExp(FROM_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const before = source.slice(Math.max(0, m.index - 9), m.index);
    if (before.endsWith(".storage")) continue;
    marks.push({ at: m.index, end: m.index + m[0].length, table: m[2] ?? null });
  }
  const hits: ReadHit[] = [];
  marks.forEach((mark, i) => {
    const until = i + 1 < marks.length ? marks[i + 1].at : source.length;
    const chunk = source.slice(mark.end, until);
    if (WRITE_RE.test(chunk)) return;
    if (!/\.\s*select\s*\(/.test(chunk)) return;
    const behindFrom = Math.max(i > 0 ? marks[i - 1].end : 0, mark.at - LOOKBEHIND);
    const context = source.slice(behindFrom, until);
    hits.push({
      table: mark.table,
      line: source.slice(0, mark.at).split("\n").length,
      scoped: SCOPE_RE.test(context),
    });
  });
  return hits;
}

/** 数えた結果（許してある一覧に無かった読み） */
export type ReadFinding = { path: string; table: string; line: number };

/** その読みを許してあるか */
export function isAllowedRead(path: string, table: string | null): boolean {
  if (table === null) return true; // 棚の名前が文字で書かれていない＝この道具では判定しない
  if (!(TENANT_SCOPED_TABLES as readonly string[]).includes(table)) return true;
  return ALLOWED_UNSCOPED_READS.some((a) => a.path === path && a.table === table);
}

/** 何枚ものソースをまとめて数える。返るのは「絞っておらず、許してもいない読み」だけ */
export function sweepReads(
  files: readonly { path: string; source: string }[],
): ReadFinding[] {
  const out: ReadFinding[] = [];
  for (const f of files) {
    for (const hit of findTableReads(f.source)) {
      if (hit.scoped) continue;
      if (isAllowedRead(f.path, hit.table)) continue;
      out.push({ path: f.path, table: hit.table as string, line: hit.line });
    }
  }
  return out;
}

/** 落ちたときに画面（試験の答え）に出す1文。やさしい言葉で、やることまで書く */
export function describeReadFindings(findings: readonly ReadFinding[]): string {
  if (findings.length === 0) return "印のある棚を絞らずに読んでいる所はありません";
  const lines = findings.map((f) => `・${f.path}:${f.line} → ${f.table}`);
  return [
    `「どの店のものか」の印がある棚を、**絞らずに読む所**が ${findings.length} か所 増えました。`,
    ...lines,
    "",
    "お店が2軒になると、この読みは**よその店の行まで返します**（f3-4）。",
    "次のどれかをしてください：",
    "① applyTenantScope（lib/tenantScope.ts）で絞る（いちばん良い）",
    "② 経理の棚なら business_type_code（お店ごとの合い札）で引く",
    "③ 本当に絞らなくてよいなら、lib/tenantReadSweep.ts の一覧に",
    "　 **なぜ許してよいか**を1行 書いて足す",
  ].join("\n");
}
