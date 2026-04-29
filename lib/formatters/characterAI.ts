import Anthropic from "@anthropic-ai/sdk";
import { Character } from "../characters/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 600;
const TEMPERATURE = 0.8;

export type MonthlyTarget = {
  shiftCount: number;
  totalSalesTarget: number;
};

export type MonthlyResult = {
  totalSales: number;
  totalReports: number;
  totalTarget: number;
  achievementRate: number;
  team1Sales: number;
  team1Reports: number;
  team2Sales: number;
  team2Reports: number;
  otherSales: number;
  otherReports: number;
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
  const praise = result.achievementRate >= 90;
  const userPrompt = [
    `${character.month}月最終日の業務LINEに、あなたの月末成果報告とお別れの挨拶を投稿してください。`,
    "",
    "【今月の実績データ】",
    `・合計売上: ${yen(result.totalSales)}`,
    `・出店件数: ${result.totalReports}件`,
    `・月間目標: ${yen(result.totalTarget)}`,
    `・達成率: ${result.achievementRate}%`,
    "",
    "【番隊別】",
    `・1番隊: ${yen(result.team1Sales)} / ${result.team1Reports}件`,
    `・2番隊: ${yen(result.team2Sales)} / ${result.team2Reports}件`,
    `・応援/その他: ${yen(result.otherSales)} / ${result.otherReports}件`,
    "",
    "【メッセージに含めること】",
    "- 今月の合計売上と達成率を伝える",
    "- 1番隊・2番隊（応援/その他がいれば）の働きを番隊単位で振り返る",
    praise
      ? "- 達成率が90%以上なので、しっかり褒めて喜びを表現する"
      : "- 達成率が90%未満なので、淡々と数字を伝える（過剰な励ましや謝罪は不要、お疲れさまの感謝は入れる）",
    "- 翌月から別のキャラに交代することへの簡潔なお別れ",
    "- キャラらしい温かい締めくくり",
  ].join("\n");

  const text = await callAnthropic(buildSystemPrompt(character), userPrompt);
  return text ?? character.fallbackMonthOutro;
};
