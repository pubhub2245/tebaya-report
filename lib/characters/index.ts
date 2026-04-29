import { Character } from "./types";
import { mayTebachan } from "./may-tebachan";
import { junTsuyuGirl } from "./jun-tsuyu-girl";
import { julGal } from "./jul-gal";
import { augNekketsu } from "./aug-nekketsu";
import { sepButler } from "./sep-butler";
import { octWitch } from "./oct-witch";

export const ALL_CHARACTERS: Character[] = [
  mayTebachan,
  junTsuyuGirl,
  julGal,
  augNekketsu,
  sepButler,
  octWitch,
];

export const CHARACTERS_BY_MONTH: Record<number, Character> =
  ALL_CHARACTERS.reduce(
    (acc, char) => ({ ...acc, [char.month]: char }),
    {} as Record<number, Character>,
  );

// JST基準で「現在のキャラ」を返す。該当月のキャラがいない場合は null。
export const getCurrentCharacter = (): Character | null => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  return CHARACTERS_BY_MONTH[month] ?? null;
};

// 任意の月のキャラを返す
export const getCharacterByMonth = (month: number): Character | null => {
  return CHARACTERS_BY_MONTH[month] ?? null;
};

export type { Character, TransformContext } from "./types";
