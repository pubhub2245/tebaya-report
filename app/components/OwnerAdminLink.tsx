"use client";

/**
 * 管理者ページへの小さいリンク。**じゅんの端末にだけ**出す（2026-11-09）。
 *
 * 「管理者ページは管理者以外に見える必要がない」（じゅん）。
 * 管理者パスワードを入れたことがある端末には印が付いている（lib/keiri/outreach.ts の
 * readOwnerDevice）ので、その端末でだけ出す。スタッフのスマホには何も出ない。
 * 印が無い端末でも、/admin を直接開けば合言葉の画面から入れる。
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { readOwnerDevice } from "@/lib/keiri/outreach";

export default function OwnerAdminLink() {
  const [owner, setOwner] = useState(false);
  useEffect(() => setOwner(readOwnerDevice()), []);
  if (!owner) return null;
  return (
    <Link href="/admin" className="block text-sm text-stone-400 underline hover:text-stone-700">
      管理者ページ →
    </Link>
  );
}
