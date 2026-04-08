"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteWineRecord } from "@/lib/actions/diary";
import { Map, CalendarDays, LayoutList, MoreVertical, Camera, Plus, MapPin, Wine as WineIcon, ChevronLeft, ChevronRight } from "lucide-react";
import type { WineRecord } from "@/types";

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type ViewMode = "feed" | "calendar" | "map";

const WINE_TYPE_COLORS: Record<string, string> = {
  red: "bg-[#722F37]", white: "bg-[#F7E7CE]", rose: "bg-[#FFC0CB]",
  sparkling: "bg-[#F3E5AB]", fortified: "bg-[#4A0E4E]", other: "bg-zinc-400",
};

function calcOverallScore(record: WineRecord): number | null {
  const scores: number[] = [];
  if (record.rating != null) scores.push(Number(record.rating));
  if (record.value_score != null) scores.push(Number(record.value_score));
  const foods = (record.foods as { name: string }[]) ?? [];
  if (foods.length > 0 && record.pairing_score != null) scores.push(Number(record.pairing_score));
  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

function MapRecordCard({ record }: { record: WineRecord }) {
  return (
    <Link href={`/diary/${record.id}`} className="block">
      <div className="flex items-start gap-4">
        {record.photos?.[0] ? (
          <img src={record.photos[0]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-black/40 flex items-center justify-center flex-shrink-0 border border-white/5">
            <WineIcon className="text-zinc-600" size={20} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${WINE_TYPE_COLORS[record.wine_type ?? ""] ?? "bg-zinc-500"}`} />
            <p className="text-sm font-medium text-white truncate px-0">{record.name}</p>
          </div>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1 font-light truncate">
            <MapPin size={10} /> {record.place_name || record.location}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-zinc-500 font-light">
              {new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
            </span>
            {(() => { const s = calcOverallScore(record); return s != null ? (
              <span className="text-[10px] text-amber-400 tracking-wider font-semibold">★ {s.toFixed(1)}</span>
            ) : null; })()}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MapView({ records }: { records: WineRecord[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<WineRecord[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const geoRecords = records.filter((r) => r.latitude != null && r.longitude != null);

  // 같은 좌표의 기록을 그룹핑
  const groupedByLocation = useCallback(() => {
    const groups = new window.Map<string, WineRecord[]>();
    geoRecords.forEach((r) => {
      const key = `${r.latitude},${r.longitude}`;
      const group = groups.get(key) ?? [];
      group.push(r);
      groups.set(key, group);
    });
    return Array.from(groups.values());
  }, [geoRecords]);

  useEffect(() => {
    if (geoRecords.length === 0) return;
    if ((window as any).kakao?.maps) { setLoaded(true); return; }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.onload = () => {
      (window as any).kakao.maps.load(() => setLoaded(true));
    };
    document.head.appendChild(script);
  }, [geoRecords.length]);

  useEffect(() => {
    if (!loaded || !mapRef.current || geoRecords.length === 0) return;
    if (mapInstanceRef.current) return;
    const kakao = (window as any).kakao;

    const bounds = new kakao.maps.LatLngBounds();
    geoRecords.forEach((r) => bounds.extend(new kakao.maps.LatLng(r.latitude, r.longitude)));

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

      // 여러 기록이 있는 장소에는 개수 오버레이 표시
      if (group.length > 1) {
        const overlay = new kakao.maps.CustomOverlay({
          position: pos,
          content: `<div style="
            position:relative; top:-44px; left:10px;
            background:#7c3aed; color:white;
            width:20px; height:20px; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            font-size:11px; font-weight:700;
            border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.3);
            pointer-events:none;
          ">${group.length}</div>`,
          zIndex: 2,
        });
        overlay.setMap(map);
      }

      const marker = new kakao.maps.Marker({ map, position: pos, title: rep.name });
      kakao.maps.event.addListener(marker, "click", () => {
        setSelectedGroup(group);
        setSelectedIdx(0);
        map.panTo(pos);
      });
    });
  }, [loaded, geoRecords, groupedByLocation]);

  if (geoRecords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-6">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5">
          <Map className="text-zinc-500" strokeWidth={1.5} size={32} />
        </div>
        <p className="text-sm text-zinc-400 font-light leading-relaxed">장소가 등록된 기록이 없어요<br/>기록 시 장소를 검색해서 선택하면 표시됩니다</p>
      </div>
    );
  }

  const current = selectedGroup?.[selectedIdx] ?? null;
  const total = selectedGroup?.length ?? 0;

  return (
    <div className="relative" style={{ height: "calc(100dvh - 200px)" }}>
      <div ref={mapRef} className="absolute inset-0" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
          <p className="text-zinc-500 text-sm font-light">지도 로딩 중…</p>
        </div>
      )}
      {current && selectedGroup && (
        <div className="absolute bottom-20 left-4 right-4 z-[1000] bg-surface/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
          <button onClick={() => { setSelectedGroup(null); setSelectedIdx(0); }} className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors text-lg w-6 h-6 flex items-center justify-center z-10">×</button>

          {/* 여러 기록일 때 네비게이션 */}
          {total > 1 && (
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setSelectedIdx((prev) => (prev - 1 + total) % total)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-zinc-300 hover:text-white hover:bg-white/20 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[11px] text-zinc-400 font-medium tabular-nums">
                {selectedIdx + 1} / {total}
              </span>
              <button
                onClick={() => setSelectedIdx((prev) => (prev + 1) % total)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-zinc-300 hover:text-white hover:bg-white/20 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <MapRecordCard record={current} />
        </div>
      )}
    </div>
  );
}

// ─── Card Menu ───────────────────────────────────────────────────────────────

function CardMenu({ recordId }: { recordId: string }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative" onClick={(e) => e.preventDefault()}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-zinc-300 hover:text-white transition-colors border border-white/10"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-surface/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl min-w-[120px]">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); router.push(`/diary/${recordId}/edit`); }}
            className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-white/5 transition-colors font-light"
          >수정</button>
          <button
            onClick={async (e) => {
              e.preventDefault(); e.stopPropagation();
              if (!confirm("이 기록을 삭제하시겠습니까?")) { setOpen(false); return; }
              setDeleting(true);
              try { await deleteWineRecord(recordId); } catch { /* redirect throws */ }
            }}
            disabled={deleting}
            className="w-full text-left px-4 py-3 text-sm text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 font-light"
          >{deleting ? "삭제 중…" : "삭제"}</button>
        </div>
      )}
    </div>
  );
}

// ─── Feed Card ────────────────────────────────────────────────────────────────

function FeedCard({ record }: { record: WineRecord }) {
  const photos: string[] = record.photos ?? [];
  const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
  const thumb = photos[0];

  return (
    <Link
      href={`/diary/${record.id}`}
      className="group relative rounded-[24px] overflow-hidden bg-background border border-white/5 active:scale-[0.98] transition-all duration-300 shadow-xl flex flex-col"
      style={{ minHeight: "400px" }}
    >
      {/* 엣지투엣지 이미지 오버레이 영역 */}
      <div className="absolute inset-0 z-0">
        {thumb ? (
          <img src={thumb} alt={record.name} className="w-full h-full object-cover object-[center_5%] transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full bg-surface flex items-center justify-center">
            <WineIcon className="text-white/10" size={80} strokeWidth={1} />
          </div>
        )}
      </div>

      {/* 하단 텍스트 가독성용 그라데이션 (하단만) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent z-10 pointer-events-none" />

      {/* 상단: 별점 + 메뉴 */}
      <div className="relative z-20 flex justify-between items-start p-5 pointer-events-none">
        {(() => { const s = calcOverallScore(record); return s != null ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 shadow-lg pointer-events-auto">
            <span className="text-amber-400 text-[11px]">★</span>
            <span className="text-xs font-bold text-amber-400">{s.toFixed(1)}</span>
          </div>
        ) : <div />; })()}
        <div className="flex items-center gap-2 pointer-events-auto">
          {photos.length > 1 && (
            <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white shadow-lg">
              <Camera size={12} /> {photos.length}
            </span>
          )}
          {!(record as unknown as Record<string, unknown>)._shared && (
            <div className="pointer-events-auto">
              <CardMenu recordId={record.id} />
            </div>
          )}
        </div>
      </div>

      {/* 사진 영역 확보 */}
      <div className="flex-1 z-10 pointer-events-none min-h-[220px]" />

      {/* 하단 슬림 글라스 패널 */}
      <div className="relative z-20 mt-auto px-5 py-4 bg-black/40 backdrop-blur-2xl border-t border-white/10 pointer-events-none">
        {Boolean((record as unknown as Record<string, unknown>)._shared) && (
          <span className="inline-block px-2 py-0.5 rounded-md bg-violet-500/20 border border-violet-500/30 text-[10px] text-violet-300 font-medium mb-1">
            {String((record as unknown as Record<string, unknown>)._ownerNickname ?? "공유")} 님의 기록
          </span>
        )}
        <h2 className="font-serif font-medium text-white text-lg tracking-wide leading-tight line-clamp-1 drop-shadow-md">
          {record.name}
        </h2>
        {record.wine_name_original && (
          <p className="text-xs text-zinc-300/80 italic font-light truncate drop-shadow-sm">{record.wine_name_original}</p>
        )}
        <p className="text-[11px] text-zinc-400 font-light tracking-wide mt-1">
          {new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
          {record.location && ` · ${record.location}`}
          {foods.length > 0 && ` · 🍽 ${foods.map(f => f.name).join(", ")}`}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {record.wine_type && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-300 font-medium">
              <span className={`w-1.5 h-1.5 rounded-full ${WINE_TYPE_COLORS[record.wine_type] ?? "bg-zinc-500"}`} />
              {TYPE_KO[record.wine_type] ?? record.wine_type}
            </span>
          )}
          {record.grape_variety && (
            <span className="px-2 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-300 font-medium">
              🍇 {/블렌드|blend/i.test(record.grape_variety) ? '블렌드' : record.grape_variety}
            </span>
          )}
          {record.wine_country && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-300 font-medium">
              <MapPin size={10} className="text-zinc-400" />
              {record.wine_country}
            </span>
          )}
          {record.wine_vintage && (
            <span className="px-2 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-300 font-medium">
              {record.wine_vintage}
            </span>
          )}
          {(record.tags ?? []).map((tag, i) => (
            <span key={i} className="px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-300 font-medium">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

// ─── Calendar Day Record Card ─────────────────────────────────────────────────

function CalendarRecordCard({ record }: { record: WineRecord }) {
  const thumb = (record.photos ?? [])[0];
  return (
    <Link
      href={`/diary/${record.id}`}
      className="flex items-center gap-4 py-3.5 px-4 rounded-[20px] bg-surface/80 border border-white/5 shadow-md active:scale-[0.98] transition-all duration-300 hover:bg-white/5"
    >
      {thumb ? (
        <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 border border-white/10 shadow-sm relative">
          <img src={thumb} alt={record.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/40 to-transparent pointer-events-none" />
        </div>
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-inner">
          <WineIcon className="text-zinc-600" size={24} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
          <p className="font-serif font-medium text-white text-base tracking-wide leading-tight truncate">{record.name}</p>
        </div>
        
        <div className="flex items-center gap-3">
          {record.wine_type && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
              <span className={`w-2 h-2 rounded-full ${WINE_TYPE_COLORS[record.wine_type] ?? "bg-zinc-500"} shadow-sm`} />
              <span className="text-[10px] text-zinc-300 font-medium">{TYPE_KO[record.wine_type] ?? record.wine_type}</span>
            </div>
          )}
          {record.wine_vintage && (
            <span className="text-zinc-400 text-[11px] font-semibold tracking-wider">{record.wine_vintage}</span>
          )}
          {record.location && (
            <p className="text-[11px] text-zinc-500 truncate flex items-center gap-1 font-light"><MapPin size={10} /> {record.location}</p>
          )}
        </div>
      </div>
      {(() => { const s = calcOverallScore(record); return s != null ? (
        <div className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0 pl-1 h-14 bg-amber-400/10 px-3 rounded-2xl">
          <span className="text-amber-400 text-[11px]">★</span>
          <span className="text-sm font-bold text-amber-400">{s.toFixed(1)}</span>
        </div>
      ) : null; })()}
    </Link>
  );
}

// ─── Date Group Carousel ─────────────────────────────────────────────────────

function DateGroupCarousel({ date, records: groupRecords }: { date: string; records: WineRecord[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const d = new Date(date + "T00:00:00");
  const dayNum = d.getDate();
  const monthStr = d.toLocaleDateString("ko-KR", { month: "short" });
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const yearStr = d.getFullYear();

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
    <div>
      <div className="flex items-center gap-3 px-5 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-white leading-none">{dayNum}</span>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-zinc-400 leading-tight">{monthStr} {yearStr}</span>
            <span className="text-[10px] text-zinc-600 leading-tight">{weekday}요일</span>
          </div>
        </div>
        <div className="flex-1 h-px bg-white/5" />
        {groupRecords.length > 1 && (
          <span className="text-[10px] text-zinc-600 font-medium">{groupRecords.length}개</span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-3 px-4"
        style={{ scrollbarWidth: "none" }}
      >
        {groupRecords.map((r) => (
          <div key={r.id} className="snap-center flex-shrink-0 w-full">
            <FeedCard record={r} />
          </div>
        ))}
      </div>
      {groupRecords.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {groupRecords.map((_, i) => (
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

// ─── Main Client Component ────────────────────────────────────────────────────

export default function DiaryClient({ records }: { records: WineRecord[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 전체 태그 수집 (빈도순)
  const tagCounts = records.reduce<Record<string, number>>((acc, r) => {
    (r.tags ?? []).forEach((t) => { acc[t] = (acc[t] ?? 0) + 1; });
    return acc;
  }, {});
  const allTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([t]) => t);

  // 태그 필터 적용
  const filteredRecords = selectedTag
    ? records.filter((r) => (r.tags ?? []).includes(selectedTag))
    : records;

  // date -> records 맵
  const recordsByDate = filteredRecords.reduce<Record<string, WineRecord[]>>((acc, r) => {
    const date = r.drunk_at.slice(0, 10); // "YYYY-MM-DD"
    (acc[date] ??= []).push(r);
    return acc;
  }, {});

  const todayStr = new Date().toISOString().slice(0, 10);

  // 달력 격자 생성
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function toDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const selectedRecords = selectedDate ? (recordsByDate[selectedDate] ?? []) : [];

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    setSelectedDate(null);
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="px-5 pt-12 pb-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-3xl font-serif tracking-wide text-white">와인노트</h1>
        <Link
          href="/diary/new"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/20 transition-all active:scale-[0.95]"
          aria-label="새 기록 추가"
        >
          <Plus strokeWidth={2.5} size={20} />
        </Link>
      </header>

      {/* Segmented Control */}
      <div className="mx-5 mb-4 flex p-1.5 rounded-xl bg-surface/80 border border-white/5 backdrop-blur-md">
        {([["feed", "카드"], ["calendar", "달력"], ["map", "지도"]] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => switchView(mode)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              viewMode === mode ? "bg-white/10 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {mode === "feed" && <LayoutList size={14} />}
            {mode === "calendar" && <CalendarDays size={14} />}
            {mode === "map" && <Map size={14} />}
            {label}
          </button>
        ))}
      </div>

      {/* 태그 필터 */}
      {allTags.length > 0 && (
        <div className="flex gap-2 px-5 mb-3 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setSelectedTag(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!selectedTag ? "bg-white/10 text-white border-white/20" : "bg-transparent text-zinc-500 border-white/5 hover:text-zinc-300"}`}
          >
            전체
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedTag === tag ? "bg-accent/20 text-accent border-accent/30" : "bg-transparent text-zinc-500 border-white/5 hover:text-zinc-300"}`}
            >
              #{tag}
              <span className="ml-1 text-[10px] opacity-60">{tagCounts[tag]}</span>
            </button>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <div className="flex flex-col flex-1 items-center justify-center gap-5 text-center px-8 z-10 relative">
          <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2 shadow-2xl backdrop-blur-xl">
             <WineIcon size={48} strokeWidth={1} className="text-zinc-500" />
          </div>
          <p className="text-zinc-400 font-light leading-relaxed">아직 기록된 와인이 없어요.<br/>특별했던 그날의 와인을 기억해보세요.</p>
          <Link href="/diary/new" className="px-6 py-3.5 mt-2 rounded-2xl bg-accent hover:bg-accent/90 text-white font-medium transition-all shadow-lg shadow-accent/20">
            첫 와인 기록하기
          </Link>
        </div>

      ) : viewMode === "map" ? (
        /* ── 지도 뷰 ── */
        <MapView records={filteredRecords} />

      ) : viewMode === "feed" ? (
        /* ── 피드 뷰 (날짜별 그룹) ── */
        <div className="flex flex-col gap-6 pb-28 overflow-y-auto">
          {Object.entries(recordsByDate)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, dateRecords]) => (
              <DateGroupCarousel key={date} date={date} records={dateRecords} />
            ))}
        </div>

      ) : (
        /* ── 달력 뷰 ── */
        <div className="flex flex-col flex-1 overflow-y-auto pb-28">

          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between px-4 py-2">
            <button
              onClick={() => { setCurrentMonth(new Date(year, month - 1, 1)); setSelectedDate(null); }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-300 transition-colors"
            >
              ‹
            </button>
            <span className="font-semibold text-white tracking-wide">
              {year}년 {month + 1}월
            </span>
            <button
              onClick={() => { setCurrentMonth(new Date(year, month + 1, 1)); setSelectedDate(null); }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-300 transition-colors"
            >
              ›
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 px-2 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-accent" : i === 6 ? "text-blue-400" : "text-zinc-500"}`}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 격자 */}
          <div className="grid grid-cols-7 px-2 gap-y-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const ds = toDateStr(day);
              const dayRecords = recordsByDate[ds] ?? [];
              const hasRecords = dayRecords.length > 0;
              const isSelected = selectedDate === ds;
              const isToday = ds === todayStr;
              const dow = (firstDow + day - 1) % 7;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(isSelected ? null : ds)}
                  className={`
                    flex flex-col items-center justify-start py-1.5 rounded-xl transition-all min-h-[44px]
                    ${isSelected ? "bg-accent shadow-lg shadow-accent/20" : isToday ? "bg-white/10" : "hover:bg-white/5"}
                  `}
                >
                  <span className={`text-sm font-medium leading-none ${
                    isSelected ? "text-white" :
                    isToday ? "text-accent" :
                    dow === 0 ? "text-accent/80" :
                    dow === 6 ? "text-blue-300/80" :
                    "text-zinc-300"
                  }`}>
                    {day}
                  </span>
                  {hasRecords && (
                    <span className={`mt-1 text-[10px] font-semibold leading-none ${
                      isSelected ? "text-white/80" : "text-accent"
                    }`}>
                      {dayRecords.length > 1 ? `×${dayRecords.length}` : "●"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 선택된 날짜의 기록 */}
          {selectedDate && (
            <div className="flex flex-col gap-2 px-4 mt-4">
              <p className="text-sm font-semibold text-zinc-400 tracking-wide">
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                {" · "}
                <span className="text-accent">{selectedRecords.length}개의 기록</span>
              </p>
              {selectedRecords.length === 0 ? (
                <p className="text-sm text-zinc-600 py-2 font-light">이 날은 기록이 없어요.</p>
              ) : (
                selectedRecords.map((r) => <CalendarRecordCard key={r.id} record={r} />)
              )}
            </div>
          )}

          {/* 선택 안 됐을 때 이번 달 요약 */}
          {!selectedDate && (
            <div className="px-4 mt-6">
              {(() => {
                const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
                const monthCount = Object.entries(recordsByDate)
                  .filter(([d]) => d.startsWith(monthPrefix))
                  .reduce((sum, [, arr]) => sum + arr.length, 0);
                if (monthCount === 0) return (
                  <p className="text-sm text-zinc-500 font-light text-center">{month + 1}월에는 아직 기록이 없어요.</p>
                );
                return (
                  <div className="bg-surface/30 backdrop-blur-md rounded-2xl p-5 border border-white/5 text-center">
                    <p className="text-sm text-zinc-400 font-light">{month + 1}월에 기록한 와인</p>
                    <p className="text-2xl mt-1 text-white font-serif"><span className="text-accent font-semibold">{monthCount}</span> 개</p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
