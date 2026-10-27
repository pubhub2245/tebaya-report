/**
 * レシート写真を「写真の置き場」（Supabase Storage）に置くための共通処理。
 *
 * ■ 何が変わるのか
 *   これまで：写真そのもの（data:image/jpeg;base64,... という超長い文字列）を
 *             日報や立替の記録の中に直接しまっていた。
 *             → 写真つき12件で18MB。日報を開くだけで重く、毎日の控えも同じだけ膨らむ。
 *   これから：写真は receipts という置き場に置き、
 *             記録には「置き場の住所（URL）」だけを持たせる。
 *             → 記録は数十文字になる。写真は見るときだけ読み込まれる。
 *
 *   たとえるなら、アルバムのページに写真を糊で貼り付けていたのをやめて、
 *   「写真は3番の引き出し」とメモだけ書くようにした、というイメージ。
 *
 * ■ 昔の記録も壊れない
 *   古い日報には今も data:... の文字列が入っているが、
 *   画面の表示（<img src=...>）はどちらの形でもそのまま映る。
 *   だから引っ越しは「これから撮る写真」から順に進められる。
 *
 * ※ 形の判定・変換そのものは lib/receiptImage.ts にある（テストで固定するため）。
 */

import { supabase } from "./supabase";
import { dataUrlToBlob, isEmbeddedImage, makeObjectPath } from "./receiptImage";
import { judgeReceiptUpload } from "./receiptUploadGate";
import { isTebayaScope, type TenantScope } from "./tenantScope";

export { isEmbeddedImage, dataUrlToBlob } from "./receiptImage";

/** 置き場（バケット）の名前 */
export const RECEIPT_BUCKET = "receipts";

/** 1枚あたりの上限。置き場側にも同じ制限を入れてある（5MB） */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * 写真を置き場に置いて、その住所（URL）を返す。
 *
 * prefix は置き場の中のフォルダ名。どの画面から入れた写真かが後から分かるように分ける。
 *   "report"  … 日報 STEP5「レジから払った経費」
 *   "advance" … 経営側の立替（/cash/advances）
 *   "keiri"   … 現場の立替（/keiri/advances）
 *
 * tenantId は「どのお店の写真か」の印（2026-10-26・f3-4）。
 * 手羽屋は省略／null でよく、そのときは今までとまったく同じ住所になる。
 * 申し込んだお店の番号を渡すと、そのお店のフォルダの中に置く（→ lib/receiptImage.ts）。
 *
 * 置くのに失敗した場合は例外を投げる。呼び出し側は uploadReceiptOrKeep を使うこと。
 */
export async function uploadReceiptDataUrl(
  dataUrl: string,
  prefix: string,
  tenantId?: string | null,
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("写真のサイズが大きすぎます");
  }
  await assertUploadAllowed((tenantId ?? null) as TenantScope);
  const path = makeObjectPath(prefix, blob.type, tenantId);

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("写真の住所を取得できませんでした");
  return data.publicUrl;
}

/**
 * よそのお店の写真を、公開のままの置き場に置かないための門（f3-4・2026-10-27）。
 *
 * ・手羽屋（印が空）… 何も聞かずに通す。**通信も1本 増えません**＝今までとまったく同じ
 * ・よそのお店 … 窓口（/api/keiri/photo-gate）に1回 聞いて、置き場が非公開のときだけ通す
 *
 * 置けないときは例外を投げる。呼び出し側（uploadReceiptOrKeep）が受け止めて、
 * 今までどおり写真を記録の中にそのまま残す（CLAUDE.md 4-7）。
 * 窓口に届かなかったときも「分かりません」として置かない（安全側）。
 * 決まりそのものは lib/receiptUploadGate.ts の1か所にある。
 */
async function assertUploadAllowed(scope: TenantScope): Promise<void> {
  if (isTebayaScope(scope)) return;
  let bucketPublic: boolean | null = null;
  try {
    const res = await fetch("/api/keiri/photo-gate", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { bucketPublic?: boolean | null };
      bucketPublic = typeof json?.bucketPublic === "boolean" ? json.bucketPublic : null;
    }
  } catch {
    bucketPublic = null;
  }
  const gate = judgeReceiptUpload(scope, bucketPublic);
  if (!gate.allowed) throw new Error(gate.reason);
}

/**
 * 「置ければURL、置けなければ元のまま」を返す安全版。
 *
 * 通信が不安定な現場でも、写真のせいで日報が保存できなくなっては困る。
 * 置き場に入れられなかったときは、これまで通り写真そのものを記録に埋め込む
 * （重いが、記録が失われるよりはるかにまし）。あとから管理者ページの
 * 「写真を置き場へ移す」で移し直せる。
 */
export async function uploadReceiptOrKeep(
  value: string | null | undefined,
  prefix: string,
  tenantId?: string | null,
): Promise<string | null> {
  if (!value) return null;
  if (!isEmbeddedImage(value)) return value; // すでにURL形式ならそのまま
  try {
    return await uploadReceiptDataUrl(value, prefix, tenantId);
  } catch (e) {
    console.warn("レシート写真の置き場への保存に失敗。埋め込み形式のまま保存します", e);
    return value;
  }
}
