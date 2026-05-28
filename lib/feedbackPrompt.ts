/**
 * 意見箱の投稿を Claude Code 用プロンプトとして整形するヘルパー。
 * 詳細画面・管理者画面の両方から使用される。
 */

export type FeedbackPromptInput = {
  submitter: string;
  title: string;
  current_problem: string;
  proposed_solution: string;
};

/** スタッフ投稿を Claude Code に貼り付けて使えるプロンプト文字列に整形 */
export function buildClaudeCodePrompt(input: FeedbackPromptInput): string {
  return [
    "確認は全て飛ばしてOK。ただし以下は絶対にしないこと：①全データの削除や復元不可能な操作（DROP TABLE、DELETE FROM ... WHERE条件なし、git push --force、rm -rf等）、②料金が発生する操作（有料APIの新規契約、課金プランへのアップグレード等）。これらを実行する必要がある場合は必ず事前にユーザーに確認すること。",
    "",
    "【スタッフからの改善要望】",
    `投稿者：${input.submitter}`,
    `タイトル：${input.title}`,
    "",
    "■ 修正してほしい項目",
    input.current_problem,
    "",
    "■ どのように修正するか",
    input.proposed_solution,
    "",
    "【依頼】",
    "上記はスタッフからの改善要望です。この要望を実装してください。",
    "まず関連するファイルと現状を調査・報告してから、実装方針を相談し、",
    "着手してください。過去データを壊す操作やDB削除はしないこと。",
    "END OF PROMPT",
  ].join("\n");
}

/**
 * クリップボードにテキストをコピー。
 * navigator.clipboard を優先し、失敗時は document.execCommand("copy") フォールバック。
 * iOS Safari でも HTTPS + ユーザー操作起点なら navigator.clipboard が動く。
 * @returns true=成功 / false=失敗（呼び出し側で手動コピー UI へ誘導）
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 続けてフォールバックを試す
  }
  // フォールバック: 非表示の textarea から execCommand
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
