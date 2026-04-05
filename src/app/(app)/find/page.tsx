"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { extractPhotoDate } from "@/lib/exif";
import { checkAuth, setPendingAction, consumePendingAction } from "@/lib/auth-guard";
import Toast from "@/components/Toast";
import AuthPrompt from "@/components/AuthPrompt";

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷", white: "화이트 🥂", rose: "로제 🌸",
  sparkling: "스파클링 ✨", fortified: "주정강화 🏺", other: "기타",
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

type Step = "select" | "preview" | "analyzing" | "result";
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
  price: number | null;
  naver_link: string | null;
  naver_image: string | null;
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
  const [wishSaved, setWishSaved] = useState(false);
  const [wishSaving, setWishSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authReturnUrl, setAuthReturnUrl] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("photo");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DbWine[]>([]);
  const [searching, setSearching] = useState(false);
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

  async function handleTextSearch() {
    const q = searchQuery.trim();
    if (!q || q.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/wines/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.wines ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
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
      vivino_url: wine.name_en ? `https://www.vivino.com/search/wines?q=${encodeURIComponent(wine.name_en)}` : undefined,
      db_match: true,
      db_price: wine.price ?? undefined,
    });
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

    const fd = new FormData();
    fd.append("file", fileBlob.current, "wine.jpg");

    try {
      const res = await fetch("/api/ai/identify", { method: "POST", body: fd });
      const data: WineResult = await res.json();
      setResult(data);
      setStep("result");

      // AI 결과 성공 시 네이버 쇼핑 검색 (한국어 이름 우선)
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
    try {
      const res = await fetch(`/api/naver/shopping?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setShopItems(data.items ?? []);
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
    setWishSaved(false);
    setWishSaving(false);
    setSearchResults([]);
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
      <header className="px-5 pt-12 pb-2 flex-shrink-0">
        <h1 className="text-2xl font-bold">와인 검색</h1>
        <p className="text-zinc-500 text-sm mt-1">사진 또는 이름으로 와인을 검색하세요</p>
      </header>

      {/* 세그먼티드 컨트롤 - select 단계에서만 표시 */}
      {step === "select" && (
        <div className="mx-5 mb-4 flex p-1 rounded-xl bg-zinc-900 border border-zinc-800 flex-shrink-0">
          {([["photo", "사진 검색"], ["text", "이름 검색"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSearchMode(key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                searchMode === key ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500"
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
              className="flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 text-sm focus:outline-none focus:border-rose-600 transition-colors"
            />
            <button
              onClick={handleTextSearch}
              disabled={searching || searchQuery.trim().length < 2}
              className="px-4 py-3 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
            >
              {searching ? "…" : "검색"}
            </button>
          </div>

          {searching && (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-rose-600 border-t-transparent animate-spin" />
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="flex flex-col gap-2.5 overflow-y-auto">
              <p className="text-zinc-500 text-sm">{searchResults.length}개의 와인을 찾았어요</p>
              {searchResults.map((wine) => (
                <button
                  key={wine.id}
                  onClick={() => selectDbWine(wine)}
                  className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-left hover:border-zinc-600 transition-colors"
                >
                  <p className="font-semibold text-white text-sm">{wine.name_ko}</p>
                  {wine.name_en && <p className="text-xs text-zinc-500 mt-0.5">{wine.name_en}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                    {wine.price && <span className="text-emerald-400 font-semibold">{wine.price.toLocaleString()}원</span>}
                    {wine.wine_type && <span>{TYPE_KO[wine.wine_type] ?? wine.wine_type}</span>}
                    {wine.country && <span>{wine.country}</span>}
                    {wine.grape_variety && <span>{wine.grape_variety}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="text-4xl">🔍</span>
              <p className="text-zinc-500 text-sm">검색 결과가 없습니다</p>
              <p className="text-zinc-600 text-xs">사진 검색으로 AI가 분석해볼 수 있어요</p>
              <button
                onClick={() => setSearchMode("photo")}
                className="text-rose-400 text-sm hover:underline"
              >
                사진으로 검색하기 →
              </button>
            </div>
          )}

          {!searching && searchQuery.trim().length < 2 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <span className="text-5xl">🍷</span>
              <p className="text-zinc-400 text-sm">와인 이름, 품종, 생산자로 검색하세요</p>
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
            className="flex-1 flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 active:bg-zinc-800/60 transition-colors"
          >
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-4xl">🍾</div>
            <div className="text-center">
              <p className="text-zinc-200 font-semibold">사진 선택</p>
              <p className="text-zinc-500 text-sm mt-1">갤러리에서 와인 라벨 사진을 선택하세요</p>
            </div>
          </button>

          {/* 카메라 버튼 */}
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-all text-white font-semibold"
          >
            <span className="text-xl">📸</span>
            지금 사진 찍기
          </button>
        </div>
      )}

      {/* ── 미리보기 ── */}
      {step === "preview" && previewUrl && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4">
          <div className="relative rounded-2xl overflow-hidden flex-1 bg-zinc-900 min-h-0">
            <img src={previewUrl} alt="선택한 사진" className="w-full h-full object-contain" />
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button onClick={reset}
              className="flex-1 py-3.5 rounded-2xl border border-zinc-700 text-zinc-300 font-medium active:scale-95 transition-all">
              다시 선택
            </button>
            <button onClick={analyze}
              className="flex-2 flex-[2] py-3.5 rounded-2xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-all text-white font-semibold">
              🤖 AI로 분석하기
            </button>
          </div>
        </div>
      )}

      {/* ── 분석 중 ── */}
      {step === "analyzing" && previewUrl && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4">
          <div className="relative rounded-2xl overflow-hidden flex-1 bg-zinc-900 min-h-0">
            <img src={previewUrl} alt="분석 중" className="w-full h-full object-contain opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full border-4 border-rose-700 border-t-transparent animate-spin" />
              <div className="text-center">
                <p className="text-white font-semibold">AI가 와인을 분석하고 있어요</p>
                <p className="text-zinc-400 text-sm mt-1">라벨 정보를 읽는 중…</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 결과 ── */}
      {step === "result" && result && (
        <div className="flex flex-col flex-1 px-4 pb-28 gap-4 overflow-y-auto">

          {result.error ? (
            /* 오류 */
            <div className="flex flex-col flex-1 items-center justify-center gap-4 text-center py-10">
              <span className="text-5xl">😅</span>
              <div>
                <p className="text-zinc-200 font-semibold">인식하지 못했어요</p>
                <p className="text-zinc-500 text-sm mt-1">{result.error}</p>
                <p className="text-zinc-600 text-sm mt-0.5">라벨이 잘 보이는 사진으로 다시 시도해보세요.</p>
              </div>
              <button onClick={reset}
                className="px-6 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors">
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

              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-4">
                {/* 이름 */}
                <div>
                  <div className="flex items-start gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-white leading-tight">{result.name}</h2>
                    {result.vintage && (
                      <span className="text-lg text-zinc-400 font-medium mt-0.5">{result.vintage}</span>
                    )}
                  </div>
                  {result.name_original && result.name_original !== result.name && (
                    <p className="text-sm text-zinc-500 italic mt-0.5">{result.name_original}</p>
                  )}
                  {(result.producer || result.country) && (
                    <p className="text-sm text-zinc-400 mt-1">
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
                {result.description && (
                  <p className="text-sm text-zinc-300 leading-relaxed">{result.description}</p>
                )}

                {/* 가격 & 페어링 */}
                {(result.db_price || shopItems.length > 0 || shopLoading || result.food_pairing) && (
                  <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5">
                    {result.db_match && result.db_price && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">✅</span>
                        <span className="text-sm text-zinc-300">한국 판매가 <span className="font-semibold text-emerald-400">{result.db_price.toLocaleString()}원</span></span>
                        <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">DB 확인</span>
                      </div>
                    )}
                    {shopLoading && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">💰</span>
                        <span className="text-sm text-zinc-500">최저가 검색 중…</span>
                      </div>
                    )}
                    {!shopLoading && shopItems.length > 0 && (() => {
                      const minPrice = Math.min(...shopItems.filter(i => i.lprice).map(i => i.lprice!));
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">💰</span>
                          <span className="text-sm text-zinc-300">네이버 최저가 <span className="font-semibold text-emerald-400">{minPrice.toLocaleString()}원</span></span>
                        </div>
                      );
                    })()}
                    {result.food_pairing && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm mt-0.5">🍽️</span>
                        <span className="text-sm text-zinc-300">{result.food_pairing}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Vivino 링크 */}
                {result.vivino_url && (
                  <a href={result.vivino_url} target="_blank" rel="noopener noreferrer"
                    className="self-start flex items-center gap-2 px-4 py-2 rounded-full border border-rose-800/60 bg-rose-950/30 text-rose-300 text-sm hover:bg-rose-900/40 transition-colors">
                    🍇 Vivino에서 더 보기 →
                  </a>
                )}
              </div>

              {/* 네이버 쇼핑 결과 */}
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-3">
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
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 transition-colors"
                      >
                        {item.image && (
                          <img
                            src={item.image}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-zinc-700"
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
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 hover:border-zinc-500 transition-colors"
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
                className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${
                  wishSaved
                    ? "bg-rose-900/30 border border-rose-700/50 text-rose-300"
                    : "bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500"
                }`}
              >
                {wishSaved ? "♥ 내 와인에 추가됨" : wishSaving ? "추가 중…" : "♡ 내 와인에 추가하기"}
              </button>

              {/* 액션 버튼 */}
              <div className="flex gap-3 flex-shrink-0">
                <button onClick={reset} disabled={recording}
                  className="flex-1 py-3.5 rounded-2xl border border-zinc-700 text-zinc-300 font-medium active:scale-95 transition-all disabled:opacity-40">
                  다시 검색
                </button>
                <button onClick={handleRecord} disabled={recording}
                  className="flex-[2] py-3.5 rounded-2xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-all text-white font-semibold disabled:opacity-60">
                  {recording ? "준비 중…" : "✍️ 이 와인 기록하기"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
