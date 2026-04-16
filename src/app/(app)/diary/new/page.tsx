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

type Step = "photo" | "search" | "wine-detail" | "review" | "rate";

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
    setBlendGrapes: (v: string[]) => void;
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
    const grapeParts = grapeVal.split(/,\s*/).map((g) => g.trim()).filter(Boolean);
    if (grapeParts.length > 1) {
      setters.setGrape("__blend__");
      setters.setBlendGrapes(grapeParts);
    } else {
      const match = GRAPE_OPTIONS.find((g) => grapeVal.includes(g) || g.includes(grapeVal));
      if (match) setters.setGrape(match);
      else setters.setGrape(grapeVal); // GrapeCombobox에 직접 표시
    }
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
  const [step, setStep] = useState<Step>(hasUrlParams || fromRecordId ? "wine-detail" : "photo");

  // ── Photo step state ──
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);

  // ── Wine step state ──
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiNotFound, setAiNotFound] = useState(false);
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
      wine_id: searchParams.get("wine_id") ?? undefined,
    };
    setAiResult(synth);
    fillWineFields(synth, { setQuery, setWineNameOriginal, setWineType, setWineVintage, setGrape, setGrapeCustom, setBlendGrapes, setCountry, setCountryCustom, setSelectedWine });

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
            const match = GRAPE_OPTIONS.find((g) => grapeVal.includes(g) || g.includes(grapeVal));
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

      // Apply AI result + DB 매칭 (모두 완료 후 search step 전환)
      if (!aiData.error && notNull(aiData.name)) {
        setAiResult(aiData);
        setAiNotFound(false);
        const koName = aiData.name || "";
        const enName = aiData.name_original || "";
        const dbMatches = await searchDbMatches(koName, enName);
        setSuggestions(dbMatches);
        setQuery(koName);
      } else {
        setAiResult(null);
        setAiNotFound(true);
      }
    } catch {
      setAiNotFound(true);
      setPhotoPreviews([blobUrl]);
    } finally {
      setAnalyzing(false);
      setStep("search");
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
    // 품종 초기화 후 세팅
    setGrape("");
    setGrapeCustom("");
    setBlendGrapes([]);
    if (wine.grapes) {
      const grapeParts = wine.grapes.split(/,\s*/).map((g: string) => g.trim()).filter(Boolean);
      if (grapeParts.length > 1) {
        setGrape("__blend__");
        setBlendGrapes(grapeParts);
      } else {
        const match = GRAPE_OPTIONS.find((g) => wine.grapes.includes(g) || g.includes(wine.grapes));
        if (match) setGrape(match);
        else setGrape(wine.grapes); // GrapeCombobox는 직접 등록 문자열을 표시
      }
    }
    if (wine.country) {
      const match = COUNTRY_OPTIONS.find((c) => wine.country.includes(c));
      if (match) setCountry(match);
      else { setCountry("__custom__"); setCountryCustom(wine.country); }
    }
  }

  function selectWine(wine: WineSuggestion) {
    applyWineFields(wine);
    setStep("wine-detail");
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
    const wineName = query.trim() || selectedWine?.name_ko || selectedWine?.name || wineNameOriginal;
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
    else if (step === "search") { setStep("photo"); setAiResult(null); setAiNotFound(false); setSuggestions(null); }
    else if (step === "wine-detail") setStep("search");
    else if (step === "review") setStep("wine-detail");
    else if (step === "rate") { if (savedRecordId) router.push(`/diary/${savedRecordId}`); }
  }

  const stepIndex = step === "photo" ? 0 : step === "search" || step === "wine-detail" ? 1 : step === "review" ? 2 : 3;

  return (
    <>
      {saving && <LoadingOverlay message="기록 저장 중…" subMessage="잠시만 기다려 주세요" />}
      {photoUploading && <LoadingOverlay message="사진 업로드 중…" />}

      <div className="flex flex-col min-h-full">

        {/* ── Header ── */}
        <header className="px-5 pt-8 pb-2 flex items-center gap-3 flex-shrink-0">
          <button onClick={handleBack} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">
              {step === "photo" && "와인 사진 찍기"}
              {step === "search" && "와인 검색"}
              {step === "wine-detail" && (selectedWine ? "와인 정보 확인" : "와인 직접 입력")}
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
              /* 두 가지 선택지 — 동일 위계 */
              <div className="flex flex-col flex-1 justify-center gap-4">
                <button
                  onClick={() => setShowPhotoSheet(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-surface/50 active:bg-surface/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                    <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/></svg>
                  </div>
                  <div className="text-center px-6">
                    <p className="text-zinc-200 font-semibold tracking-wide">사진으로 찾기</p>
                    <p className="text-zinc-500 text-xs mt-1 font-light">라벨을 촬영하거나 사진을 선택하면<br />AI가 자동으로 찾아드려요</p>
                  </div>
                </button>

                <button
                  onClick={() => setStep("search")}
                  className="flex-1 flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-surface/50 active:bg-surface/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                    <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
                  </div>
                  <div className="text-center px-6">
                    <p className="text-zinc-200 font-semibold tracking-wide">검색해서 찾기</p>
                    <p className="text-zinc-500 text-xs mt-1 font-light">와인 이름을 직접 검색해서<br />찾을 수 있어요</p>
                  </div>
                </button>
              </div>
            )}

            {/* 사진 액션시트 */}
            {showPhotoSheet && (
              <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowPhotoSheet(false)}>
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <div className="relative w-full max-w-lg px-4 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                  <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shadow-2xl">
                    <button
                      onClick={() => { setShowPhotoSheet(false); cameraRef.current?.click(); }}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 active:bg-white/10 transition-colors text-left"
                    >
                      <svg className="w-6 h-6 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/></svg>
                      <div>
                        <p className="text-zinc-100 font-medium">카메라로 촬영</p>
                        <p className="text-zinc-500 text-xs font-light">지금 와인 라벨을 촬영해요</p>
                      </div>
                    </button>
                    <div className="border-t border-white/5" />
                    <button
                      onClick={() => { setShowPhotoSheet(false); fileRef.current?.click(); }}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 active:bg-white/10 transition-colors text-left"
                    >
                      <svg className="w-6 h-6 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"/></svg>
                      <div>
                        <p className="text-zinc-100 font-medium">갤러리에서 선택</p>
                        <p className="text-zinc-500 text-xs font-light">저장된 와인 사진을 불러와요</p>
                      </div>
                    </button>
                  </div>
                  <button
                    onClick={() => setShowPhotoSheet(false)}
                    className="w-full mt-2 py-3.5 rounded-2xl bg-zinc-900 border border-white/10 text-zinc-300 font-medium text-sm hover:bg-zinc-800 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* Step 2a — 와인 검색                            */}
        {/* ══════════════════════════════════════════════ */}
        {step === "search" && (
          <div className="flex flex-col flex-1 px-4 pb-28 gap-5 overflow-y-auto">

            {/* AI 인식 실패 알림 */}
            {aiNotFound && (
              <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-amber-500/20 p-5 shadow-2xl flex items-center gap-3">
                <svg className="w-6 h-6 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div>
                  <p className="text-zinc-200 text-sm font-medium">와인을 인식하지 못했어요</p>
                  <p className="text-zinc-500 text-xs mt-0.5 font-light">검색하거나 직접 입력해주세요</p>
                </div>
              </div>
            )}

            {/* 검색 */}
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Search</p>
              </div>
              <div className="flex flex-col gap-3 px-5 pb-4">
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
                    className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 text-zinc-300 text-sm font-medium transition-colors whitespace-nowrap">
                    {suggestLoading ? "…" : "검색"}
                  </button>
                </div>

                {suggestions !== null && suggestions.length === 0 && (
                  <p className="text-xs text-zinc-500">결과가 없어요.</p>
                )}
                {suggestions && suggestions.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {suggestions.map((wine, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => selectWine(wine)}
                          className="w-full flex flex-col gap-0.5 p-3 rounded-xl border border-white/10 bg-black/20 hover:border-accent/40 text-left transition-all">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-zinc-100 text-sm">{wine.name_ko}</span>
                          </div>
                          {wine.name && wine.name !== wine.name_ko && (
                            <span className="text-xs text-zinc-500 italic truncate">{wine.name}</span>
                          )}
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 flex-wrap mt-0.5">
                            {wine.country && <span>{wine.country}</span>}
                            {wine.type && <><span>·</span><span>{TYPE_KO[wine.type] ?? wine.type}</span></>}
                            {wine.grapes && <><span>·</span><span>🍇 {wine.grapes}</span></>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 직접 입력 */}
            <button
              onClick={() => {
                setSelectedWine(null);
                setQuery(""); setWineNameOriginal("");
                setWineType(""); setWineVintage("");
                setGrape(""); setGrapeCustom(""); setBlendGrapes([]);
                setCountry(""); setCountryCustom("");
                setPrice("");
                setStep("wine-detail");
              }}
              className="text-zinc-500 text-sm text-center py-3 hover:text-zinc-300 transition-colors"
            >
              찾는 와인이 없어요 — 직접 입력 →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* Step 2b — 와인 정보 확인 / 직접 입력            */}
        {/* ══════════════════════════════════════════════ */}
        {step === "wine-detail" && (
          <div className="flex flex-col flex-1 px-4 pb-28 gap-5 overflow-y-auto">

            {/* 선택된 와인 카드 */}
            {selectedWine && (
              <div className="rounded-[20px] bg-surface/80 border border-emerald-500/30 p-5 flex flex-col gap-2 backdrop-blur-md shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-serif font-medium text-white text-lg leading-tight">{selectedWine.name_ko || selectedWine.name}</p>
                    {selectedWine.name && selectedWine.name !== selectedWine.name_ko && (
                      <p className="text-sm text-zinc-400 italic mt-0.5 font-light">{selectedWine.name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {selectedWine.type && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300 tracking-wide">
                          {TYPE_KO[selectedWine.type] ?? selectedWine.type}
                        </span>
                      )}
                      {selectedWine.country && <span className="text-xs text-zinc-400 font-light">{selectedWine.country}</span>}
                      {selectedWine.grapes && <span className="text-xs text-zinc-500 font-light">🍇 {selectedWine.grapes}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 flex-shrink-0 tracking-wide font-medium">DB 매칭</span>
                </div>
              </div>
            )}

            {/* 세부 정보 */}
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Wine Details</p>
              </div>
              <div className="flex flex-col gap-3 px-5 pb-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">와인 이름</label>
                  <input value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="한글 와인명" className={iCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">원본 명칭</label>
                  <input value={wineNameOriginal} onChange={(e) => setWineNameOriginal(e.target.value)}
                    placeholder="영어/현지어" className={iCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">종류</label>
                  <select value={wineType} onChange={(e) => setWineType(e.target.value as WineType | "")} className={iCls}>
                    <option value="">선택 안 함</option>
                    {WINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">품종</label>
                  <GrapeCombobox value={grape} onChange={(v) => { setGrape(v); if (v !== "__blend__") setBlendGrapes([]); }} wineType={wineType} className={iCls} />
                  {grape === "__blend__" && <BlendGrapeSelector grapes={blendGrapes} onChange={setBlendGrapes} wineType={wineType} />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-zinc-400">빈티지</label>
                    <select value={wineVintage} onChange={(e) => setWineVintage(e.target.value)} className={iCls}>
                      <option value="">선택 안 함</option>
                      {vintageYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-zinc-400">생산국</label>
                    <select value={country} onChange={(e) => setCountry(e.target.value)} className={iCls}>
                      <option value="">선택 안 함</option>
                      {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value="__custom__">직접입력</option>
                    </select>
                  </div>
                </div>
                {country === "__custom__" && (
                  <input value={countryCustom} onChange={(e) => setCountryCustom(e.target.value)} placeholder="생산국" className={iCls} />
                )}
                {/* 구분선 + 구매가격 */}
                <div className="border-t border-white/5 my-1" />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">구매가격</label>
                  <div className="relative">
                    <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)}
                      placeholder="선택" className={iCls + " pr-8"} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">원</span>
                  </div>
                </div>
                {price && (
                  <div className="flex flex-col gap-2">
                    <div className="flex rounded-xl overflow-hidden border border-white/10">
                      {([["retail", "소매가"], ["market", "매장가"]] as const).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => { setPriceType(v); if (v === "retail") setPriceUnit("bottle"); }}
                          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${priceType === v ? "bg-accent text-white" : "bg-black/40 text-zinc-500"}`}>{l}</button>
                      ))}
                    </div>
                    {priceType === "market" && (
                      <div className="flex rounded-xl overflow-hidden border border-white/10">
                        {([["bottle", "바틀"], ["glass", "글라스"]] as const).map(([v, l]) => (
                          <button key={v} type="button" onClick={() => setPriceUnit(v)}
                            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${priceUnit === v ? "bg-accent text-white" : "bg-black/40 text-zinc-500"}`}>{l}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col px-4 pb-8 gap-4 overflow-y-auto">
            {error && <p className="text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-center">{error}</p>}

            {/* ── 사진 ── */}
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 p-5 shadow-2xl">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-3">Photos</p>
              <div className="flex gap-2 flex-wrap">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20">
                    <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover border border-white/10" />
                    <button type="button"
                      onClick={() => { setPhotoPreviews((p) => p.filter((_, idx) => idx !== i)); setPhotos((p) => p.filter((_, idx) => idx !== i)); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 flex items-center justify-center"><CloseIcon size={10} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => photoInputRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-accent/50 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-accent transition-colors">
                  <span className="text-xl">+</span>
                  <span className="text-[10px]">추가</span>
                </button>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            </div>

            {/* ── 경험 (날짜 + 장소 + 동행) ── */}
            <div className="relative z-10 rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Experience</p>
              </div>
              <div className="flex flex-col gap-4 px-5 pb-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">날짜</label>
                  <input type="date" value={drunkAt} onChange={(e) => setDrunkAt(e.target.value)} className={iCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">장소</label>
                  <PlaceSearch
                    onChange={(p) => { setLocation(p.name); setPlaceLat(p.lat); setPlaceLng(p.lng); }}
                    className={iCls}
                    placeholder="장소 검색…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-400">함께한 사람</label>
                  <CompanionInput value={companionEntries} onChange={setCompanionEntries} className={iCls} />
                </div>
              </div>
            </div>

            {/* ── 페어링 음식 ── */}
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Pairing Food</p>
              </div>
              <div className="flex flex-col gap-3 px-5 pb-4">
                <div className="flex gap-2">
                  <input value={foodInput} onChange={(e) => setFoodInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = foodInput.trim();
                        if (v && !foods.includes(v)) { setFoods((f) => [...f, v]); setFoodInput(""); }
                      }
                    }}
                    placeholder="음식 이름" className={iCls} />
                  <button type="button"
                    onClick={() => { const v = foodInput.trim(); if (v && !foods.includes(v)) { setFoods((f) => [...f, v]); setFoodInput(""); } }}
                    disabled={!foodInput.trim()}
                    className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 text-zinc-300 text-sm font-medium transition-colors whitespace-nowrap">추가</button>
                </div>
                {foods.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {foods.map((food, i) => (
                      <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-zinc-200 text-sm font-light">
                        {food}
                        <button type="button" onClick={() => setFoods((f) => f.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-zinc-300 leading-none"><CloseIcon size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── 태그 ── */}
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Tags</p>
              </div>
              <div className="flex flex-col gap-3 px-5 pb-4">
                <div className="flex gap-2">
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = tagInput.trim().replace(/^#/, "");
                        if (v && !tags.includes(v)) { setTags((t) => [...t, v]); setTagInput(""); }
                      }
                    }}
                    placeholder="#태그" className={iCls} />
                  <button type="button"
                    onClick={() => { const v = tagInput.trim().replace(/^#/, ""); if (v && !tags.includes(v)) { setTags((t) => [...t, v]); setTagInput(""); } }}
                    disabled={!tagInput.trim()}
                    className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 text-zinc-300 text-sm font-medium transition-colors whitespace-nowrap">추가</button>
                </div>
                {tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {tags.map((tag, i) => (
                      <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[11px] font-medium">
                        #{tag}
                        <button type="button" onClick={() => setTags((t) => t.filter((_, idx) => idx !== i))} className="text-violet-400 hover:text-violet-200 leading-none"><CloseIcon size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── 공개 범위 ── */}
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Settings</p>
              </div>
              <div className="px-5 pb-4">
                <label className="text-xs text-zinc-400 mb-1.5 block">공개 범위</label>
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "link" | "public")} className={iCls}>
                  <option value="private">비공개</option>
                  <option value="link">링크 공유</option>
                  <option value="public">전체 공개</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-2 pb-16">
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

