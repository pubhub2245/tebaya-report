/**
 * よそのお店のレシート写真を、**公開のままの置き場には置かない**ための門（f3-4・2026-10-27）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   レシート写真の置き場（receipts）は、いまも「公開」の設定です
 *   （住所を知っていれば合言葉なしで1枚ずつ開けます）。
 *   非公開に変えるには サーバー側の鍵が要り、その鍵はいま壊れています（kp241・じゅんの1分）。
 *
 *   ここで困るのは**順番**です。2軒目のお店の行は、鍵が無くても
 *   倉庫の貼り紙（/keiri/sql の⑥）で作れます。
 *   ＝ **鍵より先に貼り紙だけが流れると、よそのお店が本物のレシートを
 *   「公開のままの置き場」に置ける状態**になります。置いた写真は、あとで
 *   置き場を閉めても「それまでに住所を見た人」からは守れません。
 *
 * ■ どう直すか
 *   置き場が公開のあいだ（または公開かどうか確かめられないあいだ）は、
 *   **よそのお店の写真を置き場に置きません。**
 *   そのときは今までどおり**写真を記録の中にそのまま残します**
 *   （CLAUDE.md 4-7 の「置き場に入れられなかったときは埋め込み形式のまま保存する」と同じ道。
 *     重いけれど、記録が消えるより、ましてや外から読めるより、はるかにましです）。
 *   置き場が非公開に変わったら、この門は自動で開きます（コードを直す必要はありません）。
 *
 * ■ 手羽屋は1つも変わりません
 *   手羽屋（印が空）の写真は、今までとまったく同じ置き場・同じ住所に置きます。
 *   門に聞きにも行きません（通信も1本も増えません）。
 *   ＝ 日報・立替の画面の見え方・速さ・保存先は1つも変わりません。
 *
 * ■ ここは計算だけ
 *   倉庫にも置き場にも通信しません。置き場が公開かどうかを調べるのは
 *   窓口（app/api/keiri/photo-gate/route.ts）の仕事です。
 *   tests/receiptUploadGate.test.ts で固定してあります。
 */

import { isTebayaScope, type TenantScope } from "./tenantScope";

export type ReceiptUploadGate = {
  /** 置き場に置いてよいか */
  allowed: boolean;
  /** 手羽屋の写真か（手羽屋は門に聞かずに通す） */
  tebaya: boolean;
  /** 置き場が公開のままか（true ＝ 公開 / false ＝ 非公開 / null ＝ 分かりません） */
  bucketPublic: boolean | null;
  /** 理由の1行（画面にも窓口にもそのまま出せる言葉。鍵・住所・金額は入れません） */
  reason: string;
};

/** 置き場に置かなかったときの行き先（＝今までどおり記録の中に写真を残す） */
export const RECEIPT_KEEP_NOTE =
  "写真は記録の中にそのまま残します（あとで管理者ページの「写真を置き場へ移す」で移し直せます）";

/**
 * この写真を置き場に置いてよいかを決める。
 *
 * @param scope どのお店の写真か（手羽屋は null）
 * @param bucketPublic 置き場が公開のままか（分からなければ null）
 */
export function judgeReceiptUpload(
  scope: TenantScope,
  bucketPublic: boolean | null,
): ReceiptUploadGate {
  if (isTebayaScope(scope)) {
    return {
      allowed: true,
      tebaya: true,
      bucketPublic,
      reason:
        "手羽屋の写真です。これまでとまったく同じ置き場・同じ住所に置きます（門には聞きません）",
    };
  }
  if (bucketPublic === false) {
    return {
      allowed: true,
      tebaya: false,
      bucketPublic,
      reason: "置き場は非公開になっています。お店ごとのフォルダに置きます",
    };
  }
  return {
    allowed: false,
    tebaya: false,
    bucketPublic,
    reason:
      (bucketPublic === true
        ? "置き場がまだ公開の設定です（住所を知っていれば合言葉なしで開けます）。"
        : "置き場が公開かどうかを確かめられませんでした。") +
      `よそのお店のレシート写真は、ここには置きません。${RECEIPT_KEEP_NOTE}`,
  };
}
