/**
 * レシート写真を「**窓口ごしに**見せる」ための住所の作り方（f3-4・2026-10-26）。
 * **ここには通信を入れません**（判定を試験で固定したいため。実際に写真を出す所は
 * app/api/receipt-photo/route.ts）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   レシート写真は `receipts` という置き場に置き、記録には**住所だけ**を持たせています
 *   （CLAUDE.md 4-7）。ところがこの置き場は **「公開」の設定**で、
 *   **住所さえ知っていれば、合言葉なしで だれでもその1枚を開けます**
 *   （2026-10-26 に倉庫を数えて分かったこと）。
 *   一覧は閉まっていますが、1枚ずつ開く道が開いたままです。
 *   レシート写真はその店の経理そのものなので、お店が2軒になる前に閉めます。
 *
 * ■ 閉める順番（棚のときと同じ形）
 *   ① 画面は、置き場の住所を**直に**使うのをやめ、**こちら側の窓口**を通して見る ← この紙
 *   ② 窓口は、**期限つきの住所**（60秒だけ有効）を出して写真を見せる
 *   ③ そのうえで置き場を**非公開**に変え、外から確かめる
 *   ※ ③は、サーバー側の鍵が直ってから（→ kp241）。鍵が無いと期限つきの住所を作れないため、
 *     先に非公開にすると写真が1枚も映らなくなります。
 *
 * ■ 記録は1行も書き換えません（ここが大事）
 *   棚に入っている住所（`https://…/receipts/report/2026-09/xxx.jpg`）はそのままで、
 *   **見るときだけ**窓口の住所に読み替えます。昔の記録も新しい記録も同じように映ります。
 *   写真そのものが記録に埋め込まれている昔の形（`data:image/jpeg;base64,…`）は、
 *   これまでどおり**そのまま**映します（置き場を通りません）。
 */

/** 置き場（バケット）の名前。lib/receiptStorage.ts と同じ値 */
const BUCKET = "receipts";

/** 写真を見せる窓口の住所 */
export const RECEIPT_VIEW_PATH = "/api/receipt-photo";

/** 写真を置くときのフォルダの頭（どの画面から入れた写真か）。lib/keiri/photoShelf.ts と同じ */
const PREFIXES = ["report", "advance", "keiri"] as const;

/** お店ごとのフォルダの頭（→ lib/receiptImage.ts の photoFolderForTenant） */
const TENANT_PREFIX = "t";

/** その文字列が「写真そのものを埋め込んだ古い形式」か（lib/receiptImage.ts と同じ判定） */
function isEmbedded(value: string): boolean {
  return value.startsWith("data:");
}

/**
 * 置き場の住所から、置き場の中の道（`report/2026-09/xxx.jpg`）だけを取り出す。
 * 置き場の住所でなければ null（＝読み替えない）。
 *
 * 受け取れる形は3つ：
 *   ・公開の住所 `https://…/storage/v1/object/public/receipts/<道>`
 *   ・期限つきの住所 `https://…/storage/v1/object/sign/receipts/<道>?token=…`
 *   ・道そのもの `report/2026-09/xxx.jpg`
 */
export function receiptObjectPath(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || isEmbedded(raw)) return null;

  let path = raw;
  const marker = `/${BUCKET}/`;
  if (/^https?:\/\//i.test(raw)) {
    const at = raw.indexOf(marker);
    if (at === -1) return null; // 置き場の住所ではない（よその写真置き場など）
    path = raw.slice(at + marker.length);
  }

  // 「?token=…」などの後ろは落とす（期限つきの住所をそのまま渡されても道だけを見る）
  path = path.split("?")[0].split("#")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* 読めない並びはそのまま扱う（下の見張りで弾かれる） */
  }
  path = path.replace(/^\/+/, "");
  return path || null;
}

/**
 * 窓口が受け取ってよい道か。
 * **置き場の外へ出る道（`..`）・空っぽ・変な文字は通しません。**
 */
export function isAllowedPhotoPath(path: string | null | undefined): boolean {
  const p = String(path ?? "").trim();
  if (!p || p.length > 300) return false;
  if (p.includes("..") || p.startsWith("/") || p.includes("//")) return false;
  if (!/^[A-Za-z0-9/_.-]+$/.test(p)) return false;

  const parts = p.split("/");
  if (parts.some((s) => s === "")) return false;

  // お店ごとのフォルダ … t/<お店の番号>/<頭>/…
  if (parts[0] === TENANT_PREFIX) {
    if (parts.length < 4) return false;
    if (!/^[0-9a-f-]{8,64}$/.test(parts[1])) return false;
    return (PREFIXES as readonly string[]).includes(parts[2]);
  }

  // 手羽屋（印が空）… <頭>/…（昔の形のまま）
  if (parts.length < 2) return false;
  return (PREFIXES as readonly string[]).includes(parts[0]);
}

/**
 * その道の写真は「どのお店のもの」か。
 * 手羽屋（印が空のお店）のときは null を返す（→ lib/tenantScope.ts の TEBAYA_SCOPE と同じ考え方）。
 */
export function tenantOfPhotoPath(path: string | null | undefined): string | null {
  const p = String(path ?? "").trim();
  const parts = p.split("/");
  if (parts[0] !== TENANT_PREFIX) return null;
  const id = (parts[1] ?? "").trim().toLowerCase();
  return /^[0-9a-f-]{8,64}$/.test(id) ? id : null;
}

/**
 * 画面の `<img src>` に入れる住所を作る。
 *
 *   ・写真が記録に埋め込まれている昔の形 … **そのまま**（置き場を通らない）
 *   ・置き場の住所                       … **窓口の住所**に読み替える
 *   ・それ以外（よその住所・空）         … そのまま
 *
 * ★記録の中身は1文字も書き換えません。見るときだけ読み替えます。
 *
 * @param tenantId いま開いているお店（手羽屋は省略／null）。
 *   よそのお店の写真はフォルダが分かれているので、**そのお店として開いていること**を
 *   窓口に伝えます（伝えないと窓口が断ります）。手羽屋のときは今までと同じ住所です。
 */
export function receiptViewSrc(
  value: string | null | undefined,
  tenantId?: string | null,
): string {
  const raw = String(value ?? "").trim();
  if (!raw || isEmbedded(raw)) return raw;
  const path = receiptObjectPath(raw);
  if (!path || !isAllowedPhotoPath(path)) return raw;
  const t = String(tenantId ?? "").trim().toLowerCase();
  const suffix = t ? `&t=${encodeURIComponent(t)}` : "";
  return `${RECEIPT_VIEW_PATH}?p=${encodeURIComponent(path)}${suffix}`;
}
