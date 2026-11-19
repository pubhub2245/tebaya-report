/**
 * スタッフ向け LINE Bot「手羽屋業務連絡」の、グループ向け処理の本体。
 *
 * app/api/line/webhook/route.ts から呼ばれる。倉庫（Supabase）への書き込み、
 * メンバープロフィール取得、返信の送出を「外から渡す」作りにして、テストでは
 * 本物の通信なしに動きを確かめられるようにしてある（customerWebhook と同じ設計）。
 *
 * ■ 大原則：push を一切使わない
 *   このBotは今月の無料枠を使い切っている可能性が高い。LINE は「相手からの発言への
 *   返信（reply）」は通数に数えないため、本ファイルでは replyToken を使う replyText
 *   だけを呼ぶ。push / multicast / broadcast は呼ばない（diagnose から呼ばれる既存の
 *   pushMessage は、ここからは呼ばない）。
 *
 * ■ やること
 *   - message（source.type==="group"）：未知グループなら line_groups に自動登録。
 *     is_active のグループなら line_group_messages に保存。送られてきたテキストが
 *     line_group_replies の keyword と完全一致すれば replyToken で返す。
 *   - join：line_groups に行を足して案内文を reply。
 *   - leave：line_groups の is_active を false に。
 *   - 1対1（source.type!=="group"）やそれ以外は、ここでは触らない（既存の挙動を壊さない）。
 *
 * ■ 「登録確認」は特別扱い
 *   「登録確認」と送られたら「このグループは記録中です（グループID：xxxx）」を reply。
 *   じゅんが動作確認に使う。会話のキーワードとは衝突しない固定語。
 *
 * ■ 「リンク」は特別扱い
 *   データベースから is_active なキーワードを集めて並べて reply する。
 *   「リンク」自体の reply_text は読まない（列は人向けの説明として置いてある）。
 */

export type LineGroupRow = {
  group_id: string;
  label: string | null;
  is_active: boolean;
};

export type LineGroupMessageRow = {
  group_id: string;
  group_label: string | null;
  user_id: string | null;
  display_name: string | null;
  message_type: string;
  text: string | null;
  line_message_id: string | null;
  raw: unknown;
};

export type LineGroupReplyRow = {
  group_id: string | null;
  keyword: string;
  reply_text: string;
  sort_order: number;
};

export type GroupWebhookDeps = {
  /** 署名検証はルート側でやる前提。ここには合言葉を渡さない */

  /** 既存の line_groups から1行取る（無ければ null） */
  getGroup: (groupId: string) => Promise<LineGroupRow | null>;

  /** 未知グループを自動登録する */
  insertGroup: (groupId: string) => Promise<void>;

  /** グループが退出したときに印を倒す */
  deactivateGroup: (groupId: string) => Promise<void>;

  /** 会話を1行記録する。line_message_id の unique 違反は飲み込んで true を返す */
  saveMessage: (row: LineGroupMessageRow) => Promise<{ saved: boolean }>;

  /** そのグループで有効なキーワード一覧（group_id 一致 と null の合流・is_active のみ） */
  listActiveReplies: (groupId: string) => Promise<LineGroupReplyRow[]>;

  /** 表示名を取る。取れなくても例外は投げない（取れなかったら null） */
  getDisplayName?: (groupId: string, userId: string) => Promise<string | null>;

  /** replyToken で返信する。push は絶対に呼ばない */
  replyText: (replyToken: string, text: string) => Promise<boolean>;

  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
};

export type GroupWebhookResult = {
  processed: number;
  /** 動作確認用の簡単な内訳 */
  details: Array<
    | { kind: "saved"; group_id: string; line_message_id: string | null }
    | { kind: "replied"; group_id: string; keyword: string }
    | { kind: "joined"; group_id: string }
    | { kind: "left"; group_id: string }
    | { kind: "skipped"; reason: string }
  >;
};

/** テキスト以外のメッセージを、記録に残す用の短い印に変える */
export function summarizeGroupMessage(message: any): {
  type: string;
  text: string | null;
} {
  const type = String(message?.type ?? "unknown");
  if (type === "text") {
    return { type, text: String(message.text ?? "") };
  }
  return { type, text: null };
}

/**
 * 「リンク」の返信文を組み立てる。
 * 自分自身（「リンク」）は除き、is_active のキーワードを sort_order 順に並べる。
 */
export function formatLinkListReply(replies: LineGroupReplyRow[]): string {
  const sorted = [...replies]
    .filter((r) => r.keyword !== "リンク")
    .sort((a, b) => a.sort_order - b.sort_order || a.keyword.localeCompare(b.keyword));
  const header = "送れる言葉の一覧：";
  if (sorted.length === 0) {
    return header + "\n（まだ登録されていません）";
  }
  return header + "\n" + sorted.map((r) => `・${r.keyword}`).join("\n");
}

/**
 * 1件のイベントを処理する。
 */
async function handleOneEvent(
  event: any,
  deps: GroupWebhookDeps,
  result: GroupWebhookResult,
): Promise<void> {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;

  const type = String(event?.type ?? "");
  const source = event?.source ?? {};

  // グループ向けの処理だけをここで扱う。1対1（user）は呼び出し側で処理する
  if (source?.type !== "group") {
    result.details.push({ kind: "skipped", reason: `not_group:${source?.type ?? "unknown"}` });
    return;
  }

  const groupId = String(source.groupId ?? "");
  if (!groupId) {
    result.details.push({ kind: "skipped", reason: "missing_group_id" });
    return;
  }

  switch (type) {
    case "join": {
      log(`[LINE Group] 参加: ${groupId}`);
      await deps.insertGroup(groupId);
      // ★ push ではなく reply で返す
      const token: string | undefined = event?.replyToken;
      if (token) {
        await deps.replyText(
          token,
          "記録Botです。『マニュアル』『リンク』と送ると案内を返します。",
        );
      }
      result.details.push({ kind: "joined", group_id: groupId });
      return;
    }

    case "leave": {
      log(`[LINE Group] 退出: ${groupId}`);
      await deps.deactivateGroup(groupId);
      result.details.push({ kind: "left", group_id: groupId });
      return;
    }

    case "message": {
      // 1) グループを把握する（未知なら自動登録）
      let group = await deps.getGroup(groupId);
      if (!group) {
        await deps.insertGroup(groupId);
        group = await deps.getGroup(groupId);
      }
      if (group && !group.is_active) {
        // leave 済みのグループに来た古いイベント。保存も返信もしない
        result.details.push({ kind: "skipped", reason: "group_inactive" });
        return;
      }

      // 2) 表示名を取る（失敗しても続ける）
      const userId: string | null = source?.userId ?? null;
      let displayName: string | null = null;
      if (userId && deps.getDisplayName) {
        try {
          displayName = await deps.getDisplayName(groupId, userId);
        } catch (err: any) {
          logError("[LINE Group] 表示名の取得に失敗:", err?.message || err);
        }
      }

      // 3) 保存（line_message_id で二重保存を防ぐ）
      const msg = event.message ?? {};
      const summary = summarizeGroupMessage(msg);
      const lineMessageId: string | null = msg?.id ? String(msg.id) : null;
      const row: LineGroupMessageRow = {
        group_id: groupId,
        group_label: group?.label ?? null,
        user_id: userId,
        display_name: displayName,
        message_type: summary.type,
        text: summary.text,
        line_message_id: lineMessageId,
        raw: event,
      };
      const saveResult = await deps.saveMessage(row);
      result.details.push({
        kind: "saved",
        group_id: groupId,
        line_message_id: lineMessageId,
      });
      if (!saveResult.saved) {
        // 二重保存は正常系なので、ここでは返信は続ける
        log(`[LINE Group] 既に保存済み（line_message_id=${lineMessageId}）`);
      }

      // 4) キーワード判定（テキスト・完全一致のみ）
      if (summary.type !== "text" || summary.text == null) return;
      const token: string | undefined = event?.replyToken;
      if (!token) return;

      const sentText = summary.text;

      // 「登録確認」は特別扱い。じゅんの動作確認用に固定の文面を返す
      if (sentText === "登録確認") {
        await deps.replyText(
          token,
          `このグループは記録中です（グループID：${groupId}）`,
        );
        result.details.push({ kind: "replied", group_id: groupId, keyword: sentText });
        return;
      }

      const replies = await deps.listActiveReplies(groupId);

      // 「リンク」も特別扱い。登録済みキーワードから一覧を組み立てる
      if (sentText === "リンク") {
        const text = formatLinkListReply(replies);
        await deps.replyText(token, text);
        result.details.push({ kind: "replied", group_id: groupId, keyword: sentText });
        return;
      }

      // 通常のキーワード完全一致
      const match = replies.find((r) => r.keyword === sentText);
      if (match) {
        await deps.replyText(token, match.reply_text);
        result.details.push({ kind: "replied", group_id: groupId, keyword: sentText });
      }
      return;
    }

    default:
      result.details.push({ kind: "skipped", reason: `unhandled_type:${type}` });
      return;
  }
}

/**
 * グループ向けイベントの処理本体。1対1は呼び出し側で先に捌く前提。
 */
export async function handleGroupEvents(
  events: any[],
  deps: GroupWebhookDeps,
): Promise<GroupWebhookResult> {
  const result: GroupWebhookResult = { processed: 0, details: [] };
  const logError = deps.logError ?? console.error;

  for (const event of events) {
    try {
      await handleOneEvent(event, deps, result);
      result.processed++;
    } catch (err: any) {
      logError(
        `[LINE Group] イベント処理エラー (${event?.type}):`,
        err?.message || err,
      );
    }
  }
  return result;
}
