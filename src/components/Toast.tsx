"use client";

import { useEffect } from "react";

export default function Toast({ message, visible, onHide }: {
  message: string;
  visible: boolean;
  onHide: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onHide, 2500);
    return () => clearTimeout(t);
  }, [visible, onHide]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-[slideUp_0.3s_ease-out]">
      <div className="px-5 py-3 rounded-2xl bg-rose-700 text-white text-sm font-semibold shadow-lg shadow-rose-900/40">
        {message}
      </div>
    </div>
  );
}
