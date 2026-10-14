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
  COPY_UNKNOWN,
  copyTablesOf,
  isCopyTableName,
  summarizeCopyTables,
  verdictFromAnonRead,
  type CopyTableVerdict,
} from "@/lib/keiri/copyTables";
import { BACKUP_COPY_TABLE } from "@/lib/keiri/shelves";

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

/** その棚を、公開の鍵で1行ぶん読んでみる（中身は捨てる） */
async function askAnon(table: string): Promise<CopyTableVerdict> {
  try {
    const db = anonClient({ fresh: true });
    const { error } = await db.from(table).select("*", { count: "exact", head: true });
    return verdictFromAnonRead({
      table,
      ok: !error,
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
  sheet: string;
  check: string;
};

/** 写しが開いていないかを、ぜんぶ聞いて返す */
export async function probeCopyTables(): Promise<CopyProbeReport> {
  const listed = await listExposedTables();

  const targets = new Set<string>(copyTablesOf(listed.names));
  for (const t of KNOWN_COPY_TABLES) {
    // 名前の見分けを通したものだけを足す（取り違えを1か所に寄せるため）
    if (isCopyTableName(t)) targets.add(t);
  }

  const tables: CopyTableVerdict[] = [];
  for (const t of [...targets].sort()) tables.push(await askAnon(t));

  const sum = summarizeCopyTables(tables);
  return {
    listed: listed.ok,
    listNote: listed.note,
    exposed: listed.ok ? listed.names.length : null,
    tables,
    ...sum,
    sheet: "/keiri/sql",
    check: "f3-4",
  };
}
