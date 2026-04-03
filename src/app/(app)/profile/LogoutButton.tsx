"use client";

import { logout } from "@/lib/actions/auth";

export default function LogoutButton() {
  return (
    <button
      onClick={() => logout()}
      className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-rose-700 text-zinc-400 hover:text-rose-400 text-xs transition-colors"
    >
      로그아웃
    </button>
  );
}
