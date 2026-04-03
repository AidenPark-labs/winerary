"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { extractPhotoDate } from "@/lib/exif";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileBlob = useRef<Blob | null>(null);
  const photoDateRef = useRef<string | null>(null);

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
    fileBlob.current = null;
    photoDateRef.current = null;
  }

  // 기록하기: 사진 업로드 후 diary/new 로 이동
  async function handleRecord() {
    if (!result || result.error) return;
    setRecording(true);

    const p = new URLSearchParams();
    if (notNull(result.name)) p.set("name", result.name!);
    if (notNull(result.name_original)) p.set("name_original", result.name_original!);
    if (notNull(result.wine_type)) p.set("wine_type", result.wine_type!);
    if (notNull(result.country)) p.set("country", result.country!);
    if (notNull(result.grape_variety)) p.set("grape", result.grape_variety!);
    if (result.vintage) p.set("vintage", String(result.vintage));
    if (notNull(result.vivino_url)) p.set("vivino_url", result.vivino_url!);
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
      <header className="px-5 pt-12 pb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold">와인 검색</h1>
        <p className="text-zinc-500 text-sm mt-1">라벨 사진으로 와인 정보와 최저가를 알아보세요</p>
      </header>

      {/* ── 사진 선택 ── */}
      {step === "select" && (
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

                {/* 최저가 & 페어링 */}
                {(shopItems.length > 0 || shopLoading || result.food_pairing) && (
                  <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5">
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
                  </div>
                )}
              </div>

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
