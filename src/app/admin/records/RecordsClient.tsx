"use client";

import { useState } from "react";
import AdminRecordActions from "./RecordActions";

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷", white: "화이트 🥂", rose: "로제 🌸",
  sparkling: "스파클링 ✨", fortified: "주정강화 🏺", other: "기타",
};

interface Props {
  records: any[];
  profiles: { id: string; nickname: string }[];
}

export default function RecordsClient({ records, profiles }: Props) {
  const [filterUser, setFilterUser] = useState("all");

  const nickMap = new Map(profiles.map((p) => [p.id, p.nickname]));
  const filtered = filterUser === "all" ? records : records.filter((r) => r.user_id === filterUser);
  const active = filtered.filter((r) => !r.deleted_at).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">와인 기록 관리</h1>
          <p className="text-zinc-500 text-sm mt-1">활성 {active} / 전체 {filtered.length}</p>
        </div>
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="all">전체 유저</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.nickname}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((r: any) => {
          const photos: string[] = r.photos ?? [];
          const foods: { name: string }[] = (r.foods as { name: string }[]) ?? [];
          const thumb = photos[0];

          return (
            <div
              key={r.id}
              className={`flex rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 ${r.deleted_at ? "opacity-40" : ""}`}
            >
              {/* 왼쪽: 사진 */}
              {thumb ? (
                <div className="relative w-48 flex-shrink-0">
                  <img src={thumb} alt={r.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
                  {photos.length > 1 && (
                    <span className="absolute bottom-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300">
                      📷 {photos.length}
                    </span>
                  )}
                </div>
              ) : (
                <div className="w-48 flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-rose-950/40 via-zinc-900 to-zinc-950">
                  <span className="text-4xl opacity-20">🍷</span>
                </div>
              )}

              {/* 오른쪽: 정보 */}
              <div className="flex-1 px-5 py-4 flex flex-col gap-1.5 min-w-0">
                {/* 헤더: 와인명 + 평점 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="font-semibold text-white text-base leading-tight">{r.name}</p>
                      {r.wine_vintage && <span className="text-zinc-500 text-sm">{r.wine_vintage}</span>}
                    </div>
                    {r.wine_name_original && (
                      <p className="text-xs text-zinc-500 italic mt-0.5">{r.wine_name_original}</p>
                    )}
                  </div>
                  {r.rating != null && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-yellow-400">★</span>
                      <span className="font-semibold text-white">{Number(r.rating).toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* 태그 행 */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500">
                  {r.wine_type && <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{TYPE_KO[r.wine_type] ?? r.wine_type}</span>}
                  {r.wine_country && <span>📍 {r.wine_country}</span>}
                  {r.grape_variety && <span>🍇 {r.grape_variety}</span>}
                  {r.price != null && <span>💰 {r.price.toLocaleString()}원</span>}
                  {r.value_score != null && <span>가성비 {r.value_score}</span>}
                </div>

                {/* 음용 정보 */}
                <div className="text-xs text-zinc-600">
                  {new Date(r.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
                  {r.location && ` · ${r.location}`}
                  {r.companions?.length > 0 && ` · 👥 ${r.companions.join(", ")}`}
                </div>

                {/* 음식 */}
                {foods.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {foods.map((f, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">🍽 {f.name}</span>
                    ))}
                    {r.pairing_score != null && <span className="text-xs text-zinc-500">궁합 ★{r.pairing_score}</span>}
                  </div>
                )}

                {/* 메모 */}
                {r.memo && (
                  <p className="text-xs text-zinc-400 bg-zinc-800/50 rounded-lg p-2">💬 {r.memo}</p>
                )}

                {/* 하단: 유저 + 액션 */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-zinc-800/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>👤 {nickMap.get(r.user_id) ?? "?"}</span>
                    <span className="text-zinc-700">|</span>
                    <span className="font-mono text-zinc-600">{r.id.slice(0, 8)}</span>
                    <span className="text-zinc-700">|</span>
                    {!r.deleted_at ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-400">활성</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">삭제됨</span>
                    )}
                  </div>
                  <AdminRecordActions recordId={r.id} deleted={!!r.deleted_at} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
