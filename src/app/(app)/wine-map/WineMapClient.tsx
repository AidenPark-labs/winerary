"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { MapPin, Map as MapIcon, Wine, Navigation, List } from "lucide-react";
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

// ─── 하단 카드 (큰 사진 + 정보) ──────────────────────────────────────────────

function BottomCard({ record, onClose }: { record: MapRecord; onClose: () => void }) {
  return (
    <Link href={`/diary/${record.id}`} className="block">
      <div className="flex gap-3">
        {record.photos?.[0] ? (
          <img src={record.photos[0]} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-white/10" />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
            <Wine className="w-6 h-6 text-zinc-700" />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center pr-6">
          <p className="text-sm font-bold text-white truncate">{record.name}</p>
          {record.rating != null && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-amber-400 text-sm">★</span>
              <span className="text-sm font-bold text-amber-400">{Number(record.rating).toFixed(1)}</span>
            </div>
          )}
          <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1 font-light truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {record.place_name || record.location}
          </p>
          <span className="text-[10px] text-zinc-600 mt-1">
            {new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
          </span>
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
    <div className="absolute bottom-4 left-3 right-3 z-[1000] bg-surface/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
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
            <BottomCard record={r} onClose={onClose} />
          </div>
        ))}
      </div>
      {records.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-3 -mt-1">
          {records.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIdx ? "bg-accent w-5" : "bg-zinc-600 w-1.5"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 목록 뷰 ────────────────────────────────────────────────────────────────

function ListView({ records, onClose }: { records: MapRecord[]; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-[1001] bg-background/95 backdrop-blur-xl flex flex-col">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
        <h2 className="text-lg font-bold text-white">기록 목록</h2>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-24">
        {records.map((r) => (
          <Link key={r.id} href={`/diary/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 border-b border-white/5 hover:bg-white/5 transition-colors">
            {r.photos?.[0] ? (
              <img src={r.photos[0]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-white/10" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Wine className="w-5 h-5 text-zinc-700" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{r.name}</p>
              <p className="text-xs text-zinc-500 font-light truncate mt-0.5">{r.place_name || r.location}</p>
            </div>
            {r.rating != null && (
              <span className="text-xs font-bold text-amber-400 flex-shrink-0">★ {Number(r.rating).toFixed(1)}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

export default function WineMapClient({ records }: { records: MapRecord[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<MapRecord[] | null>(null);
  const [showList, setShowList] = useState(false);

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

  function goToMyLocation() {
    if (!mapInstanceRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const kakao = (window as any).kakao;
      const loc = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      mapInstanceRef.current.setCenter(loc);
      mapInstanceRef.current.setLevel(5);
    });
  }

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

    // 현재 위치 기반으로 센터링 시도, 실패 시 기록 bounds
    const initMap = (center: any, level: number) => {
      const map = new kakao.maps.Map(mapRef.current, { center, level });
      mapInstanceRef.current = map;

      const groups = groupedByLocation();
      groups.forEach((group) => {
        const rep = group[0];
        const pos = new kakao.maps.LatLng(rep.latitude, rep.longitude);
        const count = group.length;

        const wrapper = document.createElement("div");
        wrapper.style.cssText = "cursor:pointer; display:flex; flex-direction:column; align-items:center;";

        const circle = document.createElement("div");
        circle.style.cssText = `
          background:#1c1c1e; color:#e4e4e7;
          min-width:28px; height:28px; border-radius:14px;
          display:flex; align-items:center; justify-content:center;
          font-size:${count > 1 ? "11px" : "13px"}; font-weight:700;
          border:2px solid #e11d48; box-shadow:0 2px 8px rgba(0,0,0,0.5);
          padding:0 6px;
        `;
        circle.textContent = count > 1 ? String(count) : "";
        if (count <= 1) circle.innerHTML = "🍷";

        const tail = document.createElement("div");
        tail.style.cssText = "width:2px; height:6px; background:#e11d48; border-radius:1px;";

        wrapper.appendChild(circle);
        wrapper.appendChild(tail);
        wrapper.addEventListener("click", () => {
          setSelectedGroup(group);
          map.panTo(pos);
        });

        const overlay = new kakao.maps.CustomOverlay({
          position: pos,
          content: wrapper,
          yAnchor: 1,
          zIndex: 2,
          clickable: true,
        });
        overlay.setMap(map);
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const center = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
          initMap(center, 5);
        },
        () => {
          // 위치 권한 거부 시 기록 bounds로
          const bounds = new kakao.maps.LatLngBounds();
          records.forEach((r) => bounds.extend(new kakao.maps.LatLng(r.latitude, r.longitude)));
          const center = bounds.getCenter?.() ?? new kakao.maps.LatLng(37.5665, 126.978);
          initMap(center, 8);
          mapInstanceRef.current.setBounds(bounds, 80);
        },
        { timeout: 3000 }
      );
    } else {
      const bounds = new kakao.maps.LatLngBounds();
      records.forEach((r) => bounds.extend(new kakao.maps.LatLng(r.latitude, r.longitude)));
      const center = bounds.getCenter?.() ?? new kakao.maps.LatLng(37.5665, 126.978);
      initMap(center, 8);
      mapInstanceRef.current.setBounds(bounds, 80);
    }
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
    <div className="flex flex-col h-[calc(100dvh-80px)] bg-background">
      <header className="px-5 pt-8 pb-2 flex items-center justify-between bg-background z-10">
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

        {/* 플로팅 버튼들 */}
        <div className={`absolute right-4 z-[999] flex flex-col gap-2 transition-all ${selectedGroup ? (selectedGroup.length > 1 ? "bottom-40" : "bottom-32") : "bottom-4"}`}>
          <button
            onClick={goToMyLocation}
            className="w-10 h-10 rounded-full bg-surface/90 backdrop-blur-md border border-white/10 shadow-xl flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          >
            <Navigation size={16} />
          </button>
        </div>

        <div className={`absolute left-1/2 -translate-x-1/2 z-[999] transition-all ${selectedGroup ? (selectedGroup.length > 1 ? "bottom-40" : "bottom-32") : "bottom-4"}`}>
          <button
            onClick={() => setShowList(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface/90 backdrop-blur-md border border-white/10 shadow-xl text-zinc-200 hover:text-white transition-colors"
          >
            <List size={14} />
            <span className="text-xs font-medium">목록</span>
          </button>
        </div>

        {/* 선택된 장소 카드 */}
        {selectedGroup && (
          <PopupCarousel
            records={selectedGroup}
            onClose={() => setSelectedGroup(null)}
          />
        )}

        {/* 목록 뷰 */}
        {showList && (
          <ListView records={records} onClose={() => setShowList(false)} />
        )}
      </div>
    </div>
  );
}
