/**
 * レシート写真の置き場（receipts）に、**公開の鍵で**聞くところ（f3-4・2026-10-26）。
 *
 * ★1枚も写真を読みません。1行も書き込みません。
 * ★返すのは「一覧が何件 返ったか」と ○× だけで、写真の住所・金額・お店の名前は1文字も返しません。
 * ★必ず**公開の鍵**（ブラウザに配られているのと同じ鍵）で聞きます。
 *   サーバー側の鍵で聞くと決まりを飛び越えて読めてしまい、
 *   「まだ開いている」のに「閉まっている」と答えてしまいます（→ lib/keiri/shelvesProbe.ts ⑦と同じ）。
 */

import { anonClient } from "@/lib/supabaseServer";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { applyTenantScope, TEBAYA_SCOPE } from "@/lib/tenantScope";
import {
  judgePhotoShelf,
  PHOTO_PREFIXES,
  PHOTO_SHELF_HOW,
  PHOTO_TENANT_PREFIX,
  type PhotoShelfVerdict,
  type ShelfListOutcome,
} from "@/lib/keiri/photoShelf";

export type PhotoShelfReport = {
  bucket: string;
  /** 聞いた場所ごとの結果 */
  outcomes: ShelfListOutcome[];
  /** 置き場に写真が1枚でもあると数えられたか（分からなければ null） */
  knownPhotos: number | null;
  knownPhotosNote: string;
  verdict: PhotoShelfVerdict;
  how: string;
};

/** 置き場の1か所を一覧で聞く。中身（名前）は数えるだけで返さない */
async function listFolder(folder: string): Promise<ShelfListOutcome> {
  try {
    const db = anonClient({ fresh: true });
    const { data, error } = await db.storage
      .from(RECEIPT_BUCKET)
      .list(folder, { limit: 100 });
    if (error) {
      const message = String((error as { message?: string }).message ?? "");
      const denied = /not authorized|permission|unauthorized|violates row-level/i.test(message);
      return { folder, items: null, error: message || "断られました", denied };
    }
    return { folder, items: Array.isArray(data) ? data.length : 0, error: null, denied: false };
  } catch {
    return { folder, items: null, error: "通信に失敗しました", denied: false };
  }
}

/**
 * 「置き場に写真が1枚でもあるか」を、**棚の側から**数える。
 *
 * ■ なぜ棚から数えるのか
 *   置き場が空でも鍵が効いていても、一覧は同じ「0件」で返ります（→ photoShelf.ts）。
 *   見分けるために、**記録に置き場の住所が入っている行**を数えます。
 *   数えるのは件数だけで、住所そのものは1文字も読みません。
 */
async function countPhotosFromShelves(): Promise<{ count: number | null; note: string }> {
  const tables = ["advance_expenses", "keiri_advance_expenses"];
  let total = 0;
  let asked = 0;
  for (const table of tables) {
    try {
      const db = anonClient({ fresh: true });
      // ★必ず**手羽屋のぶんだけ**を数えます（→ lib/tenantScope.ts）。
      //   数えたいのは「置き場が空っぽではない」ことだけなので、
      //   よその店の行まで数える理由がありません（f3-4）。
      //   印の欄がまだ無い棚は、ここで error になるので数に入りません。
      const { count, error } = await applyTenantScope<any>(
        db
          .from(table)
          .select("id", { count: "exact", head: true })
          .like("receipt_image_url", `%/${RECEIPT_BUCKET}/%`) as any,
        TEBAYA_SCOPE,
      );
      if (error) continue;
      asked += 1;
      total += count ?? 0;
    } catch {
      /* 聞けなかった棚は数に入れない */
    }
  }
  if (asked === 0) {
    return { count: null, note: "立替の棚に聞けませんでした（写真の枚数は分かりません）" };
  }
  if (total === 0) {
    return {
      count: null,
      note:
        "手羽屋の立替の記録には、置き場の住所がまだ1件もありません" +
        "（日報の中の写真は数えていません。数えると行の中身を読むことになるため）",
    };
  }
  return {
    count: total,
    note: `手羽屋の立替の記録のうち、置き場の住所が入っているのは ${total} 件（件数だけを数えました）`,
  };
}

export async function probePhotoShelf(): Promise<PhotoShelfReport> {
  const folders = ["", ...PHOTO_PREFIXES, PHOTO_TENANT_PREFIX];
  const outcomes: ShelfListOutcome[] = [];
  for (const folder of folders) outcomes.push(await listFolder(folder));
  const photos = await countPhotosFromShelves();

  return {
    bucket: RECEIPT_BUCKET,
    outcomes,
    knownPhotos: photos.count,
    knownPhotosNote: photos.note,
    verdict: judgePhotoShelf({
      outcomes,
      knownPhotos: photos.count,
      // コード側の決まり（lib/receiptImage.ts の photoFolderForTenant）。
      // tests/keiriPhotoShelf.test.ts が、この形から外れたら落ちるようにしてあります。
      separatedByFolder: true,
    }),
    how: PHOTO_SHELF_HOW,
  };
}
