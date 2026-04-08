"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-zinc-400 hover:text-zinc-200 text-2xl w-8"
    >
      ←
    </button>
  );
}
