"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white text-lg hover:bg-black/60 transition-colors"
    >
      ←
    </button>
  );
}
