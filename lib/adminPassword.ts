/**
 * 管理者パスワードの扱いを、ここ1か所にまとめたファイル。
 *
 * ■ 直したこと
 *   これまで、パスワードが未設定のときの初期値がコードに直接書かれていました
 *   （GitHub上でも読める状態）。これを消しました。
 *   さらに「未設定なら誰でも入れる」という分岐があったので、
 *   「未設定なら誰も入れない（設定を促す）」に変えました。
 *   鍵を掛け忘れたときに、開けっぱなしにするのではなく閉めるのが安全側です。
 *
 * ■ まだ残っている弱点（正直に書きます）
 *   設定名が NEXT_PUBLIC_ で始まるため、パスワードは
 *   **ブラウザに配られるファイルに埋め込まれます**（開けば読めます）。
 *   これは Next.js の仕様で、ここを直すには
 *   「合言葉の確認をサーバー側で行う」作りに変える必要があります（次の段階）。
 *   いまの対策は「玄関の壁に貼った紙を剥がした」だけで、
 *   「鍵を付け替えた」わけではありません。
 */

/** 設定されている管理者パスワード。未設定なら空文字 */
export const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

/** パスワードが設定されているか。false のときは管理画面を開かない */
export const ADMIN_PASSWORD_CONFIGURED = ADMIN_PASSWORD.length > 0;

/** 入力された合言葉が正しいか。未設定のときは常に false（開けっぱなしにしない） */
export function checkAdminPassword(input: string): boolean {
  if (!ADMIN_PASSWORD_CONFIGURED) return false;
  return input === ADMIN_PASSWORD;
}

/** 未設定のときに画面に出す案内文 */
export const ADMIN_PASSWORD_SETUP_MESSAGE =
  "管理者パスワードが設定されていません。Vercel の環境変数 NEXT_PUBLIC_ADMIN_PASSWORD を設定してから、もう一度開いてください。";
