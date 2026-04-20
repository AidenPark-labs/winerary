"use client";

import { useState } from "react";

type ReportType = "vivino_link" | "wine_name" | "other_info" | "custom";

interface Option {
  value: ReportType;
  label: string;
  hint: string;
}

const OPTIONS: Option[] = [
  { value: "vivino_link", label: "Vivino 링크 오류", hint: "연결된 Vivino 페이지가 이 와인과 다릅니다" },
  { value: "wine_name", label: "와인명 오류", hint: "와인 이름(한글/영문)이 잘못되었어요" },
  { value: "other_info", label: "기타 정보 오류", hint: "국가·지역·품종·와이너리·도수 등" },
  { value: "custom", label: "직접 입력", hint: "아래에 내용을 자유롭게 적어주세요" },
];

interface Props {
  wineId: string;
  onClose: () => void;
}

export default function ReportWineModal({ wineId, onClose }: Props) {
  const [reportType, setReportType] = useState<ReportType>("vivino_link");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const customRequired = reportType === "custom";
  const canSubmit = !submitting && (!customRequired || description.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/wine-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wine_id: wineId,
          report_type: reportType,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "신고 접수 중 오류가 발생했습니다");
        return;
      }
      setSuccess(true);
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface/95 backdrop-blur-xl border border-white/10 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-white">신고가 접수되었어요</h3>
            <p className="text-sm text-zinc-400">
              빠르게 확인하고 수정할게요. 데이터 품질 개선에 도움을 주셔서 감사합니다.
            </p>
            <button
              onClick={onClose}
              className="mt-2 w-full py-3 rounded-xl bg-accent hover:bg-accent/90 text-white font-medium transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">와인 정보 오류 신고</h3>
                <p className="text-xs text-zinc-500 mt-1">어떤 부분이 잘못되었나요?</p>
              </div>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 text-xl leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {OPTIONS.map((opt) => {
                const active = reportType === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors border ${
                      active
                        ? "bg-accent/10 border-accent/40"
                        : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportType"
                      value={opt.value}
                      checked={active}
                      onChange={() => setReportType(opt.value)}
                      className="mt-0.5 accent-rose-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-100 font-medium">{opt.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{opt.hint}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mb-4">
              <label className="block text-xs text-zinc-500 mb-1.5">
                상세 내용{customRequired ? " (필수)" : " (선택)"}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                placeholder={
                  customRequired
                    ? "어떤 문제가 있는지 알려주세요"
                    : "추가로 전하고 싶은 내용이 있다면 적어주세요"
                }
                rows={4}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent/60 resize-none"
              />
              <p className="text-[10px] text-zinc-600 mt-1 text-right">{description.length}/1000</p>
            </div>

            {error && (
              <p className="text-xs text-rose-400 mb-3">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent/90 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "접수 중…" : "신고하기"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
