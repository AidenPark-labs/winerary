"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { extractPhotoDate } from "@/lib/exif";
import type { WineSuggestion, WineType } from "@/types";
import { createWineRecord } from "@/lib/actions/diary";
import LoadingOverlay from "@/components/LoadingOverlay";
import StarRating from "@/components/StarRating";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "photo" | "wine" | "review";

interface AiResult {
  name?: string;
  name_original?: string;
  producer?: string;
  country?: string;
  wine_type?: string;
  grape_variety?: string | null;
  vintage?: number | null;
  vivino_url?: string;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: "red", label: "레드 🍷" },
  { value: "white", label: "화이트 🥂" },
  { value: "rose", label: "로제 🌸" },
  { value: "sparkling", label: "스파클링 ✨" },
  { value: "fortified", label: "주정강화 🏺" },
  { value: "other", label: "기타" },
];

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷", white: "화이트 🥂", rose: "로제 🌸",
  sparkling: "스파클링 ✨", fortified: "주정강화 🏺", other: "기타",
};

const GRAPE_OPTIONS = [
  "카베르네 소비뇽", "메를로", "피노 누아", "시라/쉬라즈", "말벡",
  "산지오베제", "템프라니요", "그르나슈", "카베르네 프랑", "네비올로",
  "진판델", "무르베드르", "몬테풀치아노",
  "샤르도네", "소비뇽 블랑", "리슬링", "피노 그리지오", "게뷔르츠트라미너",
  "비오니에", "알바리뇨", "뮈스카", "세미용", "그뤼너 펠트리너",
];

const COUNTRY_OPTIONS = [
  "프랑스", "이탈리아", "스페인", "포르투갈", "독일", "오스트리아",
  "미국", "칠레", "아르헨티나", "호주", "뉴질랜드",
  "남아프리카공화국", "조지아", "헝가리", "그리스", "한국",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notNull(v: string | null | undefined): string | null {
  if (!v || v === "null" || v === "undefined") return null;
  return v;
}

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

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1280;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const r = Math.min(MAX / width, MAX / height);
        width = Math.round(width * r); height = Math.round(height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/jpeg", 0.80);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
}

function fillWineFields(
  ai: AiResult,
  setters: {
    setQuery: (v: string) => void;
    setWineNameOriginal: (v: string) => void;
    setWineType: (v: WineType | "") => void;
    setWineVintage: (v: string) => void;
    setGrape: (v: string) => void;
    setGrapeCustom: (v: string) => void;
    setCountry: (v: string) => void;
    setCountryCustom: (v: string) => void;
    setSelectedWine: (v: WineSuggestion) => void;
  }
) {
  const name = notNull(ai.name) ?? "";
  const nameOrig = notNull(ai.name_original) ?? name;
  setters.setQuery(name);
  setters.setWineNameOriginal(nameOrig);

  if (ai.vintage) setters.setWineVintage(String(ai.vintage));

  const typeMap: Record<string, WineType> = {
    red: "red", white: "white", rose: "rose",
    sparkling: "sparkling", fortified: "fortified", other: "other",
  };
  if (ai.wine_type) setters.setWineType(typeMap[ai.wine_type] ?? "");

  const grapeVal = notNull(ai.grape_variety);
  if (grapeVal) {
    const match = GRAPE_OPTIONS.find((g) => grapeVal.includes(g));
    if (match) setters.setGrape(match);
    else { setters.setGrape("__custom__"); setters.setGrapeCustom(grapeVal); }
  }

  const countryVal = notNull(ai.country);
  if (countryVal) {
    const match = COUNTRY_OPTIONS.find((c) => countryVal.includes(c));
    if (match) setters.setCountry(match);
    else { setters.setCountry("__custom__"); setters.setCountryCustom(countryVal); }
  }

  setters.setSelectedWine({
    name: nameOrig,
    name_ko: name,
    producer: ai.producer || "",
    country: notNull(ai.country) ?? "",
    type: ai.wine_type || "",
    grapes: notNull(ai.grape_variety) ?? "",
    vintage_range: "",
    vivino_url: notNull(ai.vivino_url) ?? `https://www.vivino.com/search/wines?q=${encodeURIComponent(nameOrig)}`,
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NewDiaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const hasUrlParams = !!searchParams.get("name");
  const [step, setStep] = useState<Step>(hasUrlParams ? "wine" : "photo");

  // ── Photo step state ──
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // ── Wine step state ──
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiNotFound, setAiNotFound] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<WineSuggestion[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedWine, setSelectedWine] = useState<WineSuggestion | null>(null);
  const [wineNameOriginal, setWineNameOriginal] = useState("");
  const [wineType, setWineType] = useState<WineType | "">("");
  const [wineVintage, setWineVintage] = useState<string>("");
  const [grape, setGrape] = useState("");
  const [grapeCustom, setGrapeCustom] = useState("");
  const [country, setCountry] = useState("");
  const [countryCustom, setCountryCustom] = useState("");

  // ── Review step state ──
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [drunkAt, setDrunkAt] = useState(new Date().toISOString().split("T")[0]);
  const [location, setLocation] = useState("");
  const [companions, setCompanions] = useState("");
  const [foodInput, setFoodInput] = useState("");
  const [foods, setFoods] = useState<string[]>([]);
  const [rating, setRating] = useState(3);
  const [pairingScore, setPairingScore] = useState(3);
  const [price, setPrice] = useState("");
  const [valueScore, setValueScore] = useState(3);
  const [memo, setMemo] = useState("");
  const [visibility, setVisibility] = useState<"private" | "link" | "public">("private");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iCls = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";
  const currentYear = new Date().getFullYear();
  const vintageYears = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

  // ── URL params (from 와인찾기 page) ──
  useEffect(() => {
    if (!hasUrlParams) return;
    const name = searchParams.get("name")!;
    const nameOriginal = searchParams.get("name_original") || name;
    const vivinoUrl = searchParams.get("vivino_url") ||
      `https://www.vivino.com/search/wines?q=${encodeURIComponent(nameOriginal)}`;

    const synth: AiResult = {
      name,
      name_original: nameOriginal,
      wine_type: searchParams.get("wine_type") ?? undefined,
      country: searchParams.get("country") ?? undefined,
      grape_variety: searchParams.get("grape"),
      vintage: searchParams.get("vintage") ? parseInt(searchParams.get("vintage")!) : null,
      vivino_url: vivinoUrl,
    };
    setAiResult(synth);
    fillWineFields(synth, { setQuery, setWineNameOriginal, setWineType, setWineVintage, setGrape, setGrapeCustom, setCountry, setCountryCustom, setSelectedWine });

    const dateParam = searchParams.get("date");
    if (dateParam) setDrunkAt(dateParam);

    const photoParam = searchParams.get("photo");
    if (photoParam) {
      setPhotos([photoParam]);
      setPhotoPreviews([photoParam]);
      setLocalPreview(photoParam);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 1: Photo selection ──
  async function handleFile(file: File) {
    const date = await extractPhotoDate(file);
    if (date) setDrunkAt(date);

    const blob = await resizeImage(file);
    const blobUrl = URL.createObjectURL(blob);
    setLocalPreview(blobUrl);
    setAnalyzing(true);

    const fd1 = new FormData(); fd1.append("file", blob, "wine.jpg");
    const fd2 = new FormData(); fd2.append("file", blob, "wine.jpg");

    try {
      const [aiData, uploadResult] = await Promise.all([
        fetch("/api/ai/identify", { method: "POST", body: fd1 }).then((r) => r.json() as Promise<AiResult>),
        fetch("/api/upload", { method: "POST", body: fd2 }).then(async (r) => ({ ok: r.ok, data: await r.json() })),
      ]);

      // Apply uploaded URL
      if (uploadResult.ok && uploadResult.data.url) {
        setPhotos([uploadResult.data.url]);
        setPhotoPreviews([uploadResult.data.url]);
      } else {
        setPhotoPreviews([blobUrl]);
      }

      // Apply AI result
      if (!aiData.error && notNull(aiData.name)) {
        setAiResult(aiData);
        setAiNotFound(false);
        fillWineFields(aiData, { setQuery, setWineNameOriginal, setWineType, setWineVintage, setGrape, setGrapeCustom, setCountry, setCountryCustom, setSelectedWine });
      } else {
        setAiResult(null);
        setAiNotFound(true);
        setShowSearch(true);
      }
    } catch {
      setAiNotFound(true);
      setShowSearch(true);
      setPhotoPreviews([blobUrl]);
    } finally {
      setAnalyzing(false);
      setStep("wine");
    }
  }

  // ── Step 2: Text search ──
  async function handleSearch(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!query.trim() || query.trim().length < 2) return;
    setSuggestLoading(true);
    setSuggestions(null);
    setSelectedWine(null);
    try {
      const res = await fetch("/api/ai/suggest?q=" + encodeURIComponent(query));
      const data = await res.json();
      setSuggestions(data.wines ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }

  function selectWine(wine: WineSuggestion) {
    setSelectedWine(wine);
    setSuggestions(null);
    setQuery(wine.name_ko || wine.name);
    setWineNameOriginal(wine.name);
    setShowSearch(false);
    setAiResult(null);
    const typeMap: Record<string, WineType> = { red: "red", white: "white", rose: "rose", sparkling: "sparkling", fortified: "fortified", other: "other" };
    setWineType(typeMap[wine.type] ?? "");
    if (wine.grapes) {
      const match = GRAPE_OPTIONS.find((g) => wine.grapes.includes(g));
      if (match) setGrape(match);
      else { setGrape("__custom__"); setGrapeCustom(wine.grapes); }
    }
    if (wine.country) {
      const match = COUNTRY_OPTIONS.find((c) => wine.country.includes(c));
      if (match) setCountry(match);
      else { setCountry("__custom__"); setCountryCustom(wine.country); }
    }
  }

  // ── Step 3: Additional photos ──
  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoUploading(true);
    for (const file of files) {
      setPhotoPreviews((p) => [...p, URL.createObjectURL(file)]);
      let blob: Blob;
      try { blob = await compressImage(file); } catch { blob = file; }
      const fd = new FormData(); fd.append("file", blob, "photo.jpg");
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.url) setPhotos((p) => [...p, data.url]);
      } catch { /* continue */ }
    }
    setPhotoUploading(false);
    e.target.value = "";
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const wineName = selectedWine?.name_ko || selectedWine?.name || wineNameOriginal || query.trim();
    if (!wineName) { setError("와인 이름을 입력해주세요."); return; }
    setSaving(true);
    setError(null);
    const finalGrape = grape === "__custom__" ? grapeCustom.trim() || null : grape || null;
    const finalCountry = country === "__custom__" ? countryCustom.trim() || null : country || null;
    const result = await createWineRecord({
      name: wineName,
      wine_name_original: wineNameOriginal || null,
      wine_vivino_url: selectedWine?.vivino_url || null,
      wine_type: (wineType as WineType) || null,
      wine_vintage: wineVintage ? parseInt(wineVintage) : null,
      grape_variety: finalGrape,
      wine_country: finalCountry,
      photos,
      drunk_at: drunkAt,
      location: location || null,
      companions: companions ? companions.split(",").map((s) => s.trim()).filter(Boolean) : null,
      foods: foods.map((name) => ({ name })),
      rating,
      pairing_score: foods.length > 0 ? pairingScore : null,
      price: price ? parseInt(price) : null,
      value_score: valueScore,
      memo: memo || null,
      visibility,
    });
    setSaving(false);
    if (result?.error) setError(result.error);
  }

  // ── Back navigation ──
  function handleBack() {
    if (step === "photo") router.back();
    else if (step === "wine") { setStep("photo"); setAiResult(null); setAiNotFound(false); setShowSearch(false); }
    else if (step === "review") setStep("wine");
  }

  const stepIndex = step === "photo" ? 0 : step === "wine" ? 1 : 2;

  return (
    <>
      {saving && <LoadingOverlay message="기록 저장 중…" subMessage="잠시만 기다려 주세요" />}
      {photoUploading && <LoadingOverlay message="사진 업로드 중…" />}

      <div className="flex flex-col min-h-full">

        {/* ── Header ── */}
        <header className="px-5 pt-12 pb-4 flex items-center gap-3 flex-shrink-0">
          <button onClick={handleBack} className="text-zinc-400 hover:text-zinc-200 text-2xl w-8">←</button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">
              {step === "photo" && "와인 사진 찍기"}
              {step === "wine" && "와인 정보 확인"}
              {step === "review" && "감상 기록"}
            </h1>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`rounded-full transition-all ${
                i === stepIndex ? "w-5 h-2 bg-rose-500" :
                i < stepIndex ? "w-2 h-2 bg-zinc-500" : "w-2 h-2 bg-zinc-700"
              }`} />
            ))}
          </div>
        </header>

        {/* ══════════════════════════════════════════════ */}
        {/* Step 1 — 사진 선택                             */}
        {/* ══════════════════════════════════════════════ */}
        {step === "photo" && (
          <div className="flex flex-col flex-1 px-4 pb-28 gap-4">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

            {analyzing ? (
              /* 분석 중 */
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                {localPreview && (
                  <div className="relative w-full rounded-2xl overflow-hidden bg-zinc-900" style={{ height: "280px" }}>
                    <img src={localPreview} alt="분석 중" className="w-full h-full object-contain opacity-40" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <div className="w-16 h-16 rounded-full border-4 border-rose-600 border-t-transparent animate-spin" />
                      <div className="text-center">
                        <p className="text-white font-semibold">AI가 와인을 분석하고 있어요</p>
                        <p className="text-zinc-400 text-sm mt-1">라벨 정보를 읽는 중…</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 사진 선택 UI */
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 active:bg-zinc-800/60 transition-colors min-h-[240px]"
                >
                  <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-4xl">🍾</div>
                  <div className="text-center px-6">
                    <p className="text-zinc-200 font-semibold">갤러리에서 사진 선택</p>
                    <p className="text-zinc-500 text-sm mt-1">와인 라벨이 잘 보이는 사진을 선택하면<br />AI가 자동으로 와인 정보를 찾아드려요</p>
                  </div>
                </button>

                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-all text-white font-semibold"
                >
                  <span className="text-xl">📸</span> 지금 사진 찍기
                </button>

                <button
                  onClick={() => { setShowSearch(true); setStep("wine"); }}
                  className="text-zinc-500 text-sm text-center py-2 hover:text-zinc-300 transition-colors"
                >
                  사진 없이 텍스트로 검색하기 →
                </button>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* Step 2 — 와인 정보                             */}
        {/* ══════════════════════════════════════════════ */}
        {step === "wine" && (
          <div className="flex flex-col flex-1 px-4 pb-28 gap-5 overflow-y-auto">

            {/* AI 인식 실패 알림 */}
            {aiNotFound && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/80 border border-zinc-700">
                <span className="text-xl">😅</span>
                <div>
                  <p className="text-zinc-300 text-sm font-medium">와인을 인식하지 못했어요</p>
                  <p className="text-zinc-500 text-xs mt-0.5">아래에서 직접 검색하거나 이름을 입력해주세요</p>
                </div>
              </div>
            )}

            {/* AI 인식 성공 카드 */}
            {aiResult && !aiNotFound && !showSearch && (
              <div className="flex flex-col gap-2">
                <div className="rounded-2xl bg-zinc-900 border border-rose-800/50 p-4 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-lg leading-tight">{notNull(aiResult.name)}</p>
                      {notNull(aiResult.name_original) && (
                        <p className="text-sm text-zinc-400 italic mt-0.5">{aiResult.name_original}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {aiResult.vintage && <span className="text-sm text-zinc-400">{aiResult.vintage}</span>}
                        {aiResult.wine_type && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                            {TYPE_KO[aiResult.wine_type] ?? aiResult.wine_type}
                          </span>
                        )}
                        {notNull(aiResult.country) && <span className="text-xs text-zinc-400">{aiResult.country}</span>}
                      </div>
                      {notNull(aiResult.grape_variety) && (
                        <p className="text-xs text-zinc-500 mt-1">🍇 {aiResult.grape_variety}</p>
                      )}
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-lg bg-rose-900/50 text-rose-300 flex-shrink-0">AI 인식</span>
                  </div>
                </div>
                <button
                  onClick={() => { setShowSearch(true); setSelectedWine(null); }}
                  className="text-zinc-500 text-xs text-center py-1 hover:text-zinc-300 transition-colors"
                >
                  🔄 다른 와인으로 변경
                </button>
              </div>
            )}

            {/* 텍스트 검색 */}
            {(showSearch || (!aiResult && !aiNotFound)) && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">와인 검색</h2>
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
                    placeholder="와인 이름 검색 (예: 샤또 마고)"
                    className={iCls}
                    autoFocus
                  />
                  <button type="button" onClick={handleSearch}
                    disabled={suggestLoading || query.trim().length < 2}
                    className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-sm font-medium transition-colors whitespace-nowrap">
                    {suggestLoading ? "…" : "검색"}
                  </button>
                </div>

                {suggestions !== null && suggestions.length === 0 && (
                  <p className="text-sm text-zinc-500 px-1">결과가 없어요. 아래에서 직접 입력해주세요.</p>
                )}
                {suggestions && suggestions.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {suggestions.map((wine, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => selectWine(wine)}
                          className="w-full flex flex-col gap-0.5 p-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-rose-600 text-left transition-colors">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-zinc-100 text-sm">{wine.name_ko}</span>
                            <span className="text-xs text-zinc-500">{wine.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 flex-wrap">
                            {wine.country && <span>{wine.country}</span>}
                            {wine.type && <><span>·</span><span>{TYPE_KO[wine.type] ?? wine.type}</span></>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* 검색으로 선택된 와인 */}
                {selectedWine && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-700 bg-rose-950/30">
                    <div>
                      <p className="font-semibold text-zinc-100 text-sm">{selectedWine.name_ko}</p>
                      <p className="text-xs text-zinc-400">{selectedWine.name}</p>
                    </div>
                    <button type="button"
                      onClick={() => { setSelectedWine(null); setSuggestions(null); }}
                      className="text-zinc-500 hover:text-zinc-300 text-lg">×</button>
                  </div>
                )}
              </div>
            )}

            {/* 세부 정보 (항상 표시, 수정 가능) */}
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                세부 정보 <span className="normal-case font-normal text-zinc-600">(수정 가능)</span>
              </h2>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">원본 명칭 (영어/현지어)</label>
                <input value={wineNameOriginal} onChange={(e) => setWineNameOriginal(e.target.value)}
                  placeholder="예: Château Margaux" className={iCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">종류</label>
                  <select value={wineType} onChange={(e) => setWineType(e.target.value as WineType | "")} className={iCls}>
                    <option value="">선택 안 함</option>
                    {WINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">빈티지</label>
                  <select value={wineVintage} onChange={(e) => setWineVintage(e.target.value)} className={iCls}>
                    <option value="">선택 안 함</option>
                    {vintageYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">품종</label>
                <select value={grape} onChange={(e) => setGrape(e.target.value)} className={iCls}>
                  <option value="">선택 안 함</option>
                  {GRAPE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                  <option value="__custom__">직접입력</option>
                </select>
                {grape === "__custom__" && (
                  <input value={grapeCustom} onChange={(e) => setGrapeCustom(e.target.value)}
                    placeholder="예: 카베르네 소비뇽, 메를로" className={iCls} />
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">생산국</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)} className={iCls}>
                  <option value="">선택 안 함</option>
                  {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">직접입력</option>
                </select>
                {country === "__custom__" && (
                  <input value={countryCustom} onChange={(e) => setCountryCustom(e.target.value)}
                    placeholder="예: 조지아" className={iCls} />
                )}
              </div>
            </div>

            <button
              onClick={() => setStep("review")}
              disabled={!selectedWine && !wineNameOriginal.trim() && !query.trim()}
              className="w-full py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white font-semibold text-base transition-colors mt-auto"
            >
              다음 — 감상 기록 →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* Step 3 — 감상 기록                             */}
        {/* ══════════════════════════════════════════════ */}
        {step === "review" && (
          <form onSubmit={handleSubmit} className="flex flex-col px-4 pb-8 gap-6 overflow-y-auto">
            {error && <p className="text-rose-400 text-sm bg-rose-950/40 rounded-xl px-4 py-3">{error}</p>}

            {/* 사진 */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">사진</h2>
              <div className="flex gap-2 flex-wrap">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20">
                    <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover" />
                    <button type="button"
                      onClick={() => { setPhotoPreviews((p) => p.filter((_, idx) => idx !== i)); setPhotos((p) => p.filter((_, idx) => idx !== i)); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs flex items-center justify-center">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => photoInputRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-700 hover:border-rose-600 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-rose-400 transition-colors">
                  <span className="text-2xl">+</span>
                  <span className="text-xs">사진 추가</span>
                </button>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            </section>

            {/* 경험 정보 */}
            <section className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">경험 정보</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-zinc-400">날짜</label>
                  <input type="date" value={drunkAt} onChange={(e) => setDrunkAt(e.target.value)} className={iCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-zinc-400">장소</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} className={iCls} placeholder="레스토랑, 집…" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-zinc-400">함께한 사람</label>
                <input value={companions} onChange={(e) => setCompanions(e.target.value)} className={iCls} placeholder="쉼표로 구분 (예: 지연, 민준)" />
              </div>
            </section>

            {/* 페어링 음식 */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">페어링 음식</h2>
              <div className="flex gap-2">
                <input value={foodInput} onChange={(e) => setFoodInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = foodInput.trim();
                      if (v && !foods.includes(v)) { setFoods((f) => [...f, v]); setFoodInput(""); }
                    }
                  }}
                  placeholder="음식 이름 입력 후 추가" className={iCls} />
                <button type="button"
                  onClick={() => { const v = foodInput.trim(); if (v && !foods.includes(v)) { setFoods((f) => [...f, v]); setFoodInput(""); } }}
                  disabled={!foodInput.trim()}
                  className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-sm font-medium transition-colors">추가</button>
              </div>
              {foods.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {foods.map((food, i) => (
                    <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-200 text-sm">
                      {food}
                      <button type="button" onClick={() => setFoods((f) => f.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-zinc-300 text-base leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 가격 */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">가격</h2>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="구매 가격 (선택)"
                  className={iCls + " pr-8"}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">원</span>
              </div>
            </section>

            {/* 평점 */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">평점</h2>
                <span className="text-sm font-semibold text-rose-400">
                  종합 {(() => {
                    const scores = [rating, valueScore];
                    if (foods.length > 0) scores.push(pairingScore);
                    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
                  })()}점
                </span>
              </div>
              <StarRating label="와인 평점" emoji="⭐" value={rating} max={5} step={0.5} onChange={setRating} />
              <StarRating label="가성비 만족도" emoji="💰" value={valueScore} max={5} step={0.5} onChange={setValueScore} />
              {foods.length > 0 && (
                <StarRating label="음식 궁합" emoji="🍽️" value={pairingScore} max={5} step={1} onChange={setPairingScore} />
              )}
            </section>

            {/* 메모 */}
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">메모</h2>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={4}
                className={iCls + " resize-none"} placeholder="이 와인에 대한 인상, 향, 맛, 분위기를 자유롭게 적어보세요…" />
            </section>

            {/* 공개 범위 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-zinc-400">공개 범위</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "link" | "public")} className={iCls}>
                <option value="private">비공개</option>
                <option value="link">링크 공유</option>
                <option value="public">전체 공개</option>
              </select>
            </div>

            <button type="submit"
              className="w-full py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 text-white font-semibold text-base transition-colors">
              기록 저장
            </button>
          </form>
        )}
      </div>
    </>
  );
}

