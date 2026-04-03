"use client";

import { useState } from "react";

export default function ShareButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/share/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback for older browsers
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/8 border border-white/10 text-zinc-300 text-sm hover:bg-white/12 active:scale-95 transition-all"
    >
      {copied ? (
        <>
          <span className="text-emerald-400">✓</span>
          <span className="text-emerald-400">링크 복사됨!</span>
        </>
      ) : (
        <>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-zinc-400">
            <path d="M8.5 1.5a3 3 0 0 1 4.243 4.243L10.5 8l-1.06-1.06 2.06-2.06A1.5 1.5 0 0 0 9.378 2.757L7.318 4.818 6.257 3.757 8.5 1.5Zm-2 2L5.44 4.56 4.379 3.5 6.5 1.378A3 3 0 0 0 2.257 5.621L4.5 7.864 3.44 8.924 1.318 6.803A4.5 4.5 0 0 1 7.56 .561L6.5 3.5Zm-.94 3.94L6.62 8.5l-3.06 3.06a1.5 1.5 0 0 0 2.122 2.122L8.74 10.62l1.06 1.06-3.06 3.06a3 3 0 0 1-4.242-4.242L5.56 7.44Zm4 0 1.06 1.06-4.12 4.12-1.06-1.06 4.12-4.12Z" fill="currentColor" />
          </svg>
          링크 공유
        </>
      )}
    </button>
  );
}
