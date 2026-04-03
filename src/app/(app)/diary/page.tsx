import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { WineRecord } from "@/types";

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

export default async function DiaryPage() {
  const supabase = await createClient();
  const { data: records } = await supabase
    .from("wine_records")
    .select("*")
    .is("deleted_at", null)
    .order("drunk_at", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col flex-1">
      <header className="px-5 pt-12 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">내 다이어리</h1>
        <Link
          href="/diary/new"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-700 hover:bg-rose-600 text-white text-2xl leading-none transition-colors"
          aria-label="새 기록 추가"
        >
          +
        </Link>
      </header>

      {!records || records.length === 0 ? (
        <div className="flex flex-col flex-1 items-center justify-center gap-4 text-center px-8">
          <span className="text-6xl">🍾</span>
          <p className="text-zinc-400">아직 기록된 와인이 없어요</p>
          <Link href="/diary/new" className="px-6 py-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-semibold transition-colors">
            첫 와인 경험 기록하기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-28">
          {records.map((record: WineRecord) => {
            const photos: string[] = record.photos ?? [];
            const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
            const thumb = photos[0];
            return (
              <Link
                key={record.id}
                href={`/diary/${record.id}`}
                className="relative rounded-2xl overflow-hidden bg-zinc-900 active:scale-[0.98] transition-transform"
              >
                {/* 사진 영역 */}
                {thumb ? (
                  <div className="relative w-full" style={{ height: "220px" }}>
                    <img src={thumb} alt={record.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    {/* 사진 위 와인 종류 태그 */}
                    {record.wine_type && (
                      <span className="absolute top-3 left-3 text-[11px] px-2.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300">
                        {TYPE_KO[record.wine_type] ?? record.wine_type}
                      </span>
                    )}
                    {/* 사진 위 사진 수 */}
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

                {/* 텍스트 정보 */}
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
                    {record.wine_country && (
                      <span className="text-xs text-zinc-500">📍 {record.wine_country}</span>
                    )}
                    {record.grape_variety && (
                      <span className="text-xs text-zinc-500">🍇 {record.grape_variety}</span>
                    )}
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
          })}
        </div>
      )}
    </div>
  );
}
