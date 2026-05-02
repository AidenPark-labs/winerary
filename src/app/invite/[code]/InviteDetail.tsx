"use client";

import { useState } from "react";
import type { WineRecord, RecordEvaluation, Wine } from "@/types";
import DiaryDetail from "@/app/(app)/diary/[id]/DiaryDetail";
import StarRating from "@/components/StarRating";

export default function InviteDetail({ record, wineData, evaluations, inviteCode, hasFoods }: {
  record: WineRecord;
  wineData: Wine | null;
  evaluations: RecordEvaluation[];
  inviteCode: string;
  hasFoods: boolean;
}) {
  const [nickname, setNickname] = useState("");
  const [rating, setRating] = useState(3);
  const [valueScore, setValueScore] = useState(3);
  const [pairingScore, setPairingScore] = useState(3);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!nickname.trim()) { setError("닉네임을 입력해주세요"); return; }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/invite/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_code: inviteCode,
        guest_nickname: nickname.trim(),
        rating,
        value_score: valueScore,
        pairing_score: hasFoods ? pairingScore : null,
        memo: memo.trim() || null,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (data.error) { setError(data.error); return; }
    setSaved(true);
  }

  const iCls = "w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-violet-500/50 transition-all font-light text-sm";

  return (
    <>
      <DiaryDetail record={record} readOnly wineData={wineData} evaluations={evaluations} />

      {/* 하단 평가 패널 */}
      <div className="relative z-20 px-4 pb-32 -mt-4">
        <div className="rounded-[20px] bg-black/50 backdrop-blur-xl border border-violet-500/20 overflow-hidden shadow-2xl">
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-[0.15em]">
              {saved ? "평가 완료" : "나도 평가하기"}
            </p>
          </div>

          {saved ? (
            <div className="px-5 pb-5">
              <p className="text-sm text-emerald-400 font-light">평가가 저장되었습니다. 감사합니다!</p>
            </div>
          ) : (
            <div className="px-5 pb-5 flex flex-col gap-3">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임 입력"
                className={iCls}
              />

              <StarRating label="맛 평점" emoji="⭐" value={rating} max={5} step={0.5} onChange={setRating} />
              <StarRating label="가성비" emoji="💰" value={valueScore} max={5} step={0.5} onChange={setValueScore} />
              {hasFoods && (
                <StarRating label="음식 궁합" emoji="🍽️" value={pairingScore} max={5} step={1} onChange={setPairingScore} />
              )}

              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder="한줄 코멘트 (선택)"
                className={iCls + " resize-none"}
              />

              {error && (
                <p className="text-xs text-rose-400 bg-rose-900/20 border border-rose-800/30 rounded-xl px-3 py-2">{error}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-violet-900/30 active:scale-[0.98]"
              >
                {saving ? "저장 중…" : "평가 저장"}
              </button>
            </div>
          )}

          {/* 기존 평가 목록 */}
          {evaluations.length > 0 && (
            <div className="border-t border-white/10">
              <div className="px-5 pt-3 pb-1">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">
                  다른 평가 ({evaluations.length})
                </p>
              </div>
              {evaluations.map((ev) => (
                <div key={ev.id} className="px-5 py-3 border-b border-white/10 last:border-b-0">
                  <p className="text-[11px] text-zinc-400 font-medium mb-1.5">{ev.nickname ?? "익명"}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {ev.rating != null && (
                      <span className="text-xs text-zinc-300">⭐ {Number(ev.rating).toFixed(1)}</span>
                    )}
                    {ev.value_score != null && (
                      <span className="text-xs text-zinc-300">💰 {Number(ev.value_score).toFixed(1)}</span>
                    )}
                    {ev.pairing_score != null && (
                      <span className="text-xs text-zinc-300">🍽️ {Number(ev.pairing_score).toFixed(1)}</span>
                    )}
                  </div>
                  {ev.memo && (
                    <p className="text-xs text-zinc-400 font-light mt-1">{ev.memo}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-8 pt-6 bg-gradient-to-t from-black via-black/90 to-transparent">
        <a
          href="/login"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-all text-white font-semibold text-sm shadow-lg shadow-rose-900/40"
        >
          🍷 나도 와인 기록해보기
        </a>
      </div>
    </>
  );
}
