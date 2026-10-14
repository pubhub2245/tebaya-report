/**
 * 「手羽屋のデータの“写し”が、工事の外に置かれていないか」を見分ける、
 * 計算だけのファイル（f3-4・2026-10-14）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   お店ごとに分ける工事（tenant）は、**いま使っている棚**にだけ入れてきました。
 *   ところが 2026-10-13 に、工事の外にあった棚が1つ見つかりました——
 *   2026-09-02 にレシート写真を引っ越す前に取った**日報の控え**
 *   （daily_reports_backup_20260902・13行）です。
 *   「だれが読めるか」の決まりが1本も付いておらず、
 *   ブラウザに配られている公開の鍵を持っていれば、アプリを通さずに読めました。
 *
 *   本体をお店ごとに分けても、**同じ中身の写しが開いていれば**
 *   「お店ごとに分かれている」とは言えません。
 *   そこで、見つかった1つを塞ぐだけでなく、
 *   **写しを名前から機械的に見つける**ようにします（1つ見つけて終わりにしない）。
 *
 * ■ 「写し」と見なす名前（これだけ）
 *   ・…_backup / …_backup_… ／ …_bak / …_bak_…
 *   ・…_copy / …_copy_…
 *   ・…_old / …_old_…
 *   ・…_snapshot / …_snapshots
 *   ・deleted_… （消す前に取った控え・CLAUDE.md 4-11）
 *   ・うしろに日付が付いているもの（…_20260902 や …_202609）
 *
 * ■ 間違って「いま使っている棚」を写しと呼ばないための止め木
 *   ① 上の名前に当てはまらないものは、ぜんぶ「いま使っている棚」として扱う
 *   ② 別のアプリの棚（pkmn_…）は、名前が当てはまっても**触らない**
 *      （CLAUDE.md 4-11「同じ倉庫に同居しているだけ・触らないこと」）
 *   ③ 鍵をかける側（倉庫の貼り紙）では、さらに
 *      「まだ鍵がかかっていない」かつ「決まりが1本も無い」ものだけに限る。
 *      いま使っている棚はすべて鍵がかかっているので、名前で取り違えても届かない
 *
 * ★このファイルは数えるだけです。倉庫を読みも書きもしません。
 */

/** 別のアプリの棚。名前が当てはまっても写しとして扱わない（触らない） */
export const FOREIGN_TABLE_PREFIXES = ["pkmn_"] as const;

/** 「写し」と見なす名前のかたち */
const COPY_PATTERNS: RegExp[] = [
  /(^|_)backups?(_|$)/i,
  /(^|_)bak(_|$)/i,
  /(^|_)copy(_|$)/i,
  /(^|_)old(_|$)/i,
  /(^|_)snapshots?(_|$)/i,
  /^deleted_/i,
  /_(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/, // …_20260902
  /_(19|20)\d{2}(0[1-9]|1[0-2])$/, // …_202609
];

/** 別のアプリの棚か（触らない） */
export function isForeignTable(name: string): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return FOREIGN_TABLE_PREFIXES.some((p) => n.startsWith(p));
}

/**
 * その名前は「手羽屋のデータの写し」か。
 * 当てはまらないものは、ぜんぶ「いま使っている棚」として扱う（安全側）。
 */
export function isCopyTableName(name: string): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (isForeignTable(n)) return false;
  return COPY_PATTERNS.some((re) => re.test(n));
}

/** 並んでいる棚の名前から、写しだけを拾って名前順に並べる */
export function copyTablesOf(names: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of names ?? []) {
    const n = String(raw ?? "").trim();
    if (n && isCopyTableName(n)) seen.add(n);
  }
  return [...seen].sort();
}

/** 1つの写しについて、公開の鍵で読めてしまうかの答え */
export type CopyTableVerdict = {
  table: string;
  /** "まだ読めます" | "読めません" | "分かりません" */
  state: string;
  /** なぜそう判断したか（1行・中身は含めない） */
  note: string;
};

export const COPY_OPEN = "まだ読めます";
export const COPY_CLOSED = "読めません";
export const COPY_UNKNOWN = "分かりません";

/**
 * 公開の鍵で聞いた結果から、1つの写しの答えを作る。
 *
 * ★ここは読み方が**逆**です：**読めてしまったら、まだ開いています。**
 *   断られた／棚が無い＝閉まっている。それ以外は「分かりません」にして、
 *   閉まったことにしません（嘘の安心を出さないため）。
 */
export function verdictFromAnonRead(input: {
  table: string;
  ok: boolean;
  /**
   * 返ってきた行数（2026-10-14 追加）。
   * ★**鍵が効いている棚は、エラーではなく「0件」と答えます**（空の棚と同じ返事）。
   *   だから 1件以上あったときだけ「読めてしまう」と言います。
   *   渡されなかったとき（null / 未指定）は、今までどおり「読めた＝開いている」。
   */
  rows?: number | null;
  code?: string | null;
  message?: string | null;
}): CopyTableVerdict {
  const code = String(input.code ?? "");
  const message = String(input.message ?? "");
  if (input.ok) {
    const rows = input.rows;
    if (rows !== undefined && rows !== null && rows <= 0) {
      return {
        table: input.table,
        state: COPY_CLOSED,
        note: "中身は返ってきません（鍵が効いているか、空の棚です）",
      };
    }
    return {
      table: input.table,
      state: COPY_OPEN,
      note: "公開の鍵で読めました（鍵をかける必要があります）",
    };
  }
  if (code === "42P01" || /does not exist|could not find the table/i.test(message)) {
    return { table: input.table, state: COPY_CLOSED, note: "この倉庫にはありません" };
  }
  if (code === "42501" || /permission denied/i.test(message)) {
    return { table: input.table, state: COPY_CLOSED, note: "鍵が効いています（断られました）" };
  }
  return {
    table: input.table,
    state: COPY_UNKNOWN,
    note: message ? "聞けませんでした" : "聞けませんでした（返事がありません）",
  };
}

/** 全体のまとめ。開いている写しが1つでもあれば f3-4 は閉じていない */
export function summarizeCopyTables(verdicts: readonly CopyTableVerdict[]): {
  allClosed: boolean;
  open: number;
  closed: number;
  unknown: number;
  summary: string;
} {
  const open = verdicts.filter((v) => v.state === COPY_OPEN).length;
  const closed = verdicts.filter((v) => v.state === COPY_CLOSED).length;
  const unknown = verdicts.filter((v) => v.state === COPY_UNKNOWN).length;
  const allClosed = open === 0 && unknown === 0;
  const summary = allClosed
    ? verdicts.length === 0
      ? "手羽屋のデータの写しは見つかりませんでした"
      : `写し ${verdicts.length} つは、すべて公開の鍵では読めません`
    : open > 0
      ? `写し ${open} つが、公開の鍵でまだ読めます（/keiri/sql の貼り紙⑦を1回 流すと閉まります）`
      : `写し ${unknown} つは、開いているか閉まっているか分かりませんでした`;
  return { allClosed, open, closed, unknown, summary };
}
