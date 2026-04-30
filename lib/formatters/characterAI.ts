import Anthropic from "@anthropic-ai/sdk";
import { Character } from "../characters/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2200;
const TEMPERATURE = 0.8;

export type MonthlyTarget = {
  shiftCount: number;
  totalSalesTarget: number;
};

export type MonthlyResult = {
  totalSales: number;
  totalReports: number;
  totalTarget: number;          // 実出店した店舗のtarget合計（locations.target × visits）
  achievementRate: number;       // totalSales / totalTarget
  team1Sales: number;
  team1Reports: number;
  team2Sales: number;
  team2Reports: number;
  otherSales: number;
  otherReports: number;
  // 月間目標（shift合計）— 全月の目標。届いていない金額・達成率の計算に使う
  shiftMonthlyTarget?: number;
  shiftAchievementRate?: number;
  shortfallAmount?: number;
  // 月間規模感（採用必要性のメッセージング用）
  averageUnitPrice?: number;        // ¥/件
  requiredMonthlyReports?: number;  // 月間目標達成に必要な月総出店数
  monthlyScaleGap?: number;         // 必要 - 実績（差分件数）
  // 実稼働ベース（中止日除外）の達成率
  actualShiftTargetSum?: number;     // 実出店日の shifts.target 合計
  actualAchievementRate?: number;    // totalSales / actualShiftTargetSum
  canceledTargetSum?: number;        // 中止日の目標合計
  // 中止・休業日（強風・雨等）— 悔しさを表現する文脈
  canceledDays?: string[];
  // 出店数不足の構造的課題メッセージ（既に整形済の自然文）
  storeShortageMessage?: string;
  // 店舗別ランク見直し提言（達成率<90%）
  storesNeedReview?: Array<{
    store: string;
    current_rank: string;
    suggested_rank: string;
    achievement_rate: number;
    avg_per_visit: number;
    count: number;
  }>;
  // 現状維持OK（達成率≥100%）
  storesOk?: Array<{
    store: string;
    current_rank: string;
    achievement_rate: number;
    avg_per_visit: number;
    count: number;
  }>;
};

const yen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");

const buildSystemPrompt = (character: Character): string => {
  return [
    `あなたは「${character.name}」というキャラクターです。`,
    `絵文字: ${character.emoji}`,
    `署名（必ず冒頭に入れる）: ${character.displaySignature}`,
    `語尾サンプル: ${character.endings.join(" / ")}`,
    `挨拶サンプル: ${character.greetings.join(" / ")}`,
    "",
    "【絶対ルール】",
    "- 200〜400文字程度の自然な日本語LINEメッセージを生成する",
    "- 個人名（じゅん・イデ・かずき・なぎさ等）は絶対に出さない。番隊単位（1番隊・2番隊・応援/その他）でのみ言及する",
    "- キャラの語尾と絵文字を必ず使い、キャラ性を強く出す",
    "- 冒頭に上記の「署名」を必ず入れる",
    "- メッセージ本文以外の説明・前置き・後書きは絶対に書かない（生成した文章をそのままLINEに送るため）",
    "- マークダウン記法（**太字**、# 見出し等）は使わない（LINEはプレーンテキストのため）",
    "- 暴言・差別表現・下品な言葉は禁止",
  ].join("\n");
};

const callAnthropic = async (
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[characterAI] ANTHROPIC_API_KEY 未設定");
    return null;
  }
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = res.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim();
    return text || null;
  } catch (e: any) {
    console.error("[characterAI] AI呼び出し失敗:", e?.message || e);
    return null;
  }
};

/** 月初挨拶（新キャラの就任挨拶） */
export const generateMonthIntroMessage = async (
  character: Character,
  target: MonthlyTarget,
): Promise<string> => {
  const userPrompt = [
    `${character.month}月の業務LINEに、あなたの就任挨拶を投稿してください。`,
    "",
    "【今月の予定データ】",
    `・出店件数（シフト確定済）: ${target.shiftCount}件`,
    `・月間売上目標合計: ${yen(target.totalSalesTarget)}`,
    "",
    "【メッセージに含めること】",
    "- 自分が今月から担当することの自己紹介（短く）",
    "- 今月の出店件数と売上目標に軽く触れて、達成に向けた応援メッセージ",
    "- 1番隊・2番隊（応援/その他がいれば）への呼びかけ",
    "- キャラらしい元気な締めくくり",
  ].join("\n");

  const text = await callAnthropic(buildSystemPrompt(character), userPrompt);
  return text ?? character.fallbackMonthIntro;
};

/** 月末成果報告＋お別れ */
export const generateMonthOutroMessage = async (
  character: Character,
  result: MonthlyResult,
): Promise<string> => {
  const hasShiftTarget =
    typeof result.shiftMonthlyTarget === "number" &&
    result.shiftMonthlyTarget > 0;
  const hasActualTarget =
    typeof result.actualShiftTargetSum === "number" &&
    result.actualShiftTargetSum > 0;
  const lines: string[] = [
    `${character.month}月最終日の業務LINEに、あなたの月末成果報告とお別れの挨拶を投稿してください。`,
    "",
    "【今月の実績データ】",
    `・合計売上: ${yen(result.totalSales)}`,
    `・出店件数: ${result.totalReports}件`,
  ];

  if (hasShiftTarget) {
    lines.push(
      "",
      "【指標B：月間トータル達成率（中止日含む全シフト目標ベース）】",
      `・月間トータル目標: ${yen(result.shiftMonthlyTarget!)}`,
      `・達成率: ${result.shiftAchievementRate ?? 0}%`,
      `・足りなかった金額: ${yen(result.shortfallAmount ?? 0)}`,
    );
  }

  if (hasActualTarget) {
    lines.push(
      "",
      "【指標A：実出店日達成率（中止日を除外した実稼働ベース）】",
      `・実出店日のシフト目標合計: ${yen(result.actualShiftTargetSum!)}`,
      `・実出店日達成率: ${result.actualAchievementRate ?? 0}%`,
    );
  }

  if (result.canceledDays && result.canceledDays.length > 0) {
    lines.push(
      "",
      "【中止・惜しかった日】",
      ...result.canceledDays.map((d) => `・${d}`),
    );
    if (typeof result.canceledTargetSum === "number") {
      lines.push(`・中止日の目標合計: ${yen(result.canceledTargetSum)}`);
    }
  }

  if (result.storesNeedReview && result.storesNeedReview.length > 0) {
    lines.push(
      "",
      "【ランク見直しが必要な店舗（達成率90%未満）】",
      ...result.storesNeedReview.map(
        (s) =>
          `・${s.store}：現${s.current_rank}ランク / 達成率${s.achievement_rate}% / 平均${yen(s.avg_per_visit)}/件 → 推奨${s.suggested_rank}`,
      ),
    );
  }

  if (result.storesOk && result.storesOk.length > 0) {
    lines.push(
      "",
      "【現状維持OKな店舗（達成率100%以上）】",
      ...result.storesOk.map(
        (s) =>
          `・${s.store}：${s.current_rank}ランク / 達成率${s.achievement_rate}% / 平均${yen(s.avg_per_visit)}/件`,
      ),
    );
  }

  if (result.storeShortageMessage) {
    lines.push(
      "",
      "【出店数の構造的課題】",
      result.storeShortageMessage,
    );
  }

  lines.push(
    "",
    "【メッセージに必ず含める内容（6セクション、すべて触れる）】",
    `1. 4月の総括：合計売上${yen(result.totalSales)}、${result.totalReports}件の出店について軽く振り返る`,
    hasShiftTarget && hasActualTarget
      ? `2. 【誠実な達成率報告】2つの達成率を両方語る：(B)月間トータル目標${yen(result.shiftMonthlyTarget!)}に対し達成率${result.shiftAchievementRate ?? 0}%、(A)中止日除外の実稼働ベースでも目標${yen(result.actualShiftTargetSum!)}に対し達成率${result.actualAchievementRate ?? 0}%。「両方とも未達、実稼働でも伸び代がある」と誠実に伝える`
      : "2. 達成率を誠実に伝える",
    result.canceledDays && result.canceledDays.length > 0
      ? `3. 中止2日（${result.canceledDays.join("・")}）の影響を補足程度に触れる。「あの2日が痛かった」ニュアンスで軽くだけ。「中止が主因」とは絶対に語らない（実際は店舗別の問題が大きい）`
      : "3. 中止日の言及は不要",
    result.storesNeedReview && result.storesNeedReview.length > 0
      ? `4. 【新・重要】店舗別ランク見直し提言：達成率が低い店舗を3つほど名指しで具体的に語る（個人攻撃ではなく店舗としての評価）。例：「マンガ倉庫都城店は現Bランクだけど達成率57%、平均¥27,000/件だから推奨D未満が現実的」など。一方で頑張っている店舗（${(result.storesOk || []).map((s) => s.store).join("・") || "達成率100%超え店舗"}）は具体的に讃える。「5月のシフト組む時、ランク見直しを真剣に考えたい」と提言する`
      : "4. 店舗別の状況に触れる",
    result.requiredMonthlyReports && result.requiredMonthlyReports > 0
      ? `5. 【最重要・絶対に薄めない】業務メッセージ：月間目標達成のためには、平均単価¥${(result.averageUnitPrice ?? 0).toLocaleString()}/件を維持しつつ「月の総出店数」を約${result.requiredMonthlyReports}件規模にする必要がある。今月は${result.totalReports}件だったので、月間規模としては${result.monthlyScaleGap ?? 0}件くらい増やしたい、というニュアンスを必ず含める。出店日を増やすには仲間（働いてくれる人）を早く集めるのが鍵、を採用の真剣な提言として伝える`
      : "5. 採用の必要性を真剣に提言する",
    "6. 翌月キャラへのバトンタッチ＋ハニーらしい春爛漫キャラの締めくくり",
    "",
    "【絶対に使わない表現（禁止語）】",
    "- 「マジ蜜レベル」「100%超え」「達成率100%以上」など、実出店分が達成したかのような祝勝表現は絶対に使わない。実出店日でも未達であることを明確に伝える。",
    "- 「あと◯件出店すれば達成」「あと◯件追加すれば届いた」のような、現状のシフト総額に上乗せして達成する発想の表現は絶対に使わない。シフトを追加で組むと目標も連動して上がるため誤り。",
    "- 必ず「月の総出店規模を◯件にする必要がある」「月◯件規模を目指す」という、月の総出店数の話として伝える。",
    "- ランク見直しの話で、担当者個人を批判するような表現は絶対に避ける。あくまで「店舗としての評価」として語る。",
    "",
    "【トーン指示】",
    "- 春爛漫ハイテンションギャル「ブンブン〜🐝」「だぁ〜♡」「マジで〜」「〜じゃん」を維持",
    "- ただし76%・70.4%という未達数字を「正直に・伸び代あり」と語る誠実なトーン",
    "- ランク見直しの話は具体的・建設的に（店舗としての評価で、担当者個人を責めない）",
    "- ミツバチ絵文字🐝、ハート💛、キラキラ✨、はちみつ🍯は維持",
    "- 全体で700〜1000文字（情報量が増えるので長めOK）",
    "- 説教臭くならず、仲間に語りかけるトーン",
  );

  const userPrompt = lines.join("\n");
  const text = await callAnthropic(buildSystemPrompt(character), userPrompt);
  return text ?? character.fallbackMonthOutro;
};
