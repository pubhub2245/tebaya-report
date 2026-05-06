/**
 * GitHub API クライアントヘルパー（意見箱の半自動実装機能用）。
 *
 * 環境変数:
 *   GITHUB_PAT    Personal Access Token (repo 権限)
 *   GITHUB_OWNER  例: pubhub2245
 *   GITHUB_REPO   例: tebaya-report
 *
 * 環境変数が未設定でもこのモジュールの import 自体は失敗しないように、
 * 各関数の呼び出し時にクライアントを初期化する。
 */

import { Octokit } from "@octokit/rest";

export interface GitHubEnv {
  pat: string;
  owner: string;
  repo: string;
}

function readEnv(): GitHubEnv {
  const pat = process.env.GITHUB_PAT ?? "";
  const owner = process.env.GITHUB_OWNER ?? "";
  const repo = process.env.GITHUB_REPO ?? "";
  if (!pat || !owner || !repo) {
    throw new Error(
      "GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO のいずれかが未設定です",
    );
  }
  return { pat, owner, repo };
}

function buildClient(env: GitHubEnv): Octokit {
  return new Octokit({ auth: env.pat });
}

export interface RepoFileEntry {
  path: string;
  type: "file" | "dir" | string;
  size: number;
}

/**
 * master ブランチ配下の app/, lib/, components/ に絞ったファイル一覧を返す。
 * 大量ファイル避けのため filter する。
 */
export async function getRepoFileTree(): Promise<RepoFileEntry[]> {
  const env = readEnv();
  const octo = buildClient(env);

  // master の最新 SHA を取得
  const ref = await octo.rest.git.getRef({
    owner: env.owner,
    repo: env.repo,
    ref: "heads/master",
  });
  const sha = ref.data.object.sha;

  // 再帰的にツリー取得
  const tree = await octo.rest.git.getTree({
    owner: env.owner,
    repo: env.repo,
    tree_sha: sha,
    recursive: "1",
  });

  const treeArr = tree.data.tree ?? [];
  const result: RepoFileEntry[] = [];
  for (const t of treeArr) {
    if (!t.path || t.type !== "blob") continue;
    const p = t.path;
    const isCode =
      p.endsWith(".ts") ||
      p.endsWith(".tsx") ||
      p.endsWith(".js") ||
      p.endsWith(".jsx");
    const inScope =
      p.startsWith("app/") ||
      p.startsWith("lib/") ||
      p.startsWith("components/");
    if (!isCode || !inScope) continue;
    result.push({ path: p, type: "file", size: t.size ?? 0 });
  }
  return result;
}

/** 任意のファイル全文を取得（master 基準） */
export async function getFileContent(path: string): Promise<{
  content: string;
  sha: string;
}> {
  const env = readEnv();
  const octo = buildClient(env);

  const res = await octo.rest.repos.getContent({
    owner: env.owner,
    repo: env.repo,
    path,
    ref: "master",
  });
  const data = res.data;
  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`getFileContent: ${path} はファイルではありません`);
  }
  // GitHub API は base64 で返す
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

/** ブランチ作成（fromBranch の最新 SHA から作る） */
export async function createBranch(
  branchName: string,
  fromBranch = "master",
): Promise<{ sha: string }> {
  const env = readEnv();
  const octo = buildClient(env);
  const ref = await octo.rest.git.getRef({
    owner: env.owner,
    repo: env.repo,
    ref: `heads/${fromBranch}`,
  });
  const sha = ref.data.object.sha;
  await octo.rest.git.createRef({
    owner: env.owner,
    repo: env.repo,
    ref: `refs/heads/${branchName}`,
    sha,
  });
  return { sha };
}

/**
 * 指定ブランチに 1ファイルをコミット。
 * 既存ファイルなら sha を取得して更新、なければ新規作成。
 */
export async function commitFile(
  branch: string,
  path: string,
  content: string,
  message: string,
): Promise<{ commitSha: string }> {
  const env = readEnv();
  const octo = buildClient(env);

  // 既存ファイルの SHA を取得（存在しない場合は無視）
  let existingSha: string | undefined;
  try {
    const res = await octo.rest.repos.getContent({
      owner: env.owner,
      repo: env.repo,
      path,
      ref: branch,
    });
    if (!Array.isArray(res.data) && res.data.type === "file") {
      existingSha = res.data.sha;
    }
  } catch {
    // 404 等は無視（新規作成）
  }

  const res = await octo.rest.repos.createOrUpdateFileContents({
    owner: env.owner,
    repo: env.repo,
    path,
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
    sha: existingSha,
  });

  return { commitSha: res.data.commit.sha ?? "" };
}

/** PR 作成（draft=true で下書き）。ラベル付与付き */
export async function createPullRequest(
  branch: string,
  title: string,
  body: string,
  draft = true,
  labels: string[] = ["ai-generated"],
): Promise<{ url: string; number: number }> {
  const env = readEnv();
  const octo = buildClient(env);

  const pr = await octo.rest.pulls.create({
    owner: env.owner,
    repo: env.repo,
    head: branch,
    base: "master",
    title,
    body,
    draft,
  });

  // ラベル付与（無ければ作成）
  if (labels.length > 0) {
    for (const label of labels) {
      try {
        await octo.rest.issues.getLabel({
          owner: env.owner,
          repo: env.repo,
          name: label,
        });
      } catch {
        try {
          await octo.rest.issues.createLabel({
            owner: env.owner,
            repo: env.repo,
            name: label,
            color: "8957e5",
            description: "AI が自動生成した PR",
          });
        } catch {
          // ラベル作成に失敗してもPR作成自体は継続
        }
      }
    }
    try {
      await octo.rest.issues.addLabels({
        owner: env.owner,
        repo: env.repo,
        issue_number: pr.data.number,
        labels,
      });
    } catch {
      // ラベル付与失敗も継続
    }
  }

  return { url: pr.data.html_url, number: pr.data.number };
}
