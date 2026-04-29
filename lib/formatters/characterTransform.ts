import { Character, TransformContext } from "../characters/types";
import { getCurrentCharacter } from "../characters";

const pickRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

/**
 * 通知文をキャラクターの「気配」（挨拶・語尾・署名）で包んで返す。
 * 文末の機械的な置換は誤変換リスクが高いため、署名・前後の挨拶で雰囲気を出す方式。
 */
export const transformWithCharacter = (
  baseMessage: string,
  character: Character | null,
  context: TransformContext = {},
): string => {
  if (!character) return baseMessage;

  const isEmergency = context.isEmergency === true;

  if (isEmergency) {
    const prefix = character.emergencyPrefix;
    const ending = pickRandom(character.emergencyEndings);
    return `${prefix}\n\n${baseMessage}\n\n${ending}\n\n${character.displaySignature}`;
  }

  const greeting = pickRandom(character.greetings);
  const ending = pickRandom(character.endings);
  return `${character.displaySignature}\n\n${greeting}！\n${baseMessage}\n\n${ending}`;
};

/** 現在月のキャラで自動変換するショートカット */
export const transformWithCurrentCharacter = (
  baseMessage: string,
  context: TransformContext = {},
): string => {
  const character = getCurrentCharacter();
  return transformWithCharacter(baseMessage, character, context);
};
