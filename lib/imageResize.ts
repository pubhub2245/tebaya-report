/**
 * 写真を小さくしてデータURL（文字列）に変える共通処理。
 *
 * なぜ小さくするか：スマホの写真はそのままだと数MBあり、
 * データベースに入れると重くて開けなくなるため。
 * 長辺 1000px・画質70% に縮めてから保存する（レシートの数字は充分読める）。
 *
 * 戻り値は "data:image/jpeg;base64,..." という文字列。
 * 既存の立替・精算画面（/cash/advances）と同じ方式。
 */
export function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("読み込み失敗"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像読み込み失敗"));
      img.onload = () => {
        try {
          const max = 1000;
          let { width: w, height: h } = img;
          if (w > max || h > max) {
            if (w >= h) {
              h = Math.round((h * max) / w);
              w = max;
            } else {
              w = Math.round((w * max) / h);
              h = max;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas未対応"));
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } catch (err) {
          reject(err);
        }
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}
