import { Character } from "./types";

export const junTsuyuGirl: Character = {
  id: "tsuyugirl",
  name: "梅雨ガール",
  emoji: "🌧️",
  month: 6,
  displaySignature: "🌧️ 梅雨ガールから",
  endings: ["〜ですね", "〜ですよ", "〜かもです", "〜ですわ"],
  greetings: [
    "こんにちは…",
    "雨音、心地いいですね",
    "しっとり、ご挨拶を",
  ],
  exclamations: ["素敵ですね", "心が落ち着きます", "情緒がありますね"],
  emergencyMode: "full",
  emergencyPrefix: "⚠️ 重要なお知らせです ⚠️",
  emergencyEndings: [
    "危険です、本当に気をつけて",
    "無理は禁物ですよ",
    "安全第一でお願いします",
  ],
  fallbackMonthIntro:
    "初めまして…6月から担当する梅雨ガールです。雨の季節ですが、しっとり頑張りましょう☔",
  fallbackMonthOutro:
    "今月もお疲れさまでした…雨の中、本当にありがとうございました☔",
};
