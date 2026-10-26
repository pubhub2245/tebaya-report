/**
 * レシート写真の置き場（receipts）に、**公開の鍵で**聞くところ（f3-4・2026-10-26）。
 *
 * ★1枚も写真を読みません。1行も書き込みません。
 * ★返すのは「一覧が何件 返ったか」と ○× だけで、写真の住所・金額・お店の名前は1文字も返しません。
 * ★必ず**公開の鍵**（ブラウザに配られているのと同じ鍵）で聞きます。
 *   サーバー側の鍵で聞くと決まりを飛び越えて読めてしまい、
 *   「まだ開いている」のに「閉まっている」と答えてしまいます（→ lib/keiri/shelvesProbe.ts ⑦と同じ）。
 */

import { anonClient, noStoreFetch } from "@/lib/supabaseServer";
import { RECEIPT_BUCKET } from "@/lib/receiptStorage";
import { applyTenantScope, TEBAYA_SCOPE } from "@/lib/tenantScope";
import { RECEIPT_VIEW_PATH } from "@/lib/receiptViewUrl";
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
  /** 「公開かどうか」を外から確かめた結果（写真は1枚も読みません） */
  publicCheck: PublicReadCheck;
  /** 写真を見せる窓口の住所（画面はここだけを通して見る） */
  viewWindow: string;
  /** その窓口について、まだ測れていないことの1行（甘く見せないため） */
  viewWindowNote: string;
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
  // 立替に写真が無いときは、日報の側も数える（2026-10-26 18:3x）。
  //
  // ■ なぜ足したか
  //   10/26 13:5x に本番で測ったところ、手羽屋の立替の記録には置き場の住所が1件も
  //   ありませんでした（写真は日報の経費の行に付いています）。そのため合否が
  //   いつまでも「分かりません」のままで、この窓口が f3-4 の材料になりませんでした。
  //
  // ■ それでも行の中身は読みません
  //   聞くのは「その住所のかたちに当てはまる行が**何件あるか**」だけで（head=true）、
  //   住所そのもの・金額・お店の名前は1文字も返ってきません。
  //   手羽屋のぶんだけ（印が空）を数えます。
  if (total === 0) {
    const fromReports = await countPhotosInReports();
    if (fromReports > 0) {
      return {
        count: fromReports,
        note: `手羽屋の日報のうち、置き場の住所が入っている行は ${fromReports} 件（件数だけを数えました）`,
      };
    }
  }
  if (asked === 0) {
    return { count: null, note: "立替の棚に聞けませんでした（写真の枚数は分かりません）" };
  }
  if (total === 0) {
    return {
      count: null,
      note:
        "手羽屋の立替の記録にも日報にも、置き場の住所がまだ1件もありません" +
        "（数えたのは件数だけで、行の中身は1文字も読んでいません）",
    };
  }
  return {
    count: total,
    note: `手羽屋の立替の記録のうち、置き場の住所が入っているのは ${total} 件（件数だけを数えました）`,
  };
}

/**
 * 日報の経費の行に、置き場の住所が入っている行を数える（件数だけ）。
 *
 * 日報の経費はひとつの列（JSON）にまとまっているので、
 * 先頭から数件の行だけを見ます（1件でも見つかれば「置き場は空ではない」が言えます）。
 * ★返すのは件数だけ。住所・金額・お店の名前は1文字も読みません。
 * ★手羽屋のぶんだけ（印が空）を数えます。
 */
async function countPhotosInReports(): Promise<number> {
  let found = 0;
  for (let i = 0; i < 5; i++) {
    try {
      const db = anonClient({ fresh: true });
      const { count, error } = await applyTenantScope<any>(
        db
          .from("daily_reports")
          .select("id", { count: "exact", head: true })
          .like(`expenses->${i}->>receipt_image_url`, `%/${RECEIPT_BUCKET}/%`) as any,
        TEBAYA_SCOPE,
      );
      if (error) continue;
      found += count ?? 0;
    } catch {
      /* 聞けなかった分は数に入れない */
    }
  }
  return found;
}

export type PublicReadCheck = {
  /** 置き場が公開のままか（true ＝ 開いている / false ＝ 非公開 / null ＝ 分かりません） */
  open: boolean | null;
  /** 倉庫が返した番号（200・400・404 など。値や住所は入れません） */
  status: number | null;
  /** 倉庫が返した短い文（鍵・住所・お店の名前は入りません） */
  said: string;
  note: string;
};

/**
 * 置き場が「公開」のままかを、**合言葉も鍵もまったく付けずに**確かめる。
 *
 * ■ どうやって見分けるのか（やさしい説明）
 *   ありもしない写真の住所（でたらめな名前）を、**鍵なしで**たたきます。
 *   ・置き場が**公開**なら … 倉庫は「その写真は無い」と答えます（＝置き場までは入れている）
 *   ・置き場が**非公開**なら … 倉庫は「この置き場は公開されていない」と答えます
 *   どちらとも読めない答えのときは **null（分かりません）**にします。
 *
 * ★本物の写真は1枚も読みません（**存在しない住所**をたたくだけです）。
 * ★1行も書き込みません。鍵・合言葉は1つも付けません（付けたら確かめる意味がありません）。
 */
export async function probePublicRead(): Promise<PublicReadCheck> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    return {
      open: null,
      status: null,
      said: "",
      note: "倉庫の場所が設定されていないので確かめられませんでした",
    };
  }
  // わざと「無い写真」の住所。手羽屋の2枚にも、よその店の写真にも当たりません。
  const missing = `${base}/storage/v1/object/public/${RECEIPT_BUCKET}/report/0000-00/does-not-exist-${Date.now()}.jpg`;
  let res: Response;
  try {
    res = await noStoreFetch(missing);
  } catch {
    return { open: null, status: null, said: "", note: "通信できませんでした（分かりません）" };
  }
  const body = (await res.text().catch(() => "")).slice(0, 200);
  const said = body.replace(/\s+/g, " ").trim();
  const lower = said.toLowerCase();

  if (res.ok) {
    return {
      open: true,
      status: res.status,
      said: "",
      note: "鍵なしで写真が返ってきました（置き場は公開のままです）",
    };
  }
  if (/not\s*public|public\s*access|not\s*allowed|unauthorized|invalid\s*jwt/.test(lower)) {
    return {
      open: false,
      status: res.status,
      said,
      note: "鍵なしでは断られました（置き場は非公開になっています）",
    };
  }
  if (/object\s*not\s*found|not_found/.test(lower) && !/bucket\s*not\s*found/.test(lower)) {
    return {
      open: true,
      status: res.status,
      said,
      note:
        "鍵なしで置き場まで入れて「その写真は無い」と返りました" +
        "（＝置き場は公開のままで、住所を知っていれば1枚ずつ開けます）",
    };
  }
  return {
    open: null,
    status: res.status,
    said,
    note: "答えをどちらとも読めませんでした（分かりませんのままにします）",
  };
}

export async function probePhotoShelf(): Promise<PhotoShelfReport> {
  const folders = ["", ...PHOTO_PREFIXES, PHOTO_TENANT_PREFIX];
  const outcomes: ShelfListOutcome[] = [];
  for (const folder of folders) outcomes.push(await listFolder(folder));
  const photos = await countPhotosFromShelves();
  const publicCheck = await probePublicRead();

  return {
    bucket: RECEIPT_BUCKET,
    publicCheck,
    viewWindow: RECEIPT_VIEW_PATH,
    viewWindowNote:
      "画面は置き場の住所を直に使わず、この窓口ごしに写真を見ます（記録の住所は1文字も書き換えていません）。" +
      "**本物の写真1枚で端から端まで試したことは、まだありません**" +
      "（手羽屋の記録に置き場の住所が入っている行が1件も無く、外から住所を知る道もないため）。" +
      "測れているのは「無い写真・置き場の外へ出る道・よその店の写真」を正しく断ることだけです。",
    outcomes,
    knownPhotos: photos.count,
    knownPhotosNote: photos.note,
    verdict: judgePhotoShelf({
      outcomes,
      knownPhotos: photos.count,
      // コード側の決まり（lib/receiptImage.ts の photoFolderForTenant）。
      // tests/keiriPhotoShelf.test.ts が、この形から外れたら落ちるようにしてあります。
      separatedByFolder: true,
      publicRead: publicCheck.open,
      // 画面は lib/receiptViewUrl.ts を通して見る形にしました（2026-10-26）。
      // tests/receiptViewUrl.test.ts と tests/keiriPhotoShelf.test.ts が、この形から外れたら落ちます。
      viewWindow: true,
    }),
    how: PHOTO_SHELF_HOW,
  };
}
