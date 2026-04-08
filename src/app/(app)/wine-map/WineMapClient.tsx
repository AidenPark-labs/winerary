"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Map as MapIcon, Wine } from "lucide-react";
import { CloseIcon } from "@/components/Icons";

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

const WINE_COLORS: Record<string, string> = {
  red: "#be123c", white: "#d97706", rose: "#ec4899",
  sparkling: "#0ea5e9", fortified: "#8b5cf6", other: "#52525b"
};

export default function WineMapClient({ records }: { records: MapRecord[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<MapRecord | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || records.length === 0) return;

    // 이미 로드된 경우
    if ((window as any).kakao?.maps) {
      setLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.onerror = () => console.error("[KakaoMap] SDK 로드 실패 - API 키를 확인하세요");
    script.onload = () => {
      (window as any).kakao.maps.load(() => {
        setLoaded(true);
      });
    };
    document.head.appendChild(script);
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
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6 gap-3">
        <MapIcon className="w-16 h-16 text-zinc-800" strokeWidth={1} />
        <h2 className="text-lg font-semibold text-zinc-200 mt-2">아직 지도에 표시할 기록이 없어요</h2>
        <p className="text-sm text-zinc-500 font-light">와인 기록 시 장소를 검색해서 선택하면<br/>이곳에 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)] bg-background">
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/5 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-serif text-white tracking-wide">와인 지도</h1>
        </div>
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
          <div className="absolute bottom-6 left-4 right-4 z-[1000] bg-surface/95 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 text-zinc-500 hover:text-accent w-6 h-6 flex items-center justify-center transition-colors"
            ><CloseIcon size={16} /></button>
            <Link href={`/diary/${selected.id}`} className="block">
              <div className="flex items-start gap-4">
                {selected.photos?.[0] ? (
                  <img src={selected.photos[0]} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-white/5 shadow-sm" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center flex-shrink-0">
                    <Wine className="w-6 h-6 text-zinc-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0 pr-4 flex flex-col pt-0.5">
                  <p className="text-[15px] font-semibold text-white truncate flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 flex-shrink-0 rounded-full shadow-sm"
                      style={{ backgroundColor: WINE_COLORS[selected.wine_type ?? ""] ?? WINE_COLORS.other }}
                    />
                    {selected.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5 font-light truncate">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                    {selected.place_name || selected.location}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] text-zinc-500 font-light px-1.5 py-0.5 rounded-md border border-white/5 bg-white/5">
                      {new Date(selected.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                    {selected.rating != null && (
                      <span className="text-[11px] text-amber-400 font-medium px-1.5 py-0.5 rounded-md border border-amber-500/10 bg-amber-500/10">★ {selected.rating}</span>
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
