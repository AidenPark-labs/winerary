import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "accent-soft" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary:
    "bg-[image:var(--gradient-primary)] text-[var(--primary-on)] hover:brightness-110 active:brightness-95 disabled:opacity-40 shadow-[0_4px_14px_rgba(122,27,46,0.25)]",
  secondary:
    "bg-white/70 backdrop-blur text-[var(--foreground)] border border-[var(--border-strong)] hover:bg-white disabled:opacity-40",
  ghost:
    "bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-alt)] disabled:opacity-40",
  "accent-soft":
    "bg-[image:var(--gradient-accent-soft)] text-[var(--accent)] hover:brightness-95 disabled:opacity-40",
  danger:
    "bg-[var(--danger)] text-white hover:brightness-95 disabled:opacity-40",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-[52px] px-5 text-lg",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", full, className = "", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
        variantClass[variant]
      } ${sizeClass[size]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
});

export default Button;
