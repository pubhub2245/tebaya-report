/**
 * 「サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）を貼り直す」1枚ぶんの言葉を置く所。
 *
 * ■ なぜこの1枚が要るのか（2026-10-07 18:34 B が実測して分かったこと）
 *   本番の鍵の欄には、**鍵ではないもの**が入っています（長さ約700文字・うち日本語が
 *   約450文字・改行が12個）。決まりどおり半角に直してみても鍵の形にならないので、
 *   貼り間違いではなく**別の物が貼られている**状態です。
 *   この鍵が使えないあいだ、次の3つが止まったままになります：
 *     ① **毎日の自動の控え（バックアップ）が取れません**（lib/backup.ts は鍵が無いと動きません）
 *     ② お申し込みの控えを**一覧として読み返せません**（入る道は生きています）
 *     ③ **2軒目のお店の行を作れません**＝2軒目を入れる手順の1手目が通りません（f5-4）
 *   ①は手羽屋のデータそのものの備えなので、いちばん先に直したい所です。
 *
 * ■ ここに値は1文字も書きません
 *   画面にも、この窓口の返事にも、鍵の値・合言葉・環境変数の中身は出しません。
 *   出すのは「設定されているか」「使えるか」「なぜ使えないか（文字数などの形だけ）」です。
 */

/** 鍵が壊れているあいだ止まっているもの（じゅんに「何が動くか」を見せるため） */
export const KEY_BLOCKED = [
  {
    what: "毎日の自動の控え（バックアップ）",
    why: "鍵が無いと、倉庫の中身を控えに写せません。いまは控えが取れていません",
  },
  {
    what: "お申し込みの控えを一覧で読み返す",
    why: "入る道は生きていて記録は残ります。読み返すところだけが止まっています",
  },
  {
    what: "2軒目のお店の行を作る（仕上げの ⑤ f5-4）",
    why: "お店の棚は仕組み側の鍵でしか触れません。手順の1手目がここで止まります",
  },
] as const;

/** じゅんの手（4手・合計1分） */
export const KEY_FIX_STEPS = [
  {
    no: "①",
    where: "Supabase",
    what:
      "Project Settings → API を開き、service_role の欄の **コピーのボタン**を押します" +
      "（文字を選んでコピーすると、まわりの説明文が混ざります）",
  },
  {
    no: "②",
    where: "Vercel",
    what:
      "Settings → Environment Variables を開き、SUPABASE_SERVICE_ROLE_KEY の値を" +
      "いま入っているものを消して貼り直します（Production に入っていることを確かめます）",
  },
  {
    no: "③",
    where: "Vercel",
    what: "Deployments から Redeploy を1回 押します（貼り直した値は、出し直すまで効きません）",
  },
  {
    no: "④",
    where: "この1枚",
    what: "この画面をもう一度 開きます。「そのまま使えます」に変わっていれば終わりです",
  },
] as const;

/** 鍵の見立て（lib/keiri/serverHealth.ts の describeServerKey が作る形の必要なところだけ） */
export type KeyFixInput = {
  configured: boolean;
  usable: boolean;
  repaired?: boolean;
};

export type KeyFixLevel = "ok" | "repaired" | "broken" | "missing";

/** いまの状態を4通りに分ける（画面の色と見出しがこれで決まる） */
export function keyFixLevel(input: KeyFixInput): KeyFixLevel {
  if (!input.configured) return "missing";
  if (input.usable) return input.repaired ? "repaired" : "ok";
  return "broken";
}

/** 画面のいちばん大きい1行 */
export function keyFixHeadline(level: KeyFixLevel): string {
  switch (level) {
    case "ok":
      return "鍵はそのまま使えます。やることはありません";
    case "repaired":
      return "いまは直しながら動いています。急ぎではありませんが、いずれ貼り直してください";
    case "missing":
      return "鍵が登録されていません。下の4手（1分）で登録してください";
    case "broken":
      return "鍵の欄に、鍵ではないものが入っています。下の4手（1分）で貼り直してください";
  }
}

/** じゅんの手が必要か（必要なら1枚の上に手順を出す） */
export function keyFixNeeded(level: KeyFixLevel): boolean {
  return level === "broken" || level === "missing" || level === "repaired";
}
