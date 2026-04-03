export default function ProfileLoading() {
  return (
    <div className="flex flex-col animate-pulse">
      <header className="px-5 pt-12 pb-6">
        <div className="h-8 w-20 rounded-lg bg-zinc-800" />
      </header>

      <div className="px-5 pb-8 flex flex-col gap-6">
        {/* 아바타 + 정보 */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex-shrink-0" />
          <div className="flex flex-col gap-2">
            <div className="h-5 w-28 rounded bg-zinc-700" />
            <div className="h-4 w-40 rounded bg-zinc-800" />
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col items-center gap-2">
              <div className="h-8 w-10 rounded bg-zinc-700" />
              <div className="h-3 w-16 rounded bg-zinc-800" />
            </div>
          ))}
        </div>

        {/* 링크 목록 */}
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-zinc-900 border border-zinc-800" />
          ))}
        </div>

        {/* 로그아웃 버튼 */}
        <div className="h-12 rounded-xl bg-zinc-900 border border-zinc-800" />
      </div>
    </div>
  );
}
