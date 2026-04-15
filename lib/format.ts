export const yen = (n: number) =>
  "¥" + (Math.round(n) || 0).toLocaleString("ja-JP");

export const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

export const slashDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
};
