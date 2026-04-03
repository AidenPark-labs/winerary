export default function DiaryLoading() {
  return (
    <div className="flex flex-col flex-1">
      <header className="px-5 pt-12 pb-4 flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-zinc-800 animate-pulse" />
        <div className="w-10 h-10 rounded-full bg-zinc-800 animate-pulse" />
      </header>

      <div className="px-3 pb-28 grid grid-cols-2 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl bg-zinc-900 animate-pulse"
            style={{ aspectRatio: "3/4" }}
          >
            {/* 하단 텍스트 스켈레톤 */}
            <div className="h-full flex flex-col justify-end p-3 gap-1.5">
              <div className="h-2 w-10 rounded bg-zinc-700" />
              <div className="h-4 w-full rounded bg-zinc-700" />
              <div className="h-3 w-2/3 rounded bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
