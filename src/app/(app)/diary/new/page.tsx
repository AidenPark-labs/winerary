"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { WineSuggestion } from "@/types";
import { createWineRecord } from "@/lib/actions/diary";
import LoadingOverlay from "@/components/LoadingOverlay";

// 최대 1280px, JPEG 0.80 품질로 압축 (일반 모바일 사진 기준 ~300KB)
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1280;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const r = Math.min(MAX / width, MAX / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.80);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

export default function NewDiaryPage() {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement>(null);

  // 검색 단계
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<WineSuggestion[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedWine, setSelectedWine] = useState<WineSuggestion | null>(null);

  // 사진
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  // 폼
  const [drunkAt, setDrunkAt] = useState(new Date().toISOString().split("T")[0]);
  const [location, setLocation] = useState("");
  const [companions, setCompanions] = useState("");
  const [foodInput, setFoodInput] = useState("");
  const [foods, setFoods] = useState<string[]>([]);
  const [rating, setRating] = useState(3);
  const [pairingScore, setPairingScore] = useState(3);
  const [memo, setMemo] = useState("");
  const [visibility, setVisibility] = useState<"private" | "link" | "public">("private");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!query.trim() || query.trim().length < 2) return;
    setSuggestLoading(true);
    setSuggestions(null);
    setSelectedWine(null);
    setError(null);
    try {
      const res = await fetch("/api/ai/suggest?q=" + encodeURIComponent(query));
      const data = await res.json();
      setSuggestions(data.wines ?? []);
    } catch {
      setError("검색 중 오류가 발생했습니다.");
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }

  function selectWine(wine: WineSuggestion) {
    setSelectedWine(wine);
    setSuggestions(null);
    setQuery(wine.name_ko || wine.name);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoUploading(true);
    setError(null);

    let failCount = 0;

    for (const file of files) {
      const preview = URL.createObjectURL(file);
      setPhotoPreviews((p) => [...p, preview]);

      let blob: Blob;
      try { blob = await compressImage(file); } catch { blob = file; }

      const fd = new FormData();
      fd.append("file", blob, "photo.jpg");

      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.url) {
          setPhotos((p) => [...p, data.url]);
        } else {
          console.error("[photo upload] error:", data.error);
          failCount++;
          setError(`업로드 실패: ${data.error ?? "알 수 없는 오류"}`);
        }
      } catch (err) {
        console.error("[photo upload] network error:", err);
        failCount++;
      }
    }

    if (failCount > 0 && !error) {
      setError(`사진 ${failCount}장 업로드에 실패했습니다.`);
    }
    setPhotoUploading(false);
    e.target.value = "";
  }

  function removePhoto(i: number) {
    setPhotoPreviews((p) => p.filter((_, idx) => idx !== i));
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  function addFood() {
    const v = foodInput.trim();
    if (v && !foods.includes(v)) setFoods((f) => [...f, v]);
    setFoodInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWine) { setError("와인을 검색하여 선택해 주세요."); return; }
    setSaving(true);
    setError(null);

    const result = await createWineRecord({
      name: selectedWine.name_ko || selectedWine.name,
      wine_vivino_url: selectedWine.vivino_url,
      photos,
      drunk_at: drunkAt,
      location: location || null,
      companions: companions ? companions.split(",").map((s) => s.trim()).filter(Boolean) : null,
      foods: foods.map((name) => ({ name })),
      rating,
      pairing_score: foods.length > 0 ? pairingScore : null,
      memo: memo || null,
      visibility,
    });

    setSaving(false);
    if (result?.error) setError(result.error);
  }

  const iCls = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

  return (
    <>
      {saving && <LoadingOverlay message="기록 저장 중…" subMessage="잠시만 기다려 주세요" />}
      {photoUploading && <LoadingOverlay message="사진 업로드 중…" />}

      <div className="flex flex-col">
        <header className="px-5 pt-12 pb-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</button>
          <h1 className="text-xl font-bold">새 와인 경험 기록</h1>
        </header>

        <form onSubmit={handleSubmit} className="px-4 pb-8 flex flex-col gap-6">
          {error && <p className="text-rose-400 text-sm bg-rose-950/40 rounded-xl px-4 py-3">{error}</p>}

          {/* ── 와인 검색 ── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">와인 선택 *</h2>

            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
                placeholder="와인 이름 검색 (예: 샤또 마고, 오퍼스 원)"
                className={iCls}
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={suggestLoading || query.trim().length < 2}
                className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-sm font-medium transition-colors whitespace-nowrap"
              >
                {suggestLoading ? "…" : "검색"}
              </button>
            </div>

            {/* 제안 목록 */}
            {suggestLoading && (
              <p className="text-xs text-zinc-500 animate-pulse px-1">와인 목록을 불러오는 중…</p>
            )}

            {suggestions !== null && suggestions.length === 0 && (
              <p className="text-sm text-zinc-500 px-1">검색 결과가 없습니다. 다른 이름으로 검색해보세요.</p>
            )}

            {suggestions && suggestions.length > 0 && (
              <ul className="flex flex-col gap-2">
                {suggestions.map((wine, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => selectWine(wine)}
                      className="w-full flex flex-col gap-0.5 p-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-rose-600 text-left transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-zinc-100">{wine.name_ko}</span>
                        <span className="text-xs text-zinc-500">{wine.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{wine.producer}</span>
                        <span>·</span>
                        <span>{wine.country}</span>
                        <span>·</span>
                        <span>{TYPE_KO[wine.type] ?? wine.type}</span>
                        {wine.vintage_range && <><span>·</span><span>{wine.vintage_range}</span></>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* 선택된 와인 */}
            {selectedWine && (
              <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-rose-700 bg-rose-950/30">
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-zinc-100">{selectedWine.name_ko}</p>
                  <p className="text-xs text-zinc-400">{selectedWine.name} · {selectedWine.producer} · {selectedWine.country}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={selectedWine.vivino_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white transition-colors"
                  >
                    Vivino →
                  </a>
                  <button type="button" onClick={() => { setSelectedWine(null); setSuggestions(null); }} className="text-zinc-500 hover:text-zinc-300 text-lg">×</button>
                </div>
              </div>
            )}
          </section>

          {/* ── 사진 ── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">사진</h2>
            <div className="flex gap-2 flex-wrap">
              {photoPreviews.map((src, i) => (
                <div key={i} className="relative w-20 h-20">
                  <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs flex items-center justify-center"
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-700 hover:border-rose-600 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-rose-400 transition-colors"
              >
                <span className="text-2xl">+</span>
                <span className="text-xs">사진 추가</span>
              </button>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
          </section>

          {/* ── 기본 정보 ── */}
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

          {/* ── 페어링 음식 ── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">페어링 음식</h2>
            <div className="flex gap-2">
              <input
                value={foodInput}
                onChange={(e) => setFoodInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFood())}
                placeholder="음식 이름 입력 후 추가"
                className={iCls}
              />
              <button
                type="button"
                onClick={addFood}
                disabled={!foodInput.trim()}
                className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-sm font-medium transition-colors"
              >
                추가
              </button>
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

          {/* ── 평점 ── */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">평점</h2>
            <RatingSlider label="와인 평점" emoji="⭐" value={rating} max={5} step={0.5} onChange={setRating} />
            {foods.length > 0 && (
              <RatingSlider label="음식 궁합" emoji="🍽️" value={pairingScore} max={5} step={1} onChange={setPairingScore} />
            )}
          </section>

          {/* ── 메모 ── */}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">메모</h2>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              className={iCls + " resize-none"}
              placeholder="이 와인에 대한 인상, 향, 맛, 분위기를 자유롭게 적어보세요…"
            />
          </section>

          {/* ── 공개 범위 ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-zinc-400">공개 범위</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "link" | "public")} className={iCls}>
              <option value="private">비공개</option>
              <option value="link">링크 공유</option>
              <option value="public">전체 공개</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 text-white font-semibold text-base transition-colors"
          >
            경험 기록 저장
          </button>
        </form>
      </div>
    </>
  );
}

function RatingSlider({ label, emoji, value, max, step, onChange }: {
  label: string; emoji: string; value: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-300">{emoji} {label}</span>
        <span className="text-rose-400 font-semibold text-sm">{value.toFixed(step < 1 ? 1 : 0)} / {max}</span>
      </div>
      <input type="range" min={step} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-rose-600" />
    </div>
  );
}
