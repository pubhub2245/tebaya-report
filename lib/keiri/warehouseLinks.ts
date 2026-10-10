/**
 * 倉庫（Supabase）の画面への行き先を作る、ただ1か所のファイル（kp238・f1-4／f3-4／f5-4）。
 *
 * ■ なぜ要るか（2026-10-10）
 *   棚を足す貼り紙（/keiri/sql）は 10/3 から流れていません。残っている仕上げの3項目
 *   （f1-4・f3-4・f5-4）が、この1枚だけを待っています。
 *   ところが画面の手順は「Supabase を開き、左の SQL Editor に貼って Run」で、
 *   **どこを開くのかは本人が探す**作りでした。
 *   ＝ じゅんの手は「2分」ではなく「倉庫を探す→プロジェクトを選ぶ→SQL Editor を見つける」から
 *   始まっていました。行き先を1タップにして、探す手間を無くします。
 *
 * ■ 倉庫の名前はここに書かない
 *   倉庫の名前（例 vtuyebyjbvjmucqpkxug）は、すでにブラウザへ配られている
 *   `NEXT_PUBLIC_SUPABASE_URL` から取り出します（公開情報です）。
 *   **鍵・合言葉・環境変数の値はここに1文字も出しません。**
 *   取り出せなければリンクを出さない（手順の文だけ残す）＝ 間違った所へ送らない。
 */

import { projectRefFromUrl } from "@/lib/supabaseServer";

/** 倉庫の SQL Editor（貼り紙を貼る所）。分からなければ null */
export function sqlEditorUrl(
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const ref = projectRefFromUrl(supabaseUrl ?? "");
  if (!ref) return null;
  return `https://supabase.com/dashboard/project/${ref}/sql/new`;
}
