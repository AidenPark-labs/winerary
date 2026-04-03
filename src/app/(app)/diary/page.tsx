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
        <div className="px-3 pb-28 grid grid-cols-2 gap-2.5">
          {records.map((record: WineRecord) => {
            const photos: string[] = record.photos ?? [];
            const thumb = photos[0];
            return (
              <Link
                key={record.id}
                href={`/diary/${record.id}`}
                className="relative rounded-2xl overflow-hidden bg-zinc-900 active:scale-95 transition-transform"
                style={{ aspectRatio: "3/4" }}
              >
                {/* 사진 or 플레이스홀더 */}
                {thumb ? (
                  <img src={thumb} alt={record.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-950/60 via-zinc-900 to-black flex items-center justify-center text-5xl opacity-60">🍷</div>
                )}

                {/* 그라디언트 오버레이 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                {/* 상단 태그 */}
                {record.wine_type && (
                  <div className="absolute top-2.5 left-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300">
                      {TYPE_KO[record.wine_type] ?? record.wine_type}
                    </span>
                  </div>
                )}

                {/* 하단 정보 */}
                <div className="absolute bottom-0 inset-x-0 px-3 pb-3 flex flex-col gap-0.5">
                  {record.rating && (
                    <div className="flex items-center gap-0.5 mb-0.5">
                      <span className="text-yellow-400 text-xs">★</span>
                      <span className="text-xs text-white/80 font-medium">{Number(record.rating).toFixed(1)}</span>
                    </div>
                  )}
                  <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{record.name}</p>
                  {record.wine_vintage && (
                    <p className="text-xs text-white/50">{record.wine_vintage}</p>
                  )}
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {new Date(record.drunk_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    {record.location && ` · ${record.location}`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
