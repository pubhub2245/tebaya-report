/**
 * レシート写真の「形」を判定・変換するだけの部品。
 *
 * ここには通信の処理を入れない（Supabaseを読み込まない）。
 * 理由：判定の正しさをテストで固定したいが、
 * 通信の準備が要るとテストが動かせなくなるため。
 *
 * 写真には2つの形がある：
 *   ① 埋め込み  "data:image/jpeg;base64,..." … 写真そのものが記録の中に入っている（重い・昔の形）
 *   ② 住所      "https://.../receipts/xxx.jpg" … 置き場にある写真の場所だけ（軽い・これからの形）
 */

/** その文字列が「写真そのものを埋め込んだ古い形式」か */
export function isEmbeddedImage(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

/**
 * "data:image/jpeg;base64,..." を、アップロードできる形（Blob）に変える。
 * 壊れた文字列のときは例外を投げる（黙って空の写真にしない）。
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) {
    throw new Error("画像データの形式が正しくありません");
  }
  const header = dataUrl.slice(5, comma); // 例: image/jpeg;base64
  const mime = header.split(";")[0] || "image/jpeg";
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** 置き場の中でのファイル名を作る。重ならないようにランダムな英数字を使う */
export function makeObjectPath(prefix: string, mime: string): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `${prefix}/${ym}/${rand}.${ext}`;
}
