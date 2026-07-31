import CombinedClient from "./CombinedClient";

export default function ShiftsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  // 既定は「出店先」タブ。?tab=shifts のときだけシフトを開く。
  const initialTab = searchParams?.tab === "shifts" ? "shifts" : "venues";
  return <CombinedClient initialTab={initialTab} />;
}
