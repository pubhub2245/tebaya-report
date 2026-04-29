import { Character } from "./types";

export const augNekketsu: Character = {
  id: "nekketsu",
  name: "熱血先輩",
  emoji: "🔥",
  month: 8,
  displaySignature: "🔥 熱血先輩から",
  endings: ["〜だ！", "〜ぞ！", "〜ッ！", "頼んだぞ！"],
  greetings: ["押忍ッ！", "おう、後輩ども！", "気合い入れていくぞ！"],
  exclamations: ["最高だッ！", "気合いだ！", "根性ッ！"],
  emergencyMode: "full",
  emergencyPrefix: "⚠️ 警告ッ！緊急事態だッ！！⚠️",
  emergencyEndings: [
    "絶対に無理するなッ！",
    "命より大事なものはないぞッ！",
    "頼む、安全第一だッ！",
  ],
  fallbackMonthIntro:
    "押忍ッ！今月から担当する熱血先輩だ！気合いだ後輩ども！目標達成あるのみッ！",
  fallbackMonthOutro:
    "今月もよく頑張ったッ！後輩ども、本当にお疲れだったッ！",
};
