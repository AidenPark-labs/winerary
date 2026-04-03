export default function FindLoading() {
  return (
    <div className="flex flex-col flex-1 animate-pulse">
      <header className="px-5 pt-12 pb-4">
        <div className="h-8 w-28 rounded-lg bg-zinc-800" />
        <div className="h-4 w-48 rounded bg-zinc-800 mt-2" />
      </header>
      <div className="flex flex-col flex-1 px-4 pb-28 gap-4">
        <div className="flex-1 rounded-3xl bg-zinc-900 border-2 border-zinc-800" />
        <div className="h-14 rounded-2xl bg-zinc-800" />
      </div>
    </div>
  );
}
