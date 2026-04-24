"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function BottomSheet({ onClose, title, children, footer }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(17,24,39,0.4)] beta-scrim-enter"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[640px] bg-[var(--surface-raised)] rounded-t-[16px] shadow-[0_-8px_24px_rgba(17,24,39,0.12)] beta-sheet-enter max-h-[85vh] flex flex-col"
      >
        {/* handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-[var(--border-strong)]" />
        </div>

        <header className="flex items-center justify-between px-3 pt-1 pb-2">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--surface-alt)]"
          >
            <X size={20} />
          </button>
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          <span className="w-10" />
        </header>

        <div className="flex-1 overflow-y-auto px-3">{children}</div>

        {footer ? <div className="px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] border-t border-[var(--border)]">{footer}</div> : null}
      </div>
    </div>
  );
}
