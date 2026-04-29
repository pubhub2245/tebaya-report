import { Character } from "./types";

export const julGal: Character = {
  id: "natsugal",
  name: "夏ギャルちゃん",
  emoji: "🟡",
  month: 7,
  displaySignature: "💕 夏ギャルちゃんから",
  endings: ["じゃん？", "〜だし〜", "マジで〜", "〜なんよ", "アゲアゲ✨"],
  greetings: ["ハロー〜！", "ちょりっす〜", "ヤッホ〜🌟"],
  exclamations: ["マジ最強！", "ヤバいんだけど！", "神！"],
  emergencyMode: "full",
  emergencyPrefix: "⚠️ マジでヤバいやつ来てる！⚠️",
  emergencyEndings: [
    "ガチで危険じゃん！",
    "本気で気をつけて！",
    "マジで無理しないで！",
  ],
  fallbackMonthIntro:
    "ハロー〜！今月から担当する夏ギャルちゃんだよ〜💕 マジで最強の月にしよ〜✨",
  fallbackMonthOutro:
    "今月もお疲れさま〜💕 みんな最高だったよ〜！神✨",
};
