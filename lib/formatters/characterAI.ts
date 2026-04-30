import Anthropic from "@anthropic-ai/sdk";
import { Character } from "../characters/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
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
  // 中止・休業日（強風・雨等）— 悔しさを表現する文脈
  canceledDays?: string[];
  // 出店数不足の構造的課題メッセージ（既に整形済の自然文）
  storeShortageMessage?: string;
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
  const lines: string[] = [
    `${character.month}月最終日の業務LINEに、あなたの月末成果報告とお別れの挨拶を投稿してください。`,
    "",
    "【今月の実績データ】",
    `・合計売上: ${yen(result.totalSales)}`,
    `・出店件数: ${result.totalReports}件`,
    `・実出店分の店舗目標合計: ${yen(result.totalTarget)}`,
    `・実出店分の達成率: ${result.achievementRate}%`,
  ];

  if (hasShiftTarget) {
    lines.push(
      `・月間トータル目標（シフト全体）: ${yen(result.shiftMonthlyTarget!)}`,
      `・月間トータル達成率: ${result.shiftAchievementRate ?? 0}%`,
      `・目標まで足りなかった金額: ${yen(result.shortfallAmount ?? 0)}`,
    );
  }
  lines.push(
    "",
    "【番隊別】",
    `・1番隊: ${yen(result.team1Sales)} / ${result.team1Reports}件`,
    `・2番隊: ${yen(result.team2Sales)} / ${result.team2Reports}件`,
    `・応援/その他: ${yen(result.otherSales)} / ${result.otherReports}件`,
  );

  if (result.canceledDays && result.canceledDays.length > 0) {
    lines.push(
      "",
      "【中止・惜しかった日】",
      ...result.canceledDays.map((d) => `・${d}`),
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
    "【メッセージに必ず含める内容（5つ全て触れる）】",
    "1. 実出店分の店舗目標は達成（or どの程度の数字だったか）— 出店した日の頑張りはしっかり祝う",
    hasShiftTarget
      ? `2. 月間トータル目標 ${yen(result.shiftMonthlyTarget!)} には ${yen(result.shortfallAmount ?? 0)} 届かず、月間達成率は ${result.shiftAchievementRate ?? 0}% だったことを誠実に伝える（隠さない）`
      : "2. 月間目標との差については触れなくてよい",
    result.canceledDays && result.canceledDays.length > 0
      ? `3. 中止になった日（${result.canceledDays.join("・")}）への悔しさ・天候への言及`
      : "3. 中止日の言及は不要",
    result.requiredMonthlyReports && result.requiredMonthlyReports > 0
      ? `4. 【最重要・絶対に薄めない】業務メッセージ：月間目標達成のためには、平均単価¥${(result.averageUnitPrice ?? 0).toLocaleString()}/件を維持しつつ「月の総出店数」を約${result.requiredMonthlyReports}件規模にする必要がある。今月は${result.totalReports}件だったので、月間規模としては${result.monthlyScaleGap ?? 0}件くらい増やしたい、というニュアンスを必ず含める。出店日を増やすには仲間（働いてくれる人）を早く集めるのが鍵、を採用の真剣な提言として伝える（祝勝ムード一色にしない）`
      : "4. 【最重要】出店数を増やすために仲間（人手）を早く集めることを真剣に提言する",
    "5. 翌月キャラへのバトンタッチ＋自分らしい締めくくり",
    "",
    "【絶対に使わない表現（禁止語）】",
    "- 「あと◯件出店すれば達成」「あと◯件追加すれば届いた」のような、現状のシフト総額に上乗せして達成する発想の表現は絶対に使わない。",
    "  → 理由：シフトを追加で組むと shifts.target も連動して上がるため、追加してもまた未達になる。業務的に意味のないメッセージになるので避ける。",
    "- 必ず「月の総出店規模を◯件にする必要がある」「月◯件規模を目指す」という、月の総出店数の話として伝える。",
    "",
    "【トーン指示】",
    "- 祝勝ムード一色にしない。「出店した分はやれた」「全体としては足りない、月の出店規模を増やすには人を集めないと」をセットで語る",
    "- キャラの軽さ・絵文字・語尾は維持しつつ、業務的な真剣さを織り込む",
    "- 文章は500〜700文字程度（5つの要素を全部入れるためやや長め可）",
    "- 説教臭くならず、仲間に語りかけるトーン",
  );

  const userPrompt = lines.join("\n");
  const text = await callAnthropic(buildSystemPrompt(character), userPrompt);
  return text ?? character.fallbackMonthOutro;
};
