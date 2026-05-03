"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getWineImage } from "@/lib/wine-placeholder";
import { updateWine, deleteWine } from "@/app/admin/wines/actions";
import {
  confirmVivinoMatch,
  replaceVivinoUrl,
  unlinkVivinoMatch,
} from "@/app/admin/vivino-review/actions";
import { approveWineV2 } from "@/app/admin/wines-v2-review/actions";
import { confirmDedupe, rejectDedupe } from "@/app/admin/dedupe-review/actions";
import { unlinkVivino } from "@/app/admin/vivino-dup-review/actions";
import {
  resolveReport,
  dismissReport,
  reopenReport,
  resolveAllForWine,
} from "@/app/admin/reports/actions";

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷",
  white: "화이트 🥂",
  rose: "로제 🌸",
  sparkling: "스파클링 ✨",
  fortified: "주정강화 🏺",
  dessert: "디저트 🍯",
  other: "기타",
};

const REPORT_TYPE_KO: Record<string, string> = {
  vivino_link: "Vivino 링크 오류",
  wine_name: "와인명 오류",
  other_info: "기타 정보 오류",
  custom: "직접 입력",
};

export interface WineDetail {
  id: string;
  source: string;
  source_refs: string[] | null;
  created_at: string;
  updated_at: string;
  name_ko: string;
  name_en: string;
  wine_type: string;
  wine_style: string | null;
  country_ko: string;
  region_ko: string | null;
  producer: string | null;
  grape_varieties: string[] | null;
  grape_blend: unknown | null;
  alcohol: number | null;
  brand: string | null;
  price: number | null;
  description: string | null;
  image_url: string | null;
  is_published: boolean;
  needs_review: boolean;
  needs_review_reasons: string[] | null;
  locked_fields: string[] | null;
  // vivino_wines join
  vivino_url: string | null;
  vivino_wine_id: string | null;
  vivino_name: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  vivino_winery: string | null;
  vivino_grapes: string | null;
  vivino_region: string | null;
  vivino_style: string | null;
  vivino_alcohol: string | null;
  vivino_description: string | null;
  vivino_image_url: string | null;
  vivino_needs_review: boolean | null;
  vivino_reviewed_at: string | null;
  vivino_match_score: number | null;
}

export interface DedupeCandidate {
  id: string;
  raw_wine_id: string;
  match_reason: string;
  match_score: number | null;
  match_details: Record<string, unknown> | null;
  created_at: string;
  raw_wine: {
    id: string;
    source: string;
    source_id: string;
    name_ko: string | null;
    name_en: string | null;
    producer_ko: string | null;
    producer_en: string | null;
    country: string | null;
    region: string | null;
    wine_type: string | null;
    grape_variety: string | null;
    alcohol: string | null;
    image_url: string | null;
  } | null;
}

export interface DupGroupMember {
  id: string;
  name_ko: string;
  name_en: string;
  producer: string | null;
  country_ko: string;
  region_ko: string | null;
  source: string;
  image_url: string | null;
}

export interface ReportRow {
  id: string;
  user_id: string | null;
  report_type: string;
  description: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  resolved_note: string | null;
}

interface Props {
  wine: WineDetail;
  dedupeCandidates: DedupeCandidate[];
  dupGroup: DupGroupMember[];
  reports: ReportRow[];
}

type Tab = "basic" | "vivino" | "review" | "dedupe" | "url_dup" | "reports";

export default function WineDetailClient({ wine, dedupeCandidates, dupGroup, reports }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("basic");

  const openReports = reports.filter((r) => r.status === "open");
  const reviewBadges = {
    review: wine.needs_review,
    vivino: !!wine.vivino_url && !wine.vivino_reviewed_at,
    dedupe: dedupeCandidates.length,
    url_dup: dupGroup.length,
    reports: openReports.length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <Link href="/admin/wine-db" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← 목록으로
          </Link>
          <h1 className="text-2xl font-bold mt-2">{wine.name_ko}</h1>
          {wine.name_en && <p className="text-sm text-zinc-500 italic">{wine.name_en}</p>}
          <p className="text-[10px] text-zinc-600 font-mono mt-1 select-all">{wine.id}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!wine.is_published && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-700 text-zinc-300">비공개</span>
          )}
          <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 text-zinc-300">
            {TYPE_KO[wine.wine_type] ?? wine.wine_type}
          </span>
          <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
            source: {wine.source}
          </span>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap items-center gap-1 mb-6 border-b border-zinc-800">
        <TabButton label="기본" active={tab === "basic"} onClick={() => setTab("basic")} />
        <TabButton
          label="Vivino"
          active={tab === "vivino"}
          onClick={() => setTab("vivino")}
          badge={reviewBadges.vivino ? "!" : undefined}
          tone="purple"
        />
        <TabButton
          label="변환 검수"
          active={tab === "review"}
          onClick={() => setTab("review")}
          badge={reviewBadges.review ? "!" : undefined}
          tone="amber"
        />
        <TabButton
          label="중복 후보"
          active={tab === "dedupe"}
          onClick={() => setTab("dedupe")}
          badge={reviewBadges.dedupe > 0 ? String(reviewBadges.dedupe) : undefined}
          tone="blue"
        />
        <TabButton
          label="URL 그룹"
          active={tab === "url_dup"}
          onClick={() => setTab("url_dup")}
          badge={reviewBadges.url_dup > 0 ? String(reviewBadges.url_dup) : undefined}
          tone="fuchsia"
        />
        <TabButton
          label="신고"
          active={tab === "reports"}
          onClick={() => setTab("reports")}
          badge={reviewBadges.reports > 0 ? String(reviewBadges.reports) : undefined}
          tone="rose"
        />
      </div>

      {/* 탭 컨텐츠 */}
      {tab === "basic" && <BasicSection wine={wine} onChanged={() => router.refresh()} />}
      {tab === "vivino" && <VivinoSection wine={wine} onChanged={() => router.refresh()} />}
      {tab === "review" && <ReviewSection wine={wine} onChanged={() => router.refresh()} />}
      {tab === "dedupe" && (
        <DedupeSection
          wineId={wine.id}
          candidates={dedupeCandidates}
          onChanged={() => router.refresh()}
        />
      )}
      {tab === "url_dup" && (
        <UrlDupSection
          wineId={wine.id}
          vivinoUrl={wine.vivino_url}
          members={dupGroup}
          onChanged={() => router.refresh()}
        />
      )}
      {tab === "reports" && (
        <ReportsSection wineId={wine.id} reports={reports} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 탭 버튼
// ─────────────────────────────────────────────────────────

function TabButton({
  label,
  active,
  onClick,
  badge,
  tone = "zinc",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
  tone?: "zinc" | "amber" | "purple" | "blue" | "fuchsia" | "rose";
}) {
  const toneBadge: Record<string, string> = {
    zinc: "bg-zinc-700 text-zinc-200",
    amber: "bg-amber-500/30 text-amber-200",
    purple: "bg-purple-500/30 text-purple-200",
    blue: "bg-blue-500/30 text-blue-200",
    fuchsia: "bg-fuchsia-500/30 text-fuchsia-200",
    rose: "bg-rose-500/30 text-rose-200",
  };
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? "border-rose-400 text-zinc-100 font-medium"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
      {badge && (
        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${toneBadge[tone]}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// 1. 기본 편집
// ─────────────────────────────────────────────────────────

function BasicSection({ wine, onChanged }: { wine: WineDetail; onChanged: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name_ko: wine.name_ko,
    name_en: wine.name_en,
    wine_type: wine.wine_type,
    wine_style: wine.wine_style ?? "",
    country_ko: wine.country_ko,
    region_ko: wine.region_ko ?? "",
    producer: wine.producer ?? "",
    grape_varieties: (wine.grape_varieties ?? []).join(", "),
    alcohol: wine.alcohol != null ? String(wine.alcohol) : "",
    brand: wine.brand ?? "",
    price: wine.price != null ? String(wine.price) : "",
    description: wine.description ?? "",
    image_url: wine.image_url ?? "",
    is_published: wine.is_published,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const data: Record<string, string | number | string[] | boolean | null> = {
      name_ko: form.name_ko.trim(),
      name_en: form.name_en.trim(),
      wine_type: form.wine_type,
      wine_style: form.wine_style.trim() || null,
      country_ko: form.country_ko.trim(),
      region_ko: form.region_ko.trim() || null,
      producer: form.producer.trim() || null,
      grape_varieties: form.grape_varieties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      alcohol: form.alcohol.trim() || null,
      brand: form.brand.trim() || null,
      price: form.price.trim() ? Number(form.price) : null,
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      is_published: form.is_published,
    };
    const res = await updateWine(wine.id, data);
    setSaving(false);
    if (res.error) {
      setMsg(`오류: ${res.error}`);
    } else {
      setMsg("저장 완료");
      onChanged();
    }
  }

  async function handleDelete() {
    if (!confirm(`"${wine.name_ko}" 를 정말 삭제하시겠습니까? wine_records 등 참조가 있으면 실패합니다.`)) {
      return;
    }
    const res = await deleteWine(wine.id);
    if (res.error) alert(`삭제 실패: ${res.error}`);
    else router.push("/admin/wine-db");
  }

  return (
    <Card>
      <div className="flex items-start gap-6">
        <img
          src={getWineImage(wine.image_url ?? wine.vivino_image_url, wine.wine_type)}
          alt={wine.name_ko}
          className="w-32 h-32 rounded-xl object-cover border border-zinc-700 flex-shrink-0"
        />
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="한국어명 *" value={form.name_ko} onChange={(v) => setForm({ ...form, name_ko: v })} />
          <Field label="영문명 *" value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} />
          <SelectField
            label="타입 *"
            value={form.wine_type}
            options={Object.entries(TYPE_KO).map(([k, v]) => ({ value: k, label: v }))}
            onChange={(v) => setForm({ ...form, wine_type: v })}
          />
          <Field label="스타일 (영문)" value={form.wine_style} onChange={(v) => setForm({ ...form, wine_style: v })} />
          <Field label="국가 (한글) *" value={form.country_ko} onChange={(v) => setForm({ ...form, country_ko: v })} />
          <Field label="지역 (한글)" value={form.region_ko} onChange={(v) => setForm({ ...form, region_ko: v })} />
          <Field label="생산자 (영문)" value={form.producer} onChange={(v) => setForm({ ...form, producer: v })} />
          <Field label="브랜드" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
          <Field
            label="품종 (한글, 콤마 구분)"
            value={form.grape_varieties}
            onChange={(v) => setForm({ ...form, grape_varieties: v })}
          />
          <Field label="도수 (%)" value={form.alcohol} onChange={(v) => setForm({ ...form, alcohol: v })} />
          <Field label="가격 (원)" value={form.price} onChange={(v) => setForm({ ...form, price: v })} type="number" />
          <Field label="이미지 URL" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
          <div className="md:col-span-2">
            <label className="text-zinc-500 text-xs uppercase tracking-wider">설명 (한글)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
            />
            공개 (is_published)
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={handleDelete}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
        >
          와인 삭제
        </button>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-zinc-400">{msg}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 disabled:opacity-50"
          >
            {saving ? "저장중…" : "저장"}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-zinc-600 mt-4">
        등록 {new Date(wine.created_at).toLocaleString("ko-KR")} · 수정{" "}
        {new Date(wine.updated_at).toLocaleString("ko-KR")}
        {wine.locked_fields?.length ? ` · 잠금: ${wine.locked_fields.join(", ")}` : ""}
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// 2. Vivino
// ─────────────────────────────────────────────────────────

function VivinoSection({ wine, onChanged }: { wine: WineDetail; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [newUrl, setNewUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!wine.vivino_url) {
    return (
      <Card>
        <p className="text-zinc-400 text-sm mb-4">이 와인에는 Vivino 매칭이 없습니다.</p>
        <div className="flex items-center gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://www.vivino.com/w/..."
            className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          />
          <button
            onClick={() => {
              if (!newUrl.trim()) return;
              setMsg("크롤링 중…");
              startTransition(async () => {
                const res = await replaceVivinoUrl(wine.id, newUrl.trim());
                setMsg(res.error ? `오류: ${res.error}` : "매칭 완료");
                if (!res.error) {
                  setNewUrl("");
                  onChanged();
                }
              });
            }}
            disabled={pending}
            className="px-3 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 disabled:opacity-50"
          >
            URL로 매칭
          </button>
        </div>
        {msg && <p className="text-xs text-zinc-400 mt-2">{msg}</p>}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <a
            href={wine.vivino_url}
            target="_blank"
            rel="noreferrer"
            className="text-rose-400 hover:underline text-sm"
          >
            {wine.vivino_url}
          </a>
          <p className="text-[11px] text-zinc-500 mt-1">
            {wine.vivino_reviewed_at
              ? `검수 완료: ${new Date(wine.vivino_reviewed_at).toLocaleString("ko-KR")}`
              : "검수 대기"}
            {wine.vivino_match_score != null
              ? ` · 매칭 점수 ${(wine.vivino_match_score * 100).toFixed(0)}%`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!wine.vivino_reviewed_at && (
            <button
              onClick={() =>
                startTransition(async () => {
                  const res = await confirmVivinoMatch(wine.id);
                  setMsg(res.error ? `오류: ${res.error}` : "검수 확정");
                  if (!res.error) onChanged();
                })
              }
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
            >
              매칭 확정
            </button>
          )}
          <button
            onClick={() => {
              if (!confirm("Vivino 매칭을 해제합니다.")) return;
              startTransition(async () => {
                const res = await unlinkVivinoMatch(wine.id);
                setMsg(res.error ? `오류: ${res.error}` : "매칭 해제");
                if (!res.error) onChanged();
              });
            }}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
          >
            매칭 해제
          </button>
        </div>
      </div>

      {wine.vivino_image_url && (
        <img
          src={wine.vivino_image_url}
          alt={wine.vivino_name ?? ""}
          className="w-24 h-24 rounded-lg object-cover border border-zinc-700 mb-4"
        />
      )}

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Info label="Vivino 와인명" value={wine.vivino_name} />
        <Info label="Winery" value={wine.vivino_winery} />
        <Info label="Region" value={wine.vivino_region} />
        <Info label="Style" value={wine.vivino_style} />
        <Info label="Grapes" value={wine.vivino_grapes} />
        <Info label="Alcohol" value={wine.vivino_alcohol} />
        <Info
          label="Rating"
          value={
            wine.vivino_rating != null
              ? `★ ${wine.vivino_rating}${
                  wine.vivino_reviews != null ? ` (${wine.vivino_reviews.toLocaleString()})` : ""
                }`
              : null
          }
        />
        <Info label="Vivino wine_id" value={wine.vivino_wine_id} />
      </dl>
      {wine.vivino_description && (
        <div className="mt-4">
          <span className="text-zinc-500 text-xs uppercase tracking-wider">Description</span>
          <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">{wine.vivino_description}</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-500 mb-2">다른 URL로 교체</p>
        <div className="flex items-center gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://www.vivino.com/w/..."
            className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          />
          <button
            onClick={() => {
              if (!newUrl.trim()) return;
              setMsg("크롤링 중…");
              startTransition(async () => {
                const res = await replaceVivinoUrl(wine.id, newUrl.trim());
                setMsg(res.error ? `오류: ${res.error}` : "교체 완료");
                if (!res.error) {
                  setNewUrl("");
                  onChanged();
                }
              });
            }}
            disabled={pending}
            className="px-3 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            교체
          </button>
        </div>
        {msg && <p className="text-xs text-zinc-400 mt-2">{msg}</p>}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// 3. 변환 검수
// ─────────────────────────────────────────────────────────

function ReviewSection({ wine, onChanged }: { wine: WineDetail; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!wine.needs_review) {
    return (
      <Card>
        <p className="text-emerald-300 text-sm">변환 검수 필요 없음 — needs_review = false</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-amber-300 text-sm mb-3">
        변환 모듈이 다음 사유로 자동 정규화를 미루었습니다. 기본 탭에서 필드 수정 후 저장하면 사유가 재계산됩니다.
        그대로 통과시키려면 &quot;사유 무시 승인&quot;.
      </p>
      <ul className="space-y-1 mb-6">
        {(wine.needs_review_reasons ?? []).map((r, i) => (
          <li
            key={i}
            className="text-sm text-zinc-300 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
          >
            {r}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            startTransition(async () => {
              const res = await approveWineV2(wine.id);
              setMsg(res.error ? `오류: ${res.error}` : "검수 승인");
              if (!res.error) onChanged();
            })
          }
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          사유 무시 승인
        </button>
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// 4. 중복 후보 (raw_wine ↔ this wine)
// ─────────────────────────────────────────────────────────

function DedupeSection({
  wineId,
  candidates,
  onChanged,
}: {
  wineId: string;
  candidates: DedupeCandidate[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (candidates.length === 0) {
    return (
      <Card>
        <p className="text-zinc-400 text-sm">이 와인을 대상으로 한 중복 후보가 없습니다.</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm text-zinc-400 mb-4">
        다음 raw_wines가 이 와인과 같은 와인일 수 있습니다. <strong>Merge</strong>: source_refs 누적 +
        promoted_wine_id 연결. <strong>Reject</strong>: 다른 와인으로 처리.
      </p>
      <div className="space-y-3">
        {candidates.map((c) => (
          <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-xs text-zinc-500">
                  {c.match_reason}
                  {c.match_score != null ? ` · 점수 ${(c.match_score * 100).toFixed(0)}%` : ""}
                  {c.raw_wine && (
                    <>
                      {" · "}
                      {c.raw_wine.source}/{c.raw_wine.source_id}
                    </>
                  )}
                </p>
                {c.raw_wine ? (
                  <div className="mt-2">
                    <p className="text-zinc-100 font-medium">{c.raw_wine.name_ko ?? "—"}</p>
                    {c.raw_wine.name_en && (
                      <p className="text-xs text-zinc-500 italic">{c.raw_wine.name_en}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-zinc-400">
                      {(c.raw_wine.producer_ko || c.raw_wine.producer_en) && (
                        <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">
                          🏭 {c.raw_wine.producer_ko ?? c.raw_wine.producer_en}
                        </span>
                      )}
                      {c.raw_wine.country && (
                        <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">
                          📍 {c.raw_wine.country}
                          {c.raw_wine.region ? ` · ${c.raw_wine.region}` : ""}
                        </span>
                      )}
                      {c.raw_wine.grape_variety && (
                        <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">🍇 {c.raw_wine.grape_variety}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-rose-400 text-xs mt-1">raw_wine을 찾을 수 없습니다 (id: {c.raw_wine_id})</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() =>
                    startTransition(async () => {
                      const res = await confirmDedupe(c.id, {});
                      setMsg(res.error ? `오류: ${res.error}` : "Merge 완료");
                      if (!res.error) onChanged();
                    })
                  }
                  disabled={pending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                >
                  Merge
                </button>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      const res = await rejectDedupe(c.id);
                      setMsg(res.error ? `오류: ${res.error}` : "반려");
                      if (!res.error) onChanged();
                    })
                  }
                  disabled={pending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs text-zinc-400 mt-3">{msg}</p>}
      {/* wineId는 여기서 직접 안 쓰지만, 이 섹션이 어떤 와인 기준인지 명시용 */}
      <p className="text-[10px] text-zinc-600 font-mono mt-4">target: {wineId}</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// 5. URL 그룹 (같은 vivino_url 가리키는 다른 와인)
// ─────────────────────────────────────────────────────────

function UrlDupSection({
  wineId,
  vivinoUrl,
  members,
  onChanged,
}: {
  wineId: string;
  vivinoUrl: string | null;
  members: DupGroupMember[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!vivinoUrl) {
    return (
      <Card>
        <p className="text-zinc-400 text-sm">이 와인에 Vivino URL이 없어 그룹을 확인할 수 없습니다.</p>
      </Card>
    );
  }
  if (members.length === 0) {
    return (
      <Card>
        <p className="text-zinc-400 text-sm">같은 Vivino URL을 가리키는 다른 와인이 없습니다.</p>
        <a
          href={vivinoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-rose-400 hover:underline mt-2 inline-block"
        >
          {vivinoUrl}
        </a>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm text-zinc-400 mb-2">
        같은 Vivino URL을 가리키는 다른 와인 {members.length}건. 잘못 매칭된 와인의 Vivino를 해제하세요.
      </p>
      <a
        href={vivinoUrl}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-rose-400 hover:underline mb-4 inline-block"
      >
        {vivinoUrl}
      </a>
      <div className="space-y-2 mt-4">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
          >
            <img
              src={getWineImage(m.image_url, null)}
              alt={m.name_ko}
              className="w-10 h-10 rounded-lg object-cover border border-zinc-700"
            />
            <div className="flex-1 min-w-0">
              <Link href={`/admin/wine-db/${m.id}`} className="text-sm font-medium text-zinc-200 hover:underline">
                {m.name_ko}
              </Link>
              <p className="text-[11px] text-zinc-500 italic truncate">{m.name_en}</p>
              <p className="text-[11px] text-zinc-500">
                {m.producer ?? "—"} · {m.country_ko}
                {m.region_ko ? ` · ${m.region_ko}` : ""} · {m.source}
              </p>
            </div>
            <button
              onClick={() => {
                if (!confirm(`"${m.name_ko}"의 Vivino 매칭을 해제합니다.`)) return;
                startTransition(async () => {
                  const res = await unlinkVivino(m.id);
                  setMsg(res.error ? `오류: ${res.error}` : "해제 완료");
                  if (!res.error) onChanged();
                });
              }}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
            >
              Vivino 해제
            </button>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs text-zinc-400 mt-3">{msg}</p>}
      <p className="text-[10px] text-zinc-600 font-mono mt-4">this: {wineId}</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// 6. 신고
// ─────────────────────────────────────────────────────────

function ReportsSection({
  wineId,
  reports,
  onChanged,
}: {
  wineId: string;
  reports: ReportRow[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const open = reports.filter((r) => r.status === "open");
  const closed = reports.filter((r) => r.status !== "open");

  return (
    <Card>
      {reports.length === 0 ? (
        <p className="text-zinc-400 text-sm">이 와인에 대한 신고가 없습니다.</p>
      ) : (
        <>
          {open.length > 1 && (
            <button
              onClick={() => {
                if (!confirm(`이 와인의 미해결 신고 ${open.length}건을 모두 해결 처리합니다.`)) return;
                startTransition(async () => {
                  const res = await resolveAllForWine(wineId);
                  setMsg(res.error ? `오류: ${res.error}` : "일괄 해결 완료");
                  if (!res.error) onChanged();
                });
              }}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 mb-4"
            >
              미해결 {open.length}건 일괄 해결
            </button>
          )}
          <div className="space-y-3">
            {[...open, ...closed].map((r) => (
              <ReportRowItem
                key={r.id}
                row={r}
                pending={pending}
                onResolve={(note) =>
                  startTransition(async () => {
                    const res = await resolveReport(r.id, note);
                    setMsg(res.error ? `오류: ${res.error}` : "해결");
                    if (!res.error) onChanged();
                  })
                }
                onDismiss={(note) =>
                  startTransition(async () => {
                    const res = await dismissReport(r.id, note);
                    setMsg(res.error ? `오류: ${res.error}` : "기각");
                    if (!res.error) onChanged();
                  })
                }
                onReopen={() =>
                  startTransition(async () => {
                    const res = await reopenReport(r.id);
                    setMsg(res.error ? `오류: ${res.error}` : "다시 열기");
                    if (!res.error) onChanged();
                  })
                }
              />
            ))}
          </div>
        </>
      )}
      {msg && <p className="text-xs text-zinc-400 mt-3">{msg}</p>}
    </Card>
  );
}

function ReportRowItem({
  row,
  pending,
  onResolve,
  onDismiss,
  onReopen,
}: {
  row: ReportRow;
  pending: boolean;
  onResolve: (note?: string) => void;
  onDismiss: (note?: string) => void;
  onReopen: () => void;
}) {
  const [note, setNote] = useState("");
  const statusTone: Record<string, string> = {
    open: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    dismissed: "bg-zinc-700 text-zinc-300 border-zinc-600",
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${statusTone[row.status]}`}
          >
            {row.status}
          </span>
          <span className="text-xs text-zinc-400 ml-2">
            {REPORT_TYPE_KO[row.report_type] ?? row.report_type}
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">
          {new Date(row.created_at).toLocaleString("ko-KR")}
        </span>
      </div>
      {row.description && (
        <p className="text-sm text-zinc-300 whitespace-pre-wrap mb-2">{row.description}</p>
      )}
      {row.user_id && (
        <p className="text-[10px] text-zinc-600 font-mono mb-2">신고자: {row.user_id}</p>
      )}
      {row.resolved_note && (
        <p className="text-[11px] text-zinc-500 italic mb-2">처리 메모: {row.resolved_note}</p>
      )}
      {row.status === "open" ? (
        <div className="flex items-center gap-2 mt-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="처리 메모 (선택)"
            className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200"
          />
          <button
            onClick={() => onResolve(note || undefined)}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
          >
            해결
          </button>
          <button
            onClick={() => onDismiss(note || undefined)}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700"
          >
            기각
          </button>
        </div>
      ) : (
        <button
          onClick={onReopen}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 mt-2"
        >
          다시 열기
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 공용 UI
// ─────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-zinc-500 text-xs uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-zinc-500 text-xs uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="text-zinc-500 text-xs uppercase tracking-wider">{label}</span>
      <div className="text-zinc-200 mt-0.5">{value ?? <span className="text-zinc-600">—</span>}</div>
    </div>
  );
}
