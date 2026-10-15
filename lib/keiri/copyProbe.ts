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
import {
  probeTenantReadGuard,
  type TenantReadGuardReport,
} from "@/lib/keiri/tenantReadGuard";

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
  /**
   * **よその店の行**が、公開の鍵から隠れているか（f3-4 の本題・2026-10-15）。
   * ★手羽屋の行（印が空）は流したあとも読めます。それが正しい形です。
   */
  tenantRows: TenantReadGuardReport;
  /**
   * **f3-4 の合否を1回で読める形**（2026-10-15 18:3x・A の依頼）。
   * 貼り紙が流れた日に、ここだけ見れば合否が付くようにしてあります。
   */
  verdict: F34Verdict;
  /** f3-4 全体の答え（写しだけでは閉まらない） */
  f34: string;
  sheet: string;
  check: string;
  /** この窓口が答えるまでにかかった時間（ミリ秒・遅さの見張り用） */
  tookMs: number;
};

/**
 * f3-4 の合否を1回で読める形。
 *
 * ■ 2つ揃って初めて合格です（片方だけ見ると嘘の合否が出ます）
 *   ① **よその店の行が、公開の鍵で読めない**（f3-4 の本題）
 *   ② **手羽屋の行は、今までどおり読める**（ここが false になったら やりすぎ＝元に戻す）
 *   ③ おまけに、写し（控え）も閉まっていること
 *
 * ★分からないときは null（「まだ試せていない」を「閉まった」にしない）
 */
export type F34Verdict = {
  /** ①よその店の行が隠れたか */
  foreignHidden: boolean | null;
  /** ②手羽屋の行が今までどおり読めるか */
  tebayaStillReadable: boolean | null;
  /** ③写し（控え）が閉まっているか */
  copiesClosed: boolean;
  /** f3-4 の合否（全部そろったときだけ true・分からなければ null） */
  pass: boolean | null;
  /** 1行で分かる言い方 */
  line: string;
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

/**
 * 一度に聞く本数の既定。
 *
 * ■ 2026-10-15 に 160 → 1200 へ上げました（f3-4）
 *   組み立てた名前は 800 通りをこえます。160 本ずつだと、外から確かめる人が
 *   **?from=… を付けて5〜6回 開き直さないと**「ぜんぶ聞き終えた」になりません。
 *   実際に 10/15 の朝は 72 本で止まっていて、「ほかに開いた写しは無い」と
 *   言えない状態が1日続きました。1回 開けば終わるようにします
 *   （持ち時間も上げ、窓口の制限時間を60秒にしてあります）。
 */
export const SWEEP_LIMIT_DEFAULT = 1200;
/** 一度に聞く本数の上限 */
export const SWEEP_LIMIT_MAX = 2000;
/** 一度の呼び出しで使ってよい時間（これを超えたら、続きは次の呼び出しに回す） */
export const SWEEP_BUDGET_MS = 40000;
/**
 * 同時に聞く本数（倉庫に一度にぶつけすぎないため）。
 *
 * ■ 2026-10-15 18:3x に 24 → 64 へ上げました（f3-4）
 *   24 本ずつだと 819 本を聞き終えるのに**毎回 15〜21 秒**かかっていて
 *   （こちらで3回 実測：20.9秒・20.6秒・14.9秒）、
 *   倉庫が少し遅い日には窓口の持ち時間（60秒）を超え、
 *   **外から確かめる人には「サーバー側の誤り」に見えます**
 *   （10/15 18:0x に A が2回 続けてそれに当たりました）。
 *   聞いているのは「件数だけ・行の中身は1文字も読まない」軽い問い合わせなので、
 *   本数を増やしても倉庫の負担はほとんど変わりません。
 */
const SWEEP_PARALLEL = 64;

/**
 * 窓口ぜんたいの持ち時間（f3-4・2026-10-15 18:3x）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   この窓口は「**写しが開いていないか**（名前を片っぱしから聞く）」と
 *   「**よその店の行が見えないか**（f3-4 の本題）」の2つを返します。
 *   前者は 819 本 聞くので時間がかかり、後者は1秒で終わります。
 *   それまでは**前者を先に**やっていたので、倉庫が遅い日は
 *   時間切れで**後者の答えまで丸ごと返らない**形でした。
 *   ＝ いちばん要る答え（合否）が、いちばん落ちやすい作りでした。
 *
 *   そこで **①先に本題を答える ②残り時間で写しを聞く** に順番を変え、
 *   残り時間が無ければ写しだけ「続きがあります」にします。
 *   **合否は必ず返ります。**
 */
export const PROBE_DEADLINE_MS = 20000;
/** 写しを聞くのに最低これだけは使う（0 秒だと一歩も進まないため） */
export const SWEEP_MIN_MS = 2000;

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
  /** 窓口ぜんたいの持ち時間（渡さなければ PROBE_DEADLINE_MS） */
  deadlineMs?: number;
  /** いまの時刻（試験で差し替えるため） */
  now?: () => number;
}): Promise<CopyProbeReport> {
  const clock = options?.now ?? (() => Date.now());
  const startedAt = clock();
  const deadline = options?.deadlineMs ?? PROBE_DEADLINE_MS;

  // --- ①先に本題を答える（1秒で終わる所。ここは必ず返す） -----------------
  const [listed, live, tenantRows] = await Promise.all([
    listExposedTables(),
    probeLiveShelf(),
    probeTenantReadGuard(),
  ]);

  const targets = new Set<string>(copyTablesOf(listed.names));
  for (const t of KNOWN_COPY_TABLES) {
    // 名前の見分けを通したものだけを足す（取り違えを1か所に寄せるため）
    if (isCopyTableName(t)) targets.add(t);
  }

  const tables: CopyTableVerdict[] = [];
  for (const t of [...targets].sort()) tables.push(await askAnon(t));

  // --- ②残り時間で、名前を組み立てて片っぱしから聞く ----------------------
  //     一覧が読めない倉庫では、ここが「全部か」を言えるかどうかの分かれ目になる。
  //     ★残り時間が無ければ、ここは「続きがあります」で止める（合否は①で返っている）
  let sweep: CopySweepReport | null = null;
  if (options?.sweep !== false) {
    const already = new Set(tables.map((t) => t.table));
    const names = copyCandidateNames(KNOWN_COPY_TABLES).filter((n) => !already.has(n));
    const left = deadline - (clock() - startedAt);
    const result = await sweepCandidates({
      names,
      from: options?.from,
      limit: options?.limit,
      budgetMs: Math.max(SWEEP_MIN_MS, left),
      now: clock,
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

  const sum = summarizeCopyTables(tables);
  return {
    listed: listed.ok,
    listNote: listed.note,
    exposed: listed.ok ? listed.names.length : null,
    tables,
    ...sum,
    sweep,
    live,
    tenantRows,
    verdict: f34Verdict(sum.allClosed, live, tenantRows),
    f34: f34Note(sum.allClosed, live, tenantRows),
    sheet: "/keiri/sql",
    check: "f3-4",
    tookMs: clock() - startedAt,
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

/**
 * f3-4 全体の答え（写しだけでなく、本体の棚も見る）。
 *
 * ■ 2026-10-15 に見方を直しました（ここを取り違えると嘘の合否が出ます）
 *   それまでは「日報の棚が公開の鍵で読めるか」だけを見ていました。
 *   ところが **手羽屋の行（印が空）は、貼り紙⑧を流したあとも公開の鍵で読めます**。
 *   それが正しい形です（ブラウザから倉庫を読む作りで、お店ごとの入室がまだ無いため。
 *   CLAUDE.md 4-8。ここを締めるのは次の段で、f3-4 が聞いていることではありません）。
 *   ＝ 古い見方だと、⑧を流したあとも「開いている」と出続けます。
 *   f3-4 が聞いているのは「**よその店のデータが見えないか**」なので、
 *   **印が付いた行だけ**を見て答えます（lib/keiri/tenantReadGuard.ts）。
 */
export function f34Note(
  copiesClosed: boolean,
  live: LiveShelfReport,
  tenantRows?: TenantReadGuardReport,
): string {
  const copies = copiesClosed
    ? "写しは閉まっています"
    : "写しがまだ開いています（貼り紙⑦を1回 流すと閉まります）";

  // ① よその店の行が見えてしまう＝ここが本題。まだ閉まっていない
  if (tenantRows?.separated === false) {
    return `${copies}。ただし **${tenantRows.note}**`;
  }
  // ② 見えないことを、窓口ごしの読みと見比べて確かめられた
  if (tenantRows?.separated === true) {
    return copiesClosed
      ? "写しも、よその店の日報も、公開の鍵では読めません" +
          "（f3-4 のうち『棚の鍵』の分は閉まっています）。" +
          `${tenantRows.note}`
      : `よその店の日報は公開の鍵では読めません。ただし ${copies}`;
  }
  // ③ まだ試せていない（よその店の行が1行も無い）
  const why = tenantRows?.note ?? "よその店の行があるかを聞けませんでした";
  if (live.readable === null) {
    return `${copies}。日報の棚を聞けませんでした。分からないまま合格にしないこと`;
  }
  return `${copies}。${why}`;
}

/**
 * f3-4 の合否を1回で読める形にする（2026-10-15 18:3x・A の依頼）。
 *
 * ■ なぜ1か所にまとめたか（やさしい説明）
 *   貼り紙が流れた日に見るものが3か所に散っていました
 *   （写し＝tables／よその店の行＝tenantRows／手羽屋の行＝live）。
 *   3か所のうち1つを読み落とすと、**やりすぎ（手羽屋まで読めなくなった）に気づけません**。
 *   ここを1つの ○× にして、見落としようが無い形にします。
 *
 * ■ 判定（ここだけ見れば分かります）
 *   合格 … よその店の行が読めない ＋ 手羽屋の行は読める ＋ 写しも閉まっている
 *   不合格 … よその店の行が読める、または 手羽屋の行まで読めなくなった
 *   分からない … まだ試せていない（よその店の行が1行も無い等）
 *
 * ★この関数は計算だけです（倉庫に聞きません）。試験で固定してあります。
 */
export function f34Verdict(
  copiesClosed: boolean,
  live: LiveShelfReport,
  tenantRows?: TenantReadGuardReport,
): F34Verdict {
  const foreignHidden = tenantRows?.separated ?? null;
  const tebayaStillReadable = live.readable;

  // ①やりすぎ：手羽屋の行まで読めなくなった（毎日の画面が止まる＝すぐ元に戻す）
  if (tebayaStillReadable === false) {
    return {
      foreignHidden,
      tebayaStillReadable,
      copiesClosed,
      pass: false,
      line:
        "**不合格（やりすぎです）**：手羽屋の行まで公開の鍵で読めなくなりました。" +
        "毎日の画面が止まるので、その一手を元に戻してください",
    };
  }
  // ②本題：よその店の行が、公開の鍵でまだ読める
  if (foreignHidden === false) {
    return {
      foreignHidden,
      tebayaStillReadable,
      copiesClosed,
      pass: false,
      line:
        "**不合格**：よその店の行が、公開の鍵でまだ読めます" +
        "（/keiri/sql の貼り紙⑧を1回 流すと閉まります）",
    };
  }
  // ③まだ試せていない（よその店の行が1行も無い・聞けなかった）
  if (foreignHidden === null || tebayaStillReadable === null) {
    return {
      foreignHidden,
      tebayaStillReadable,
      copiesClosed,
      pass: null,
      line:
        "**まだ分かりません**（よその店の行で試せていません）。" +
        "分からないまま合格にしないこと",
    };
  }
  // ④よその店の行は隠れている。あとは写しだけ
  if (!copiesClosed) {
    return {
      foreignHidden,
      tebayaStillReadable,
      copiesClosed,
      pass: false,
      line:
        "**あと1つ**：よその店の行は読めません（手羽屋の行は今までどおり読めます）。" +
        "ただし写し（控え）がまだ開いています（貼り紙⑦を1回 流すと閉まります）",
    };
  }
  return {
    foreignHidden,
    tebayaStillReadable,
    copiesClosed,
    pass: true,
    line:
      "**合格**：よその店の行は公開の鍵では読めず、手羽屋の行は今までどおり読めます" +
      "（写しも閉まっています）",
  };
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
