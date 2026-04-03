"use client";

import { useState } from "react";
import Link from "next/link";
import type { WineRecord } from "@/types";

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type ViewMode = "feed" | "calendar";

// ─── Feed Card ────────────────────────────────────────────────────────────────

function FeedCard({ record }: { record: WineRecord }) {
  const photos: string[] = record.photos ?? [];
  const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
  const thumb = photos[0];

  return (
    <Link
      href={`/diary/${record.id}`}
      className="relative rounded-2xl overflow-hidden bg-zinc-900 active:scale-[0.98] transition-transform"
    >
      {thumb ? (
        <div className="relative w-full" style={{ height: "220px" }}>
          <img src={thumb} alt={record.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          {record.wine_type && (
            <span className="absolute top-3 left-3 text-[11px] px-2.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300">
              {TYPE_KO[record.wine_type] ?? record.wine_type}
            </span>
          )}
          {photos.length > 1 && (
            <span className="absolute top-3 right-3 text-[11px] px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300">
              📷 {photos.length}
            </span>
          )}
        </div>
      ) : (
        <div className="w-full flex items-center justify-center bg-gradient-to-br from-rose-950/40 via-zinc-900 to-zinc-950" style={{ height: "100px" }}>
          <span className="text-4xl opacity-30">🍷</span>
          {record.wine_type && (
            <span className="absolute top-3 left-3 text-[11px] px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-400">
              {TYPE_KO[record.wine_type] ?? record.wine_type}
            </span>
          )}
        </div>
      )}
      <div className="px-4 py-3 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="font-semibold text-white text-base leading-tight">{record.name}</p>
              {record.wine_vintage && (
                <span className="text-zinc-500 text-sm">{record.wine_vintage}</span>
              )}
            </div>
            {record.wine_name_original && (
              <p className="text-xs text-zinc-500 italic mt-0.5">{record.wine_name_original}</p>
            )}
          </div>
          {record.rating && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-yellow-400 text-sm">★</span>
              <span className="text-sm font-semibold text-white">{Number(record.rating).toFixed(1)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {record.wine_country && <span className="text-xs text-zinc-500">📍 {record.wine_country}</span>}
          {record.grape_variety && <span className="text-xs text-zinc-500">🍇 {record.grape_variety}</span>}
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <p className="text-xs text-zinc-600">
            {new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
            {record.location && ` · ${record.location}`}
          </p>
          {foods.length > 0 && (
            <p className="text-xs text-zinc-600 truncate max-w-[40%]">
              🍽 {foods.map(f => f.name).join(", ")}
            </p>
          )}
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
      className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-800 active:scale-[0.98] transition-transform"
    >
      {thumb ? (
        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
          <img src={thumb} alt={record.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-14 h-14 rounded-xl bg-rose-950/40 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl opacity-50">🍷</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <p className="font-semibold text-white text-sm leading-tight truncate">{record.name}</p>
          {record.wine_vintage && (
            <span className="text-zinc-500 text-xs">{record.wine_vintage}</span>
          )}
        </div>
        {record.wine_type && (
          <p className="text-xs text-zinc-500 mt-0.5">{TYPE_KO[record.wine_type] ?? record.wine_type}</p>
        )}
        {record.location && (
          <p className="text-xs text-zinc-600 mt-0.5 truncate">📍 {record.location}</p>
        )}
      </div>
      {record.rating && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <span className="text-yellow-400 text-xs">★</span>
          <span className="text-xs font-semibold text-white">{Number(record.rating).toFixed(1)}</span>
        </div>
      )}
    </Link>
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

  // date -> records 맵
  const recordsByDate = records.reduce<Record<string, WineRecord[]>>((acc, r) => {
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

  function toggleView() {
    setViewMode(v => v === "feed" ? "calendar" : "feed");
    setSelectedDate(null);
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="px-5 pt-12 pb-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold">와인일기</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleView}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
            aria-label={viewMode === "feed" ? "달력으로 보기" : "목록으로 보기"}
          >
            {viewMode === "feed" ? (
              // Calendar icon (simple SVG)
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
                <line x1="1.5" y1="6" x2="14.5" y2="6" />
                <line x1="5" y1="1" x2="5" y2="4" />
                <line x1="11" y1="1" x2="11" y2="4" />
              </svg>
            ) : (
              // List icon
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="3" y1="4" x2="13" y2="4" />
                <line x1="3" y1="8" x2="13" y2="8" />
                <line x1="3" y1="12" x2="13" y2="12" />
              </svg>
            )}
          </button>
          <Link
            href="/diary/new"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-700 hover:bg-rose-600 text-white text-2xl leading-none transition-colors"
            aria-label="새 기록 추가"
          >
            +
          </Link>
        </div>
      </header>

      {records.length === 0 ? (
        <div className="flex flex-col flex-1 items-center justify-center gap-4 text-center px-8">
          <span className="text-6xl">🍾</span>
          <p className="text-zinc-400">아직 기록된 와인이 없어요</p>
          <Link href="/diary/new" className="px-6 py-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-semibold transition-colors">
            첫 와인 경험 기록하기
          </Link>
        </div>

      ) : viewMode === "feed" ? (
        /* ── 피드 뷰 ── */
        <div className="flex flex-col gap-3 px-4 pb-28 overflow-y-auto">
          {records.map((r) => <FeedCard key={r.id} record={r} />)}
        </div>

      ) : (
        /* ── 달력 뷰 ── */
        <div className="flex flex-col flex-1 overflow-y-auto pb-28">

          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between px-4 py-2">
            <button
              onClick={() => { setCurrentMonth(new Date(year, month - 1, 1)); setSelectedDate(null); }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-300 transition-colors"
            >
              ‹
            </button>
            <span className="font-semibold text-zinc-100">
              {year}년 {month + 1}월
            </span>
            <button
              onClick={() => { setCurrentMonth(new Date(year, month + 1, 1)); setSelectedDate(null); }}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-300 transition-colors"
            >
              ›
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 px-2 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-zinc-500"}`}>
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
                    flex flex-col items-center justify-start py-1.5 rounded-xl transition-colors min-h-[44px]
                    ${isSelected ? "bg-rose-700" : isToday ? "bg-zinc-800" : "hover:bg-zinc-800/60"}
                  `}
                >
                  <span className={`text-sm font-medium leading-none ${
                    isSelected ? "text-white" :
                    isToday ? "text-rose-400" :
                    dow === 0 ? "text-rose-300/80" :
                    dow === 6 ? "text-blue-300/80" :
                    "text-zinc-200"
                  }`}>
                    {day}
                  </span>
                  {hasRecords && (
                    <span className={`mt-1 text-[10px] font-semibold leading-none ${
                      isSelected ? "text-rose-200" : "text-rose-400"
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
              <p className="text-sm font-semibold text-zinc-400">
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                {" · "}
                <span className="text-rose-400">{selectedRecords.length}개의 기록</span>
              </p>
              {selectedRecords.length === 0 ? (
                <p className="text-sm text-zinc-600 py-2">이 날은 기록이 없어요.</p>
              ) : (
                selectedRecords.map((r) => <CalendarRecordCard key={r.id} record={r} />)
              )}
            </div>
          )}

          {/* 선택 안 됐을 때 이번 달 요약 */}
          {!selectedDate && (
            <div className="px-4 mt-4">
              {(() => {
                const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
                const monthCount = Object.entries(recordsByDate)
                  .filter(([d]) => d.startsWith(monthPrefix))
                  .reduce((sum, [, arr]) => sum + arr.length, 0);
                if (monthCount === 0) return (
                  <p className="text-sm text-zinc-600">{month + 1}월에는 아직 기록이 없어요.</p>
                );
                return (
                  <p className="text-sm text-zinc-500">{month + 1}월에 총 <span className="text-rose-400 font-semibold">{monthCount}개</span>의 와인을 기록했어요.</p>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
