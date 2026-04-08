export default function DiaryDetailLoading() {
  return (
    <div className="relative min-h-screen bg-black">
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* 사진 히어로 */}
        <div className="relative bg-zinc-900 animate-pulse" style={{ height: "60vh" }}>
          <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/70 to-transparent" />
          {/* 헤더 버튼 */}
          <div className="absolute top-0 inset-x-0 px-4 pt-12 flex items-center justify-between z-20">
            <div className="w-9 h-9 rounded-full bg-black/40 animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-14 rounded-full bg-white/10 animate-pulse" />
              <div className="h-8 w-8 rounded-full bg-white/10 animate-pulse" />
            </div>
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="flex flex-col gap-4 px-4 -mt-12 pb-28 relative z-20">

          {/* 글라스 카드 (별점 + 날짜) */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 px-5 py-3.5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-4 w-16 rounded bg-zinc-700 animate-pulse" />
              <div className="h-4 w-px bg-white/20" />
              <div className="h-4 w-28 rounded bg-zinc-700 animate-pulse" />
            </div>
          </div>

          {/* Wine 섹션 */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
            <div className="px-5 pt-4 pb-2">
              <div className="h-3 w-10 rounded bg-zinc-700 animate-pulse" />
            </div>
            <div className="flex flex-col gap-0.5 pb-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-2.5">
                  <div className="h-3 w-10 rounded bg-zinc-800 animate-pulse" />
                  <div className={`h-3.5 rounded bg-zinc-700 animate-pulse ${i === 0 ? "w-40" : "w-16"}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Experience 섹션 */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
            <div className="px-5 pt-4 pb-2">
              <div className="h-3 w-20 rounded bg-zinc-700 animate-pulse" />
            </div>
            <div className="flex flex-col gap-0.5 pb-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-2.5">
                  <div className="h-3 w-10 rounded bg-zinc-800 animate-pulse" />
                  <div className="h-3.5 w-24 rounded bg-zinc-700 animate-pulse" />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
