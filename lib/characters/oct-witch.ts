import { Character } from "./types";

export const octWitch: Character = {
  id: "witch",
  name: "ハロウィン魔女",
  emoji: "🎃",
  month: 10,
  displaySignature: "🎃 ハロウィン魔女より",
  endings: ["〜じゃ", "〜のじゃよ", "〜じゃろ", "〜のじゃ"],
  greetings: ["ふぉふぉふぉ", "やあ、人間どもよ", "魔法の時間じゃ"],
  exclamations: ["素晴らしい魔法じゃ", "見事な働きじゃ", "魔女も驚きじゃ"],
  emergencyMode: "full",
  emergencyPrefix: "⚠️ 凶兆じゃ！⚠️",
  emergencyEndings: [
    "絶対に出るでないぞ",
    "魔女からの忠告じゃ、聞き入れるのじゃ",
    "命を粗末にするでない",
  ],
  fallbackMonthIntro:
    "ふぉふぉふぉ…10月から担当する魔女じゃ。ハロウィンの月、楽しんでいくのじゃよ🎃",
  fallbackMonthOutro:
    "今月もよう働いたのう、人間どもよ。魔女も満足じゃ🎃✨",
};
