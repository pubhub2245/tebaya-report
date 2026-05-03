/**
 * Gmail からじゅんさん→大田原さん宛ての出店希望メールを取得する。
 *
 * クエリ仕様:
 *   from:tebaya1222@gmail.com to:food-assistant@m-nagayama.co.jp newer_than:6m
 *
 * 戻り値:
 *   {
 *     id, threadId, subject, from, to, date,
 *     plaintextBody, snippet
 *   }[]
 *
 * エラーハンドリング:
 *   - トークン期限切れ → getAuthedClient が refresh
 *   - リフレッシュ失敗 → 例外（呼び出し元で再認証 UI へ誘導）
 *   - Rate limit (429) → 指数バックオフで最大 3 回リトライ
 */

import { google, type gmail_v1 } from "googleapis";
import { getAuthedClient, PRIMARY_GMAIL_USER } from "./oauth";

const FROM_ADDRESS = "tebaya1222@gmail.com";
const TO_ADDRESS = "food-assistant@m-nagayama.co.jp";

export interface EmailMessage {
  id: string;
  threadId: string | null;
  subject: string;
  from: string;
  to: string;
  date: string; // RFC 2822 / received date
  plaintextBody: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function buildQuery(months: number): string {
  return `from:${FROM_ADDRESS} to:${TO_ADDRESS} newer_than:${months}m`;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === lower);
  return h?.value ?? "";
}

/**
 * payload を再帰的に走査して text/plain の本文を抽出。
 * 複数 text/plain がある場合は連結（通常は1つだけ）。
 */
function extractPlaintext(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  const collected: string[] = [];
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (
      part.mimeType === "text/plain" &&
      part.body?.data
    ) {
      const buf = Buffer.from(part.body.data, "base64url");
      collected.push(buf.toString("utf8"));
    }
    if (part.parts && part.parts.length > 0) {
      for (const sub of part.parts) walk(sub);
    }
  };
  walk(payload);
  // text/plain が見つからなかった場合は body.data から拾えるか試す
  if (collected.length === 0 && payload.body?.data) {
    const buf = Buffer.from(payload.body.data, "base64url");
    collected.push(buf.toString("utf8"));
  }
  return collected.join("\n");
}

/** 429 / 5xx は指数バックオフでリトライ */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status ?? err?.code;
      if (status !== 429 && !(typeof status === "number" && status >= 500)) {
        throw err; // リトライしない
      }
      lastErr = err;
      const delay = 500 * Math.pow(2, attempt); // 500ms, 1000ms, 2000ms
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

export async function fetchRequestEmails(opts?: {
  months?: number;
  userEmail?: string;
}): Promise<EmailMessage[]> {
  const months = opts?.months ?? 6;
  const userEmail = opts?.userEmail ?? PRIMARY_GMAIL_USER;
  const auth = await getAuthedClient(userEmail);
  const gmail = google.gmail({ version: "v1", auth });
  const query = buildQuery(months);

  // 1. ID 一覧を取得（pagination 対応）
  const ids: string[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const res: gmail_v1.Schema$ListMessagesResponse = (await withRetry(() =>
      gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 100,
        pageToken,
      }),
    )).data;
    for (const m of res.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = res.nextPageToken ?? undefined;
  } while (pageToken);

  if (ids.length === 0) return [];

  // 2. 各メッセージの本文を取得
  const messages: EmailMessage[] = [];
  for (const id of ids) {
    const res: gmail_v1.Schema$Message = (await withRetry(() =>
      gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      }),
    )).data;

    const headers = res.payload?.headers;
    const plaintextBody = extractPlaintext(res.payload);

    messages.push({
      id: res.id ?? id,
      threadId: res.threadId ?? null,
      subject: getHeader(headers, "Subject"),
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      date: getHeader(headers, "Date"),
      plaintextBody,
      snippet: res.snippet ?? "",
    });
  }

  // 日付降順（新しい順）
  messages.sort((a, b) => {
    const da = Date.parse(a.date);
    const db = Date.parse(b.date);
    if (Number.isNaN(da) && Number.isNaN(db)) return 0;
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return db - da;
  });

  return messages;
}

// ---------------------------------------------------------------------------
// 単一メッセージ取得（API ルートから messageId 指定で呼ぶ用）
// ---------------------------------------------------------------------------

export async function fetchOneMessage(
  messageId: string,
  userEmail: string = PRIMARY_GMAIL_USER,
): Promise<EmailMessage | null> {
  const auth = await getAuthedClient(userEmail);
  const gmail = google.gmail({ version: "v1", auth });
  const res = await withRetry(() =>
    gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    }),
  );
  const data = res.data;
  if (!data || !data.id) return null;
  const headers = data.payload?.headers;
  return {
    id: data.id,
    threadId: data.threadId ?? null,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    date: getHeader(headers, "Date"),
    plaintextBody: extractPlaintext(data.payload),
    snippet: data.snippet ?? "",
  };
}

// ---------------------------------------------------------------------------
// テスト用 export（純関数のみ）
// ---------------------------------------------------------------------------

/** 検索クエリ生成（テスト用に export） */
export function _buildQueryForTest(months: number): string {
  return buildQuery(months);
}
