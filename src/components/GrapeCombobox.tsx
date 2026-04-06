"use client";

import { useState, useRef, useEffect } from "react";
import { GRAPE_OPTIONS } from "@/lib/grapes";

interface GrapeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onBlendGrapesChange?: (grapes: string[]) => void;
  blendGrapes?: string[];
  className?: string;
}

export default function GrapeCombobox({ value, onChange, onBlendGrapesChange, blendGrapes = [], className }: GrapeComboboxProps) {
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

  const displayValue = value === "__blend__" ? "블렌드" : value === "__custom__" ? "" : value;

  const filtered = query
    ? GRAPE_OPTIONS.filter((g) => g.includes(query))
    : GRAPE_OPTIONS;

  function handleSelect(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
    if (v !== "__blend__" && onBlendGrapesChange) onBlendGrapesChange([]);
  }

  function handleInputChange(v: string) {
    setQuery(v);
    setOpen(true);
  }

  function handleInputFocus() {
    setOpen(true);
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-1.5">
      <div className="relative flex gap-1.5">
        <div className="relative flex-1">
          <input
            value={open ? query : displayValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => { handleInputFocus(); setQuery(""); }}
            placeholder="품종 검색…"
            className={className}
            autoComplete="off"
          />
          {value && !open && (
            <button type="button" onClick={() => { onChange(""); setQuery(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-sm">×</button>
          )}
        </div>
        <button type="button" onClick={() => setOpen(!open)}
          className="px-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors text-sm flex-shrink-0">
          {open ? "▲" : "▼"}
        </button>
      </div>

      {open && (
        <ul className="z-50 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-lg max-h-48 overflow-y-auto">
          <li>
            <button type="button" onClick={() => handleSelect("__blend__")}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${value === "__blend__" ? "bg-rose-900/40 text-rose-300" : "text-zinc-200 hover:bg-zinc-800"}`}>
              🔀 블렌드
            </button>
          </li>
          {filtered.map((g) => (
            <li key={g}>
              <button type="button" onClick={() => handleSelect(g)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${value === g ? "bg-rose-900/40 text-rose-300" : "text-zinc-200 hover:bg-zinc-800"}`}>
                {g}
              </button>
            </li>
          ))}
          {query && !filtered.length && (
            <li>
              <button type="button" onClick={() => { onChange(query); setQuery(""); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
                &quot;{query}&quot; 직접 등록
              </button>
            </li>
          )}
          {query && filtered.length > 0 && !filtered.includes(query) && (
            <li>
              <button type="button" onClick={() => { onChange(query); setQuery(""); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-800 border-t border-zinc-800">
                &quot;{query}&quot; 직접 등록
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
