"use client";

import { useState } from "react";
import { ImagePlus, ChevronDown } from "lucide-react";
import BottomSheet from "./BottomSheet";
import Button from "./Button";
import StarRating from "./StarRating";
import { diaries } from "../_mock/diaries";

export default function QuickRecordSheet({ onClose }: { onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState("");
  const [diaryId, setDiaryId] = useState(diaries[0].id);
  const selected = diaries.find((d) => d.id === diaryId)!;

  return (
    <BottomSheet
      title="오늘의 한 잔"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="md" full>
            더 자세히 남기기
          </Button>
          <Button
            variant="primary"
            size="md"
            full
            onClick={() => {
              // prototype: just close with imagined toast
              onClose();
            }}
          >
            가볍게 담기
          </Button>
        </div>
      }
    >
      <div className="pb-4">
        {/* photo */}
        <button
          type="button"
          className="w-full aspect-[4/3] rounded-[12px] bg-[var(--surface-alt)] border border-dashed border-[var(--border-strong)] flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)]/40 transition-colors"
        >
          <ImagePlus size={28} strokeWidth={1.8} />
          <span className="text-sm">오늘의 한 컷</span>
        </button>

        {/* rating */}
        <div className="mt-5 text-center">
          <div className="text-sm text-[var(--text-muted)] mb-2">마음에 들었나요?</div>
          <StarRating value={rating} onChange={setRating} />
        </div>

        {/* memo */}
        <div className="mt-5">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="기억해두고 싶은 한 마디"
            maxLength={200}
            rows={3}
            className="w-full resize-none rounded-[12px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-[10px] text-[15px] text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
          <div className="mt-1 text-right text-xs text-[var(--text-muted)]">{memo.length} / 200</div>
        </div>

        {/* diary picker */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              const idx = diaries.findIndex((d) => d.id === diaryId);
              setDiaryId(diaries[(idx + 1) % diaries.length].id);
            }}
            className="w-full flex items-center justify-between px-3 py-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-raised)] text-left hover:bg-[var(--surface-alt)]"
          >
            <span className="flex items-center gap-2 text-[15px]">
              <span>📖</span>
              <span>{selected.name}에 담기</span>
            </span>
            <ChevronDown size={18} className="text-[var(--text-muted)]" />
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
