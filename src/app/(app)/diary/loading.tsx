export default function DiaryLoading() {
  return (
    <div className="flex flex-col flex-1">
      <header className="px-5 pt-12 pb-4 flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-zinc-800 animate-pulse" />
        <div className="w-10 h-10 rounded-full bg-zinc-800 animate-pulse" />
      </header>

      <div className="flex flex-col gap-3 px-4 pb-28">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden bg-zinc-900 animate-pulse">
            <div className="w-full bg-zinc-800" style={{ height: "220px" }} />
            <div className="px-4 py-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="h-4 w-2/3 rounded bg-zinc-700" />
                  <div className="h-3 w-1/3 rounded bg-zinc-800" />
                </div>
                <div className="h-5 w-8 rounded bg-zinc-700" />
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-16 rounded bg-zinc-800" />
                <div className="h-3 w-20 rounded bg-zinc-800" />
              </div>
              <div className="h-3 w-24 rounded bg-zinc-800 mt-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
