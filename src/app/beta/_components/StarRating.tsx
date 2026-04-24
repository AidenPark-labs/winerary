"use client";

import { Star } from "lucide-react";
import { useState } from "react";

type Props = {
  value?: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
};

export default function StarRating({ value = 0, onChange, size = 28, readOnly = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const current = hover ?? value;

  return (
    <div
      role={readOnly ? "img" : "slider"}
      aria-label={`${value}점`}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = current >= i;
        const half = current >= i - 0.5 && current < i;
        return (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            aria-label={`${i}점`}
            onClick={() => onChange?.(i)}
            onMouseEnter={() => setHover(i)}
            className="p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
          >
            <Star
              size={size}
              strokeWidth={1.5}
              className={
                filled
                  ? "fill-[var(--accent)] text-[var(--accent)]"
                  : half
                  ? "fill-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--border-strong)]"
              }
            />
          </button>
        );
      })}
    </div>
  );
}
