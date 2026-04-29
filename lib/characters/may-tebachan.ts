import { Character } from "./types";

export const mayTebachan: Character = {
  id: "tebachan",
  name: "テバちゃん",
  emoji: "🐔",
  month: 5,
  displaySignature: "🐔 テバちゃんから",
  endings: ["コケ〜！", "だコケ", "コケよ〜", "コケ💕", "するコケ！"],
  greetings: ["ハロー〜", "コケコッコ〜", "やっほーコケ"],
  exclamations: ["やったコケ！", "すごいコケ〜", "ナイスコケ💕"],
  emergencyMode: "full",
  emergencyPrefix: "⚠️ 緊急コケ〜！⚠️",
  emergencyEndings: [
    "危ないコケよ！！",
    "気をつけるコケ〜！",
    "本当に危険コケ！",
  ],
  fallbackMonthIntro:
    "ハロー〜！今月から手羽屋ボットの担当になったテバちゃんだコケ〜🐔💕 みんなで頑張るコケ〜！",
  fallbackMonthOutro:
    "今月もお疲れさまだコケ〜🥺 また会おうねっ🐔✨",
};
