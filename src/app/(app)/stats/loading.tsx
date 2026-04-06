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

function SkeletonSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
      <div className="h-4 w-20 rounded bg-zinc-700 mb-4" />
      {children}
    </div>
  );
}

export default function StatsLoading() {
  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-6">
        <div className="h-8 w-28 rounded-lg bg-zinc-800 animate-pulse" />
      </header>

      <div className="px-4 pb-28 flex flex-col gap-6 animate-pulse">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col items-center gap-2">
              <div className="w-6 h-6 rounded bg-zinc-700" />
              <div className="h-5 w-8 rounded bg-zinc-700" />
              <div className="h-2 w-10 rounded bg-zinc-800" />
            </div>
          ))}
        </div>

        {/* 국가 도넛 */}
        <SkeletonSection>
          <div className="flex items-center gap-6">
            <div className="w-[120px] h-[120px] rounded-full bg-zinc-800 flex-shrink-0" />
            <div className="flex flex-col gap-3 flex-1">
              {[80, 55, 40].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 flex-shrink-0" />
                  <div className="h-3 rounded bg-zinc-700 flex-1" style={{ maxWidth: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>
        </SkeletonSection>

        {/* 자주 마신 와인 */}
        <SkeletonSection>
          <div className="flex flex-col gap-3">
            {["90%", "70%", "45%", "30%"].map((w, i) => (
              <SkeletonBar key={i} width={w} />
            ))}
          </div>
        </SkeletonSection>

        {/* 같이 마신 사람 */}
        <SkeletonSection>
          <div className="flex flex-col gap-3">
            {["85%", "55%", "35%"].map((w, i) => (
              <SkeletonBar key={i} width={w} />
            ))}
          </div>
        </SkeletonSection>

        {/* 가성비 분석 */}
        <SkeletonSection>
          <div className="flex flex-col gap-3">
            {[70, 85, 60, 50].map((w, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-16 rounded bg-zinc-700" />
                  <div className="h-3.5 w-12 rounded bg-zinc-700" />
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800">
                  <div className="h-1.5 rounded-full bg-zinc-700" style={{ width: `${w}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SkeletonSection>

        {/* 페어링 음식 */}
        <SkeletonSection>
          <div className="flex flex-col gap-3">
            {["90%", "65%", "40%"].map((w, i) => (
              <SkeletonBar key={i} width={w} />
            ))}
          </div>
        </SkeletonSection>

        {/* 가격대별 */}
        <SkeletonSection>
          <div className="h-2 rounded-full bg-zinc-800 mb-4" />
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 flex-shrink-0" />
                <div className="h-3 w-16 rounded bg-zinc-700" />
                <div className="flex-1" />
                <div className="h-3 w-6 rounded bg-zinc-700" />
              </div>
            ))}
          </div>
        </SkeletonSection>
      </div>
    </div>
  );
}
