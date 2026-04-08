"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CloseIcon } from "@/components/Icons";

interface PlaceResult {
  title: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
}

interface PlaceSearchProps {
  defaultValue?: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
  onChange: (place: { name: string; lat: number | null; lng: number | null }) => void;
  className?: string;
  placeholder?: string;
}

function MiniMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if ((window as any).kakao?.maps) { setLoaded(true); return; }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.onload = () => (window as any).kakao.maps.load(() => setLoaded(true));
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const kakao = (window as any).kakao;
    const position = new kakao.maps.LatLng(lat, lng);
    const map = new kakao.maps.Map(mapRef.current, { center: position, level: 3, draggable: false, zoomable: false });
    new kakao.maps.Marker({ map, position, title: name });
  }, [loaded, lat, lng, name]);

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-zinc-700">
      <div ref={mapRef} className="w-full h-32" />
      {!loaded && (
        <div className="w-full h-32 flex items-center justify-center bg-zinc-900">
          <span className="text-zinc-600 text-xs">지도 로딩 중…</span>
        </div>
      )}
    </div>
  );
}

export default function PlaceSearch({ defaultValue = "", defaultLat = null, defaultLng = null, onChange, className, placeholder = "장소 검색…" }: PlaceSearchProps) {
  const [query, setQuery] = useState(defaultValue);
  const [selectedLat, setSelectedLat] = useState<number | null>(defaultLat);
  const [selectedLng, setSelectedLng] = useState<number | null>(defaultLng);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    setSelectedLat(null);
    setSelectedLng(null);
    onChange({ name: v, lat: null, lng: null });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 400);
  }

  function handleSelect(place: PlaceResult) {
    setQuery(place.title);
    setSelectedLat(place.lat);
    setSelectedLng(place.lng);
    setOpen(false);
    onChange({ name: place.title, lat: place.lat, lng: place.lng });
  }

  function handleClear() {
    setQuery("");
    setSelectedLat(null);
    setSelectedLng(null);
    onChange({ name: "", lat: null, lng: null });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && !selectedLat && setOpen(true)}
          className={className}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">검색중…</span>
        )}
        {selectedLat && !loading && (
          <button type="button" onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><CloseIcon size={12} /></button>
        )}
      </div>
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
      {selectedLat != null && selectedLng != null && (
        <MiniMap lat={selectedLat} lng={selectedLng} name={query} />
      )}
    </div>
  );
}
