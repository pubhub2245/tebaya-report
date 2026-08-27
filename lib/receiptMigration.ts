/**
 * 昔の日報に埋め込まれたレシート写真を、写真の置き場（Storage）へ引っ越す処理。
 *
 * ■ 何をするのか
 *   古い日報の経費には、写真そのものが
 *   "data:image/jpeg;base64,..." という超長い文字列として埋め込まれている。
 *   （写真つき12件で18MB。日報を1件開くだけで重く、毎日の控えも同じだけ膨らむ）
 *
 *   これを1件ずつ
 *     ① 写真を receipts（置き場）に置く
 *     ② 日報の中身を「置き場の住所（URL）」に書き換える
 *   に変える。写真は消さない。置き場に移すだけ。
 *
 * ■ 安全のための決まり
 *   - 書き換える前に、必ずその日報の"引っ越し前の姿"を控えとして残す
 *     （table_snapshots に receipt_migration_backup という名前で保存）。
 *     万一おかしくなっても、控えから元に戻せる。
 *   - 置き場に置けなかった写真は、書き換えずにそのまま残す（消さない）。
 *   - すでに住所（URL）になっている写真は何もしない。
 *     → 同じ処理を何度実行しても、二重に増えたり壊れたりしない。
 *   - まず「下見だけ（dryRun）」で、何件・何MBが対象かを確かめられる。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** 置き場（バケット）の名前。lib/receiptStorage.ts と同じ */
const BUCKET = "receipts";

/** 控えを残すときの名前 */
export const MIGRATION_SNAPSHOT_NAME = "receipt_migration_backup";

type ExpenseLike = {
  description?: string;
  amount?: number;
  receipt_image_url?: string | null;
  [k: string]: unknown;
};

export type MigrationResult = {
  ok: boolean;
  dryRun: boolean;
  /** 写真が埋め込まれたままの日報の件数 */
  targetReports: number;
  /** 引っ越しの対象になった写真の枚数 */
  targetPhotos: number;
  /** 実際に置き場へ移せた枚数 */
  movedPhotos: number;
  /** 移せずにそのまま残した枚数 */
  failedPhotos: number;
  /** 書き換えた日報の件数 */
  updatedReports: number;
  /** 引っ越し対象の写真の合計容量（バイト） */
  targetBytes: number;
  /** まだ引っ越していない日報の残り件数 */
  remainingReports: number;
  /** 控えを残せたか */
  backupSaved: boolean;
  errors: string[];
};

function isEmbedded(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:");
}

/** "data:image/jpeg;base64,..." を、置き場に置ける形に変える */
function decodeDataUrl(dataUrl: string): { bytes: Buffer; mime: string } {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("画像データの形式が正しくありません");
  const header = dataUrl.slice(5, comma); // 例: image/jpeg;base64
  const mime = header.split(";")[0] || "image/jpeg";
  return { bytes: Buffer.from(dataUrl.slice(comma + 1), "base64"), mime };
}

function extOf(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * 引っ越しを実行する。
 *
 * dryRun = true のときは、何も書き換えず「対象の件数と容量」だけを返す。
 * limit で1回に処理する日報の件数を区切れる（時間切れ対策）。
 */
export async function migrateReceipts(
  db: SupabaseClient,
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<MigrationResult> {
  const dryRun = opts.dryRun ?? false;
  const limit = opts.limit ?? 5;

  const result: MigrationResult = {
    ok: true,
    dryRun,
    targetReports: 0,
    targetPhotos: 0,
    movedPhotos: 0,
    failedPhotos: 0,
    updatedReports: 0,
    targetBytes: 0,
    remainingReports: 0,
    backupSaved: false,
    errors: [],
  };

  // 1) まず「どの日報に写真が残っているか」だけを軽く調べる。
  //    （中身ごと読むと18MBのダウンロードになるため、IDと枚数だけを返す関数を使う）
  const { data: index, error: idxErr } = await db.rpc(
    "list_embedded_receipt_reports",
  );
  if (idxErr) {
    result.ok = false;
    result.errors.push(`対象の調査に失敗: ${idxErr.message}`);
    return result;
  }

  const indexRows = (index ?? []) as {
    id: string;
    report_date: string;
    photo_count: number;
    bytes: number;
  }[];

  result.targetReports = indexRows.length;
  result.targetPhotos = indexRows.reduce((s, r) => s + (Number(r.photo_count) || 0), 0);
  result.targetBytes = indexRows.reduce((s, r) => s + (Number(r.bytes) || 0), 0);

  // 下見だけなら、ここで件数と容量を返して終わり（何も書き換えない）
  if (dryRun || indexRows.length === 0) return result;

  // 2) 今回の分だけ、中身を読み込む（時間切れを避けるため limit 件ずつ）
  const batchIds = indexRows.slice(0, limit).map((r) => r.id);
  const { data: rows, error } = await db
    .from("daily_reports")
    .select("id, date, expenses")
    .in("id", batchIds);

  if (error) {
    result.ok = false;
    result.errors.push(`日報の読み込みに失敗: ${error.message}`);
    return result;
  }

  const targets = (rows ?? []).filter(
    (r: any) =>
      Array.isArray(r.expenses) &&
      r.expenses.some((e: ExpenseLike) => isEmbedded(e?.receipt_image_url)),
  );
  if (targets.length === 0) return result;

  // 3) 書き換える前に、引っ越し前の姿を控えとして残す。
  //    同じ日に何回かに分けて実行しても前の控えが消えないよう、
  //    すでにある控えに継ぎ足す（上書きしない）。
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await db
    .from("table_snapshots")
    .select("data")
    .eq("table_name", MIGRATION_SNAPSHOT_NAME)
    .eq("snapshot_date", today)
    .maybeSingle();

  const already = Array.isArray((existing as any)?.data) ? (existing as any).data : [];
  const alreadyIds = new Set(already.map((r: any) => r?.id));
  const merged = [...already, ...targets.filter((r: any) => !alreadyIds.has(r.id))];

  const { error: snapErr } = await db.from("table_snapshots").upsert(
    {
      table_name: MIGRATION_SNAPSHOT_NAME,
      snapshot_date: today,
      row_count: merged.length,
      data: merged,
    },
    { onConflict: "table_name,snapshot_date" },
  );
  if (snapErr) {
    // 控えが残せないなら書き換えない（元に戻せなくなるため）
    result.ok = false;
    result.errors.push(
      `引っ越し前の控えを保存できなかったため中止しました: ${snapErr.message}`,
    );
    return result;
  }
  result.backupSaved = true;

  // 4) 1件ずつ、写真を置き場へ移して住所に書き換える
  for (const row of targets) {
    const expenses = row.expenses as ExpenseLike[];
    const next: ExpenseLike[] = [];
    let changed = false;

    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (!isEmbedded(e.receipt_image_url)) {
        next.push(e);
        continue;
      }
      try {
        const { bytes, mime } = decodeDataUrl(e.receipt_image_url);
        const path = `report/migrated/${row.id}-${i}.${extOf(mime)}`;
        const { error: upErr } = await db.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType: mime, upsert: true });
        if (upErr) throw upErr;

        const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
        if (!pub?.publicUrl) throw new Error("住所を取得できませんでした");

        next.push({ ...e, receipt_image_url: pub.publicUrl });
        result.movedPhotos += 1;
        changed = true;
      } catch (err: any) {
        // 移せなかった写真はそのまま残す（消さない）
        next.push(e);
        result.failedPhotos += 1;
        result.errors.push(
          `日報 ${row.date}（${row.id}）の${i + 1}件目の写真: ${err?.message || err}`,
        );
      }
    }

    if (!changed) continue;

    const { error: updErr } = await db
      .from("daily_reports")
      .update({ expenses: next })
      .eq("id", row.id);
    if (updErr) {
      result.errors.push(`日報 ${row.date} の書き換えに失敗: ${updErr.message}`);
      result.ok = false;
    } else {
      result.updatedReports += 1;
    }
  }

  result.remainingReports = Math.max(0, result.targetReports - result.updatedReports);
  if (result.failedPhotos > 0) result.ok = false;
  return result;
}
