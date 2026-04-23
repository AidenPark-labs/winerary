"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateRawWine, promoteRawWine, createAdminWine } from "./actions";

export interface RawWineRow {
  id: string;
  source: string;
  source_id: string;
  name_ko: string | null;
  name_en: string | null;
  country: string | null;
  region: string | null;
  wine_type: string | null;
  grape_variety: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  image_url: string | null;
  price: number | null;
  promoted_wine_id: string | null;
  collected_at: string | null;
}

interface Props {
  rows: RawWineRow[];
  total: number;
  page: number;
  pageSize: number;
  source: string;
  promote: string;
  missing: string;
  q: string;
  sourceTotals: Record<string, number>;
}

const SOURCE_LABELS: Record<string, string> = {
  wine21: "wine21",
  winenara: "winenara",
  gangnam: "gangnam",
  naver_shopping: "naver",
  user_submission: "유저",
  admin: "어드민",
};

const WINE_TYPES = ["red", "white", "rose", "sparkling", "fortified", "dessert", "other"];

export default function RawWinesClient({ rows, total, page, pageSize, source, promote, missing, q, sourceTotals }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<RawWineRow>>>({});
  const [flash, setFlash] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(q);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const submitSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      const params = new URLSearchParams();
      const merged: Record<string, string | number | undefined> = { source, promote, missing, q: trimmed };
      for (const [k, v] of Object.entries(merged)) {
        if (v == null || v === "" || v === "all") continue;
        params.set(k, String(v));
      }
      const qs = params.toString();
      router.push(`/admin/raw-wines${qs ? `?${qs}` : ""}`);
    },
    [source, promote, missing, router],
  );

  const buildUrl = useCallback(
    (patch: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams();
      const merged = { source, promote, missing, q, page, ...patch };
      for (const [k, v] of Object.entries(merged)) {
        if (v == null || v === "" || v === "all") continue;
        if (k === "page" && Number(v) <= 1) continue;
        params.set(k, String(v));
      }
      const qs = params.toString();
      return `/admin/raw-wines${qs ? `?${qs}` : ""}`;
    },
    [source, promote, missing, q, page],
  );

  const setField = (id: string, field: keyof RawWineRow, value: string) => {
    setEditing((e) => ({ ...e, [id]: { ...(e[id] ?? {}), [field]: value } }));
  };

  const saveRow = (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    setFlash(null);
    startTransition(async () => {
      const result = await updateRawWine(id, patch);
      if (result.error) {
        setFlash({ id, msg: `저장 실패: ${result.error}`, ok: false });
      } else {
        setFlash({ id, msg: "저장됨", ok: true });
        setEditing((e) => {
          const { [id]: _, ...rest } = e;
          return rest;
        });
        router.refresh();
      }
    });
  };

  const promoteRow = (id: string) => {
    setFlash(null);
    startTransition(async () => {
      const result = await promoteRawWine(id);
      if ("error" in result) {
        setFlash({ id, msg: `승격 실패: ${result.error}`, ok: false });
        return;
      }
      const oc = result.outcome;
      let msg = "";
      let ok = true;
      switch (oc.kind) {
        case "already_promoted":
          msg = `이미 승격됨 (wine_id: ${oc.wine_id.slice(0, 8)}…)`;
          break;
        case "missing_fields":
          msg = `필드 부족: ${oc.missing.join(", ")}`;
          ok = false;
          break;
        case "auto_merged":
          msg = `기존 wines(${oc.wine_id.slice(0, 8)}…)에 병합`;
          break;
        case "new_promoted":
          msg = `신규 promote 완료 (${oc.wine_id.slice(0, 8)}…)`;
          break;
        case "candidate":
          msg = `검수 큐로 등록 (${oc.reason})`;
          break;
        case "error":
          msg = `에러: ${oc.message}`;
          ok = false;
          break;
      }
      setFlash({ id, msg, ok });
      router.refresh();
    });
  };

  return (
    <div>
      {/* 필터 바 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {/* source 탭 */}
        <div className="flex gap-1">
          <FilterLink href={buildUrl({ source: undefined, page: undefined })} active={source === "all"}>
            전체
          </FilterLink>
          {Object.entries(SOURCE_LABELS).map(([s, label]) => (
            <FilterLink key={s} href={buildUrl({ source: s, page: undefined })} active={source === s}>
              {label} <span className="opacity-60">({sourceTotals[s]?.toLocaleString() ?? 0})</span>
            </FilterLink>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex gap-1">
          <FilterLink href={buildUrl({ promote: "unpromoted", page: undefined })} active={promote === "unpromoted"}>
            미promote
          </FilterLink>
          <FilterLink href={buildUrl({ promote: "promoted", page: undefined })} active={promote === "promoted"}>
            승격됨
          </FilterLink>
          <FilterLink href={buildUrl({ promote: "all", page: undefined })} active={promote === "all"}>
            전체
          </FilterLink>
        </div>
        <span className="text-zinc-600">|</span>
        <div className="flex gap-1">
          <FilterLink href={buildUrl({ missing: "all", page: undefined })} active={missing === "all"}>
            결손 무관
          </FilterLink>
          <FilterLink href={buildUrl({ missing: "complete", page: undefined })} active={missing === "complete"}>
            3필드 완전
          </FilterLink>
          <FilterLink href={buildUrl({ missing: "missing_name_ko", page: undefined })} active={missing === "missing_name_ko"}>
            name_ko 누락
          </FilterLink>
          <FilterLink href={buildUrl({ missing: "missing_name_en", page: undefined })} active={missing === "missing_name_en"}>
            name_en 누락
          </FilterLink>
          <FilterLink href={buildUrl({ missing: "missing_country", page: undefined })} active={missing === "missing_country"}>
            country 누락
          </FilterLink>
          <FilterLink href={buildUrl({ missing: "missing_grape", page: undefined })} active={missing === "missing_grape"}>
            grape 누락
          </FilterLink>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="ml-auto px-3 py-1.5 rounded bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm"
          title="raw_wines 거치지 않고 wines에 직접 추가"
        >
          + wines에 직접 추가
        </button>
      </div>

      {/* 이름 검색 */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitSearch(searchInput);
              }
            }}
            placeholder="와인명 검색 (name_ko 또는 name_en)"
            className="flex-1 px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-zinc-600 focus:outline-none"
          />
          <button
            onClick={() => submitSearch(searchInput)}
            className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-sm font-medium"
          >
            검색
          </button>
          {q && (
            <button
              onClick={() => { setSearchInput(""); submitSearch(""); }}
              className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 text-sm"
            >
              초기화
            </button>
          )}
        </div>
        {q && (
          <span className="text-xs text-zinc-500">
            검색어: <span className="text-zinc-300 font-mono">{q}</span>
          </span>
        )}
      </div>

      <div className="mb-4 text-xs text-zinc-500">
        총 <span className="text-zinc-200 font-bold">{total.toLocaleString()}</span>건 · 페이지 {page}/{totalPages}
      </div>

      {/* 리스트 */}
      <div className="space-y-2">
        {rows.map((r) => {
          const e = editing[r.id] ?? {};
          const cur = <K extends keyof RawWineRow>(k: K): RawWineRow[K] => (e[k] !== undefined ? (e[k] as RawWineRow[K]) : r[k]);
          const isExpanded = expanded === r.id;
          const hasEdit = Object.keys(e).length > 0;
          return (
            <div key={r.id} className={`rounded border ${isExpanded ? "border-zinc-700 bg-zinc-900/50" : "border-zinc-800 bg-zinc-900/30"} p-3`}>
              <div className="flex items-start gap-3">
                <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-zinc-800 text-zinc-300 mt-0.5 whitespace-nowrap">
                  {SOURCE_LABELS[r.source] ?? r.source}
                </span>
                {r.promoted_wine_id ? (
                  <span className="px-1.5 py-0.5 rounded text-[11px] bg-emerald-950 border border-emerald-800 text-emerald-300 mt-0.5 whitespace-nowrap">
                    promoted
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[11px] bg-amber-950 border border-amber-800 text-amber-300 mt-0.5 whitespace-nowrap">
                    unpromoted
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${r.name_ko ? "text-zinc-100" : "text-red-400 italic"}`}>
                      {r.name_ko || "(name_ko 없음)"}
                    </span>
                    <span className={`text-xs ${r.name_en ? "text-zinc-400" : "text-red-400 italic"}`}>
                      {r.name_en || "(name_en 없음)"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5 flex gap-2 flex-wrap">
                    <span>{r.country || <span className="text-red-500 italic">country 없음</span>}</span>
                    <span>·</span>
                    <span>{r.grape_variety || <span className="text-amber-500 italic">grape 컬럼 없음</span>}</span>
                    <span>·</span>
                    <span>{r.wine_type || "-"}</span>
                  </div>
                </div>
                <button
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                  className="text-xs px-2 py-1 rounded border border-zinc-700 hover:border-zinc-600 text-zinc-300"
                >
                  {isExpanded ? "접기" : "편집"}
                </button>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <EditField label="name_ko" value={cur("name_ko") ?? ""} onChange={(v) => setField(r.id, "name_ko", v)} />
                    <EditField label="name_en" value={cur("name_en") ?? ""} onChange={(v) => setField(r.id, "name_en", v)} />
                    <EditField label="country" value={cur("country") ?? ""} onChange={(v) => setField(r.id, "country", v)} />
                    <EditField label="region" value={cur("region") ?? ""} onChange={(v) => setField(r.id, "region", v)} />
                    <EditSelect
                      label="wine_type"
                      value={cur("wine_type") ?? ""}
                      onChange={(v) => setField(r.id, "wine_type", v)}
                      options={["", ...WINE_TYPES]}
                    />
                    <EditField label="grape_variety" value={cur("grape_variety") ?? ""} onChange={(v) => setField(r.id, "grape_variety", v)} />
                    <EditField label="producer_ko" value={cur("producer_ko") ?? ""} onChange={(v) => setField(r.id, "producer_ko", v)} />
                    <EditField label="producer_en" value={cur("producer_en") ?? ""} onChange={(v) => setField(r.id, "producer_en", v)} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => saveRow(r.id)}
                      disabled={!hasEdit || isPending}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => promoteRow(r.id)}
                      disabled={isPending}
                      className="px-3 py-1.5 rounded bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-sm"
                    >
                      지금 승격
                    </button>
                    {r.promoted_wine_id && (
                      <Link
                        href={`/admin/wines?q=${encodeURIComponent(r.promoted_wine_id)}`}
                        className="text-xs text-zinc-400 hover:text-zinc-200 underline ml-auto"
                      >
                        승격된 wines 보기 → {r.promoted_wine_id.slice(0, 8)}…
                      </Link>
                    )}
                    <span className="text-[10px] text-zinc-600 font-mono">raw id: {r.id.slice(0, 8)}…</span>
                  </div>
                  {flash?.id === r.id && (
                    <div className={`mt-2 text-xs ${flash.ok ? "text-emerald-400" : "text-red-400"}`}>{flash.msg}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 페이지네이션 */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link
          href={page > 1 ? buildUrl({ page: page - 1 }) : "#"}
          className={`px-3 py-1.5 rounded border ${page > 1 ? "border-zinc-700 text-zinc-200 hover:border-zinc-500" : "border-zinc-900 text-zinc-700 pointer-events-none"}`}
        >
          ← 이전
        </Link>
        <span className="text-zinc-500">{page} / {totalPages}</span>
        <Link
          href={page < totalPages ? buildUrl({ page: page + 1 }) : "#"}
          className={`px-3 py-1.5 rounded border ${page < totalPages ? "border-zinc-700 text-zinc-200 hover:border-zinc-500" : "border-zinc-900 text-zinc-700 pointer-events-none"}`}
        >
          다음 →
        </Link>
      </div>

      {/* 어드민 추가 모달 */}
      {addOpen && <AddDialog onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); router.refresh(); }} />}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  const base = "px-2.5 py-1 rounded text-xs font-medium transition-colors border";
  const cls = active
    ? "bg-zinc-100 text-zinc-900 border-zinc-100"
    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700";
  return (
    <Link href={href} className={`${base} ${cls}`}>
      {children}
    </Link>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-zinc-600 focus:outline-none"
      />
    </label>
  );
}

function EditSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-zinc-600 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "(미지정)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function AddDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name_ko: "",
    name_en: "",
    country: "",
    region: "",
    wine_type: "",
    grape_variety: "",
    producer_ko: "",
    producer_en: "",
    image_url: "",
  });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = () => {
    if (!form.name_ko.trim() || !form.name_en.trim() || !form.country.trim()) {
      setMsg({ text: "name_ko, name_en, country는 필수입니다", ok: false });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const result = await createAdminWine(form);
      if ("error" in result) {
        setMsg({ text: result.error, ok: false });
        return;
      }
      const oc = result.outcome;
      let text = "";
      switch (oc.kind) {
        case "new_inserted":
          text = `신규 wines 생성 완료 (${oc.wine_id.slice(0, 8)}…)`;
          break;
        case "auto_merged":
          text = `기존 wines에 merge (${oc.wine_id.slice(0, 8)}…)`;
          break;
        case "candidate":
          text = `검수 큐로 등록 (${oc.reason}, ${oc.wine_id.slice(0, 8)}…)`;
          break;
      }
      setMsg({ text, ok: true });
      setTimeout(onDone, 1500);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-xl w-full">
        <h2 className="text-lg font-bold mb-1">wines에 직접 추가</h2>
        <p className="text-xs text-zinc-500 mb-4">raw_wines 거치지 않고 wines 카탈로그에 바로 INSERT</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <EditField label="name_ko *" value={form.name_ko} onChange={(v) => setForm({ ...form, name_ko: v })} />
          <EditField label="name_en *" value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} />
          <EditField label="country *" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
          <EditField label="region" value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
          <EditSelect
            label="wine_type"
            value={form.wine_type}
            onChange={(v) => setForm({ ...form, wine_type: v })}
            options={["", ...WINE_TYPES]}
          />
          <EditField label="grape_variety (쉼표 구분)" value={form.grape_variety} onChange={(v) => setForm({ ...form, grape_variety: v })} />
          <EditField label="producer_ko" value={form.producer_ko} onChange={(v) => setForm({ ...form, producer_ko: v })} />
          <EditField label="producer_en" value={form.producer_en} onChange={(v) => setForm({ ...form, producer_en: v })} />
          <div className="md:col-span-2">
            <EditField label="image_url" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
          </div>
        </div>
        {msg && (
          <div className={`mt-3 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-sm">
            취소
          </button>
          <button
            onClick={submit}
            disabled={isPending}
            className="px-3 py-1.5 rounded bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-sm"
          >
            {isPending ? "처리 중…" : "wines에 추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
