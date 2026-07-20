import { redirect } from "next/navigation";

// 出店先問い合わせはシフトページに統合されました。
// 旧URL /venues は統合ページの「問い合わせ」タブへ転送します。
export default function VenuesPage() {
  redirect("/shifts?tab=venues");
}
