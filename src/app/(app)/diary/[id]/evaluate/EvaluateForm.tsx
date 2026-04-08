"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertRecordEvaluation } from "@/lib/actions/diary";
import StarRating from "@/components/StarRating";

export default function EvaluateForm({
  recordId,
  hasFoods,
  existing,
}: {
  recordId: string;
  hasFoods: boolean;
  existing: {
    rating: number | null;
    value_score: number | null;
    pairing_score: number | null;
    memo: string | null;
  } | null;
}) {
  const router = useRouter();
  const isEdit = !!existing;

  const [rating, setRating] = useState(existing?.rating ?? 3);
  const [valueScore, setValueScore] = useState(existing?.value_score ?? 3);
  const [pairingScore, setPairingScore] = useState(existing?.pairing_score ?? 3);
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const result = await upsertRecordEvaluation(recordId, {
      rating,
      value_score: valueScore,
      pairing_score: hasFoods ? pairingScore : null,
      memo: memo.trim() || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push(`/diary/${recordId}`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 p-5 flex flex-col gap-5">
        <StarRating label="맛 평점" emoji="⭐" value={rating} max={5} step={0.5} onChange={setRating} />
        <StarRating label="가성비" emoji="💰" value={valueScore} max={5} step={0.5} onChange={setValueScore} />
        {hasFoods && (
          <StarRating label="음식 궁합" emoji="🍽️" value={pairingScore} max={5} step={1} onChange={setPairingScore} />
        )}
      </div>

      <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 p-5">
        <label className="text-xs text-zinc-400 font-medium mb-2 block">한줄 코멘트</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          placeholder="이 와인에 대한 감상을 남겨보세요 (선택)"
          className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-zinc-100 text-sm font-light resize-none focus:outline-none focus:border-violet-500/50 transition-all placeholder:text-zinc-500"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 px-1">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="flex-1 py-3.5 rounded-2xl text-sm text-zinc-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-3.5 rounded-2xl text-sm text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors font-medium"
        >
          {saving ? "저장 중…" : isEdit ? "수정 완료" : "평가 저장"}
        </button>
      </div>
    </div>
  );
}
