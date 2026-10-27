/**
 * 目印の画像を置き、置き場の一覧を**公開の鍵で**聞くところ（f3-4・2026-10-27）。
 * 決まり（判定）は lib/keiri/photoMarker.ts の1か所だけです。
 *
 * ★書き込むのは **目印の画像1枚だけ**（`probe/listcheck.png`・1×1の透明な PNG・68バイト）。
 *   すでにあるときは**1行も書き込みません**（置き直しもしません）。
 * ★本物のレシート・日報・経費・申し込みの行には1件も触りません。
 * ★手羽屋の写真は消しません・動かしません。
 * ★聞くときは必ず**公開の鍵**（ブラウザに配られているのと同じ鍵）です。
 *   サーバー側の鍵で聞くと決まりを飛び越えて読めてしまい、
 *   「まだ開いている」のに「閉まっている」と答えてしまいます。
 */

import { anonClient, noStoreFetch } from "@/lib/supabaseServer";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import {
  judgeMarkerList,
  markerIsThere,
  PHOTO_MARKER_FOLDER,
  PHOTO_MARKER_PATH,
  photoMarkerBytes,
  readsAsAlreadyThere,
  readsAsDenied,
  type MarkerListVerdict,
  type MarkerPlacement,
} from "@/lib/keiri/photoMarker";

/** 目印のフォルダを一覧で聞く。名前は返さず、数だけ数えます */
export async function listMarkerFolder(): Promise<number | null> {
  try {
    const db = anonClient({ fresh: true });
    const { data, error } = await db.storage
      .from(RECEIPT_BUCKET)
      .list(PHOTO_MARKER_FOLDER, { limit: 100 });
    if (error) return null;
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return null;
  }
}

/**
 * 目印が置き場にあるかを、**1行も書き込まずに**確かめる。
 *
 * 置き場が公開のあいだは、鍵をまったく付けずにその住所をたたけば分かります
 * （透明な点1つの画像なので、読めても何も漏れません）。
 * 置き場が非公開になったあとは、この道では分かりません（null を返します）。
 */
export async function peekMarkerPublicly(): Promise<boolean | null> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const url = `${base}/storage/v1/object/public/${RECEIPT_BUCKET}/${PHOTO_MARKER_PATH}`;
  try {
    const res = await noStoreFetch(url, { method: "GET" });
    if (res.ok) {
      // 中身は捨てます（透明な点1つですが、読み込んだまま放置しないため）
      await res.arrayBuffer().catch(() => undefined);
      return true;
    }
    const said = (await res.text().catch(() => "")).toLowerCase();
    // 「この置き場は公開されていません」＝ この道では確かめられない
    if (/not\s*public|public\s*access|not\s*allowed|unauthorized|invalid\s*jwt/.test(said)) {
      return null;
    }
    if (/object\s*not\s*found|not_found/.test(said)) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * 目印を置く（すでにあれば何もしない）。
 * ★置き場が公開でも非公開でも同じように使えます（置く許可だけで足りるため）。
 */
export async function placeMarker(): Promise<MarkerPlacement> {
  try {
    const db = anonClient({ fresh: true });
    const { error } = await db.storage
      .from(RECEIPT_BUCKET)
      .upload(PHOTO_MARKER_PATH, photoMarkerBytes(), {
        contentType: "image/png",
        upsert: false,
      });
    if (!error) return "placed";
    const message = String((error as { message?: string }).message ?? "");
    const status = Number((error as { statusCode?: string | number }).statusCode ?? NaN);
    const code = Number.isFinite(status) ? status : null;
    if (readsAsAlreadyThere(message, code)) return "already";
    if (readsAsDenied(message, code)) return "denied";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** 置いて → 聞いて → 判定する（/api/keiri/photo-mark が使う道） */
export async function markAndCheck(): Promise<MarkerListVerdict> {
  const marker = await placeMarker();
  const listed = markerIsThere(marker) ? await listMarkerFolder() : null;
  return judgeMarkerList({ marker, listed });
}

/**
 * 読むだけで判定する（/api/keiri/photos が使う道）。
 * 目印が見つからないあいだは「分かりません」のままです。
 */
export async function checkWithoutWriting(): Promise<MarkerListVerdict> {
  const seen = await peekMarkerPublicly();
  const marker: MarkerPlacement = seen === true ? "already" : "unknown";
  const listed = seen === true ? await listMarkerFolder() : null;
  return judgeMarkerList({ marker, listed });
}
