export const yen = (n: number) =>
  "¥" + (Math.round(n) || 0).toLocaleString("ja-JP");

export const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

// 業務日（JST基準で朝5時を境界に切替）
// 0:00〜4:59 → 前日扱い、5:00〜23:59 → 当日扱い
export const businessDateStr = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (jst.getUTCHours() < 5) {
    jst.setUTCDate(jst.getUTCDate() - 1);
  }
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const slashDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
};
