"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

function MapRecordCard({ record }: { record: MapRecord }) {
  return (
    <Link href={`/diary/${record.id}`} className="block">
      <div className="flex items-start gap-4">
        {record.photos?.[0] ? (
          <img src={record.photos[0]} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-white/5 shadow-sm" />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center flex-shrink-0">
            <Wine className="w-6 h-6 text-zinc-600" />
          </div>
        )}
        <div className="flex-1 min-w-0 pr-4 flex flex-col pt-0.5">
          <p className="text-[15px] font-semibold text-white truncate flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 flex-shrink-0 rounded-full shadow-sm"
              style={{ backgroundColor: WINE_COLORS[record.wine_type ?? ""] ?? WINE_COLORS.other }}
            />
            {record.name}
          </p>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5 font-light truncate">
            <MapPin className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            {record.place_name || record.location}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-zinc-500 font-light px-1.5 py-0.5 rounded-md border border-white/5 bg-white/5">
              {new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
            </span>
            {record.rating != null && (
              <span className="text-[11px] text-amber-400 font-medium px-1.5 py-0.5 rounded-md border border-amber-500/10 bg-amber-500/10">★ {record.rating}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function PopupCarousel({ records, onClose }: { records: MapRecord[]; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActiveIdx(idx);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="absolute bottom-32 left-4 right-4 z-[1000] bg-surface/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-zinc-400 hover:text-white hover:bg-black/60 transition-colors text-sm z-10"
      >
        <CloseIcon size={14} />
      </button>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ scrollbarWidth: "none" }}
      >
        {records.map((r) => (
          <div key={r.id} className="snap-center flex-shrink-0 w-full p-4">
            <MapRecordCard record={r} />
          </div>
        ))}
      </div>
      {records.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-3 -mt-1">
          {records.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                i === activeIdx ? "bg-accent w-4" : "bg-zinc-600"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WineMapClient({ records }: { records: MapRecord[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<MapRecord[] | null>(null);

  const groupedByLocation = useCallback(() => {
    const groups = new window.Map<string, MapRecord[]>();
    records.forEach((r) => {
      const key = `${r.latitude},${r.longitude}`;
      const group = groups.get(key) ?? [];
      group.push(r);
      groups.set(key, group);
    });
    return Array.from(groups.values());
  }, [records]);

  useEffect(() => {
    if (typeof window === "undefined" || records.length === 0) return;
    if ((window as any).kakao?.maps) { setLoaded(true); return; }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.onerror = () => console.error("[KakaoMap] SDK 로드 실패");
    script.onload = () => {
      (window as any).kakao.maps.load(() => setLoaded(true));
    };
    document.head.appendChild(script);
  }, [records.length]);

  useEffect(() => {
    if (!loaded || !mapRef.current || records.length === 0) return;
    if (mapInstanceRef.current) return;
    const kakao = (window as any).kakao;

    const bounds = new kakao.maps.LatLngBounds();
    records.forEach((r) => bounds.extend(new kakao.maps.LatLng(r.latitude, r.longitude)));

    const map = new kakao.maps.Map(mapRef.current, {
      center: bounds.getCenter?.() ?? new kakao.maps.LatLng(37.5665, 126.978),
      level: 8,
    });
    map.setBounds(bounds, 80);
    if (map.getLevel() < 5) map.setLevel(5);
    mapInstanceRef.current = map;

    const groups = groupedByLocation();
    groups.forEach((group) => {
      const rep = group[0];
      const pos = new kakao.maps.LatLng(rep.latitude, rep.longitude);

      // 다크 테마 커스텀 마커
      const count = group.length;
      const markerHtml = `<div style="
        cursor:pointer;
        display:flex; flex-direction:column; align-items:center;
      ">
        <div style="
          background:#1c1c1e; color:#e4e4e7;
          min-width:28px; height:28px; border-radius:14px;
          display:flex; align-items:center; justify-content:center;
          font-size:11px; font-weight:700;
          border:2px solid #e11d48; box-shadow:0 2px 8px rgba(0,0,0,0.5);
          padding:0 6px;
        ">${count > 1 ? count : "🍷"}</div>
        <div style="
          width:2px; height:6px; background:#e11d48; border-radius:1px;
        "></div>
      </div>`;

      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: markerHtml,
        yAnchor: 1,
        zIndex: 2,
        clickable: true,
      });
      overlay.setMap(map);

      const el = overlay.getContent() as HTMLElement;
      if (el && el.addEventListener) {
        el.addEventListener("click", () => {
          setSelectedGroup(group);
          map.panTo(pos);
        });
      }
    });
  }, [loaded, records, groupedByLocation]);

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
    <div className="flex flex-col h-[calc(100dvh-80px)] bg-background min-h-screen">
      <header className="px-5 pt-8 pb-2 flex items-center justify-between border-b border-white/5 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-2xl font-bold text-white">와인맵</h1>
        <span className="text-xs text-zinc-500">{records.length}개 기록 · {groupedByLocation().length}곳</span>
      </header>

      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />

        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
            <p className="text-zinc-500 text-sm">지도 로딩 중…</p>
          </div>
        )}

        {selectedGroup && (
          <PopupCarousel
            records={selectedGroup}
            onClose={() => setSelectedGroup(null)}
          />
        )}
      </div>
    </div>
  );
}
