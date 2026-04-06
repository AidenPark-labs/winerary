"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface PlaceResult {
  title: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
}

interface PlaceSearchProps {
  defaultValue?: string;
  onChange: (place: { name: string; lat: number | null; lng: number | null }) => void;
  className?: string;
  placeholder?: string;
}

export default function PlaceSearch({ defaultValue = "", onChange, className, placeholder = "장소 검색…" }: PlaceSearchProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/naver/local?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.items ?? []);
      setOpen(true);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  function handleInput(v: string) {
    setQuery(v);
    onChange({ name: v, lat: null, lng: null });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 400);
  }

  function handleSelect(place: PlaceResult) {
    setQuery(place.title);
    setOpen(false);
    onChange({ name: place.title, lat: place.lat, lng: place.lng });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">검색중…</span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-lg max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-zinc-800 transition-colors"
              >
                <p className="text-sm text-zinc-100 truncate">{r.title}</p>
                <p className="text-xs text-zinc-500 truncate">{r.address}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
