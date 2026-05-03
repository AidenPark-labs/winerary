"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import WineDetailClient, {
  type WineDetail,
  type DedupeCandidate,
  type DupGroupMember,
  type ReportRow,
} from "./[id]/WineDetailClient";

interface Bundle {
  wine: WineDetail;
  dedupeCandidates: DedupeCandidate[];
  dupGroup: DupGroupMember[];
  reports: ReportRow[];
}

interface Props {
  wineId: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function WineDetailDrawer({ wineId, onClose, onPrev, onNext, hasPrev, hasNext }: Props) {
  const router = useRouter();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/wines/${wineId}/full`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        setBundle(null);
      } else {
        setBundle(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch 실패");
    } finally {
      setLoading(false);
    }
  }, [wineId]);

  useEffect(() => {
    load();
  }, [load]);

  // ESC 닫기, j/k 다음·이전, 입력 포커스 시 무시
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "j" && onNext && hasNext) onNext();
      else if (e.key === "k" && onPrev && hasPrev) onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  // 검수 액션 후 bundle 다시 로드 + 부모 router refresh로 카드 배지 갱신
  function handleChanged() {
    load();
    router.refresh();
  }

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      {/* drawer */}
      <aside className="fixed top-0 right-0 bottom-0 w-full max-w-4xl bg-zinc-950 border-l border-zinc-800 z-50 overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPrev && onPrev()}
              disabled={!hasPrev}
              title="이전 (k)"
              className="px-2 py-1 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
            >
              ↑
            </button>
            <button
              onClick={() => onNext && onNext()}
              disabled={!hasNext}
              title="다음 (j)"
              className="px-2 py-1 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
            >
              ↓
            </button>
            <span className="text-[11px] text-zinc-600 ml-2">j/k 이동 · ESC 닫기</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/admin/wine-db/${wineId}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              새 탭으로 열기 ↗
            </a>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-zinc-800 text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading && <p className="text-zinc-500 text-sm">불러오는 중…</p>}
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 text-sm">
              불러오기 실패: {error}
              <button onClick={load} className="ml-3 underline">
                재시도
              </button>
            </div>
          )}
          {bundle && (
            <DrawerContent bundle={bundle} onChanged={handleChanged} />
          )}
        </div>
      </aside>
    </>
  );
}

function DrawerContent({ bundle, onChanged }: { bundle: Bundle; onChanged: () => void }) {
  return (
    <WineDetailClient
      wine={bundle.wine}
      dedupeCandidates={bundle.dedupeCandidates}
      dupGroup={bundle.dupGroup}
      reports={bundle.reports}
      onChanged={onChanged}
      embedded
    />
  );
}
