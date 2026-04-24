type Props = {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  as?: "button" | "span";
};

export default function Chip({ label, selected, onClick, as = "button" }: Props) {
  const className = `inline-flex items-center h-7 px-[10px] rounded-full text-sm transition-colors ${
    selected
      ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
      : "bg-[var(--surface-alt)] text-[var(--foreground)]"
  } ${as === "button" ? "hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" : ""}`;

  if (as === "span") return <span className={className}>{label}</span>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}
