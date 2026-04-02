"use client";

interface Props {
  message?: string;
  subMessage?: string;
}

export default function LoadingOverlay({ message = "처리 중…", subMessage }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-5 px-8">
      <div className="w-12 h-12 border-4 border-zinc-700 border-t-rose-500 rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-white font-semibold text-lg">{message}</p>
        {subMessage && <p className="text-zinc-400 text-sm mt-1">{subMessage}</p>}
      </div>
      <p className="text-zinc-600 text-xs">잠시 이 화면을 벗어나지 마세요</p>
    </div>
  );
}
