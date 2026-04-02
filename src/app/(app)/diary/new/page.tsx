"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { LabelAnalysisResult, WineType } from "@/types";
import type { NaverItem } from "@/app/api/naver/search/route";
import { createWineRecord } from "@/lib/actions/diary";
import LoadingOverlay from "@/components/LoadingOverlay";

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: "red", label: "레드" },
  { value: "white", label: "화이트" },
  { value: "rose", label: "로제" },
  { value: "sparkling", label: "스파클링" },
  { value: "fortified", label: "주정강화" },
  { value: "other", label: "기타" },
];

type FormState = {
  name: string; vintage: string; country: string; region: string;
  grapes: string; producer: string; type: WineType | "";
  location: string; drunk_at: string; price: string; memo: string;
  balance: number; complexity: number; value_score: number; rating: number;
};

const INITIAL: FormState = {
  name: "", vintage: "", country: "", region: "",
  grapes: "", producer: "", type: "", location: "",
  drunk_at: new Date().toISOString().split("T")[0],
  price: "", memo: "",
  balance: 3, complexity: 3, value_score: 3, rating: 3,
};

// 이미지를 JPEG으로 정규화 + 최대 1920px 리사이즈
async function normalizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1920;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const r = Math.min(MAX / width, MAX / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject()), "image/jpeg", 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export default function NewDiaryPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  // 단계별 상태
  const [ocrLoading, setOcrLoading] = useState(false);           // 1단계: OCR
  const [naverItems, setNaverItems] = useState<NaverItem[] | null>(null);  // 네이버 결과
  const [selectedNaver, setSelectedNaver] = useState<NaverItem | null>(null);
  const [aiLoading, setAiLoading] = useState(false);             // 3단계: AI 웹검색 (백그라운드)
  const [aiDone, setAiDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rawText, setRawText] = useState("");
  const [naverQuery, setNaverQuery] = useState("");
  const [aiResult, setAiResult] = useState<LabelAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [showEval, setShowEval] = useState(false);

  const set = (field: keyof FormState, v: string | number) =>
    setForm((f) => ({ ...f, [field]: v }));

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setNaverItems(null);
    setSelectedNaver(null);
    setAiResult(null);
    setAiDone(false);
    setError(null);
    setOcrLoading(true);

    let blob: Blob;
    try { blob = await normalizeImage(file); } catch { blob = file; }

    // OCR + 업로드 병렬
    const fdOcr = new FormData(); fdOcr.append("file", blob, "label.jpg");
    const fdUpload = new FormData(); fdUpload.append("file", blob, "label.jpg");

    const [ocrRes, uploadRes] = await Promise.allSettled([
      fetch("/api/ai/ocr", { method: "POST", body: fdOcr }),
      fetch("/api/upload", { method: "POST", body: fdUpload }),
    ]);

    setOcrLoading(false);

    if (uploadRes.status === "fulfilled" && uploadRes.value.ok) {
      const d = await uploadRes.value.json();
      if (d.url) setUploadedUrl(d.url);
    }

    if (ocrRes.status !== "fulfilled" || !ocrRes.value.ok) {
      setError("라벨 텍스트 인식에 실패했습니다. 직접 입력해 주세요.");
      return;
    }

    const { raw_text } = await ocrRes.value.json();
    setRawText(raw_text);

    // 네이버 검색할 쿼리 추출 (첫 두 줄 or 전체)
    const firstLines = raw_text.split("\n").slice(0, 2).join(" ").trim();
    const query = firstLines || raw_text.slice(0, 80);
    setNaverQuery(query);
    await runNaverSearch(query);

    // AI 웹검색은 백그라운드에서 진행
    runAiSearch(raw_text);
  }

  async function runNaverSearch(query: string) {
    if (!query.trim()) return;
    const res = await fetch("/api/naver/search?q=" + encodeURIComponent(query));
    if (res.ok) {
      const { items } = await res.json();
      setNaverItems(items ?? []);
    }
  }

  function runAiSearch(text: string) {
    setAiLoading(true);
    fetch("/api/ai/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((r) => r.json())
      .then((data: LabelAnalysisResult) => {
        setAiResult(data);
        setAiDone(true);
        // AI 결과로 폼 채우기 (이미 네이버로 선택된 필드는 유지)
        setForm((f) => ({
          ...f,
          name: f.name || data.name || "",
          vintage: f.vintage || (data.vintage ? String(data.vintage) : ""),
          country: f.country || data.country || "",
          region: f.region || data.region || "",
          grapes: f.grapes || (data.grapes?.join(", ") ?? ""),
          producer: f.producer || data.producer || "",
          type: f.type || (data.type as WineType) || "",
        }));
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }

  function selectNaver(item: NaverItem) {
    setSelectedNaver(item);
    setForm((f) => ({
      ...f,
      name: item.title,
      price: item.lprice ? String(item.lprice) : f.price,
      producer: item.brand || item.maker || f.producer,
    }));
    if (item.image && !uploadedUrl) setUploadedUrl(item.image);
  }

  async function handleManualSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!naverQuery.trim()) return;
    setNaverItems(null);
    await runNaverSearch(naverQuery);
    if (naverQuery !== rawText) runAiSearch(naverQuery);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setError("와인 이름을 입력해 주세요."); return; }
    setSaving(true);
    setError(null);

    const result = await createWineRecord({
      name: form.name,
      vintage: form.vintage ? parseInt(form.vintage) : null,
      country: form.country || null,
      region: form.region || null,
      grapes: form.grapes ? form.grapes.split(",").map((s) => s.trim()).filter(Boolean) : null,
      producer: form.producer || null,
      type: (form.type as WineType) || null,
      location: form.location || null,
      drunk_at: form.drunk_at,
      price: form.price ? parseFloat(form.price) : null,
      memo: form.memo || null,
      balance: form.balance, complexity: form.complexity,
      value_score: form.value_score, rating: form.rating,
      label_image_url: uploadedUrl || null,
      visibility: "private", foods: [],
    });

    setSaving(false);
    if (result?.error) setError(result.error);
  }

  const confidence = aiResult?.confidence ?? {};

  return (
    <>
      {saving && <LoadingOverlay message="기록 저장 중…" subMessage="잠시만 기다려 주세요" />}
      {ocrLoading && <LoadingOverlay message="라벨 읽는 중…" subMessage="5초 내로 완료됩니다" />}

      <div className="flex flex-col">
        <header className="px-5 pt-12 pb-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</button>
          <h1 className="text-xl font-bold">새 와인 기록</h1>
        </header>

        <form onSubmit={handleSubmit} className="px-4 pb-8 flex flex-col gap-5">
          {error && <p className="text-rose-400 text-sm bg-rose-950/40 rounded-xl px-4 py-3">{error}</p>}

          {/* ── 라벨 촬영 ── */}
          <section className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-32 h-40 rounded-2xl bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-rose-600 transition-colors flex flex-col items-center justify-center overflow-hidden"
            >
              {uploadedUrl || previewUrl ? (
                <img src={uploadedUrl || previewUrl!} alt="label" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <span className="text-3xl">📷</span>
                  <span className="text-xs text-zinc-500 mt-1">라벨 촬영</span>
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageChange} />
            {previewUrl && (
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                다시 촬영
              </button>
            )}
          </section>

          {/* ── 검색창 (직접 입력 or 보정) ── */}
          <section>
            <form onSubmit={handleManualSearch} className="flex gap-2">
              <input
                value={naverQuery}
                onChange={(e) => setNaverQuery(e.target.value)}
                placeholder="와인 이름으로 검색…"
                className="flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-rose-600"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
              >
                검색
              </button>
            </form>
          </section>

          {/* ── 네이버 쇼핑 결과 ── */}
          {naverItems !== null && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">네이버 쇼핑 결과</span>
                {aiLoading && <span className="text-xs text-zinc-500 animate-pulse">AI 분석 중…</span>}
                {aiDone && <span className="text-xs text-emerald-500">✓ AI 분석 완료</span>}
              </div>

              {naverItems.length === 0 ? (
                <p className="text-sm text-zinc-500 py-2">검색 결과가 없습니다. 이름을 수정해서 다시 검색해 보세요.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {naverItems.map((item) => {
                    const selected = selectedNaver?.productId === item.productId;
                    return (
                      <button
                        key={item.productId}
                        type="button"
                        onClick={() => selectNaver(item)}
                        className={`flex gap-3 p-3 rounded-xl border text-left transition-colors ${
                          selected
                            ? "border-rose-600 bg-rose-950/30"
                            : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                        }`}
                      >
                        {item.image && (
                          <img src={item.image} alt={item.title} className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-zinc-800" />
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2">{item.title}</p>
                          {(item.brand || item.maker) && (
                            <p className="text-xs text-zinc-500">{item.brand || item.maker}</p>
                          )}
                          {item.lprice && (
                            <p className="text-xs text-rose-400 mt-0.5">
                              {item.lprice.toLocaleString()}원{item.hprice && item.hprice !== item.lprice ? ` ~ ${item.hprice.toLocaleString()}원` : ""}
                            </p>
                          )}
                        </div>
                        {selected && <span className="ml-auto text-rose-400 flex-shrink-0">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* AI 결과가 있으면 raw_text 보기 제공 */}
              {rawText && (
                <button type="button" onClick={() => setShowRawText((v) => !v)} className="text-xs text-zinc-600 hover:text-zinc-400 underline text-left">
                  {showRawText ? "라벨 텍스트 접기 ▲" : "라벨에서 읽은 텍스트 보기 ▼"}
                </button>
              )}
              {showRawText && (
                <pre className="text-xs text-zinc-300 bg-zinc-900 rounded-xl p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto">{rawText}</pre>
              )}
            </section>
          )}

          {/* ── 기본 정보 폼 ── */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">기본 정보</h2>

            <Field label="와인 이름 *" confidence={confidence.name}>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} required className={iCls} placeholder="Château Margaux" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="빈티지" confidence={confidence.vintage}>
                <input value={form.vintage} onChange={(e) => set("vintage", e.target.value)} className={iCls} placeholder="2018" inputMode="numeric" />
              </Field>
              <Field label="종류" confidence={confidence.type}>
                <select value={form.type} onChange={(e) => set("type", e.target.value as WineType)} className={iCls}>
                  <option value="">선택</option>
                  {WINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="생산국" confidence={confidence.country}>
                <input value={form.country} onChange={(e) => set("country", e.target.value)} className={iCls} placeholder="France" />
              </Field>
              <Field label="지역" confidence={confidence.region}>
                <input value={form.region} onChange={(e) => set("region", e.target.value)} className={iCls} placeholder="Bordeaux" />
              </Field>
            </div>

            <Field label="품종" confidence={confidence.grapes}>
              <input value={form.grapes} onChange={(e) => set("grapes", e.target.value)} className={iCls} placeholder="Cabernet Sauvignon, Merlot" />
            </Field>

            <Field label="생산자" confidence={confidence.producer}>
              <input value={form.producer} onChange={(e) => set("producer", e.target.value)} className={iCls} placeholder="Château Margaux" />
            </Field>
          </section>

          {/* ── 음용 정보 ── */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">음용 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="날짜">
                <input type="date" value={form.drunk_at} onChange={(e) => set("drunk_at", e.target.value)} className={iCls} />
              </Field>
              <Field label="가격 (원)">
                <input value={form.price} onChange={(e) => set("price", e.target.value)} className={iCls} placeholder="50000" inputMode="numeric" />
              </Field>
            </div>
            <Field label="장소">
              <input value={form.location} onChange={(e) => set("location", e.target.value)} className={iCls} placeholder="강남 와인바" />
            </Field>
            <Field label="메모">
              <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={3} className={iCls + " resize-none"} placeholder="자유롭게 기록해 보세요…" />
            </Field>
          </section>

          {/* ── 품평 (접기/펼치기) ── */}
          <section>
            <button
              type="button"
              onClick={() => setShowEval((v) => !v)}
              className="w-full flex items-center justify-between py-3 text-sm font-semibold text-zinc-400 uppercase tracking-wider"
            >
              <span>품평 (선택)</span>
              <span className="text-zinc-600">{showEval ? "▲ 접기" : "▼ 펼치기"}</span>
            </button>

            {showEval && (
              <div className="flex flex-col gap-5 mt-2">
                <RatingSlider label="종합 평점" emoji="⭐" value={form.rating} max={5} step={0.5} onChange={(v) => set("rating", v)} />
                <RatingSlider label="밸런스" emoji="⚖️" value={form.balance} max={5} step={1} onChange={(v) => set("balance", v)} />
                <RatingSlider label="복잡성" emoji="🌸" value={form.complexity} max={5} step={1} onChange={(v) => set("complexity", v)} />
                <RatingSlider label="가성비" emoji="💰" value={form.value_score} max={5} step={1} onChange={(v) => set("value_score", v)} />
              </div>
            )}
          </section>

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 text-white font-semibold text-base transition-colors"
          >
            기록 저장
          </button>
        </form>
      </div>
    </>
  );
}

const iCls = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

function Field({ label, children, confidence }: { label: string; children: React.ReactNode; confidence?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-zinc-400 flex items-center gap-1.5">
        {label}
        {confidence === "high" && <span className="text-xs text-emerald-500 bg-emerald-950/40 px-1.5 py-0.5 rounded">인식됨</span>}
        {confidence === "medium" && <span className="text-xs text-sky-500 bg-sky-950/40 px-1.5 py-0.5 rounded">확인 필요</span>}
        {confidence === "low" && <span className="text-xs text-amber-500 bg-amber-950/40 px-1.5 py-0.5 rounded">추정</span>}
      </label>
      {children}
    </div>
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
