"use client";

import { useState } from "react";
import { updateWineRecord } from "@/lib/actions/diary";
import type { WineRecord } from "@/types";
import LoadingOverlay from "@/components/LoadingOverlay";

const iCls = "w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

export default function EditForm({ record, onClose }: { record: WineRecord; onClose?: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [foods, setFoods] = useState<string[]>((record.foods ?? []).map((f) => f.name));
  const [foodInput, setFoodInput] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const result = await updateWineRecord(record.id, {
      location: (fd.get("location") as string) || null,
      drunk_at: fd.get("drunk_at") as string,
      companions: (fd.get("companions") as string)
        ? (fd.get("companions") as string).split(",").map((s) => s.trim()).filter(Boolean)
        : null,
      memo: (fd.get("memo") as string) || null,
      rating: parseFloat(fd.get("rating") as string),
      pairing_score: foods.length > 0 ? parseInt(fd.get("pairing_score") as string) : null,
      foods: foods.map((name) => ({ name })),
      visibility: (fd.get("visibility") as "private" | "link" | "public") || "private",
    });

    setSaving(false);
    if (result?.error) { setError(result.error); return; }
    setSuccess(true);
    setTimeout(() => { setSuccess(false); onClose?.(); }, 1200);
  }

  return (
    <>
      {saving && <LoadingOverlay message="기록 수정 중…" subMessage="잠시만 기다려 주세요" />}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-zinc-100">기록 수정</h3>
          {onClose && (
            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl w-8 h-8 flex items-center justify-center">×</button>
          )}
        </div>

        {error && <p className="text-rose-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">✓ 저장되었습니다</p>}

        <div className="grid grid-cols-2 gap-2">
          <input name="drunk_at" type="date" defaultValue={record.drunk_at} className={iCls} />
          <input name="location" defaultValue={record.location ?? ""} placeholder="장소" className={iCls} />
        </div>
        <input name="companions" defaultValue={record.companions?.join(", ") ?? ""} placeholder="함께한 사람 (쉼표 구분)" className={iCls} />

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input value={foodInput} onChange={(e) => setFoodInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (foodInput.trim()) { setFoods((f) => [...f, foodInput.trim()]); setFoodInput(""); } } }}
              placeholder="페어링 음식 추가" className={iCls} />
            <button type="button" onClick={() => { if (foodInput.trim()) { setFoods((f) => [...f, foodInput.trim()]); setFoodInput(""); } }}
              className="px-3 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm whitespace-nowrap">추가</button>
          </div>
          {foods.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {foods.map((food, i) => (
                <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-200 text-sm">
                  {food}
                  <button type="button" onClick={() => setFoods((f) => f.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-zinc-300">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="w-20 flex-shrink-0">와인 평점</span>
          <input type="range" name="rating" min="0.5" max="5" step="0.5" defaultValue={record.rating ?? 3} className="flex-1 accent-rose-600" />
        </label>
        {foods.length > 0 && (
          <label className="flex items-center gap-3 text-sm text-zinc-400">
            <span className="w-20 flex-shrink-0">음식 궁합</span>
            <input type="range" name="pairing_score" min="1" max="5" step="1" defaultValue={record.pairing_score ?? 3} className="flex-1 accent-amber-600" />
          </label>
        )}

        <textarea name="memo" defaultValue={record.memo ?? ""} rows={3} placeholder="메모" className={iCls + " resize-none"} />

        <select name="visibility" defaultValue={record.visibility} className={iCls}>
          <option value="private">비공개</option>
          <option value="link">링크 공유</option>
          <option value="public">전체 공개</option>
        </select>

        <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold transition-colors">
          저장
        </button>
      </form>
    </>
  );
}
