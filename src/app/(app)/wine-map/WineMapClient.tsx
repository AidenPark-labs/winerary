"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface MapRecord {
  id: string;
  name: string;
  location: string | null;
  place_name: string | null;
  latitude: number;
  longitude: number;
  drunk_at: string;
  rating: number | null;
  photos: string[];
  wine_type: string | null;
}

const WINE_EMOJI: Record<string, string> = {
  red: "\uD83C\uDF77", white: "\uD83E\uDD42", rose: "\uD83C\uDF38",
  sparkling: "\u2728", fortified: "\uD83C\uDFFA", other: "\uD83C\uDF7E",
};

export default function WineMapClient({ records }: { records: MapRecord[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<MapRecord | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || records.length === 0) return;

    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.onload = () => {
      (window as any).kakao.maps.load(() => {
        setLoaded(true);
      });
    };
    document.head.appendChild(script);

    return () => { document.head.removeChild(script); };
  }, [records.length]);

  useEffect(() => {
    if (!loaded || !mapRef.current || records.length === 0) return;
    const kakao = (window as any).kakao;

    const bounds = new kakao.maps.LatLngBounds();
    records.forEach((r) => bounds.extend(new kakao.maps.LatLng(r.latitude, r.longitude)));

    const map = new kakao.maps.Map(mapRef.current, {
      center: bounds.getCenter ? bounds.getCenter() : new kakao.maps.LatLng(37.5665, 126.9780),
      level: 5,
    });

    if (records.length > 1) map.setBounds(bounds, 60);

    records.forEach((r) => {
      const marker = new kakao.maps.Marker({
        map,
        position: new kakao.maps.LatLng(r.latitude, r.longitude),
        title: r.name,
      });
      kakao.maps.event.addListener(marker, "click", () => setSelected(r));
    });
  }, [loaded, records]);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
        <p className="text-4xl mb-4">🗺️</p>
        <h2 className="text-lg font-semibold text-zinc-200 mb-2">아직 지도에 표시할 기록이 없어요</h2>
        <p className="text-sm text-zinc-500">와인 기록 시 장소를 검색해서 선택하면<br/>이곳에 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)]">
      <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800">
        <h1 className="text-lg font-bold text-zinc-100">🗺️ 와인 지도</h1>
        <span className="text-xs text-zinc-500">{records.length}곳</span>
      </div>

      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />

        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
            <p className="text-zinc-500 text-sm">지도 로딩 중…</p>
          </div>
        )}

        {selected && (
          <div className="absolute bottom-4 left-4 right-4 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-xl">
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 text-lg w-6 h-6 flex items-center justify-center"
            >×</button>
            <Link href={`/diary/${selected.id}`} className="block">
              <div className="flex items-start gap-3">
                {selected.photos?.[0] && (
                  <img src={selected.photos[0]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">
                    {WINE_EMOJI[selected.wine_type ?? ""] ?? "🍷"} {selected.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    📍 {selected.place_name || selected.location}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-zinc-500">
                      {new Date(selected.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                    {selected.rating != null && (
                      <span className="text-xs text-amber-400">★ {selected.rating}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
