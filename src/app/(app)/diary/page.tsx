import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { WineRecord } from "@/types";

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
        <ul className="px-4 pb-4 flex flex-col gap-3">
          {records.map((record: WineRecord) => {
            const photos: string[] = record.photos ?? [];
            const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
            return (
              <li key={record.id}>
                <Link
                  href={`/diary/${record.id}`}
                  className="flex gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
                >
                  {photos[0] ? (
                    <img src={photos[0]} alt={record.name} className="w-16 h-20 object-cover rounded-lg flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-20 rounded-lg bg-zinc-800 flex items-center justify-center text-2xl flex-shrink-0">🍷</div>
                  )}
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="font-semibold truncate">{record.name}</p>
                    {foods.length > 0 && (
                      <p className="text-xs text-zinc-500 truncate">{foods.map((f) => f.name).join(" · ")}</p>
                    )}
                    <p className="text-xs text-zinc-600 mt-auto">
                      {new Date(record.drunk_at).toLocaleDateString("ko-KR")}
                      {record.location && ` · ${record.location}`}
                    </p>
                    {record.rating && (
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-400 text-sm">★</span>
                        <span className="text-sm text-zinc-300">{record.rating.toFixed(1)}</span>
                        {record.pairing_score && (
                          <span className="text-xs text-zinc-500 ml-1">페어링 {record.pairing_score}/5</span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
