"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateWineRecord } from "@/lib/actions/diary";
import type { WineRecord, WineType, CompanionEntry } from "@/types";
import LoadingOverlay from "@/components/LoadingOverlay";
import PlaceSearch from "@/components/PlaceSearch";
import BlendGrapeSelector from "@/components/BlendGrapeSelector";
import GrapeCombobox from "@/components/GrapeCombobox";
import CompanionInput from "@/components/CompanionInput";
import { CloseIcon } from "@/components/Icons";

const iCls = "w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light text-sm";

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: "red", label: "레드" },
  { value: "white", label: "화이트" },
  { value: "rose", label: "로제" },
  { value: "sparkling", label: "스파클링" },
  { value: "fortified", label: "주정강화" },
  { value: "other", label: "기타" },
];

import { GRAPE_OPTIONS } from "@/lib/grapes";

const COUNTRY_OPTIONS = [
  "프랑스", "이탈리아", "스페인", "포르투갈", "독일", "오스트리아",
  "미국", "칠레", "아르헨티나", "호주", "뉴질랜드",
  "남아프리카공화국", "조지아", "헝가리", "그리스", "한국",
];

function initGrapeState(val: string | null) {
  if (!val) return { grape: "", grapeCustom: "", blendGrapes: [] as string[] };
  const blendMatch = val.match(/^블렌드\s*\((.+)\)$/);
  if (blendMatch) return { grape: "__blend__", grapeCustom: "", blendGrapes: blendMatch[1].split(",").map((s) => s.trim()) };
  if (val === "블렌드") return { grape: "__blend__", grapeCustom: "", blendGrapes: [] as string[] };
  const match = GRAPE_OPTIONS.find((g) => val.includes(g));
  if (match) return { grape: match, grapeCustom: "", blendGrapes: [] as string[] };
  return { grape: val, grapeCustom: "", blendGrapes: [] as string[] };
}

function initCountryState(val: string | null) {
  if (!val) return { country: "", countryCustom: "" };
  const match = COUNTRY_OPTIONS.find((c) => val.includes(c));
  if (match) return { country: match, countryCustom: "" };
  return { country: "__custom__", countryCustom: val };
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
      canvas.toBlob((b) => b ? resolve(b) : reject(), "image/jpeg", 0.80);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export default function EditForm({ record, onClose, redirectAfterSave }: {
  record: WineRecord;
  onClose?: () => void;
  redirectAfterSave?: string;
}) {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // wine_id 매핑
  const [wineId, setWineId] = useState<string | null>(record.wine_id ?? null);
  const [wineSearchQuery, setWineSearchQuery] = useState("");
  const [wineSearchResults, setWineSearchResults] = useState<any[]>([]);
  const [wineSearching, setWineSearching] = useState(false);
  const [showWineSearch, setShowWineSearch] = useState(false);

  async function searchWines(q: string) {
    if (q.length < 2) { setWineSearchResults([]); return; }
    setWineSearching(true);
    try {
      const res = await fetch(`/api/ai/suggest?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setWineSearchResults(data.wines ?? []);
    } catch { setWineSearchResults([]); }
    setWineSearching(false);
  }

  // 와인 기본 정보
  const [name, setName] = useState(record.name);
  const [wineNameOriginal, setWineNameOriginal] = useState(record.wine_name_original ?? "");
  const [wineType, setWineType] = useState<WineType | "">(record.wine_type ?? "");
  const [wineVintage, setWineVintage] = useState(record.wine_vintage ? String(record.wine_vintage) : "");

  // 품종
  const grapeInit = initGrapeState(record.grape_variety);
  const [grape, setGrape] = useState(grapeInit.grape);
  const [grapeCustom, setGrapeCustom] = useState(grapeInit.grapeCustom);
  const [blendGrapes, setBlendGrapes] = useState<string[]>(grapeInit.blendGrapes);

  // 국가
  const countryInit = initCountryState(record.wine_country);
  const [country, setCountry] = useState(countryInit.country);
  const [countryCustom, setCountryCustom] = useState(countryInit.countryCustom);

  // 사진
  const [photos, setPhotos] = useState<string[]>(record.photos ?? []);
  const [photoUploading, setPhotoUploading] = useState(false);

  // 경험 정보
  const [drunkAt, setDrunkAt] = useState(record.drunk_at);
  const [placeLocation, setPlaceLocation] = useState(record.location ?? "");
  const [placeLat, setPlaceLat] = useState<number | null>(record.latitude ?? null);
  const [placeLng, setPlaceLng] = useState<number | null>(record.longitude ?? null);
  const [companionEntries, setCompanionEntries] = useState<CompanionEntry[]>(() => {
    const mentionCodes = ((record as unknown as Record<string, unknown>)._mentionCodes ?? {}) as Record<string, string>;
    return (record.companions ?? []).map((c) => {
      if (c.startsWith("@")) {
        const name = c.slice(1);
        return { name, userCode: mentionCodes[name] ?? null };
      }
      return { name: c, userCode: null };
    });
  });

  // 음식
  const [foods, setFoods] = useState<string[]>((record.foods ?? []).map((f) => f.name));
  const [foodInput, setFoodInput] = useState("");

  // 가격
  const [price, setPrice] = useState(record.price != null ? String(record.price) : "");
  const [priceType, setPriceType] = useState<"market" | "retail">(record.price_type ?? "retail");
  const [priceUnit, setPriceUnit] = useState<"bottle" | "glass">(record.price_unit ?? "bottle");
  const [tags, setTags] = useState<string[]>(record.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState(record.visibility);

  async function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoUploading(true);
    for (const file of files) {
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) { setError("와인 이름을 입력해주세요."); return; }
    setSaving(true);
    setError(null);

    const finalGrape = grape === "__blend__"
      ? (blendGrapes.length > 0 ? `블렌드 (${blendGrapes.join(", ")})` : "블렌드")
      : grape || null;
    const finalCountry = country === "__custom__" ? countryCustom.trim() || null : country || null;

    const result = await updateWineRecord(record.id, {
      name: name.trim(),
      wine_id: wineId,
      wine_name_original: wineNameOriginal || null,
      wine_type: (wineType as WineType) || null,
      wine_vintage: wineVintage ? parseInt(wineVintage) : null,
      grape_variety: finalGrape,
      wine_country: finalCountry,
      photos,
      location: placeLocation || null,
      place_name: placeLocation || null,
      latitude: placeLat,
      longitude: placeLng,
      drunk_at: drunkAt,
      companions: companionEntries.length > 0 ? companionEntries.map((e) => e.userCode ? `@${e.name}` : e.name) : null,
      companion_entries: companionEntries.length > 0 ? companionEntries : undefined,
      tags: tags.length > 0 ? tags : null,
      price: price ? parseInt(price) : null,
      price_type: price ? priceType : null,
      price_unit: price ? priceUnit : null,
      foods: foods.map((name) => ({ name })),
      visibility,
    });

    setSaving(false);
    if (result?.error) { setError(result.error); return; }
    setSuccess(true);
    setTimeout(() => {
      if (redirectAfterSave) router.push(redirectAfterSave);
      else { setSuccess(false); onClose?.(); }
    }, 800);
  }

  return (
    <>
      {saving && <LoadingOverlay message="기록 수정 중…" subMessage="잠시만 기다려 주세요" />}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {onClose && (
          <div className="flex items-center justify-end">
            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 w-8 h-8 flex items-center justify-center"><CloseIcon size={16} /></button>
          </div>
        )}

        {error && <p className="text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-center">{error}</p>}
        {success && <p className="text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800/30 rounded-xl px-4 py-3 text-center">✓ 저장되었습니다</p>}

        {/* ── 사진 ── */}
        <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 p-5 shadow-2xl">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-3">Photos</p>
          <div className="flex gap-2 flex-wrap">
            {photos.map((src, i) => (
              <div key={i} className="relative w-20 h-20">
                <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover border border-white/10" />
                <button type="button" onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 flex items-center justify-center"><CloseIcon size={10} /></button>
              </div>
            ))}
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-accent/50 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-accent transition-colors">
              {photoUploading ? <span className="text-xs">업로드중</span> : <><span className="text-xl">+</span><span className="text-[10px]">추가</span></>}
            </button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoAdd} />
        </div>

        {/* ── 와인 정보 ── */}
        <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Wine</p>
            {wineId ? (
              <button type="button" onClick={() => { setWineId(null); setShowWineSearch(false); }}
                className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-colors">DB 연결됨 ×</button>
            ) : (
              <button type="button" onClick={() => setShowWineSearch(!showWineSearch)}
                className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 transition-colors">
                {showWineSearch ? "닫기" : "DB 검색"}
              </button>
            )}
          </div>
          {showWineSearch && !wineId && (
            <div className="flex flex-col gap-2 px-5 pb-3">
              <div className="flex gap-2">
                <input value={wineSearchQuery} onChange={(e) => setWineSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchWines(wineSearchQuery); } }}
                  placeholder="와인 이름으로 검색…" className={iCls} />
                <button type="button" onClick={() => searchWines(wineSearchQuery)} disabled={wineSearching}
                  className="px-3 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 text-zinc-300 text-sm whitespace-nowrap">
                  {wineSearching ? "…" : "검색"}
                </button>
              </div>
              {wineSearchResults.length > 0 && (
                <ul className="bg-black/40 border border-white/10 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {wineSearchResults.map((w: any, i: number) => (
                    <li key={i}>
                      <button type="button" onClick={() => { setWineId(w.wine_id); setShowWineSearch(false); setWineSearchResults([]); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors">
                        <p className="text-sm text-zinc-100 truncate">{w.name_ko}</p>
                        <p className="text-xs text-zinc-500 truncate">{w.name} {w.country && `· ${w.country}`}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3 px-5 pb-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400">와인 이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="와인 이름" className={iCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400">원본 명칭</label>
              <input value={wineNameOriginal} onChange={(e) => setWineNameOriginal(e.target.value)} placeholder="영어/현지어" className={iCls} />
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
                  {Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
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
          </div>
        </div>

        {/* ── 경험 ── */}
        <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 shadow-2xl">
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
              <PlaceSearch defaultValue={placeLocation} defaultLat={placeLat} defaultLng={placeLng}
                onChange={(p) => { setPlaceLocation(p.name); setPlaceLat(p.lat); setPlaceLng(p.lng); }}
                className={iCls} placeholder="장소 검색…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-400">함께한 사람</label>
              <CompanionInput value={companionEntries} onChange={setCompanionEntries} className={iCls} />
            </div>
          </div>
        </div>

        {/* ── 구매가격 ── */}
        <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Price</p>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-4">
            <div className="relative">
              <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="구매가격 (선택)" className={iCls + " pr-8"} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">원</span>
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

        {/* ── 페어링 음식 ── */}
        <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Pairing Food</p>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-4">
            <div className="flex gap-2">
              <input value={foodInput} onChange={(e) => setFoodInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (foodInput.trim()) { setFoods((f) => [...f, foodInput.trim()]); setFoodInput(""); } } }}
                placeholder="음식 이름" className={iCls} />
              <button type="button" onClick={() => { if (foodInput.trim()) { setFoods((f) => [...f, foodInput.trim()]); setFoodInput(""); } }}
                className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-sm font-medium transition-colors whitespace-nowrap">추가</button>
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
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = tagInput.trim().replace(/^#/, ""); if (v && !tags.includes(v)) { setTags((t) => [...t, v]); setTagInput(""); } } }}
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

        <div className="pb-16">
          <button type="submit" disabled={saving} className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]">
            저장
          </button>
        </div>
      </form>
    </>
  );
}
