"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, HelpCircle, Wine, Camera, Image as ImageIcon, AlertCircle } from "lucide-react";
import { extractPhotoDate } from "@/lib/exif";
import { checkAuth, setPendingAction, consumePendingAction } from "@/lib/auth-guard";
import Toast from "@/components/Toast";
import { getWineImage } from "@/lib/wine-placeholder";
import AuthPrompt from "@/components/AuthPrompt";

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

interface WineResult {
  name?: string;
  name_original?: string;
  producer?: string;
  country?: string;
  region?: string;
  wine_type?: string;
  grape_variety?: string | null;
  vintage?: number | null;
  vivino_url?: string;
  description?: string;
  food_pairing?: string;
  error?: string;
  db_match?: boolean;
  db_price?: number;
  db_image?: string;
  vivino_rating?: number;
  vivino_reviews?: number;
  match_type?: "exact" | "candidates" | "none";
  wine_id?: string;
  candidates?: DbWine[];
}

interface ShoppingItem {
  title: string;
  link: string;
  image: string;
  lprice: number | null;
  hprice: number | null;
  mallName: string;
  productId: string;
  brand: string;
  category: string;
}

type Step = "select" | "preview" | "analyzing" | "candidates" | "result";
type SearchMode = "photo" | "text";

interface DbWine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer: string | null;
  description: string | null;
  price: number | null;
  naver_link: string | null;
  naver_image: string | null;
  vivino_url: string | null;
  vivino_page_url: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
}

function notNull(v: string | null | undefined): string | null {
  if (!v || v === "null" || v === "undefined") return null;
  return v;
}

// 클라이언트에서 이미지 리사이즈 (1200px 이하, JPEG 0.85)
function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.85);
    };
    img.src = url;
  });
}

export default function FindPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<WineResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [shopItems, setShopItems] = useState<ShoppingItem[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopPriceRange, setShopPriceRange] = useState<{ min: number; max: number } | null>(null);
  const [wishSaved, setWishSaved] = useState(false);
  const [wishSaving, setWishSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authReturnUrl, setAuthReturnUrl] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("photo");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DbWine[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchLimit, setSearchLimit] = useState(50);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [aiSearchResult, setAiSearchResult] = useState<WineResult | null>(null);
  const [photoCandidates, setPhotoCandidates] = useState<DbWine[]>([]);
  // 줌/패닝 상태
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ dist: number; cx: number; cy: number; px: number; py: number; z: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileBlob = useRef<Blob | null>(null);
  const photoDateRef = useRef<string | null>(null);

  // 로그인 후 돌아왔을 때 대기 액션 실행
  useEffect(() => {
    async function runPending() {
      if (!(await checkAuth())) return;

      // 위시리스트 추가 대기 액션
      const pending = consumePendingAction();
      if (pending?.type === "wishlist_add") {
        await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name_ko: pending.name_ko, name_en: pending.name_en }),
        });
        setWishSaved(true);
        setToast(true);
        return;
      }

      // 기록하기 대기 액션
      const pendingRecord = sessionStorage.getItem("winerary_pending_record");
      if (pendingRecord && window.location.search.includes("resume=record")) {
        sessionStorage.removeItem("winerary_pending_record");
        router.push(`/diary/new?${pendingRecord}`);
      }
    }
    runPending();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 핀치 줌/패닝 터치 핸들러
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = {
        dist: Math.hypot(dx, dy),
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        px: pan.x, py: pan.y, z: zoom,
      };
    } else if (e.touches.length === 1 && zoom > 1) {
      touchRef.current = {
        dist: 0,
        cx: e.touches[0].clientX, cy: e.touches[0].clientY,
        px: pan.x, py: pan.y, z: zoom,
      };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchRef.current) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const scale = Math.min(Math.max(touchRef.current.z * (newDist / touchRef.current.dist), 1), 5);
      setZoom(scale);
      if (scale === 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && zoom > 1) {
      const dx = e.touches[0].clientX - touchRef.current.cx;
      const dy = e.touches[0].clientY - touchRef.current.cy;
      setPan({ x: touchRef.current.px + dx, y: touchRef.current.py + dy });
    }
  }

  function handleTouchEnd() {
    touchRef.current = null;
  }

  // 확대된 영역만 크롭하여 Blob 반환
  function cropVisibleArea(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!fileBlob.current || zoom <= 1) {
        resolve(fileBlob.current!);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const container = imgContainerRef.current;
        if (!container) { resolve(fileBlob.current!); return; }

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        // 이미지가 object-contain으로 표시된 실제 크기 계산
        const imgRatio = img.width / img.height;
        const containerRatio = cw / ch;
        let displayW: number, displayH: number;
        if (imgRatio > containerRatio) {
          displayW = cw; displayH = cw / imgRatio;
        } else {
          displayH = ch; displayW = ch * imgRatio;
        }

        // 보이는 영역의 이미지 좌표 계산
        const scale = img.width / (displayW * zoom);
        const offsetX = ((cw / 2 - pan.x) - displayW * zoom / 2) * (img.width / (displayW * zoom));
        const offsetY = ((ch / 2 - pan.y) - displayH * zoom / 2) * (img.height / (displayH * zoom));
        const cropW = cw * scale;
        const cropH = ch * scale;

        const sx = Math.max(0, Math.min(offsetX, img.width - cropW));
        const sy = Math.max(0, Math.min(offsetY, img.height - cropH));

        const canvas = document.createElement("canvas");
        canvas.width = Math.min(cropW, img.width);
        canvas.height = Math.min(cropH, img.height);
        canvas.getContext("2d")!.drawImage(img, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
      };
      img.src = URL.createObjectURL(fileBlob.current!);
    });
  }

  async function handleTextSearch() {
    const q = searchQuery.trim();
    if (!q || q.length < 2) return;
    setSearching(true);
    setSearchResults([]);
    setAiSearchResult(null);
    setSearchHasMore(false);
    setSearchLimit(50);
    setLastQuery(q);
    try {
      // 1차: DB 검색
      const res = await fetch(`/api/wines/search?q=${encodeURIComponent(q)}&limit=50`);
      const data = await res.json();
      if (data.wines?.length > 0) {
        setSearchResults(data.wines);
        setSearchHasMore(!!data.hasMore);
      } else {
        // 2차: AI 검색 폴백
        const aiRes = await fetch(`/api/ai/identify-by-name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const aiData = await aiRes.json();
        if (aiData && !aiData.error) {
          setAiSearchResult(aiData);
        }
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function loadMoreSearchResults() {
    if (!lastQuery || loadingMore) return;
    const nextLimit = Math.min(searchLimit + 50, 500);
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/wines/search?q=${encodeURIComponent(lastQuery)}&limit=${nextLimit}`);
      const data = await res.json();
      if (data.wines?.length > 0) {
        setSearchResults(data.wines);
        setSearchHasMore(!!data.hasMore && nextLimit < 500);
        setSearchLimit(nextLimit);
      } else {
        setSearchHasMore(false);
      }
    } catch {
      // swallow
    } finally {
      setLoadingMore(false);
    }
  }

  // 텍스트 검색 결과에서 와인 선택 → 상세 결과로 전환
  function selectDbWine(wine: DbWine) {
    setResult({
      name: wine.name_ko,
      name_original: wine.name_en ?? undefined,
      wine_type: wine.wine_type ?? undefined,
      country: wine.country ?? undefined,
      region: wine.region ?? undefined,
      grape_variety: wine.grape_variety,
      producer: wine.producer ?? undefined,
      description: wine.description ?? undefined,
      vivino_url: wine.vivino_page_url ?? wine.vivino_url ?? (wine.name_en ? `https://www.vivino.com/search/wines?q=${encodeURIComponent(wine.name_en)}` : undefined),
      vivino_rating: wine.vivino_rating ?? undefined,
      vivino_reviews: wine.vivino_reviews ?? undefined,
      db_match: true,
      db_price: wine.price ?? undefined,
      db_image: wine.naver_image ?? undefined,
    });
    setPreviewUrl(wine.naver_image ?? null);
    setStep("result");
    // 네이버 쇼핑 검색도 실행
    if (wine.name_ko) searchShopping(wine.name_ko);
  }

  async function handleFile(file: File) {
    // Extract date from original File BEFORE resize (resize strips EXIF + lastModified)
    photoDateRef.current = await extractPhotoDate(file);
    const blob = await resizeImage(file);
    fileBlob.current = blob;
    setPreviewUrl(URL.createObjectURL(blob));
    setStep("preview");
  }

  async function analyze() {
    if (!fileBlob.current) return;
    setStep("analyzing");

    // 줌이 적용된 경우 보이는 영역만 크롭
    const imageBlob = zoom > 1 ? await cropVisibleArea() : fileBlob.current;
    const fd = new FormData();
    fd.append("file", imageBlob, "wine.jpg");

    try {
      const res = await fetch("/api/ai/identify", { method: "POST", body: fd });
      const data: WineResult = await res.json();

      // 정확 매칭: 상세 페이지로 바로 이동
      if (!data.error && data.match_type === "exact" && data.wine_id) {
        router.push(`/wines/${data.wine_id}`);
        return;
      }

      // 후보 여러 건: 후보 리스트 표시
      if (!data.error && data.match_type === "candidates" && data.candidates && data.candidates.length > 0) {
        setResult(data);
        setPhotoCandidates(data.candidates);
        setStep("candidates");
        return;
      }

      // DB에 없음(또는 에러): 기존 AI 결과 카드
      setResult(data);
      setStep("result");

      if (!data.error && (data.name || data.name_original)) {
        searchShopping(data.name || data.name_original!);
      }
    } catch {
      setResult({ error: "분석 중 오류가 발생했습니다. 다시 시도해주세요." });
      setStep("result");
    }
  }

  async function searchShopping(query: string) {
    setShopLoading(true);
    setShopItems([]);
    setShopPriceRange(null);
    try {
      const res = await fetch(`/api/naver/shopping?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setShopItems(data.items ?? []);
      setShopPriceRange(data.priceRange ?? null);
    } catch {
      // 쇼핑 검색 실패해도 무시
    } finally {
      setShopLoading(false);
    }
  }

  function reset() {
    setStep("select");
    setPreviewUrl(null);
    setResult(null);
    setShopItems([]);
    setShopLoading(false);
    setShopPriceRange(null);
    setWishSaved(false);
    setWishSaving(false);
    setSearchResults([]);
    setAiSearchResult(null);
    setPhotoCandidates([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    fileBlob.current = null;
    photoDateRef.current = null;
  }

  function buildWineParams() {
    if (!result || result.error) return null;
    const p = new URLSearchParams();
    if (notNull(result.name)) p.set("name", result.name!);
    if (notNull(result.name_original)) p.set("name_original", result.name_original!);
    if (notNull(result.wine_type)) p.set("wine_type", result.wine_type!);
    if (notNull(result.country)) p.set("country", result.country!);
    if (notNull(result.grape_variety)) p.set("grape", result.grape_variety!);
    if (result.vintage) p.set("vintage", String(result.vintage));
    if (notNull(result.vivino_url)) p.set("vivino_url", result.vivino_url!);
    return p;
  }

  // 기록하기: 사진 업로드 후 diary/new 로 이동
  async function handleRecord() {
    if (!result || result.error) return;
    if (!(await checkAuth())) {
      const p = buildWineParams();
      if (p) {
        sessionStorage.setItem("winerary_pending_record", p.toString());
        setAuthReturnUrl("/find?resume=record");
      }
      setShowAuthPrompt(true);
      return;
    }
    setRecording(true);

    const p = buildWineParams()!;
    if (photoDateRef.current) p.set("date", photoDateRef.current);

    // 분석에 사용한 사진을 스토리지에 업로드해서 파라미터로 전달
    if (fileBlob.current) {
      try {
        const fd = new FormData();
        fd.append("file", fileBlob.current, "wine.jpg");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.url) p.set("photo", data.url);
      } catch {
        // 업로드 실패해도 진행
      }
    }

    router.push(`/diary/new?${p.toString()}`);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {showAuthPrompt && <AuthPrompt message="와인을 저장하거나 기록하려면 로그인이 필요합니다" returnUrl={authReturnUrl} />}
      <Toast message="내 와인에 추가되었어요!" visible={toast} onHide={() => setToast(false)} />
      <header className="sticky top-0 z-30 px-5 pt-8 pb-2 flex-shrink-0 bg-background">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">와인검색</h1>
            <p className="text-zinc-500 text-sm mt-1">사진 또는 이름으로 와인을 검색하세요</p>
          </div>
          <Link
            href="/dictionary"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs hover:bg-white/10 transition-colors mt-1"
          >
            와인 사전 →
          </Link>
        </div>
      </header>

      {/* 세그먼티드 컨트롤 - select 단계에서만 표시 */}
      {step === "select" && (
        <div className="mx-5 mb-4 flex p-1 rounded-xl bg-surface border border-white/5 flex-shrink-0 backdrop-blur-md">
          {([["photo", "사진 검색"], ["text", "이름 검색"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSearchMode(key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                searchMode === key ? "bg-white/10 text-white shadow-sm" : "text-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── 텍스트 검색 ── */}
      {step === "select" && searchMode === "text" && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTextSearch()}
              placeholder="와인 이름을 입력하세요"
              className="flex-1 rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-zinc-100 text-sm focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
            />
            <button
              onClick={handleTextSearch}
              disabled={searching || searchQuery.trim().length < 2}
              className="px-4 py-3 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 text-white font-medium text-sm transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
            >
              {searching ? "…" : "검색"}
            </button>
          </div>

          {searching && (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin shadow-lg shadow-accent/20" />
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="flex flex-col gap-2.5 overflow-y-auto">
              <p className="text-zinc-500 text-sm">
                {searchResults.length}개{searchHasMore ? "+" : ""}의 와인을 찾았어요
              </p>
              {searchResults.map((wine) => (
                <Link
                  key={wine.id}
                  href={`/wines/${wine.id}`}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surface/80 border border-white/5 text-left hover:border-white/20 transition-all backdrop-blur-sm"
                >
                  <img src={getWineImage(wine.naver_image, wine.wine_type)} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-white/5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{wine.name_ko}</p>
                    {wine.name_en && <p className="text-xs text-zinc-500 mt-0.5 truncate">{wine.name_en}</p>}
                    <div className="flex items-center gap-2.5 mt-1.5 text-xs text-zinc-400">
                      {wine.price && <span className="text-emerald-400 font-semibold">{wine.price.toLocaleString()}원</span>}
                      {wine.vivino_rating && <span className="text-purple-300">★ {wine.vivino_rating}</span>}
                      {wine.wine_type && <span>{TYPE_KO[wine.wine_type] ?? wine.wine_type}</span>}
                      {wine.country && <span>{wine.country}</span>}
                    </div>
                  </div>
                </Link>
              ))}
              {searchHasMore && (
                <button
                  onClick={loadMoreSearchResults}
                  disabled={loadingMore || searchLimit >= 500}
                  className="py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-light transition-all disabled:opacity-40"
                >
                  {loadingMore ? "불러오는 중…" : searchLimit >= 500 ? "최대 500개까지 표시됩니다 — 검색어를 구체화해 주세요" : "더 보기"}
                </button>
              )}
            </div>
          )}

          {/* AI 검색 결과 */}
          {!searching && searchResults.length === 0 && aiSearchResult && !aiSearchResult.error && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">AI 검색</span>
                <p className="text-zinc-500 text-sm font-light">DB에 없지만 AI가 찾았어요</p>
              </div>
              <button
                onClick={() => {
                  setResult(aiSearchResult);
                  setStep("result");
                  if (aiSearchResult.name || aiSearchResult.name_original) {
                    searchShopping(aiSearchResult.name || aiSearchResult.name_original!);
                  }
                }}
                className="p-4 rounded-2xl bg-surface/80 border border-white/5 text-left hover:border-white/20 transition-all backdrop-blur-sm"
              >
                <p className="font-semibold text-white text-sm">{aiSearchResult.name}</p>
                {aiSearchResult.name_original && (
                  <p className="text-xs text-zinc-500 mt-0.5">{aiSearchResult.name_original}</p>
                )}
                <div className="flex items-center gap-2.5 mt-1.5 text-xs text-zinc-400">
                  {aiSearchResult.wine_type && <span>{TYPE_KO[aiSearchResult.wine_type] ?? aiSearchResult.wine_type}</span>}
                  {aiSearchResult.country && <span>{aiSearchResult.country}</span>}
                  {aiSearchResult.grape_variety && <span>{aiSearchResult.grape_variety}</span>}
                </div>
              </button>
            </div>
          )}

          {/* 검색 결과 없음 */}
          {!searching && searchResults.length === 0 && !aiSearchResult && searchQuery.trim().length >= 2 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Search className="w-12 h-12 text-zinc-700" />
              <p className="text-zinc-500 text-sm font-light">검색 결과가 없습니다</p>
              <p className="text-zinc-600 text-xs font-light">사진 검색으로 AI가 분석해볼 수 있어요</p>
              <button
                onClick={() => setSearchMode("photo")}
                className="text-accent text-sm hover:underline font-light mt-1"
              >
                사진으로 검색하기 →
              </button>
            </div>
          )}

          {/* AI도 못 찾은 경우 */}
          {!searching && searchResults.length === 0 && aiSearchResult?.error && searchQuery.trim().length >= 2 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <HelpCircle className="w-12 h-12 text-zinc-700" />
              <p className="text-zinc-500 text-sm font-light">DB와 AI 모두에서 찾지 못했어요</p>
              <button
                onClick={() => setSearchMode("photo")}
                className="text-accent text-sm hover:underline font-light mt-1"
              >
                사진으로 검색하기 →
              </button>
            </div>
          )}

          {!searching && searchQuery.trim().length < 2 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Wine className="w-16 h-16 text-zinc-800" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">와인 이름, 품종, 생산자로 검색하세요</p>
            </div>
          )}
        </div>
      )}

      {/* ── 사진 선택 ── */}
      {step === "select" && searchMode === "photo" && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4">
          {/* 히든 파일 인풋 */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

          {/* 대형 업로드 영역 */}
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/20 bg-surface/50 active:bg-surface/80 transition-all font-light"
          >
            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-zinc-400" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-zinc-200 font-semibold tracking-wide">사진 선택</p>
              <p className="text-zinc-500 text-sm mt-1 font-light">갤러리에서 와인 라벨 사진을 선택하세요</p>
            </div>
          </button>

          {/* 카메라 버튼 */}
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all text-white font-medium shadow-lg shadow-accent/20"
          >
            <Camera className="w-5 h-5" />
            지금 사진 찍기
          </button>
        </div>
      )}

      {/* ── 미리보기 (핀치 줌/패닝 지원) ── */}
      {step === "preview" && previewUrl && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-3">
          <div
            ref={imgContainerRef}
            className="relative rounded-2xl overflow-hidden flex-1 bg-zinc-900 min-h-0 touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={previewUrl}
              alt="선택한 사진"
              className="w-full h-full object-contain transition-transform duration-75"
              style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
              draggable={false}
            />
            {zoom <= 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <span className="px-3 py-1.5 rounded-full bg-black/60 text-zinc-300 text-xs">
                  두 손가락으로 확대하여 라벨에 집중하세요
                </span>
              </div>
            )}
            {zoom > 1 && (
              <button
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 text-zinc-300 text-xs"
              >
                원본 보기
              </button>
            )}
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button onClick={() => { reset(); setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="flex-1 py-3.5 rounded-2xl border border-white/10 text-zinc-300 font-medium active:scale-95 transition-all bg-white/5 hover:bg-white/10">
              다시 선택
            </button>
            <button onClick={analyze}
              className="flex-[2] py-3.5 rounded-2xl bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all text-white font-medium shadow-lg shadow-accent/20">
              {zoom > 1 ? "🔍 선택 영역 분석하기" : "🤖 AI로 분석하기"}
            </button>
          </div>
        </div>
      )}

      {/* ── 분석 중 ── */}
      {step === "analyzing" && previewUrl && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4">
          <div className="relative rounded-2xl overflow-hidden flex-1 bg-surface min-h-0">
            <img src={previewUrl} alt="분석 중" className="w-full h-full object-contain opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full border-4 border-accent border-t-transparent animate-spin shadow-xl shadow-accent/20" />
              <div className="text-center">
                <p className="text-white font-serif tracking-wide">AI가 와인을 분석하고 있어요</p>
                <p className="text-zinc-500 text-sm mt-1 font-light">라벨 정보를 읽는 중…</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 후보 리스트 ── */}
      {step === "candidates" && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4 overflow-y-auto">
          {previewUrl && (
            <div className="rounded-2xl overflow-hidden bg-zinc-900 flex-shrink-0" style={{ height: "160px" }}>
              <img src={previewUrl} alt="분석한 사진" className="w-full h-full object-contain" />
            </div>
          )}
          <div>
            <p className="text-zinc-200 font-semibold tracking-wide">일치할 수 있는 와인을 {photoCandidates.length}개 찾았어요</p>
            <p className="text-zinc-500 text-sm mt-1 font-light">정확한 와인을 선택해주세요</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {photoCandidates.map((wine) => (
              <Link
                key={wine.id}
                href={`/wines/${wine.id}`}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface/80 border border-white/5 text-left hover:border-white/20 transition-all backdrop-blur-sm"
              >
                <img src={getWineImage(wine.naver_image, wine.wine_type)} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-white/5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{wine.name_ko}</p>
                  {wine.name_en && <p className="text-xs text-zinc-500 mt-0.5 truncate">{wine.name_en}</p>}
                  <div className="flex items-center gap-2.5 mt-1.5 text-xs text-zinc-400">
                    {wine.price && <span className="text-emerald-400 font-semibold">{wine.price.toLocaleString()}원</span>}
                    {wine.vivino_rating && <span className="text-purple-300">★ {wine.vivino_rating}</span>}
                    {wine.wine_type && <span>{TYPE_KO[wine.wine_type] ?? wine.wine_type}</span>}
                    {wine.country && <span>{wine.country}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <button
            onClick={() => {
              if (!result) { reset(); return; }
              // DB에서 일치 항목이 없다고 판단되면 AI 결과로 폴백
              setStep("result");
              if (result.name || result.name_original) {
                searchShopping(result.name || result.name_original!);
              }
            }}
            className="py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-light transition-all"
          >
            일치하는 와인이 없어요 — AI 분석 결과 보기
          </button>
          <button
            onClick={reset}
            className="py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400 text-sm font-light transition-all"
          >
            다시 검색
          </button>
        </div>
      )}

      {/* ── 결과 ── */}
      {step === "result" && result && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4 overflow-y-auto">

          {result.error ? (
            /* 오류 */
            <div className="flex flex-col flex-1 items-center justify-center gap-4 text-center py-10">
              <AlertCircle className="w-16 h-16 text-zinc-700" strokeWidth={1} />
              <div>
                <p className="text-zinc-200 font-semibold tracking-wide">인식하지 못했어요</p>
                <p className="text-zinc-500 text-sm mt-1 font-light">{result.error}</p>
                <p className="text-zinc-600 text-sm mt-0.5 font-light">라벨이 잘 보이는 사진으로 다시 시도해보세요.</p>
              </div>
              <button onClick={reset}
                className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-200 font-medium transition-all">
                다시 시도
              </button>
            </div>
          ) : (
            /* 성공 */
            <>
              {previewUrl && (
                <div className="rounded-2xl overflow-hidden bg-zinc-900" style={{ height: "220px" }}>
                  <img src={previewUrl} alt="와인 사진" className="w-full h-full object-contain" />
                </div>
              )}

              <div className="rounded-2xl bg-surface/80 border border-white/10 p-5 flex flex-col gap-4 shadow-xl backdrop-blur-md">
                {/* 이름 */}
                <div>
                  <div className="flex items-start gap-2 flex-wrap">
                    <h2 className="text-2xl font-serif font-medium text-white leading-tight drop-shadow-sm">{result.name}</h2>
                    {result.vintage && (
                      <span className="text-lg text-zinc-400 font-light mt-0.5">{result.vintage}</span>
                    )}
                  </div>
                  {result.name_original && result.name_original !== result.name && (
                    <p className="text-sm text-zinc-500 italic mt-0.5 font-light">{result.name_original}</p>
                  )}
                  {(result.producer || result.country) && (
                    <p className="text-sm text-zinc-400 mt-1 font-light">
                      {[result.producer, result.country, result.region].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                {/* 태그 */}
                <div className="flex flex-wrap gap-2">
                  {result.wine_type && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                      {TYPE_KO[result.wine_type] ?? result.wine_type}
                    </span>
                  )}
                  {notNull(result.grape_variety) && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                      🍇 {result.grape_variety}
                    </span>
                  )}
                </div>

                {/* 설명 */}
                {result.description && !/예상됩니다|것으로 보입니다|추정됩니다|부족하|알 수 없|명확한 정보|정보가 제한/.test(result.description) && (
                  <p className="text-sm text-zinc-300 leading-relaxed">{result.description}</p>
                )}

                {/* 가격 & 페어링 */}
                {(shopItems.length > 0 || shopLoading || result.food_pairing) && (
                  <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5">
                    {shopLoading && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">💰</span>
                        <span className="text-sm text-zinc-500">가격 검색 중… (750ml 기준)</span>
                      </div>
                    )}
                    {!shopLoading && shopPriceRange && (() => {
                      const { min, max } = shopPriceRange;
                      const isSame = min === max;
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">💰</span>
                          <span className="text-sm text-zinc-300">
                            {isSame ? (
                              <>네이버 최저가 <span className="font-semibold text-emerald-400">{min.toLocaleString()}원</span></>
                            ) : (
                              <>판매가 <span className="font-semibold text-emerald-400">{min.toLocaleString()}~{max.toLocaleString()}원</span></>
                            )}
                          </span>
                          <span className="text-[10px] text-zinc-600">750ml</span>
                        </div>
                      );
                    })()}
                    {!shopLoading && !shopPriceRange && shopItems.length === 0 && result.db_price && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">💰</span>
                        <span className="text-sm text-zinc-300">참고가 <span className="font-semibold text-emerald-400">{result.db_price.toLocaleString()}원</span></span>
                      </div>
                    )}
                    {result.food_pairing && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm mt-0.5">🍽️</span>
                        <span className="text-sm text-zinc-300">{result.food_pairing}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Vivino 별점 + 링크 */}
                {(result.vivino_rating || result.vivino_url) && (
                  <div className="flex items-center gap-3">
                    {result.vivino_rating && (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-950/30 border border-purple-800/40">
                        <span className="text-purple-300 text-sm font-bold">★ {result.vivino_rating.toFixed(1)}</span>
                        {result.vivino_reviews && (
                          <span className="text-purple-400/60 text-xs">({result.vivino_reviews.toLocaleString()})</span>
                        )}
                        <span className="text-purple-400/40 text-xs ml-0.5">Vivino</span>
                      </div>
                    )}
                    {result.vivino_url && (
                      <a href={result.vivino_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-accent text-xs hover:bg-white/10 transition-colors">
                        Vivino에서 보기 →
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* 네이버 쇼핑 결과 */}
              <div className="rounded-2xl bg-surface/80 border border-white/10 p-5 flex flex-col gap-3 shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">네이버 쇼핑 최저가</h3>
                  {shopLoading && (
                    <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                  )}
                </div>

                {shopLoading && shopItems.length === 0 && (
                  <p className="text-sm text-zinc-500">가격 정보를 검색하고 있어요…</p>
                )}

                {!shopLoading && shopItems.length === 0 && (
                  <p className="text-sm text-zinc-500">검색 결과가 없습니다</p>
                )}

                {shopItems.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    {shopItems.slice(0, 5).map((item) => (
                      <a
                        key={item.productId || item.link}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
                      >
                        {item.image && (
                          <img
                            src={item.image}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-white/5"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 line-clamp-2 leading-snug">{item.title}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{item.mallName}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {item.lprice && (
                            <p className="text-sm font-bold text-emerald-400">{item.lprice.toLocaleString()}원</p>
                          )}
                        </div>
                      </a>
                    ))}
                    <a
                      href={`https://msearch.shopping.naver.com/search/all?query=${encodeURIComponent(result.name || result.name_original || "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-white/10 bg-white/5 text-zinc-300 text-sm hover:bg-white/10 transition-colors font-light"
                    >
                      네이버에서 전체 가격 확인하기 →
                    </a>
                  </div>
                )}
              </div>

              {/* 내 와인에 추가 */}
              <button
                onClick={async () => {
                  if (wishSaved || wishSaving) return;
                  if (!(await checkAuth())) {
                    setPendingAction({
                      type: "wishlist_add",
                      name_ko: result.name || result.name_original || "",
                      name_en: result.name_original || result.name || "",
                    });
                    setAuthReturnUrl("/find");
                    setShowAuthPrompt(true);
                    return;
                  }
                  setWishSaving(true);
                  await fetch("/api/wishlist", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name_ko: result.name || result.name_original || "",
                      name_en: result.name_original || result.name || "",
                    }),
                  });
                  setWishSaved(true);
                  setWishSaving(false);
                  setToast(true);
                }}
                disabled={wishSaving || wishSaved}
                className={`w-full py-3.5 rounded-2xl font-light text-sm transition-all shadow-lg active:scale-[0.98] ${
                  wishSaved
                    ? "bg-accent/20 border border-accent/40 text-accent/80"
                    : "bg-surface/80 border border-white/10 text-zinc-200 hover:bg-white/5"
                }`}
              >
                {wishSaved ? "♥ 내 와인에 추가됨" : wishSaving ? "추가 중…" : "♡ 내 와인에 추가하기"}
              </button>

              {/* 액션 버튼 */}
              <div className="flex gap-3 flex-shrink-0">
                <button onClick={reset} disabled={recording}
                  className="flex-1 py-3.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 font-medium active:scale-[0.98] transition-all disabled:opacity-40">
                  다시 검색
                </button>
                <button onClick={handleRecord} disabled={recording}
                  className="flex-[2] py-3.5 rounded-2xl bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all text-white font-medium shadow-lg shadow-accent/20 disabled:opacity-60">
                  {recording ? "준비 중…" : "이 와인 기록하기"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
