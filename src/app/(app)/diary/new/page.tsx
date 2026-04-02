"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { LabelAnalysisResult, WineType } from "@/types";
import { createWineRecord, uploadLabelImage } from "@/lib/actions/diary";

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: "red", label: "레드" },
  { value: "white", label: "화이트" },
  { value: "rose", label: "로제" },
  { value: "sparkling", label: "스파클링" },
  { value: "fortified", label: "주정강화" },
  { value: "other", label: "기타" },
];

type FormState = {
  name: string;
  vintage: string;
  country: string;
  region: string;
  grapes: string;
  producer: string;
  type: WineType | "";
  location: string;
  drunk_at: string;
  price: string;
  memo: string;
  balance: number;
  complexity: number;
  value_score: number;
  rating: number;
  label_image_url: string;
};

const INITIAL: FormState = {
  name: "", vintage: "", country: "", region: "",
  grapes: "", producer: "", type: "", location: "",
  drunk_at: new Date().toISOString().split("T")[0],
  price: "", memo: "",
  balance: 3, complexity: 3, value_score: 3, rating: 3,
  label_image_url: "",
};

export default function NewDiaryPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<LabelAnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof FormState, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setAiLoading(true);
    setAiResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/recognize", { method: "POST", body: fd });
      const data: LabelAnalysisResult = await res.json();
      setAiResult(data);
      setForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        vintage: data.vintage ? String(data.vintage) : f.vintage,
        country: data.country ?? f.country,
        region: data.region ?? f.region,
        grapes: data.grapes ? data.grapes.join(", ") : f.grapes,
        producer: data.producer ?? f.producer,
        type: (data.type as WineType) ?? f.type,
      }));
    } catch {
      setError("AI 분석에 실패했습니다. 수동으로 입력해 주세요.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setError("와인 이름을 입력해 주세요."); return; }
    setSaving(true);
    setError(null);

    let labelUrl = form.label_image_url;

    const file = fileRef.current?.files?.[0];
    if (file && !labelUrl) {
      const fd = new FormData();
      fd.append("file", file);
      const uploadResult = await uploadLabelImage(fd);
      if (uploadResult.error) { setError(uploadResult.error); setSaving(false); return; }
      labelUrl = uploadResult.url ?? "";
    }

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
      balance: form.balance,
      complexity: form.complexity,
      value_score: form.value_score,
      rating: form.rating,
      label_image_url: labelUrl || null,
      visibility: "private",
      foods: [],
    });

    if (result?.error) { setError(result.error); setSaving(false); }
  }

  const confidence = aiResult?.confidence ?? {};

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</button>
        <h1 className="text-xl font-bold">새 와인 기록</h1>
      </header>

      <form onSubmit={handleSubmit} className="px-4 pb-8 flex flex-col gap-6">
        {error && (
          <p className="text-rose-400 text-sm bg-rose-950/40 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Label Image */}
        <section className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-32 h-40 rounded-2xl bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-rose-600 transition-colors flex flex-col items-center justify-center overflow-hidden"
          >
            {previewUrl ? (
              <img src={previewUrl} alt="label preview" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <>
                <span className="text-3xl">📷</span>
                <span className="text-xs text-zinc-500 mt-1">라벨 촬영</span>
              </>
            )}
            {aiLoading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-white text-sm">AI 분석 중…</span>
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageChange}
          />
          {aiResult && (
            <p className="text-xs text-emerald-400 bg-emerald-950/40 px-3 py-1.5 rounded-full">
              ✓ AI가 와인 정보를 인식했습니다 — 확인 후 저장하세요
            </p>
          )}
        </section>

        {/* Basic Info */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">기본 정보</h2>

          <Field label="와인 이름 *" uncertain={confidence.name === "low"}>
            <input
              name="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              className={inputCls}
              placeholder="Château Margaux"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="빈티지" uncertain={confidence.vintage === "low"}>
              <input
                name="vintage"
                value={form.vintage}
                onChange={(e) => set("vintage", e.target.value)}
                className={inputCls}
                placeholder="2018"
                inputMode="numeric"
              />
            </Field>
            <Field label="종류" uncertain={confidence.type === "low"}>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as WineType)}
                className={inputCls}
              >
                <option value="">선택</option>
                {WINE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="생산국" uncertain={confidence.country === "low"}>
              <input
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                className={inputCls}
                placeholder="France"
              />
            </Field>
            <Field label="지역" uncertain={confidence.region === "low"}>
              <input
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className={inputCls}
                placeholder="Bordeaux"
              />
            </Field>
          </div>

          <Field label="품종" uncertain={confidence.grapes === "low"}>
            <input
              value={form.grapes}
              onChange={(e) => set("grapes", e.target.value)}
              className={inputCls}
              placeholder="Cabernet Sauvignon, Merlot"
            />
          </Field>

          <Field label="생산자 (와이너리)" uncertain={confidence.producer === "low"}>
            <input
              value={form.producer}
              onChange={(e) => set("producer", e.target.value)}
              className={inputCls}
              placeholder="Château Margaux"
            />
          </Field>
        </section>

        {/* Occasion */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">음용 정보</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="날짜">
              <input
                type="date"
                value={form.drunk_at}
                onChange={(e) => set("drunk_at", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="가격 (원)">
              <input
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                className={inputCls}
                placeholder="50000"
                inputMode="numeric"
              />
            </Field>
          </div>
          <Field label="장소">
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              className={inputCls}
              placeholder="강남 와인바"
            />
          </Field>
          <Field label="메모">
            <textarea
              value={form.memo}
              onChange={(e) => set("memo", e.target.value)}
              rows={3}
              className={inputCls + " resize-none"}
              placeholder="자유롭게 기록해 보세요…"
            />
          </Field>
        </section>

        {/* Evaluation */}
        <section className="flex flex-col gap-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">품평</h2>
          <RatingSlider label="종합 평점" emoji="⭐" value={form.rating} max={5} step={0.5} onChange={(v) => set("rating", v)} />
          <RatingSlider label="밸런스" emoji="⚖️" value={form.balance} max={5} step={1} onChange={(v) => set("balance", v)} />
          <RatingSlider label="복잡성" emoji="🌸" value={form.complexity} max={5} step={1} onChange={(v) => set("complexity", v)} />
          <RatingSlider label="가성비" emoji="💰" value={form.value_score} max={5} step={1} onChange={(v) => set("value_score", v)} />
        </section>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold text-base transition-colors"
        >
          {saving ? "저장 중…" : "기록 저장"}
        </button>
      </form>
    </div>
  );
}

const inputCls = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

function Field({ label, children, uncertain }: { label: string; children: React.ReactNode; uncertain?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-zinc-400 flex items-center gap-1">
        {label}
        {uncertain && <span className="text-xs text-amber-500" title="AI 추정값">추정</span>}
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
      <input
        type="range"
        min={step}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-rose-600"
      />
    </div>
  );
}
