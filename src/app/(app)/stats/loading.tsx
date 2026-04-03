function SkeletonBar({ width }: { width: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-24 rounded bg-zinc-700" />
        <div className="h-3.5 w-8 rounded bg-zinc-700" />
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 ml-6">
        <div className="h-1.5 rounded-full bg-zinc-700 animate-pulse" style={{ width }} />
      </div>
    </div>
  );
}

export default function StatsLoading() {
  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-6">
        <div className="h-8 w-28 rounded-lg bg-zinc-800 animate-pulse" />
        <div className="h-4 w-40 rounded bg-zinc-800 animate-pulse mt-2" />
      </header>

      <div className="px-4 pb-28 flex flex-col gap-6 animate-pulse">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col gap-2">
              <div className="w-8 h-8 rounded-lg bg-zinc-700" />
              <div className="h-6 w-16 rounded bg-zinc-700" />
              <div className="h-3 w-12 rounded bg-zinc-800" />
            </div>
          ))}
        </div>

        {/* 도넛 차트 */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
          <div className="h-4 w-20 rounded bg-zinc-700 mb-4" />
          <div className="flex items-center gap-6">
            <div className="w-[120px] h-[120px] rounded-full bg-zinc-800 flex-shrink-0" style={{ background: "conic-gradient(#3f3f46 0%, #27272a 100%)" }} />
            <div className="flex flex-col gap-3 flex-1">
              {[80, 55, 40, 30].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 flex-shrink-0" />
                  <div className="h-3 rounded bg-zinc-700 flex-1" style={{ maxWidth: `${w}%` }} />
                  <div className="h-3 w-5 rounded bg-zinc-800" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 품종 바 차트 */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
          <div className="h-4 w-20 rounded bg-zinc-700 mb-4" />
          <div className="flex flex-col gap-3">
            {["90%", "65%", "45%", "30%"].map((w, i) => (
              <SkeletonBar key={i} width={w} />
            ))}
          </div>
        </div>

        {/* 월별 막대 */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
          <div className="h-4 w-20 rounded bg-zinc-700 mb-4" />
          <div className="flex items-end gap-2 h-28">
            {[40, 70, 55, 90, 35, 60].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-md bg-zinc-800" style={{ height: `${(h / 90) * 72}px` }} />
                <div className="h-2 w-5 rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
