/**
 * 「手羽屋のデータの写し」が、公開の鍵で読めてしまわないかを
 * **サーバー側で実際に聞いて**確かめるところ（f3-4・2026-10-14）。
 *
 * ■ 2つの段取り
 *   ① 倉庫が**表に出している棚の名前**を、ぜんぶ数え上げる
 *      （公開の鍵で倉庫の入口を読むと、棚の名前の一覧が返ってきます）
 *   ② そのうち「写し」だけ（lib/keiri/copyTables.ts の見分け）を、
 *      **公開の鍵で1行 読んでみる**。読めてしまったら、まだ開いています
 *
 * ■ 返さないもの（大事）
 *   行の中身は1文字も読みません（件数の問い合わせだけを送り、数も返しません）。
 *   鍵・合言葉の値も返しません。返すのは **棚の名前と ○× だけ**です。
 *
 * ■ 一覧が読めなかったときも、黙って「大丈夫」にしません
 *   名前の一覧が読めないことはあり得ます（倉庫の設定次第）。
 *   そのときは **いままでに分かっている写しの名前**（下の KNOWN_COPY_TABLES）を
 *   必ず聞き、一覧が読めなかったことも正直に返します。
 *
 * ★1行も書き込みません。
 */

import { anonClient, anonKeyStatus, noStoreFetch } from "@/lib/supabaseServer";
import {
  COPY_OPEN,
  COPY_UNKNOWN,
  copyTablesOf,
  isCopyTableName,
  summarizeCopyTables,
  verdictFromAnonRead,
  type CopyTableVerdict,
} from "@/lib/keiri/copyTables";
import { BACKUP_COPY_TABLE } from "@/lib/keiri/shelves";
import {
  copyCandidateNames,
  type SweepTally,
} from "@/lib/keiri/copyCandidates";

/**
 * これまでに見つかっている写しの名前。
 * 一覧が読めなかったときでも、ここは必ず聞く（取りこぼさないため）。
 * ★新しく見つけたら足すこと。消さないこと。
 */
export const KNOWN_COPY_TABLES = [
  BACKUP_COPY_TABLE, // 2026-10-13 に見つかった日報の控え（2026-09-02・13行）
  "receipt_migration_backup", // レシート写真の引っ越し前に手で取った控え（CLAUDE.md 4-6）
] as const;

/** 倉庫が表に出している棚の名前を、公開の鍵で数え上げる */
export async function listExposedTables(): Promise<{
  ok: boolean;
  names: string[];
  note: string;
}> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = anonKeyStatus();
  if (!url || !anon.ok) {
    return { ok: false, names: [], note: "公開の鍵か倉庫の住所が設定されていません" };
  }
  try {
    const res = await noStoreFetch(`${url}/rest/v1/`, {
      headers: { apikey: anon.key, Authorization: `Bearer ${anon.key}`, Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, names: [], note: `棚の名前の一覧が読めませんでした（${res.status}）` };
    }
    const json = (await res.json()) as unknown;
    const names = namesFromOpenApi(json);
    if (names.length === 0) {
      return { ok: false, names: [], note: "棚の名前の一覧が、知っている形で返ってきませんでした" };
    }
    return { ok: true, names, note: `表に出ている棚 ${names.length} を数え上げました` };
  } catch {
    return { ok: false, names: [], note: "棚の名前の一覧を聞けませんでした" };
  }
}

/** 倉庫の入口の返事から、棚の名前だけを取り出す（形が違えば空で返す） */
export function namesFromOpenApi(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const found = new Set<string>();

  const defs = o.definitions;
  if (defs && typeof defs === "object") {
    for (const k of Object.keys(defs as Record<string, unknown>)) found.add(k);
  }
  const paths = o.paths;
  if (paths && typeof paths === "object") {
    for (const p of Object.keys(paths as Record<string, unknown>)) {
      const m = p.match(/^\/([A-Za-z0-9_]+)$/);
      if (m) found.add(m[1]);
    }
  }
  return [...found].filter((n) => n && !n.startsWith("rpc")).sort();
}

/**
 * その棚を、公開の鍵で聞いてみる（**行の中身は1行も受け取りません**）。
 *
 * ■ 2026-10-14 18:5x に見つけた落とし穴（同じ間違いを二度としないため）
 *   ここは長いあいだ「件数だけを聞く」やり方（head だけの問い合わせ）で聞いていました。
 *   ところがこのやり方だと、**倉庫の返事の中身が空になる**ため、
 *   使っている部品が「そんな棚はありません（404）」を
 *   **ふつうの返事と取り違えます**（＝無い棚まで「読めました」に見える）。
 *   実際に本番で、ありもしない名前が 72 本ぜんぶ「まだ読めます」と出ました。
 *   そこで **行を0件だけ要求する聞き方**に替えます。返事に中身が入るので、
 *   「無い」「断られた」「読めた」を取り違えません。
 *
 * ■ もう1つの落とし穴：**鍵が効いていても『断られた』とは返ってきません**
 *   棚に鍵がかかっていて読む決まりが1本も無いとき、倉庫は
 *   エラーではなく「0件です」と答えます（空の棚と見分けが付きません）。
 *   だから **行数が1以上 返ってきたときだけ「読めてしまう」**と言い、
 *   0件のときは「読めません（中身は返りません）」までにして、
 *   嘘の安心も、嘘の警告も出さないようにします。
 *
 * ★行の中身（金額・お店の名前・連絡先）は1文字も受け取りません（limit 0）。
 */
async function askAnon(table: string): Promise<CopyTableVerdict> {
  try {
    const db = anonClient({ fresh: true });
    const { error, count } = await db
      .from(table)
      .select("*", { count: "exact" })
      .limit(0);
    return verdictFromAnonRead({
      table,
      ok: !error,
      rows: count ?? null,
      code: error?.code ?? null,
      message: error?.message ?? null,
    });
  } catch {
    return { table, state: COPY_UNKNOWN, note: "聞けませんでした" };
  }
}

export type CopyProbeReport = {
  listed: boolean;
  listNote: string;
  exposed: number | null;
  tables: CopyTableVerdict[];
  allClosed: boolean;
  open: number;
  closed: number;
  unknown: number;
  summary: string;
  /** 名前を組み立てて片っぱしから聞いた結果（聞かなかったときは null） */
  sweep: CopySweepReport | null;
  /** いま使っている棚（日報）が、公開の鍵で読めるか */
  live: LiveShelfReport;
  /** f3-4 全体の答え（写しだけでは閉まらない） */
  f34: string;
  sheet: string;
  check: string;
};

/** 名前を組み立てて聞いた結果（外に出す形） */
export type CopySweepReport = SweepTally & {
  from: number;
  nextFrom: number | null;
  total: number;
  /** 組み立てた名前を全部 聞き終えたか */
  done: boolean;
  note: string;
};

/* ------------------------------------------------------------------ *
 *  名前を組み立てて片っぱしから聞く（2026-10-14 18:34・kp239・f3-4）
 * ------------------------------------------------------------------ */

/** 一度に聞く本数の既定（サーバーの持ち時間に収まる数） */
export const SWEEP_LIMIT_DEFAULT = 160;
/** 一度に聞く本数の上限 */
export const SWEEP_LIMIT_MAX = 400;
/** 一度の呼び出しで使ってよい時間（これを超えたら、続きは次の呼び出しに回す） */
export const SWEEP_BUDGET_MS = 6000;
/** 同時に聞く本数（倉庫に一度にぶつけすぎないため） */
const SWEEP_PARALLEL = 8;

/**
 * 組み立てた名前を、公開の鍵で片っぱしから聞く。
 *
 * ★**読むだけ**です（件数の問い合わせだけ・行の中身は1文字も読みません）。
 * ★持ち時間を超えたら、そこで止めて「どこまで聞いたか」を返します
 *   （CLAUDE.md 4-6 と同じ考え方。途中で止まっても、続きから進められる）。
 */
export async function sweepCandidates(params?: {
  names?: readonly string[];
  from?: number;
  limit?: number;
  budgetMs?: number;
  now?: () => number;
}): Promise<SweepTally & { from: number; nextFrom: number | null; total: number }> {
  const all = params?.names ?? copyCandidateNames(KNOWN_COPY_TABLES);
  const total = all.length;
  const from = Math.max(0, Math.min(Math.trunc(params?.from ?? 0), total));
  const limit = Math.max(
    1,
    Math.min(Math.trunc(params?.limit ?? SWEEP_LIMIT_DEFAULT), SWEEP_LIMIT_MAX),
  );
  const budget = params?.budgetMs ?? SWEEP_BUDGET_MS;
  const clock = params?.now ?? (() => Date.now());
  const startedAt = clock();

  const tally: SweepTally = { asked: 0, absent: 0, locked: 0, open: [], unknown: [] };
  let at = from;
  const end = Math.min(total, from + limit);
  while (at < end) {
    if (clock() - startedAt > budget) break; // 持ち時間を使い切った。続きは次の呼び出し
    const batch = all.slice(at, Math.min(at + SWEEP_PARALLEL, end));
    const verdicts = await Promise.all(batch.map((t) => askAnon(t)));
    for (const v of verdicts) {
      tally.asked += 1;
      if (v.state === COPY_OPEN) tally.open.push(v.table);
      else if (v.state === COPY_UNKNOWN) tally.unknown.push(v.table);
      else if (/ありません/.test(v.note)) tally.absent += 1;
      else tally.locked += 1;
    }
    at += batch.length;
  }
  return { ...tally, from, nextFrom: at < total ? at : null, total };
}

/** 写しが開いていないかを、ぜんぶ聞いて返す */
export async function probeCopyTables(options?: {
  /** 名前を組み立てて片っぱしから聞くか（既定：聞く） */
  sweep?: boolean;
  /** 続きから聞くときの位置 */
  from?: number;
  /** 一度に聞く本数 */
  limit?: number;
}): Promise<CopyProbeReport> {
  const listed = await listExposedTables();

  const targets = new Set<string>(copyTablesOf(listed.names));
  for (const t of KNOWN_COPY_TABLES) {
    // 名前の見分けを通したものだけを足す（取り違えを1か所に寄せるため）
    if (isCopyTableName(t)) targets.add(t);
  }

  const tables: CopyTableVerdict[] = [];
  for (const t of [...targets].sort()) tables.push(await askAnon(t));

  // 一覧が読めない倉庫では、ここが「全部か」を言えるかどうかの分かれ目になる
  let sweep: CopySweepReport | null = null;
  if (options?.sweep !== false) {
    const already = new Set(tables.map((t) => t.table));
    const names = copyCandidateNames(KNOWN_COPY_TABLES).filter((n) => !already.has(n));
    const result = await sweepCandidates({
      names,
      from: options?.from,
      limit: options?.limit,
    });
    sweep = {
      ...result,
      done: result.nextFrom === null,
      note: sweepNote(result),
    };
    // 新しく見つかった写しは、見える所（tables）へ出す
    for (const name of result.open) {
      tables.push({
        table: name,
        state: COPY_OPEN,
        note:
          "公開の鍵で読めました（名前を組み立てて見つけた写しです。" +
          "KNOWN_COPY_TABLES に足してください）",
      });
    }
    for (const name of result.unknown) {
      tables.push({ table: name, state: COPY_UNKNOWN, note: "聞けませんでした" });
    }
  }

  const live = await probeLiveShelf();

  const sum = summarizeCopyTables(tables);
  return {
    listed: listed.ok,
    listNote: listed.note,
    exposed: listed.ok ? listed.names.length : null,
    tables,
    ...sum,
    sweep,
    live,
    f34: f34Note(sum.allClosed, live),
    sheet: "/keiri/sql",
    check: "f3-4",
  };
}

/* ------------------------------------------------------------------ *
 *  写しを閉めただけでは「お店ごとに分かれている」とは言えない
 *  （2026-10-14 18:34・B・f3-4）
 * ------------------------------------------------------------------ */

/**
 * いま使っている棚（日報）が、公開の鍵でそのまま読めるか。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   写し（控え）に鍵をかけても、**本体の棚が公開の鍵で読めるなら**
 *   「お店ごとに分かれている」とは言えません。
 *   いまの日報の棚は「だれでも・ぜんぶの操作・条件なし」の決まり1本だけで、
 *   ブラウザに配られている鍵で読めます（2026-10-06 に A が実測）。
 *   お店が2軒になると、この鍵でよその店の日報も読めてしまいます。
 *
 *   ここを外から1回で見えるようにしておかないと、
 *   貼り紙⑦（写しに鍵をかける）が流れた日に
 *   「写しは全部 閉まりました」だけを見て**f3-4 を合格にしてしまう**おそれがあります。
 *
 * ★件数も行の中身も返しません。読めたか・読めなかったかだけです。
 */
export const LIVE_SHELF_TABLE = "daily_reports";

export type LiveShelfReport = {
  table: string;
  /** 公開の鍵でそのまま読めたか（true＝まだ分かれていない） */
  readable: boolean | null;
  note: string;
};

export async function probeLiveShelf(): Promise<LiveShelfReport> {
  const v = await askAnon(LIVE_SHELF_TABLE);
  if (v.state === COPY_OPEN) {
    return {
      table: LIVE_SHELF_TABLE,
      readable: true,
      note:
        "日報の棚そのものが、公開の鍵でまだ読めます（決まりが『だれでも・条件なし』1本だけ）。" +
        "お店が2軒になると、この鍵でよその店の日報も読めます",
    };
  }
  if (v.state === COPY_UNKNOWN) {
    return { table: LIVE_SHELF_TABLE, readable: null, note: "聞けませんでした" };
  }
  return {
    table: LIVE_SHELF_TABLE,
    readable: false,
    note: "日報の棚は、公開の鍵では読めません（決まりが効いています）",
  };
}

/** f3-4 全体の答え（写しだけでなく、本体の棚も見る） */
export function f34Note(copiesClosed: boolean, live: LiveShelfReport): string {
  if (live.readable === true) {
    return (
      (copiesClosed
        ? "写しは閉まっていますが、"
        : "写しがまだ開いていて、さらに ") +
      "**いま使っている日報の棚そのものが公開の鍵で読めます**。" +
      "貼り紙を1回 流しても f3-4 はここで閉まりません——" +
      "棚の決まりを『自分のお店のぶんだけ』に締める一手（kp239 ③）が残っています。" +
      "締めるには、よそのお店の数字をサーバー側で読める形（サーバー側の鍵の貼り直し＝kp241、" +
      "または倉庫の窓口ごしに読む作り）が先に要ります"
    );
  }
  if (live.readable === null) {
    return "日報の棚が公開の鍵で読めるかを聞けませんでした。分からないまま合格にしないこと";
  }
  return copiesClosed
    ? "写しも、いま使っている日報の棚も、公開の鍵では読めません（f3-4 のうち『棚の鍵』の分は閉まっています）"
    : "日報の棚は閉まっていますが、写しがまだ開いています（貼り紙⑦を1回 流すと閉まります）";
}

/** 片っぱしから聞いた結果を1行で言う */
export function sweepNote(result: {
  asked: number;
  total: number;
  open: string[];
  unknown: string[];
  nextFrom: number | null;
}): string {
  const head =
    result.nextFrom === null
      ? `組み立てた名前 ${result.total} 本を、ぜんぶ聞き終えました。`
      : `組み立てた名前 ${result.total} 本のうち ${result.asked} 本を聞きました` +
        `（続きは ?from=${result.nextFrom} を付けて開いてください）。`;
  if (result.open.length > 0) {
    return `${head}**新しく見つかった写しが ${result.open.length} つあります**：${result.open.join("・")}`;
  }
  if (result.unknown.length > 0) {
    return `${head}${result.unknown.length} 本は聞けませんでした（開いているとも閉まっているとも言えません）。`;
  }
  return `${head}ほかに開いている写しは見つかりませんでした。`;
}
