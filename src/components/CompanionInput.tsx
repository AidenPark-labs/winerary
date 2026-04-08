"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { CompanionEntry } from "@/types";

interface ProfileResult {
  id: string;
  nickname: string;
  avatar_url: string | null;
  user_code: string;
}

interface Props {
  value: CompanionEntry[];
  onChange: (entries: CompanionEntry[]) => void;
  className?: string;
}

export default function CompanionInput({ value, onChange, className = "" }: Props) {
  const [input, setInput] = useState("");
  const [mentionMode, setMentionMode] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchProfiles = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.profiles ?? []);
      setSelectedIdx(0);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!mentionMode || !mentionQuery) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchProfiles(mentionQuery), 300);
    return () => clearTimeout(debounceRef.current);
  }, [mentionQuery, mentionMode, searchProfiles]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setMentionMode(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addEntry(name: string, userCode: string | null) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // 중복 체크
    const exists = value.some((e) =>
      userCode ? e.userCode === userCode : e.name === trimmed && !e.userCode
    );
    if (exists) return;
    onChange([...value, { name: trimmed, userCode }]);
  }

  function removeEntry(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function selectMention(profile: ProfileResult) {
    addEntry(profile.nickname, profile.user_code);
    setInput("");
    setMentionMode(false);
    setMentionQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  function addPlainText() {
    const text = input.replace(/^@/, "").trim();
    if (text) {
      addEntry(text, null);
      setInput("");
      setMentionMode(false);
      setMentionQuery("");
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);

    // @ 감지
    const atIdx = val.lastIndexOf("@");
    if (atIdx >= 0) {
      const afterAt = val.slice(atIdx + 1);
      // @뒤에 공백이 없으면 멘션 모드
      if (!afterAt.includes(" ") && !afterAt.includes(",")) {
        setMentionMode(true);
        setMentionQuery(afterAt);
        return;
      }
    }
    setMentionMode(false);
    setMentionQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionMode && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectMention(results[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionMode(false);
        return;
      }
    }

    // 쉼표 또는 Enter로 일반 텍스트 추가
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addPlainText();
    }

    // Backspace로 마지막 칩 삭제
    if (e.key === "Backspace" && !input && value.length > 0) {
      removeEntry(value.length - 1);
    }
  }

  return (
    <div className="relative">
      <div className={`flex flex-wrap gap-1.5 items-center min-h-[3rem] ${className} !py-2 !px-3 cursor-text`}
        onClick={() => inputRef.current?.focus()}>
        {value.map((entry, i) => (
          <span key={i} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm ${
            entry.userCode
              ? "bg-violet-900/40 border border-violet-800/50 text-violet-200"
              : "bg-zinc-800 text-zinc-200"
          }`}>
            {entry.userCode ? `@${entry.name}` : entry.name}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeEntry(i); }}
              className={`${entry.userCode ? "text-violet-400 hover:text-violet-200" : "text-zinc-500 hover:text-zinc-300"} text-xs ml-0.5`}>
              x
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? "이름 또는 @닉네임으로 멘션" : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-500"
        />
      </div>

      {/* 멘션 드롭다운 */}
      {mentionMode && (results.length > 0 || searching) && (
        <div ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
          {searching && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-zinc-500">검색 중...</div>
          )}
          {results.map((profile, i) => (
            <button key={profile.id} type="button"
              onClick={() => selectMention(profile)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                i === selectedIdx ? "bg-zinc-800" : "hover:bg-zinc-800/60"
              }`}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">
                  {profile.nickname[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-100 truncate">{profile.nickname}</p>
                <p className="text-[11px] text-zinc-500">{profile.user_code}</p>
              </div>
            </button>
          ))}
          {!searching && results.length === 0 && mentionQuery.length >= 1 && (
            <div className="px-4 py-3 text-sm text-zinc-500">일치하는 유저가 없습니다</div>
          )}
        </div>
      )}
    </div>
  );
}
