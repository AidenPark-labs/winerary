import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DeleteButton from "./DeleteButton";
import EditForm from "./EditForm";
import type { WineRecord } from "@/types";

export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: record } = await supabase
    .from("wine_records")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  const photos: string[] = record.photos ?? [];
  const foods: { name: string }[] = record.foods ?? [];

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-4 flex items-center justify-between">
        <a href="/diary" className="text-zinc-400 hover:text-zinc-200 text-2xl">←</a>
        <DeleteButton id={id} />
      </header>

      {/* 사진 */}
      {photos.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <img key={i} src={url} alt="" className="h-48 w-auto rounded-2xl object-cover flex-shrink-0" />
            ))}
          </div>
        </div>
      )}

      <div className="px-5 flex flex-col gap-6 pb-8">

        {/* 와인 이름 + Vivino 링크 */}
        <div>
          <h1 className="text-2xl font-bold">{record.name}</h1>
          {record.wine_vivino_url && (
            <a
              href={record.wine_vivino_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs px-3 py-1.5 rounded-lg border border-rose-800 text-rose-400 hover:bg-rose-950/40 transition-colors"
            >
              Vivino에서 보기 →
            </a>
          )}
        </div>

        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-3">
          <InfoCard label="날짜" value={new Date(record.drunk_at).toLocaleDateString("ko-KR")} />
          {record.location && <InfoCard label="장소" value={record.location} />}
          {record.companions?.length && (
            <InfoCard label="함께한 사람" value={record.companions.join(", ")} />
          )}
        </div>

        {/* 페어링 음식 */}
        {foods.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">페어링 음식</h2>
            <div className="flex gap-2 flex-wrap">
              {foods.map((f, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-200 text-sm">{f.name}</span>
              ))}
            </div>
          </section>
        )}

        {/* 평점 */}
        {(record.rating || record.pairing_score) && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">평점</h2>
            <div className="flex flex-col gap-3">
              {record.rating && <ScoreBar label="와인 평점" value={record.rating} max={5} color="bg-rose-600" />}
              {record.pairing_score && <ScoreBar label="음식 궁합" value={record.pairing_score} max={5} color="bg-amber-600" />}
            </div>
          </section>
        )}

        {/* 메모 */}
        {record.memo && (
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{record.memo}</p>
          </div>
        )}

        <EditForm record={record as WineRecord} />
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm text-zinc-200">{value}</p>
    </div>
  );
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-sm text-rose-400 w-8 text-right">{value.toFixed(1)}</span>
    </div>
  );
}
