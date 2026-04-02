"use client";

import { useState } from "react";
import { updateWineRecord } from "@/lib/actions/diary";
import type { WineRecord, WineType } from "@/types";
import LoadingOverlay from "@/components/LoadingOverlay";

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: "red", label: "레드" },
  { value: "white", label: "화이트" },
  { value: "rose", label: "로제" },
  { value: "sparkling", label: "스파클링" },
  { value: "fortified", label: "주정강화" },
  { value: "other", label: "기타" },
];

const inputCls = "w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors text-sm";

export default function EditForm({ record }: { record: WineRecord }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const result = await updateWineRecord(record.id, {
      name: fd.get("name") as string,
      vintage: fd.get("vintage") ? parseInt(fd.get("vintage") as string) : null,
      country: (fd.get("country") as string) || null,
      region: (fd.get("region") as string) || null,
      grapes: (fd.get("grapes") as string) ? (fd.get("grapes") as string).split(",").map((s) => s.trim()).filter(Boolean) : null,
      producer: (fd.get("producer") as string) || null,
      type: (fd.get("type") as WineType) || null,
      location: (fd.get("location") as string) || null,
      drunk_at: fd.get("drunk_at") as string,
      price: fd.get("price") ? parseFloat(fd.get("price") as string) : null,
      memo: (fd.get("memo") as string) || null,
      balance: parseFloat(fd.get("balance") as string),
      complexity: parseFloat(fd.get("complexity") as string),
      value_score: parseFloat(fd.get("value_score") as string),
      rating: parseFloat(fd.get("rating") as string),
      visibility: (fd.get("visibility") as "private" | "link" | "public") || "private",
    });

    setSaving(false);
    if (result?.error) { setError(result.error); return; }
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setOpen(false); }, 1500);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-2xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold transition-colors"
      >
        수정하기
      </button>
    );
  }

  return (
    <>
      {saving && <LoadingOverlay message="기록 수정 중…" subMessage="잠시만 기다려 주세요" />}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">기록 수정</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300 text-xl">×</button>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">✓ 저장되었습니다</p>}

      <input name="name" defaultValue={record.name} required placeholder="와인 이름 *" className={inputCls} />
      <div className="grid grid-cols-2 gap-3">
        <input name="vintage" defaultValue={record.vintage ?? ""} placeholder="빈티지" className={inputCls} inputMode="numeric" />
        <select name="type" defaultValue={record.type ?? ""} className={inputCls}>
          <option value="">종류 선택</option>
          {WINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input name="country" defaultValue={record.country ?? ""} placeholder="생산국" className={inputCls} />
        <input name="region" defaultValue={record.region ?? ""} placeholder="지역" className={inputCls} />
      </div>
      <input name="grapes" defaultValue={record.grapes?.join(", ") ?? ""} placeholder="품종 (쉼표로 구분)" className={inputCls} />
      <input name="producer" defaultValue={record.producer ?? ""} placeholder="생산자" className={inputCls} />
      <div className="grid grid-cols-2 gap-3">
        <input name="drunk_at" type="date" defaultValue={record.drunk_at} className={inputCls} />
        <input name="price" defaultValue={record.price ?? ""} placeholder="가격" className={inputCls} inputMode="numeric" />
      </div>
      <input name="location" defaultValue={record.location ?? ""} placeholder="장소" className={inputCls} />
      <textarea name="memo" defaultValue={record.memo ?? ""} rows={3} placeholder="메모" className={inputCls + " resize-none"} />

      <div className="flex flex-col gap-3">
        {(["rating", "balance", "complexity", "value_score"] as const).map((key) => (
          <label key={key} className="flex items-center gap-3 text-sm text-zinc-400">
            <span className="w-20">{key === "rating" ? "종합 평점" : key === "balance" ? "밸런스" : key === "complexity" ? "복잡성" : "가성비"}</span>
            <input type="range" name={key} min="1" max="5" step={key === "rating" ? "0.5" : "1"} defaultValue={record[key] ?? 3} className="flex-1 accent-rose-600" />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-zinc-400">공개 범위</label>
        <select name="visibility" defaultValue={record.visibility} className={inputCls}>
          <option value="private">비공개</option>
          <option value="link">링크 공유</option>
          <option value="public">전체 공개</option>
        </select>
      </div>

      <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold transition-colors">
        저장
      </button>
    </form>
    </>
  );
}
