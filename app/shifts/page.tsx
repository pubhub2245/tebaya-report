import CombinedClient from "./CombinedClient";

export default function ShiftsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const initialTab = searchParams?.tab === "venues" ? "venues" : "shifts";
  return <CombinedClient initialTab={initialTab} />;
}
