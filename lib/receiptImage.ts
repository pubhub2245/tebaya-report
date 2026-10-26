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

/**
 * 写真を置くときの「お店ごとのフォルダ」。
 *
 * ■ なぜ足したか（2026-10-26・f3-4）
 *   棚（テーブル）はお店ごとに分ける工事が済みましたが、**写真の置き場は分けていません**でした。
 *   いまの置き場は `report/2026-10/<でたらめな名前>.jpg` のように、
 *   **どのお店の写真かが どこにも書かれていません**。
 *   お店が2軒になると、
 *   ・そのお店の写真だけを数える・見せる・あとで消す、ができません
 *   ・万一「置き場の中の一覧」が読める形になった日に、**全部のお店の写真が1つの袋**に入っています
 *   という形になります（レシート写真は、その店の経理そのものです）。
 *
 * ■ 手羽屋は1文字も変わりません（ここがいちばん大事）
 *   手羽屋は印が空（null）のお店なので、**今までとまったく同じ住所**になります。
 *   フォルダが増えるのは「経理パッケージを申し込んだお店」の写真だけです。
 *   昔の写真の住所も1つも書き換えません（記録に住所がそのまま残っているので、今までどおり映ります）。
 */
export function photoFolderForTenant(prefix: string, tenantId?: string | null): string {
  const id = String(tenantId ?? "").trim().toLowerCase();
  if (!id) return prefix; // 手羽屋（印が空）＝今までどおり
  // 変な文字で別のフォルダに届かないように、英数字とハイフンだけを通す
  if (!/^[0-9a-f-]{8,64}$/.test(id)) return prefix;
  return `t/${id}/${prefix}`;
}

/**
 * 置き場の中でのファイル名を作る。重ならないようにランダムな英数字を使う。
 * tenantId を渡すと、そのお店のフォルダの中に作る（手羽屋＝省略・null で今までどおり）。
 */
export function makeObjectPath(
  prefix: string,
  mime: string,
  tenantId?: string | null,
): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `${photoFolderForTenant(prefix, tenantId)}/${ym}/${rand}.${ext}`;
}
