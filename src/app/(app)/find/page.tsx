"use client";

import { useState, useRef } from "react";
import Link from "next/link";

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
  error?: string;
}

type Step = "select" | "preview" | "analyzing" | "result";

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
  const [step, setStep] = useState<Step>("select");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<WineResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileBlob = useRef<Blob | null>(null);

  async function handleFile(file: File) {
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
    } catch {
      setResult({ error: "분석 중 오류가 발생했습니다. 다시 시도해주세요." });
      setStep("result");
    }
  }

  function reset() {
    setStep("select");
    setPreviewUrl(null);
    setResult(null);
    fileBlob.current = null;
  }

  // 기록하기 링크용 파라미터 생성
  function buildRecordLink() {
    if (!result) return "/diary/new";
    const p = new URLSearchParams();
    if (result.name) p.set("name", result.name);
    if (result.name_original) p.set("name_original", result.name_original);
    if (result.wine_type) p.set("wine_type", result.wine_type);
    if (result.country) p.set("country", result.country);
    if (result.grape_variety) p.set("grape", result.grape_variety);
    if (result.vintage) p.set("vintage", String(result.vintage));
    if (result.vivino_url) p.set("vivino_url", result.vivino_url);
    return `/diary/new?${p.toString()}`;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="px-5 pt-12 pb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold">와인 찾기</h1>
        <p className="text-zinc-500 text-sm mt-1">라벨 사진으로 와인을 바로 알아보세요</p>
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
                  {result.grape_variety && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                      🍇 {result.grape_variety}
                    </span>
                  )}
                </div>

                {/* 설명 */}
                {result.description && (
                  <p className="text-sm text-zinc-300 leading-relaxed">{result.description}</p>
                )}

                {/* Vivino 링크 */}
                {result.vivino_url && (
                  <a href={result.vivino_url} target="_blank" rel="noopener noreferrer"
                    className="self-start flex items-center gap-2 px-4 py-2 rounded-full border border-rose-800/60 bg-rose-950/30 text-rose-300 text-sm hover:bg-rose-900/40 transition-colors">
                    🍇 Vivino에서 더 보기 →
                  </a>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-3 flex-shrink-0">
                <button onClick={reset}
                  className="flex-1 py-3.5 rounded-2xl border border-zinc-700 text-zinc-300 font-medium active:scale-95 transition-all">
                  다시 찾기
                </button>
                <Link href={buildRecordLink()}
                  className="flex-[2] py-3.5 rounded-2xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-all text-white font-semibold text-center">
                  ✍️ 이 와인 기록하기
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
