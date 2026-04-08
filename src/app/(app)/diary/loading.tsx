export default function DiaryLoading() {
  return (
    <div className="flex flex-col flex-1">
      {/* 헤더 */}
      <header className="px-5 pt-12 pb-4 flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-zinc-800 animate-pulse" />
        <div className="w-10 h-10 rounded-full bg-zinc-800 animate-pulse" />
      </header>

      {/* 세그먼트 컨트롤 */}
      <div className="mx-5 mb-4 h-10 rounded-xl bg-surface/80 border border-white/5 animate-pulse" />

      {/* 날짜 그룹 스켈레톤 */}
      <div className="flex flex-col gap-6 pb-28">
        {Array.from({ length: 3 }).map((_, gi) => (
          <div key={gi}>
            {/* 날짜 헤더 */}
            <div className="flex items-center gap-3 px-5 mb-3">
              <div className="h-7 w-7 rounded bg-zinc-800 animate-pulse" />
              <div className="flex flex-col gap-1">
                <div className="h-3 w-16 rounded bg-zinc-800 animate-pulse" />
                <div className="h-2.5 w-10 rounded bg-zinc-800/60 animate-pulse" />
              </div>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* 카드 */}
            <div className="px-4">
              <div
                className="rounded-[24px] overflow-hidden bg-zinc-900 border border-white/5 animate-pulse flex flex-col"
                style={{ minHeight: "400px" }}
              >
                <div className="flex-1 bg-zinc-800" />
                <div className="px-5 py-4 bg-black/40 border-t border-white/5 flex flex-col gap-2">
                  <div className="h-5 w-3/4 rounded bg-zinc-700" />
                  <div className="h-3 w-1/2 rounded bg-zinc-800" />
                  <div className="flex gap-1.5 mt-1">
                    <div className="h-5 w-14 rounded-full bg-zinc-800" />
                    <div className="h-5 w-16 rounded-full bg-zinc-800" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
