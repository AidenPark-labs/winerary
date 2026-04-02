"use client";

import { logout } from "@/lib/actions/auth";

export default function LogoutButton() {
  return (
    <button
      onClick={() => logout()}
      className="w-full py-3 rounded-xl border border-zinc-700 hover:border-rose-700 text-zinc-400 hover:text-rose-400 text-sm font-semibold transition-colors"
    >
      로그아웃
    </button>
  );
}
