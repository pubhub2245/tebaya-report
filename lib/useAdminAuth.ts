"use client";

/**
 * 管理者ログイン状態を扱う共通フック。
 *
 * 既存の app/components/AdminGate.tsx と「同じ」sessionStorageキー・
 * パスワードを共有する。したがって /admin などで一度ログインすれば、
 * このフックを使う画面でも管理者として扱われる（AdminGate は無変更）。
 *
 * 用途: 「閲覧は誰でも／追加・編集だけ管理者」を実現するために、
 *       ページ全体ではなく編集操作だけをこのフックでガードする。
 */

import { useEffect, useState } from "react";
import {
  ADMIN_PASSWORD_CONFIGURED,
  checkAdminPassword,
} from "./adminPassword";

// AdminGate.tsx と同一の値をそろえる（キー・パスワード）
const SS_KEY = "admin-auth";

export function useAdminAuth() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    // パスワード未設定なら誰も管理者にしない（AdminGate と同じ挙動）。
    // 設定し忘れで管理機能が公開されてしまうのを防ぐため。
    if (!ADMIN_PASSWORD_CONFIGURED) return;
    try {
      if (sessionStorage.getItem(SS_KEY) === "1") setIsAdmin(true);
    } catch {}
  }, []);

  /** パスワードを検証し、正しければ管理者にする。成否を返す。 */
  const login = (password: string): boolean => {
    if (checkAdminPassword(password)) {
      try {
        sessionStorage.setItem(SS_KEY, "1");
      } catch {}
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(SS_KEY);
    } catch {}
    setIsAdmin(false);
  };

  return { isAdmin, hydrated, login, logout };
}
