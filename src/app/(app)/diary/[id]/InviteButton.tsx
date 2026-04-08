"use client";

import { useState } from "react";
import { generateInviteCode } from "@/lib/actions/diary";

export default function InviteButton({ recordId, inviteCode: initialCode }: { recordId: string; inviteCode: string | null }) {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleClick() {
    if (code) {
      // 이미 코드가 있으면 복사
      const url = `${window.location.origin}/invite/${code}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    // 코드 생성
    setGenerating(true);
    const result = await generateInviteCode(recordId);
    setGenerating(false);
    if (result.code) {
      setCode(result.code);
      const url = `${window.location.origin}/invite/${result.code}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={generating}
      className="text-xs font-medium px-4 py-2 rounded-full bg-violet-500/20 backdrop-blur-md border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-colors shadow-lg disabled:opacity-50"
    >
      {generating ? "…" : copied ? "링크 복사됨" : code ? "초대 링크" : "평가 초대"}
    </button>
  );
}
