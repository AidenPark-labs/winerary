"use client";

import { useState, useRef, useEffect } from "react";
import { getGrapesByType } from "@/lib/grapes";
import { ChevronIcon, CloseIcon } from "@/components/Icons";

const iCls = "w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

export default function BlendGrapeSelector({ grapes, onChange, wineType }: { grapes: string[]; onChange: (v: string[]) => void; wineType?: string | null }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const options = getGrapesByType(wineType);
  const available = options.filter((g) => !grapes.includes(g));
  const filtered = query ? available.filter((g) => g.includes(query)) : available;

  function handleAdd(g: string) {
    if (!grapes.includes(g)) onChange([...grapes, g]);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-2 mt-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="품종 검색 후 추가…"
            className={iCls}
            autoComplete="off"
          />
        </div>
        <button type="button" onClick={() => setOpen(!open)}
          className="px-3.5 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0">
          <ChevronIcon direction={open ? "up" : "down"} />
        </button>
      </div>
      {open && (
        <ul className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((g) => (
            <li key={g}>
              <button type="button" onClick={() => handleAdd(g)}
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">{g}</button>
            </li>
          ))}
          {query && !filtered.length && (
            <li>
              <button type="button" onClick={() => handleAdd(query.trim())}
                className="w-full text-left px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
                &quot;{query}&quot; 직접 추가
              </button>
            </li>
          )}
          {query && filtered.length > 0 && !available.includes(query) && !grapes.includes(query) && (
            <li>
              <button type="button" onClick={() => handleAdd(query.trim())}
                className="w-full text-left px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-800 border-t border-zinc-800">
                &quot;{query}&quot; 직접 추가
              </button>
            </li>
          )}
        </ul>
      )}
      {grapes.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {grapes.map((g, i) => (
            <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-900/40 border border-rose-800/50 text-rose-200 text-sm">
              🍇 {g}
              <button type="button" onClick={() => onChange(grapes.filter((_, idx) => idx !== i))}
                className="text-rose-400 hover:text-rose-200 leading-none"><CloseIcon size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
