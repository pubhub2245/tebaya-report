/**
 * 申し込んだお店が「自分だと名乗る札」を、そのタブのあいだだけ覚えておくところ（kp239・f3-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   経理の数字をサーバー側で読む窓口（/api/keiri/month）は、
 *   **お店の番号を受け取りません**（番号を書き換えればよその店が開けてしまうため）。
 *   代わりに「合言葉を戻せない形にしたもの」を受け取り、
 *   どのお店かはサーバーが倉庫に聞いて決めます。
 *   そのため画面側は、入室のときに入れた合言葉の**戻せない形**を持っておく必要があります。
 *
 * ■ 守ること
 *   ① 合言葉そのもの（打った文字）は**どこにも残しません**。戻せない形だけを置きます
 *   ② 置き場はそのタブだけ（sessionStorage）。**タブを閉じれば消えます**
 *   ③ 「出る」を押したら消します（入室の印と同時に）
 *   ④ 手羽屋には使いません（手羽屋は今までどおりの読み方のままです）
 */

/** そのタブのあいだだけ覚えておく名前 */
export const KEIRI_SECRET_KEY = "keiri-shop-key";

/** 戻せない形（sha256 の16進64文字） */
const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * 合言葉を、戻せない形（16進64文字）に直す。
 * ブラウザに元から入っている仕組み（crypto.subtle）を使うので、何も読み込みません。
 * 使えない端末（古い・HTTPSでない）では null を返し、画面は今までどおりの読み方に戻ります。
 */
export async function hashSecretInBrowser(secret: string): Promise<string | null> {
  try {
    const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
    if (!subtle) return null;
    const bytes = new TextEncoder().encode(secret);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/** 札を覚える（戻せない形だけ。形がおかしければ覚えない） */
export function rememberKeiriSecret(hash: string | null | undefined): void {
  const h = String(hash ?? "").trim().toLowerCase();
  if (!HASH_RE.test(h)) return;
  try {
    sessionStorage.setItem(KEIRI_SECRET_KEY, h);
  } catch {}
}

/** 札を取り出す。無ければ null */
export function readKeiriSecret(): string | null {
  try {
    const h = String(sessionStorage.getItem(KEIRI_SECRET_KEY) ?? "")
      .trim()
      .toLowerCase();
    return HASH_RE.test(h) ? h : null;
  } catch {
    return null;
  }
}

/** 札を捨てる（「出る」を押したとき） */
export function forgetKeiriSecret(): void {
  try {
    sessionStorage.removeItem(KEIRI_SECRET_KEY);
  } catch {}
}
