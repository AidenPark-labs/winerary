interface IconProps {
  className?: string;
  size?: number;
}

/** 드롭다운 화살표 — direction="up" 이면 위, 기본은 아래 */
export function ChevronIcon({ className, size = 14, direction = "down" }: IconProps & { direction?: "up" | "down" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      style={direction === "up" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 닫기/삭제 × 아이콘 */
export function CloseIcon({ className, size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
    >
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
