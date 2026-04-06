"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateWineRecord } from "@/lib/actions/diary";
import type { WineRecord, WineType } from "@/types";
import LoadingOverlay from "@/components/LoadingOverlay";
import StarRating from "@/components/StarRating";
import PlaceSearch from "@/components/PlaceSearch";

const iCls = "w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: "red", label: "레드 🍷" },
  { value: "white", label: "화이트 🥂" },
  { value: "rose", label: "로제 🌸" },
  { value: "sparkling", label: "스파클링 ✨" },
  { value: "fortified", label: "주정강화 🏺" },
  { value: "other", label: "기타" },
];

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

function initGrapeState(val: string | null) {
  if (!val) return { grape: "", grapeCustom: "", blendGrapes: [] as string[] };
  const blendMatch = val.match(/^블렌드\s*\((.+)\)$/);
  if (blendMatch) return { grape: "__blend__", grapeCustom: "", blendGrapes: blendMatch[1].split(",").map((s) => s.trim()) };
  if (val === "블렌드") return { grape: "__blend__", grapeCustom: "", blendGrapes: [] as string[] };
  const match = GRAPE_OPTIONS.find((g) => val.includes(g));
  if (match) return { grape: match, grapeCustom: "", blendGrapes: [] as string[] };
  return { grape: "__custom__", grapeCustom: val, blendGrapes: [] as string[] };
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
  const [companions, setCompanions] = useState(record.companions?.join(", ") ?? "");

  // 음식
  const [foods, setFoods] = useState<string[]>((record.foods ?? []).map((f) => f.name));
  const [foodInput, setFoodInput] = useState("");

  // 평점/가격
  const [rating, setRating] = useState(record.rating ?? 3);
  const [pairingScore, setPairingScore] = useState(record.pairing_score ?? 3);
  const [price, setPrice] = useState(record.price != null ? String(record.price) : "");
  const [priceType, setPriceType] = useState<"market" | "retail">(record.price_type ?? "retail");
  const [priceUnit, setPriceUnit] = useState<"bottle" | "glass">(record.price_unit ?? "bottle");
  const [valueScore, setValueScore] = useState(record.value_score ?? 3);
  const [memo, setMemo] = useState(record.memo ?? "");
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
      : grape === "__custom__" ? grapeCustom.trim() || null : grape || null;
    const finalCountry = country === "__custom__" ? countryCustom.trim() || null : country || null;

    const result = await updateWineRecord(record.id, {
      name: name.trim(),
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
      companions: companions ? companions.split(",").map((s) => s.trim()).filter(Boolean) : null,
      memo: memo || null,
      rating,
      pairing_score: foods.length > 0 ? pairingScore : null,
      price: price ? parseInt(price) : null,
      price_type: price ? priceType : null,
      price_unit: price ? priceUnit : null,
      value_score: valueScore,
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-zinc-100">기록 수정</h3>
          {onClose && (
            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl w-8 h-8 flex items-center justify-center">×</button>
          )}
        </div>

        {error && <p className="text-rose-400 text-sm bg-rose-950/40 rounded-xl px-4 py-2">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">✓ 저장되었습니다</p>}

        {/* ── 사진 ── */}
        <section className="flex flex-col gap-2">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">사진</label>
          <div className="flex gap-2 flex-wrap">
            {photos.map((src, i) => (
              <div key={i} className="relative w-20 h-20">
                <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover" />
                <button type="button"
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs flex items-center justify-center">×</button>
              </div>
            ))}
            <button type="button" onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-700 hover:border-rose-600 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-rose-400 transition-colors">
              {photoUploading ? <span className="text-xs">업로드중</span> : <><span className="text-2xl">+</span><span className="text-[10px]">추가</span></>}
            </button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoAdd} />
        </section>

        {/* ── 와인 정보 ── */}
        <section className="flex flex-col gap-3">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">와인 정보</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="와인 이름" className={iCls} />
          <input value={wineNameOriginal} onChange={(e) => setWineNameOriginal(e.target.value)} placeholder="원본 명칭 (영어/현지어)" className={iCls} />

          <div className="grid grid-cols-2 gap-2">
            <select value={wineType} onChange={(e) => setWineType(e.target.value as WineType | "")} className={iCls}>
              <option value="">종류 선택 안 함</option>
              {WINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={wineVintage} onChange={(e) => setWineVintage(e.target.value)} className={iCls}>
              <option value="">빈티지 선택 안 함</option>
              {Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* 품종 */}
          <select value={grape} onChange={(e) => { setGrape(e.target.value); if (e.target.value !== "__blend__") setBlendGrapes([]); }} className={iCls}>
            <option value="">품종 선택 안 함</option>
            {GRAPE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="__blend__">블렌드</option>
            <option value="__custom__">직접입력</option>
          </select>
          {grape === "__custom__" && (
            <input value={grapeCustom} onChange={(e) => setGrapeCustom(e.target.value)} placeholder="품종명" className={iCls} />
          )}
          {grape === "__blend__" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-500">블렌드 구성 품종</p>
              <div className="flex gap-1.5 flex-wrap">
                {GRAPE_OPTIONS.map((g) => (
                  <button key={g} type="button"
                    onClick={() => setBlendGrapes((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                      blendGrapes.includes(g) ? "bg-rose-700 border-rose-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}
                  >{g}</button>
                ))}
              </div>
              {blendGrapes.length > 0 && <p className="text-xs text-zinc-400">선택: {blendGrapes.join(", ")}</p>}
            </div>
          )}

          {/* 국가 */}
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={iCls}>
            <option value="">생산국 선택 안 함</option>
            {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__custom__">직접입력</option>
          </select>
          {country === "__custom__" && (
            <input value={countryCustom} onChange={(e) => setCountryCustom(e.target.value)} placeholder="생산국" className={iCls} />
          )}
        </section>

        {/* ── 경험 정보 ── */}
        <section className="flex flex-col gap-3">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">경험 정보</label>
          <input type="date" value={drunkAt} onChange={(e) => setDrunkAt(e.target.value)} className={iCls} />
          <PlaceSearch
            defaultValue={placeLocation}
            defaultLat={placeLat}
            defaultLng={placeLng}
            onChange={(p) => { setPlaceLocation(p.name); setPlaceLat(p.lat); setPlaceLng(p.lng); }}
            className={iCls}
            placeholder="장소 검색…"
          />
          <input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="함께한 사람 (쉼표 구분)" className={iCls} />
        </section>

        {/* ── 페어링 음식 ── */}
        <section className="flex flex-col gap-2">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">페어링 음식</label>
          <div className="flex gap-2">
            <input value={foodInput} onChange={(e) => setFoodInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (foodInput.trim()) { setFoods((f) => [...f, foodInput.trim()]); setFoodInput(""); } } }}
              placeholder="음식 이름" className={iCls} />
            <button type="button" onClick={() => { if (foodInput.trim()) { setFoods((f) => [...f, foodInput.trim()]); setFoodInput(""); } }}
              className="px-3 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm whitespace-nowrap">추가</button>
          </div>
          {foods.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {foods.map((food, i) => (
                <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-200 text-sm">
                  {food}
                  <button type="button" onClick={() => setFoods((f) => f.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-zinc-300">×</button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── 가격 ── */}
        <section className="flex flex-col gap-2">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">가격</label>
          <div className="relative">
            <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="가격 (선택)" className={iCls + " pr-8"} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">원</span>
          </div>
          {price && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                {([["bottle", "바틀"], ["glass", "글라스"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setPriceUnit(v)}
                    className={`flex-1 py-2 text-sm transition-colors ${priceUnit === v ? "bg-rose-700 text-white" : "bg-zinc-800 text-zinc-400"}`}>{l}</button>
                ))}
              </div>
              <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                {([["retail", "소매가"], ["market", "시장가"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setPriceType(v)}
                    className={`flex-1 py-2 text-sm transition-colors ${priceType === v ? "bg-rose-700 text-white" : "bg-zinc-800 text-zinc-400"}`}>{l}</button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── 평점 ── */}
        <section className="flex flex-col gap-3">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">평점</label>
          <StarRating label="와인 평점" emoji="⭐" value={rating} max={5} step={0.5} onChange={setRating} />
          <StarRating label="가성비 만족도" emoji="💰" value={valueScore} max={5} step={0.5} onChange={setValueScore} />
          {foods.length > 0 && (
            <StarRating label="음식 궁합" emoji="🍽️" value={pairingScore} max={5} step={1} onChange={setPairingScore} />
          )}
        </section>

        {/* ── 메모 ── */}
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} placeholder="메모" className={iCls + " resize-none"} />

        {/* ── 공개 범위 ── */}
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "link" | "public")} className={iCls}>
          <option value="private">비공개</option>
          <option value="link">링크 공유</option>
          <option value="public">전체 공개</option>
        </select>

        <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold transition-colors">
          저장
        </button>
      </form>
    </>
  );
}
