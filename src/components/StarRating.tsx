"use client";

interface StarRatingProps {
  label: string;
  emoji: string;
  value: number;
  max?: number;
  step?: 0.5 | 1;
  onChange: (v: number) => void;
}

export default function StarRating({
  label,
  emoji,
  value,
  max = 5,
  step = 0.5,
  onChange,
}: StarRatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);

  function handleTap(starIndex: number, e: React.MouseEvent | React.TouchEvent) {
    if (step === 1) {
      onChange(starIndex);
      return;
    }
    // 0.5 단위: 별의 왼쪽 반 클릭 → .5, 오른쪽 반 → 정수
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const isLeft = clientX - rect.left < rect.width / 2;
    onChange(isLeft ? starIndex - 0.5 : starIndex);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-300">
          {emoji} {label}
        </span>
        <span className="text-rose-400 font-semibold text-sm">
          {value.toFixed(step < 1 ? 1 : 0)} / {max}
        </span>
      </div>
      <div className="flex w-full">
        {stars.map((star) => {
          const filled = value >= star;
          const half = !filled && value >= star - 0.5;
          return (
            <button
              key={star}
              type="button"
              onClick={(e) => handleTap(star, e)}
              className="relative flex-1 aspect-square text-3xl select-none transition-transform active:scale-110"
              aria-label={`${star}점`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-zinc-700">
                ★
              </span>
              {filled && (
                <span className="absolute inset-0 flex items-center justify-center text-amber-400">
                  ★
                </span>
              )}
              {half && (
                <span
                  className="absolute inset-0 flex items-center justify-center text-amber-400 overflow-hidden"
                  style={{ clipPath: "inset(0 50% 0 0)" }}
                >
                  ★
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
