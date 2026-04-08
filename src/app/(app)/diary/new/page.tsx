"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { extractPhotoDate } from "@/lib/exif";
import type { WineSuggestion, WineType, CompanionEntry } from "@/types";
import { createWineRecord, updateWineRecord, linkRecords } from "@/lib/actions/diary";
import LoadingOverlay from "@/components/LoadingOverlay";
import StarRating from "@/components/StarRating";
import PlaceSearch from "@/components/PlaceSearch";
import BlendGrapeSelector from "@/components/BlendGrapeSelector";
import GrapeCombobox from "@/components/GrapeCombobox";
import CompanionInput from "@/components/CompanionInput";
import { CloseIcon } from "@/components/Icons";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "photo" | "wine" | "review" | "rate";

interface AiResult {
  name?: string;
  name_original?: string;
  producer?: string;
  country?: string;
  wine_type?: string;
  grape_variety?: string | null;
  vintage?: number | null;
  vivino_url?: string;
  wine_id?: string;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: "red", label: "레드" },
  { value: "white", label: "화이트" },
  { value: "rose", label: "로제" },
  { value: "sparkling", label: "스파클링" },
  { value: "fortified", label: "주정강화" },
  { value: "other", label: "기타" },
];

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

import { GRAPE_OPTIONS } from "@/lib/grapes";

const COUNTRY_OPTIONS = [
  "프랑스", "이탈리아", "스페인", "포르투갈", "독일", "오스트리아",
  "미국", "칠레", "아르헨티나", "호주", "뉴질랜드",
  "남아프리카공화국", "조지아", "헝가리", "그리스", "한국",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  // 단어 기반 유사도 (공백/특수문자 분리)
  const wordsA = a.replace(/['\-]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
  const wordsB = b.replace(/['\-]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  let matchCount = 0;
  for (const wa of wordsA) {
    if (wordsB.some((wb) => wa.includes(wb) || wb.includes(wa))) matchCount++;
  }
  return matchCount / Math.max(wordsA.length, wordsB.length);
}

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
    wine_id: ai.wine_id,
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
  const fromRecordId = searchParams.get("from");
  const [step, setStep] = useState<Step>(hasUrlParams || fromRecordId ? "wine" : "photo");

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
  const [blendGrapes, setBlendGrapes] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [countryCustom, setCountryCustom] = useState("");

  // ── Review step state ──
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [drunkAt, setDrunkAt] = useState(new Date().toISOString().split("T")[0]);
  const [location, setLocation] = useState("");
  const [placeLat, setPlaceLat] = useState<number | null>(null);
  const [placeLng, setPlaceLng] = useState<number | null>(null);
  const [companionEntries, setCompanionEntries] = useState<CompanionEntry[]>([]);
  const [foodInput, setFoodInput] = useState("");
  const [foods, setFoods] = useState<string[]>([]);
  const [rating, setRating] = useState(3);
  const [pairingScore, setPairingScore] = useState(3);
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<"market" | "retail">("retail");
  const [priceUnit, setPriceUnit] = useState<"bottle" | "glass">("bottle");
  const [valueScore, setValueScore] = useState(3);
  const [repurchaseIntent, setRepurchaseIntent] = useState<"yes" | "maybe" | "no" | null>(null);
  const [memo, setMemo] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState<"private" | "link" | "public">("private");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [linkSuggestions, setLinkSuggestions] = useState<{ recordId: string; wineName: string; ownerNickname: string }[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const iCls = "w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light text-sm";
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

  // ── from 파라미터: 공유 기록에서 프리필 ──
  const [fromLinkTarget, setFromLinkTarget] = useState<string | null>(fromRecordId);
  useEffect(() => {
    if (!fromRecordId) return;
    fetch(`/api/record/${fromRecordId}/prefill`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const name = data.name ?? "";
        const nameOrig = data.wine_name_original ?? name;

        // 와인명 직접 세팅
        setQuery(name);
        setWineNameOriginal(nameOrig);

        // 타입
        if (data.wine_type) {
          const typeMap: Record<string, WineType> = { red: "red", white: "white", rose: "rose", sparkling: "sparkling", fortified: "fortified", other: "other" };
          setWineType(typeMap[data.wine_type] ?? "");
        }

        // 빈티지
        if (data.wine_vintage) setWineVintage(String(data.wine_vintage));

        // 품종
        if (data.grape_variety) {
          const grapeVal = data.grape_variety as string;
          const blendMatch = grapeVal.match(/^블렌드\s*\((.+)\)$/);
          if (blendMatch) {
            setGrape("__blend__");
            setBlendGrapes(blendMatch[1].split(",").map((s: string) => s.trim()));
          } else if (grapeVal === "블렌드") {
            setGrape("__blend__");
          } else {
            const match = GRAPE_OPTIONS.find((g) => grapeVal.includes(g));
            if (match) setGrape(match);
            else { setGrape(grapeVal); }
          }
        }

        // 국가 — 직접 세팅
        if (data.wine_country) {
          const match = COUNTRY_OPTIONS.find((c) => data.wine_country.includes(c));
          if (match) setCountry(match);
          else { setCountry("__custom__"); setCountryCustom(data.wine_country); }
        }

        // selectedWine (저장 시 wine_id 유지)
        setSelectedWine({
          wine_id: data.wine_id ?? undefined,
          name: nameOrig,
          name_ko: name,
          producer: "",
          country: data.wine_country ?? "",
          type: data.wine_type ?? "",
          grapes: data.grape_variety ?? "",
          vintage_range: "",
          vivino_url: data.wine_vivino_url ?? "",
        });

        // 날짜, 장소
        if (data.drunk_at) setDrunkAt(data.drunk_at);
        if (data.place_name) setLocation(data.place_name);
        if (data.latitude) setPlaceLat(data.latitude);
        if (data.longitude) setPlaceLng(data.longitude);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DB 매칭 검색 함수 (handleFile에서 호출) ──
  async function searchDbMatches(koName: string, enName: string): Promise<WineSuggestion[]> {
    const allWines: WineSuggestion[] = [];
    const seenIds = new Set<string>();

    for (const q of [koName, enName].filter(Boolean)) {
      try {
        const res = await fetch("/api/ai/suggest?q=" + encodeURIComponent(q));
        const data = await res.json();
        for (const w of data.wines ?? []) {
          if (!seenIds.has(w.wine_id ?? w.name)) {
            seenIds.add(w.wine_id ?? w.name);
            allWines.push(w);
          }
        }
      } catch { /* skip */ }
      if (allWines.length >= 5) break;
    }

    if (allWines.length === 0 && enName.length >= 2) {
      const words = enName.split(/[\s']+/).filter((w: string) => w.length >= 4);
      for (const word of words.slice(0, 3)) {
        try {
          const res = await fetch("/api/ai/suggest?q=" + encodeURIComponent(word));
          const data = await res.json();
          for (const w of data.wines ?? []) {
            if (!seenIds.has(w.wine_id ?? w.name)) {
              seenIds.add(w.wine_id ?? w.name);
              allWines.push(w);
            }
          }
        } catch { /* skip */ }
        if (allWines.length >= 5) break;
      }
    }

    const normalize = (s: string) => s.toLowerCase().replace(/['\s]/g, "");
    const koNorm = normalize(koName);
    const enNorm = normalize(enName);
    allWines.sort((a, b) => {
      const scoreA = Math.max(similarity(koNorm, normalize(a.name_ko || "")), similarity(enNorm, normalize(a.name || "")));
      const scoreB = Math.max(similarity(koNorm, normalize(b.name_ko || "")), similarity(enNorm, normalize(b.name || "")));
      return scoreB - scoreA;
    });

    return allWines;
  }

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

      // Apply AI result + DB 매칭 (모두 완료 후 step 전환)
      if (!aiData.error && notNull(aiData.name)) {
        setAiResult(aiData);
        setAiNotFound(false);
        fillWineFields(aiData, { setQuery, setWineNameOriginal, setWineType, setWineVintage, setGrape, setGrapeCustom, setCountry, setCountryCustom, setSelectedWine });

        // DB 매칭
        const koName = aiData.name || "";
        const enName = aiData.name_original || "";
        let primaryMatch: WineSuggestion | null = null;

        // 1) AI가 wine_id를 찾았으면 직접 조회
        if (aiData.wine_id) {
          try {
            const res = await fetch(`/api/wine/${aiData.wine_id}`);
            if (res.ok) primaryMatch = await res.json();
          } catch { /* skip */ }
        }

        // 2) 대안 후보 검색
        const altMatches = await searchDbMatches(koName, enName);

        // primaryMatch를 최상단에, 중복 제거
        const allMatches = primaryMatch
          ? [primaryMatch, ...altMatches.filter((w) => w.wine_id !== primaryMatch!.wine_id)]
          : altMatches;

        setSuggestions(allMatches);

        if (allMatches.length > 0) {
          applyWineFields(allMatches[0]);
        }
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

  function applyWineFields(wine: WineSuggestion) {
    setSelectedWine(wine);
    setQuery(wine.name_ko || wine.name);
    setWineNameOriginal(wine.name);
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

  function selectWine(wine: WineSuggestion) {
    applyWineFields(wine);
    setSuggestions(null);
    setShowSearch(false);
    setAiResult(null);
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

  // ── 정보 저장 (Step 3) ──
  async function handleSaveRecord(goToRate: boolean) {
    const wineName = selectedWine?.name_ko || selectedWine?.name || wineNameOriginal || query.trim();
    if (!wineName) { setError("와인 이름을 입력해주세요."); return; }
    setSaving(true);
    setError(null);
    const finalGrape = grape === "__blend__"
      ? (blendGrapes.length > 0 ? `블렌드 (${blendGrapes.join(", ")})` : "블렌드")
      : grape || null;
    const finalCountry = country === "__custom__" ? countryCustom.trim() || null : country || null;
    const resolvedWineId = selectedWine?.wine_id || aiResult?.wine_id || null;
    const result = await createWineRecord({
      name: wineName,
      wine_id: resolvedWineId,
      wine_name_original: wineNameOriginal || null,
      wine_vivino_url: selectedWine?.vivino_url || null,
      wine_type: (wineType as WineType) || null,
      wine_vintage: wineVintage ? parseInt(wineVintage) : null,
      grape_variety: finalGrape,
      wine_country: finalCountry,
      photos,
      drunk_at: drunkAt,
      location: location || null,
      place_name: location || null,
      latitude: placeLat,
      longitude: placeLng,
      companions: companionEntries.length > 0 ? companionEntries.map((e) => e.userCode ? `@${e.name}` : e.name) : null,
      companion_entries: companionEntries.length > 0 ? companionEntries : undefined,
      foods: foods.map((name) => ({ name })),
      price: price ? parseInt(price) : null,
      price_type: price ? priceType : null,
      price_unit: price ? priceUnit : null,
      tags: tags.length > 0 ? tags : null,
      visibility,
    });
    setSaving(false);
    if (result?.error) { setError(result.error); return; }
    if (result && 'id' in result) {
      const id = result.id as string;
      setSavedRecordId(id);
      // from 기록과 자동 연결
      if (fromLinkTarget) {
        await linkRecords(id, fromLinkTarget);
        setFromLinkTarget(null);
      }
      const linkable = (result as { linkable?: { recordId: string; wineName: string; ownerNickname: string }[] }).linkable ?? [];
      if (linkable.length > 0) setLinkSuggestions(linkable);
      if (goToRate) setStep("rate");
      else if (linkable.length > 0) setStep("rate");
      else router.push(`/diary/${id}`);
    }
  }

  // ── 평가 저장 (Step 4) ──
  async function handleSaveEvaluation(e: React.FormEvent) {
    e.preventDefault();
    if (!savedRecordId) return;
    setSaving(true);
    setError(null);
    const result = await updateWineRecord(savedRecordId, {
      rating,
      value_score: valueScore,
      pairing_score: foods.length > 0 ? pairingScore : null,
      repurchase_intent: repurchaseIntent,
      memo: memo || null,
    });
    setSaving(false);
    if (result?.error) { setError(result.error); return; }
    router.push(`/diary/${savedRecordId}`);
  }

  // ── Back navigation ──
  function handleBack() {
    if (step === "photo") router.back();
    else if (step === "wine") { setStep("photo"); setAiResult(null); setAiNotFound(false); setShowSearch(false); }
    else if (step === "review") setStep("wine");
    else if (step === "rate") { if (savedRecordId) router.push(`/diary/${savedRecordId}`); }
  }

  const stepIndex = step === "photo" ? 0 : step === "wine" ? 1 : step === "review" ? 2 : 3;

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
              {step === "review" && "경험 기록"}
              {step === "rate" && "평가하기"}
            </h1>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`rounded-full transition-all ${
                i === stepIndex ? "w-5 h-2 bg-accent shadow-sm shadow-accent/50" :
                i < stepIndex ? "w-2 h-2 bg-white/20" : "w-2 h-2 bg-white/5"
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
                  <div className="relative w-full rounded-[24px] overflow-hidden bg-surface" style={{ height: "280px" }}>
                    <img src={localPreview} alt="분석 중" className="w-full h-full object-contain opacity-40" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <div className="w-16 h-16 rounded-full border-4 border-accent border-t-transparent animate-spin shadow-xl shadow-accent/20" />
                      <div className="text-center">
                        <p className="text-white font-serif tracking-wide">AI가 와인을 분석하고 있어요</p>
                        <p className="text-zinc-500 text-sm mt-1 font-light">라벨 정보를 읽는 중…</p>
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
                  className="flex-1 flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/20 bg-surface/50 active:bg-surface/80 transition-all min-h-[240px]"
                >
                  <div className="w-20 h-20 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                    <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  </div>
                  <div className="text-center px-6">
                    <p className="text-zinc-200 font-semibold tracking-wide">갤러리에서 사진 선택</p>
                    <p className="text-zinc-500 text-sm mt-1 font-light">와인 라벨이 잘 보이는 사진을 선택하면<br />AI가 자동으로 와인 정보를 찾아드려요</p>
                  </div>
                </button>

                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all text-white font-medium shadow-lg shadow-accent/20"
                >
                  지금 사진 찍기
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
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface/50 border border-white/10 backdrop-blur-md">
                <svg className="w-6 h-6 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div>
                  <p className="text-zinc-300 text-sm font-medium">와인을 인식하지 못했어요</p>
                  <p className="text-zinc-500 text-xs mt-0.5 font-light">아래에서 직접 검색하거나 이름을 입력해주세요</p>
                </div>
              </div>
            )}

            {/* AI 인식 성공 → DB 매칭 최고 후보 확인 */}
            {aiResult && !aiNotFound && !showSearch && (
              <div className="flex flex-col gap-3">
                {/* 선택된 와인 (DB 매칭 최고 후보 또는 AI 결과) */}
                <div className="rounded-[20px] bg-surface/80 border border-accent/30 p-5 flex flex-col gap-3 backdrop-blur-md shadow-xl">
                  <p className="text-xs text-accent font-medium">이 와인이 맞나요?</p>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-serif font-medium text-white text-lg leading-tight">{selectedWine?.name_ko || selectedWine?.name || notNull(aiResult.name)}</p>
                      {(selectedWine?.name || notNull(aiResult.name_original)) && (
                        <p className="text-sm text-zinc-400 italic mt-0.5 font-light">{selectedWine?.name || aiResult.name_original}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {(selectedWine?.type || aiResult.wine_type) && (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300 tracking-wide">
                            {TYPE_KO[selectedWine?.type || aiResult.wine_type || ""] ?? (selectedWine?.type || aiResult.wine_type)}
                          </span>
                        )}
                        {(selectedWine?.country || notNull(aiResult.country)) && (
                          <span className="text-xs text-zinc-400 font-light">{selectedWine?.country || aiResult.country}</span>
                        )}
                        {(selectedWine?.grapes || notNull(aiResult.grape_variety)) && (
                          <span className="text-xs text-zinc-500 font-light">🍇 {selectedWine?.grapes || aiResult.grape_variety}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-lg flex-shrink-0 tracking-wide font-medium ${
                      selectedWine?.wine_id ? "bg-emerald-500/20 text-emerald-400" : "bg-accent/20 text-accent"
                    }`}>
                      {selectedWine?.wine_id ? "DB 매칭" : "AI 인식"}
                    </span>
                  </div>
                </div>

                {/* 다른 후보 리스트 */}
                {suggestions && suggestions.length > 1 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-zinc-500 font-medium px-1">다른 와인인가요?</p>
                    {suggestions.filter((w) => (w.wine_id ?? w.name) !== (selectedWine?.wine_id ?? selectedWine?.name)).slice(0, 4).map((wine, i) => (
                      <button key={i} type="button" onClick={() => { applyWineFields(wine); }}
                        className="w-full flex flex-col gap-0.5 p-3 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 text-left transition-all">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-zinc-100 text-sm">{wine.name_ko || wine.name}</span>
                        </div>
                        {wine.name && wine.name !== wine.name_ko && (
                          <span className="text-xs text-zinc-500 italic truncate">{wine.name}</span>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {wine.country && <span className="text-[10px] text-zinc-500">{wine.country}</span>}
                          {wine.grapes && <span className="text-[10px] text-zinc-600">🍇 {wine.grapes}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => {
                    setSuggestions(null);
                    setShowSearch(true);
                    setSelectedWine(null);
                    setAiResult(null);
                  }}
                  className="text-zinc-500 text-xs text-center py-2 px-4 mx-auto rounded-full hover:bg-white/5 transition-colors font-light"
                >
                  목록에 없음 — 직접 검색
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
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-accent/40 bg-accent/10">
                    <div>
                      <p className="font-semibold text-zinc-100 text-sm">{selectedWine.name_ko}</p>
                      <p className="text-xs text-zinc-400">{selectedWine.name}</p>
                    </div>
                    <button type="button"
                      onClick={() => { setSelectedWine(null); setSuggestions(null); }}
                      className="text-zinc-500 hover:text-zinc-300"><CloseIcon size={14} /></button>
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

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">종류</label>
                <select value={wineType} onChange={(e) => setWineType(e.target.value as WineType | "")} className={iCls}>
                  <option value="">선택 안 함</option>
                  {WINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">품종</label>
                <GrapeCombobox
                  value={grape}
                  onChange={(v) => { setGrape(v); if (v !== "__blend__") setBlendGrapes([]); }}
                  wineType={wineType}
                  className={iCls}
                />
                {grape === "__blend__" && (
                  <BlendGrapeSelector grapes={blendGrapes} onChange={setBlendGrapes} wineType={wineType} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">빈티지</label>
                  <select value={wineVintage} onChange={(e) => setWineVintage(e.target.value)} className={iCls}>
                    <option value="">선택 안 함</option>
                    {vintageYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">생산국</label>
                  <select value={country} onChange={(e) => setCountry(e.target.value)} className={iCls}>
                    <option value="">선택 안 함</option>
                    {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="__custom__">직접입력</option>
                  </select>
                </div>
              </div>
              {country === "__custom__" && (
                <input value={countryCustom} onChange={(e) => setCountryCustom(e.target.value)}
                  placeholder="예: 조지아" className={iCls} />
              )}
            </div>

            <button
              onClick={() => setStep("review")}
              disabled={!selectedWine && !wineNameOriginal.trim() && !query.trim()}
              className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-40 active:scale-[0.98] text-white font-medium transition-all shadow-lg shadow-accent/20 mt-auto"
            >
              다음 — 감상 기록 →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* Step 3 — 감상 기록                             */}
        {/* ══════════════════════════════════════════════ */}
        {step === "review" && (
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col px-4 pb-8 gap-6 overflow-y-auto">
            {error && <p className="text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-center">{error}</p>}

            {/* 사진 */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">사진</h2>
              <div className="flex gap-2 flex-wrap">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20">
                    <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover" />
                    <button type="button"
                      onClick={() => { setPhotoPreviews((p) => p.filter((_, idx) => idx !== i)); setPhotos((p) => p.filter((_, idx) => idx !== i)); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 flex items-center justify-center"><CloseIcon size={10} /></button>
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
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-zinc-400">날짜</label>
                <input type="date" value={drunkAt} onChange={(e) => setDrunkAt(e.target.value)} className={iCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-zinc-400">장소</label>
                <PlaceSearch
                  onChange={(p) => { setLocation(p.name); setPlaceLat(p.lat); setPlaceLng(p.lng); }}
                  className={iCls}
                  placeholder="장소 검색…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-zinc-400">함께한 사람</label>
                <CompanionInput value={companionEntries} onChange={setCompanionEntries} className={iCls} />
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
                      <button type="button" onClick={() => setFoods((f) => f.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-zinc-300 leading-none"><CloseIcon size={12} /></button>
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
                  placeholder="가격 (선택)"
                  className={iCls + " pr-8"}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">원</span>
              </div>
              {price && (
                <div className="flex flex-col gap-2">
                  <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                    {([["retail", "소매가"], ["market", "매장가"]] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => { setPriceType(v); if (v === "retail") setPriceUnit("bottle"); }}
                        className={`flex-1 py-2 text-sm transition-colors ${priceType === v ? "bg-accent text-white" : "bg-black/40 text-zinc-400"}`}>{l}</button>
                    ))}
                  </div>
                  {priceType === "market" && (
                    <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                      {([["bottle", "바틀"], ["glass", "글라스"]] as const).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setPriceUnit(v)}
                          className={`flex-1 py-2 text-sm transition-colors ${priceUnit === v ? "bg-accent text-white" : "bg-black/40 text-zinc-400"}`}>{l}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 태그 */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">태그</h2>
              <div className="flex gap-2">
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = tagInput.trim().replace(/^#/, "");
                      if (v && !tags.includes(v)) { setTags((t) => [...t, v]); setTagInput(""); }
                    }
                  }}
                  placeholder="#태그 입력 후 추가" className={iCls} />
                <button type="button"
                  onClick={() => { const v = tagInput.trim().replace(/^#/, ""); if (v && !tags.includes(v)) { setTags((t) => [...t, v]); setTagInput(""); } }}
                  disabled={!tagInput.trim()}
                  className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-sm font-medium transition-colors">추가</button>
              </div>
              {tags.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {tags.map((tag, i) => (
                    <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-900/40 border border-violet-800/50 text-violet-200 text-sm">
                      #{tag}
                      <button type="button" onClick={() => setTags((t) => t.filter((_, idx) => idx !== i))} className="text-violet-400 hover:text-violet-200 leading-none"><CloseIcon size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
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

            <div className="flex flex-col gap-3 mt-4">
              <button type="button" onClick={() => handleSaveRecord(true)} disabled={saving}
                className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]">
                저장 후 평가하기
              </button>
              <button type="button" onClick={() => handleSaveRecord(false)} disabled={saving}
                className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 text-sm font-medium transition-all active:scale-[0.98]">
                평가 없이 저장
              </button>
            </div>
          </form>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* Step 4 — 평가하기                              */}
        {/* ══════════════════════════════════════════════ */}
        {step === "rate" && (
          <form onSubmit={handleSaveEvaluation} className="flex flex-col px-4 pb-8 gap-6 overflow-y-auto">
            {error && <p className="text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-center">{error}</p>}

            <p className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 rounded-xl px-4 py-3 text-center">기록이 저장되었습니다. 이제 평가를 남겨보세요.</p>

            {/* 평점 */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">평점</h2>
                <span className="text-sm font-semibold text-accent">
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

            {/* 재구매 의사 */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">재구매 의사</h2>
              <div className="flex gap-2">
                {([["yes", "완전 있음", "🔄"], ["maybe", "중간", "🤔"], ["no", "안마실듯", "👋"]] as const).map(([val, label, emoji]) => (
                  <button key={val} type="button"
                    onClick={() => setRepurchaseIntent(repurchaseIntent === val ? null : val)}
                    className={`flex-1 py-3 rounded-2xl text-sm font-medium border transition-all ${repurchaseIntent === val ? "bg-accent/20 border-accent text-accent" : "bg-surface/60 border-white/5 text-zinc-400 hover:bg-white/5"}`}>
                    <span className="block text-lg mb-0.5">{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* 메모 */}
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">메모</h2>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={4}
                className={iCls + " resize-none"} placeholder="이 와인에 대한 인상, 향, 맛, 분위기를 자유롭게 적어보세요…" />
            </section>

            {/* 연결 제안 */}
            {linkSuggestions.length > 0 && (
              <section className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 flex flex-col gap-3">
                <p className="text-sm text-blue-300 font-medium">🔗 함께한 기록을 연결할까요?</p>
                {linkSuggestions.map((s) => (
                  <div key={s.recordId} className="flex items-center justify-between bg-black/20 rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{s.wineName}</p>
                      <p className="text-xs text-zinc-500">{s.ownerNickname}</p>
                    </div>
                    <button
                      type="button"
                      disabled={linkingId === s.recordId}
                      onClick={async () => {
                        if (!savedRecordId) return;
                        setLinkingId(s.recordId);
                        await linkRecords(savedRecordId, s.recordId);
                        setLinkSuggestions((prev) => prev.filter((p) => p.recordId !== s.recordId));
                        setLinkingId(null);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {linkingId === s.recordId ? "연결 중…" : "연결"}
                    </button>
                  </div>
                ))}
              </section>
            )}

            <div className="flex flex-col gap-3 mt-4">
              <button type="submit" disabled={saving}
                className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]">
                평가 저장
              </button>
              <button type="button" onClick={() => router.push(`/diary/${savedRecordId}`)}
                className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 text-sm font-medium transition-all active:scale-[0.98]">
                나중에 평가하기
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

