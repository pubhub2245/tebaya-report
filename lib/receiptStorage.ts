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
 * 置くのに失敗した場合は例外を投げる。呼び出し側は uploadReceiptOrKeep を使うこと。
 */
export async function uploadReceiptDataUrl(
  dataUrl: string,
  prefix: string,
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("写真のサイズが大きすぎます");
  }
  const path = makeObjectPath(prefix, blob.type);

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("写真の住所を取得できませんでした");
  return data.publicUrl;
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
): Promise<string | null> {
  if (!value) return null;
  if (!isEmbeddedImage(value)) return value; // すでにURL形式ならそのまま
  try {
    return await uploadReceiptDataUrl(value, prefix);
  } catch (e) {
    console.warn("レシート写真の置き場への保存に失敗。埋め込み形式のまま保存します", e);
    return value;
  }
}
