/**
 * 部隊判定ロジック。
 * - 1番隊: じゅん, イデ
 * - 2番隊: かずき, なぎさ
 * 不明スタッフはデフォルト1（UIで編集可能）。
 */

export type TeamUnit = 1 | 2;

const TEAM_1 = ["じゅん", "イデ"] as const;
const TEAM_2 = ["かずき", "なぎさ"] as const;

export function inferTeamUnit(staffName: string): TeamUnit {
  const name = (staffName ?? "").trim();
  if ((TEAM_1 as readonly string[]).includes(name)) return 1;
  if ((TEAM_2 as readonly string[]).includes(name)) return 2;
  return 1;
}

export function getTeamMembers(teamUnit: TeamUnit): readonly string[] {
  return teamUnit === 1 ? TEAM_1 : TEAM_2;
}

export function getTeamLabel(teamUnit: TeamUnit): string {
  return `${teamUnit}番隊`;
}
