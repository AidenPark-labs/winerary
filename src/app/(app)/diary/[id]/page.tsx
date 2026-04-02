import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DeleteButton from "./DeleteButton";
import EditForm from "./EditForm";
import type { WineRecord } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  red: "레드 🍷", white: "화이트 🥂", rose: "로제 🌸",
  sparkling: "스파클링 ✨", fortified: "주정강화 🏺", other: "기타",
};

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

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-4 flex items-center justify-between">
        <a href="/diary" className="text-zinc-400 hover:text-zinc-200 text-2xl">←</a>
        <div className="flex gap-2">
          <DeleteButton id={id} />
        </div>
      </header>

      {record.label_image_url && (
        <div className="px-5 mb-6">
          <img
            src={record.label_image_url}
            alt={record.name}
            className="w-full max-h-72 object-contain rounded-2xl bg-zinc-900"
          />
        </div>
      )}

      <div className="px-5 flex flex-col gap-6 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {record.type && <span className="text-sm text-zinc-400">{TYPE_LABEL[record.type]}</span>}
            {record.vintage && <span className="text-sm text-zinc-500">{record.vintage}</span>}
          </div>
          <h1 className="text-2xl font-bold">{record.name}</h1>
          {record.producer && <p className="text-zinc-400 mt-1">{record.producer}</p>}
          {(record.country || record.region) && (
            <p className="text-sm text-zinc-500 mt-0.5">
              {[record.country, record.region].filter(Boolean).join(" · ")}
            </p>
          )}
          {record.grapes && (
            <p className="text-sm text-zinc-500 mt-0.5">{record.grapes.join(", ")}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoCard label="날짜" value={new Date(record.drunk_at).toLocaleDateString("ko-KR")} />
          {record.location && <InfoCard label="장소" value={record.location} />}
          {record.price && <InfoCard label="가격" value={`${record.price.toLocaleString()}원`} />}
        </div>

        {record.memo && (
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{record.memo}</p>
          </div>
        )}

        {(record.rating || record.balance || record.complexity || record.value_score) && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">품평</h2>
            <div className="flex flex-col gap-3">
              {record.rating && <ScoreBar label="종합 평점" value={record.rating} max={5} />}
              {record.balance && <ScoreBar label="밸런스" value={record.balance} max={5} />}
              {record.complexity && <ScoreBar label="복잡성" value={record.complexity} max={5} />}
              {record.value_score && <ScoreBar label="가성비" value={record.value_score} max={5} />}
            </div>
          </section>
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

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-800">
        <div className="h-2 rounded-full bg-rose-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-rose-400 w-8 text-right">{value.toFixed(1)}</span>
    </div>
  );
}
