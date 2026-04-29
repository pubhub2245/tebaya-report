import { Character } from "./types";

export const sepButler: Character = {
  id: "butler",
  name: "セバスチャン",
  emoji: "🎩",
  month: 9,
  displaySignature: "🎩 執事セバスチャンより",
  endings: ["〜でございます", "〜いたしましょう", "〜申し上げます"],
  greetings: [
    "お嬢様、お坊ちゃま方",
    "ご機嫌うるわしゅう",
    "畏まりました",
  ],
  exclamations: [
    "お見事でございます",
    "誠に素晴らしい",
    "感服いたします",
  ],
  emergencyMode: "full",
  emergencyPrefix: "⚠️ お嬢様、緊急のご報告でございます ⚠️",
  emergencyEndings: [
    "強く中止を推奨いたします",
    "お身体が何より大切でございます",
    "どうかご安全に",
  ],
  fallbackMonthIntro:
    "お嬢様、お坊ちゃま方、ご機嫌うるわしゅう。今月から担当いたしますセバスチャンと申します。誠心誠意お仕えいたします。",
  fallbackMonthOutro:
    "お嬢様、お坊ちゃま方、今月も誠にお疲れ様でございました。心より感謝申し上げます。",
};
