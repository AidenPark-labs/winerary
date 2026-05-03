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
  /** drawer 등 외부 컨텍스트에서 데이터 갱신 주체를 주입할 때 사용. 없으면 router.refresh */
  onChanged?: () => void;
  /** drawer에 임베드 시 헤더의 "← 목록으로" 링크 숨김 */
  embedded?: boolean;
}

type Tab = "basic" | "vivino" | "review" | "dedupe" | "url_dup" | "reports";

export default function WineDetailClient({
  wine,
  dedupeCandidates,
  dupGroup,
  reports,
  onChanged: onChangedProp,
  embedded = false,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("basic");
  const onChanged = onChangedProp ?? (() => router.refresh());

  const openReports = reports.filter((r) => r.status === "open");
  const reviewBadges = {
    review: wine.needs_review,
    vivino: !!wine.vivino_url && !wine.vivino_reviewed_at,
    dedupe: dedupeCandidates.length,
    url_dup: dupGroup.length,
    reports: openReports.length,
  };

  return (
    <div className={embedded ? "" : "max-w-6xl mx-auto"}>
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          {!embedded && (
            <Link href="/admin/wine-db" className="text-sm text-zinc-500 hover:text-zinc-300">
              ← 목록으로
            </Link>
          )}
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
      {tab === "basic" && <BasicSection wine={wine} onChanged={onChanged} embedded={embedded} />}
      {tab === "vivino" && <VivinoSection wine={wine} onChanged={onChanged} />}
      {tab === "review" && <ReviewSection wine={wine} onChanged={onChanged} />}
      {tab === "dedupe" && (
        <DedupeSection wine={wine} candidates={dedupeCandidates} onChanged={onChanged} />
      )}
      {tab === "url_dup" && <UrlDupSection wine={wine} members={dupGroup} onChanged={onChanged} />}
      {tab === "reports" && (
        <ReportsSection wineId={wine.id} reports={reports} onChanged={onChanged} />
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

function BasicSection({
  wine,
  onChanged,
  embedded = false,
}: {
  wine: WineDetail;
  onChanged: () => void;
  embedded?: boolean;
}) {
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
    if (res.error) {
      alert(`삭제 실패: ${res.error}`);
      return;
    }
    if (embedded) onChanged();
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

type VivinoEditField =
  | "name_ko"
  | "name_en"
  | "producer"
  | "country_ko"
  | "region_ko"
  | "grape_varieties"
  | "alcohol";

type VivinoEditDraft = Record<VivinoEditField, string>;

function makeDraft(wine: WineDetail): VivinoEditDraft {
  return {
    name_ko: wine.name_ko,
    name_en: wine.name_en,
    producer: wine.producer ?? "",
    country_ko: wine.country_ko,
    region_ko: wine.region_ko ?? "",
    grape_varieties: (wine.grape_varieties ?? []).join(", "),
    alcohol: wine.alcohol != null ? String(wine.alcohol) : "",
  };
}

function VivinoSection({ wine, onChanged }: { wine: WineDetail; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [newUrl, setNewUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<VivinoEditDraft>(() => makeDraft(wine));
  const [editMsg, setEditMsg] = useState<string | null>(null);

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

  // vivino_region(예: "Argentina / Mendoza / Uco Valley") segment 추출
  const vivinoRegionSegs = (wine.vivino_region ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const vivinoCountryEn = vivinoRegionSegs[0] ?? null;
  const vivinoRegionDeepest = vivinoRegionSegs.length > 1 ? vivinoRegionSegs.slice(1).join(" / ") : null;

  // 비교 행 정의 — 좌(우리 DB)와 우(Vivino) 같은 의미 필드끼리
  const grapesKo = (wine.grape_varieties ?? []).join(", ");
  const compareRows: Array<{
    label: string;
    ours: string | null;
    vivino: string | null;
    editKey?: VivinoEditField;
    /** ← 버튼이 눌렸을 때 input에 채워질 값 (vivino_region 처럼 표시값과 복사값이 다른 경우) */
    copyValue?: string | null;
  }> = [
    { label: "와인명 (한)", ours: wine.name_ko, vivino: null, editKey: "name_ko" },
    {
      label: "와인명 (영)",
      ours: wine.name_en,
      vivino: wine.vivino_name,
      editKey: "name_en",
    },
    { label: "와이너리", ours: wine.producer, vivino: wine.vivino_winery, editKey: "producer" },
    {
      label: "국가",
      ours: wine.country_ko,
      vivino: vivinoCountryEn,
      editKey: "country_ko",
    },
    {
      label: "지역",
      ours: wine.region_ko,
      vivino: vivinoRegionDeepest ?? wine.vivino_region,
      editKey: "region_ko",
      copyValue: vivinoRegionDeepest ?? wine.vivino_region,
    },
    {
      label: "품종",
      ours: grapesKo || null,
      vivino: wine.vivino_grapes,
      editKey: "grape_varieties",
    },
    { label: "스타일", ours: wine.wine_style, vivino: wine.vivino_style },
    {
      label: "도수",
      ours: wine.alcohol != null ? `${wine.alcohol}%` : null,
      vivino: wine.vivino_alcohol,
      editKey: "alcohol",
      // alcohol input은 숫자만 — vivino_alcohol "13.5%" 에서 % 떼고
      copyValue: wine.vivino_alcohol ? wine.vivino_alcohol.replace(/[^0-9.]/g, "") : null,
    },
  ];

  function startEdit() {
    setDraft(makeDraft(wine));
    setEditing(true);
    setEditMsg(null);
  }
  function cancelEdit() {
    setEditing(false);
    setEditMsg(null);
  }
  function copyFromVivino(key: VivinoEditField, value: string | null) {
    if (!value) return;
    setDraft((prev) => ({ ...prev, [key]: value }));
  }
  async function saveEdits() {
    const data: Record<string, string | string[] | null> = {};
    if (draft.name_ko.trim() !== wine.name_ko && draft.name_ko.trim()) {
      data.name_ko = draft.name_ko.trim();
    }
    if (draft.name_en.trim() !== wine.name_en && draft.name_en.trim()) {
      data.name_en = draft.name_en.trim();
    }
    const trimmedProducer = draft.producer.trim();
    if (trimmedProducer !== (wine.producer ?? "")) {
      data.producer = trimmedProducer || null;
    }
    if (draft.country_ko.trim() !== wine.country_ko && draft.country_ko.trim()) {
      data.country_ko = draft.country_ko.trim();
    }
    const trimmedRegion = draft.region_ko.trim();
    if (trimmedRegion !== (wine.region_ko ?? "")) {
      data.region_ko = trimmedRegion || null;
    }
    const newGrapes = draft.grape_varieties
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const currGrapes = (wine.grape_varieties ?? []).join(",");
    if (newGrapes.join(",") !== currGrapes) {
      data.grape_varieties = newGrapes;
    }
    const trimmedAlc = draft.alcohol.trim();
    const currAlc = wine.alcohol != null ? String(wine.alcohol) : "";
    if (trimmedAlc !== currAlc) {
      data.alcohol = trimmedAlc || null;
    }
    if (Object.keys(data).length === 0) {
      setEditMsg("변경 사항 없음");
      setEditing(false);
      return;
    }
    setEditMsg("저장 중…");
    startTransition(async () => {
      const res = await updateWine(wine.id, data);
      if (res.error) {
        setEditMsg(`오류: ${res.error}`);
      } else {
        setEditMsg("저장 완료");
        setEditing(false);
        onChanged();
      }
    });
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
          {!editing ? (
            <button
              onClick={startEdit}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25"
            >
              우리 DB 편집
            </button>
          ) : (
            <>
              <button
                onClick={saveEdits}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                저장
              </button>
              <button
                onClick={cancelEdit}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700"
              >
                취소
              </button>
            </>
          )}
        </div>
      </div>

      {/* 안내 박스 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 mb-4 text-xs text-zinc-400 leading-relaxed">
        <strong className="text-zinc-200">왼쪽</strong>은 우리 카탈로그(<code className="text-zinc-500">wines</code>)의 정규화된 값,{" "}
        <strong className="text-rose-300">오른쪽</strong>은 Vivino에서 가져온 원본(<code className="text-zinc-500">vivino_wines</code>)입니다.
        두 와인이 같은 와인을 가리키는지 비교해서 <strong>매칭 확정</strong>·<strong>해제</strong>·<strong>URL 교체</strong>를 결정하세요.
        ⚠가 붙은 행은 표기/내용에 차이가 있는 행 (정보 보강 또는 정정 후보).
        {" "}<strong>우리 DB 편집</strong>을 누르면 좌측 input + 우측 ← 버튼으로 Vivino 값을 옮겨올 수 있습니다 (변환 모듈 자동 정규화 통과).
        {editMsg && <span className="ml-2 text-emerald-300">· {editMsg}</span>}
      </div>

      {/* 헤더 + 비교 표 — 같은 grid로 라인 정렬 */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {/* 헤더 행 (라벨칸 비움, 좌·우 카드) */}
        <div className="grid grid-cols-[7rem_1fr_1fr]">
          <div className="bg-zinc-900/60 px-3 py-2 flex items-center text-[10px] uppercase tracking-wider text-zinc-600">
            필드
          </div>
          <div className="px-3 py-3 bg-zinc-900/40 flex items-center gap-3">
            <img
              src={getWineImage(wine.image_url, wine.wine_type)}
              alt={wine.name_ko}
              className="w-12 h-12 rounded-lg object-cover border border-zinc-700 flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-300">
                우리 DB · wines
              </p>
              <p className="text-sm text-zinc-100 truncate">{wine.name_ko}</p>
            </div>
          </div>
          <div className="px-3 py-3 bg-rose-500/[0.08] border-l border-zinc-800 flex items-center gap-3">
            <img
              src={getWineImage(wine.vivino_image_url, wine.wine_type)}
              alt={wine.vivino_name ?? ""}
              className="w-12 h-12 rounded-lg object-cover border border-zinc-700 flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-300">
                Vivino · vivino_wines
              </p>
              <p className="text-sm text-zinc-100 truncate">
                {wine.vivino_name ?? <span className="text-zinc-600">—</span>}
              </p>
            </div>
          </div>
        </div>

        {/* 비교 행들 */}
        {compareRows.map((r) => {
          const diff = compareDiffers(r.ours, r.vivino);
          const inEdit = editing && r.editKey;
          const copySrc = r.copyValue !== undefined ? r.copyValue : r.vivino;
          return (
            <div
              key={r.label}
              className={`grid grid-cols-[7rem_1fr_1fr] text-sm border-t border-zinc-800 ${
                diff ? "bg-amber-500/[0.04]" : ""
              }`}
            >
              <div className="px-3 py-2 bg-zinc-900/60 text-zinc-500 text-xs uppercase tracking-wider flex items-center">
                {r.label}
                {diff && (
                  <span className="ml-2 text-amber-400" title="차이 있음">
                    ⚠
                  </span>
                )}
              </div>
              <div className={`px-3 py-1.5 ${diff && !inEdit ? "text-amber-100" : "text-zinc-200"}`}>
                {inEdit ? (
                  <input
                    value={draft[r.editKey!]}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [r.editKey!]: e.target.value }))
                    }
                    placeholder={r.label}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                ) : (
                  r.ours ?? <span className="text-zinc-600">—</span>
                )}
              </div>
              <div
                className={`px-3 py-2 border-l border-zinc-800 flex items-center gap-2 ${
                  diff && !inEdit ? "text-amber-100" : "text-zinc-200"
                }`}
              >
                {inEdit && r.editKey && copySrc && (
                  <button
                    onClick={() => copyFromVivino(r.editKey!, copySrc)}
                    title="Vivino 값으로 좌측 채우기"
                    className="text-zinc-500 hover:text-rose-300 text-base leading-none flex-shrink-0"
                  >
                    ←
                  </button>
                )}
                <span className="flex-1 min-w-0 truncate" title={r.vivino ?? ""}>
                  {r.vivino ?? <span className="text-zinc-600">—</span>}
                </span>
              </div>
            </div>
          );
        })}

        {/* Vivino 단독 정보 */}
        {(wine.vivino_rating != null || wine.vivino_wine_id) && (
          <div className="grid grid-cols-[7rem_1fr_1fr] text-sm border-t border-zinc-800">
            <div className="px-3 py-2 bg-zinc-900/60 text-zinc-500 text-xs uppercase tracking-wider">
              평점·ID
            </div>
            <div className="px-3 py-2 text-zinc-600">—</div>
            <div className="px-3 py-2 border-l border-zinc-800 text-zinc-200">
              {wine.vivino_rating != null && (
                <span className="text-amber-400 mr-2">
                  ★ {wine.vivino_rating}
                  {wine.vivino_reviews != null && ` (${wine.vivino_reviews.toLocaleString()})`}
                </span>
              )}
              {wine.vivino_wine_id && (
                <span className="text-zinc-500 text-xs font-mono">#{wine.vivino_wine_id}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {wine.vivino_description && (
        <div className="mt-4 rounded-xl border border-zinc-800 p-3 bg-zinc-900/40">
          <span className="text-zinc-500 text-xs uppercase tracking-wider">Vivino Description</span>
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

function compareDiffers(a: string | null, b: string | null): boolean {
  if (!a || !b) return false; // 한쪽만 있으면 정보 보강이지 의심 아님
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return norm(a) !== norm(b);
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
  wine,
  candidates,
  onChanged,
}: {
  wine: WineDetail;
  candidates: DedupeCandidate[];
  onChanged: () => void;
}) {
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
        다음 raw_wines가 이 와인과 같은 와인일 수 있습니다. raw / 현재 / 최종을 비교해서 최종값을 정한 뒤
        <strong> Merge</strong>하면 변환 모듈을 통과해 자동 정규화됩니다. 최종 칸이 비어있으면 현재값 유지.
      </p>
      <div className="space-y-6">
        {candidates.map((c) => (
          <CandidateCompare key={c.id} candidate={c} target={wine} onChanged={onChanged} />
        ))}
      </div>
    </Card>
  );
}

interface DedupeFormState {
  name_ko: string;
  name_en: string;
  country_ko: string;
  region_ko: string;
  wine_type: string;
  producer: string;
  grape_varieties: string;
  alcohol: string;
  image_url: string;
}

const EMPTY_DEDUPE_FORM: DedupeFormState = {
  name_ko: "",
  name_en: "",
  country_ko: "",
  region_ko: "",
  wine_type: "",
  producer: "",
  grape_varieties: "",
  alcohol: "",
  image_url: "",
};

function CandidateCompare({
  candidate: c,
  target,
  onChanged,
}: {
  candidate: DedupeCandidate;
  target: WineDetail;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<DedupeFormState>(EMPTY_DEDUPE_FORM);

  const raw = c.raw_wine;
  const targetGrapes = (target.grape_varieties ?? []).join(", ");
  const rawProducer = raw?.producer_ko ?? raw?.producer_en ?? "";

  // 행 정의: [필드, raw 값, target 값, form key]
  const rows: Array<{
    label: string;
    rawValue: string;
    targetValue: string;
    key: keyof DedupeFormState;
    placeholder?: string;
  }> = [
    { label: "name_ko", rawValue: raw?.name_ko ?? "", targetValue: target.name_ko, key: "name_ko" },
    { label: "name_en", rawValue: raw?.name_en ?? "", targetValue: target.name_en, key: "name_en" },
    { label: "country", rawValue: raw?.country ?? "", targetValue: target.country_ko, key: "country_ko" },
    { label: "region", rawValue: raw?.region ?? "", targetValue: target.region_ko ?? "", key: "region_ko" },
    { label: "wine_type", rawValue: raw?.wine_type ?? "", targetValue: target.wine_type, key: "wine_type" },
    { label: "producer", rawValue: rawProducer, targetValue: target.producer ?? "", key: "producer" },
    {
      label: "grapes",
      rawValue: raw?.grape_variety ?? "",
      targetValue: targetGrapes,
      key: "grape_varieties",
      placeholder: "콤마로 구분",
    },
    {
      label: "alcohol",
      rawValue: raw?.alcohol ?? "",
      targetValue: target.alcohol != null ? String(target.alcohol) : "",
      key: "alcohol",
    },
    {
      label: "image_url",
      rawValue: raw?.image_url ?? "",
      targetValue: target.image_url ?? "",
      key: "image_url",
    },
  ];

  function copyAll(side: "raw" | "target") {
    const next: DedupeFormState = { ...EMPTY_DEDUPE_FORM };
    for (const r of rows) {
      next[r.key] = side === "raw" ? r.rawValue : r.targetValue;
    }
    setForm(next);
  }

  function clearForm() {
    setForm(EMPTY_DEDUPE_FORM);
  }

  function buildFinalData(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const trim = (s: string) => s.trim();
    if (trim(form.name_ko)) out.name_ko = trim(form.name_ko);
    if (trim(form.name_en)) out.name_en = trim(form.name_en);
    if (trim(form.country_ko)) out.country_ko = trim(form.country_ko);
    if (trim(form.region_ko)) out.region_ko = trim(form.region_ko);
    if (trim(form.wine_type)) out.wine_type = trim(form.wine_type);
    if (trim(form.producer)) out.producer = trim(form.producer);
    if (trim(form.grape_varieties)) {
      out.grape_varieties = form.grape_varieties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (trim(form.alcohol)) out.alcohol = trim(form.alcohol);
    if (trim(form.image_url)) out.image_url = trim(form.image_url);
    return out;
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="text-xs text-zinc-500">
            {c.match_reason}
            {c.match_score != null ? ` · 점수 ${(c.match_score * 100).toFixed(0)}%` : ""}
            {raw && ` · ${raw.source}/${raw.source_id}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => copyAll("raw")}
            className="text-[11px] px-2 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25"
          >
            전체 ← raw
          </button>
          <button
            onClick={() => copyAll("target")}
            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700"
          >
            전체 ← 현재
          </button>
          <button
            onClick={clearForm}
            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-500 border border-zinc-700 hover:bg-zinc-700"
          >
            비우기
          </button>
        </div>
      </div>

      {!raw ? (
        <p className="text-rose-400 text-xs">raw_wine을 찾을 수 없습니다 (id: {c.raw_wine_id})</p>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="grid grid-cols-[6rem_1fr_1.5rem_1fr_1.5rem_1.5fr] text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-900/80">
            <div className="px-2 py-1.5">필드</div>
            <div className="px-2 py-1.5">raw_wine</div>
            <div></div>
            <div className="px-2 py-1.5">현재 wine</div>
            <div></div>
            <div className="px-2 py-1.5">최종 (편집)</div>
          </div>
          {rows.map((r) => {
            const formVal = form[r.key];
            return (
              <div
                key={r.label}
                className="grid grid-cols-[6rem_1fr_1.5rem_1fr_1.5rem_1.5fr] text-sm border-t border-zinc-800"
              >
                <div className="px-2 py-1.5 text-zinc-500 text-xs flex items-center bg-zinc-900/40">
                  {r.label}
                </div>
                <div className="px-2 py-1.5 text-zinc-300 truncate" title={r.rawValue}>
                  {r.rawValue || <span className="text-zinc-600">—</span>}
                </div>
                <button
                  onClick={() => setForm({ ...form, [r.key]: r.rawValue })}
                  disabled={!r.rawValue}
                  title="raw → 최종"
                  className="text-zinc-500 hover:text-blue-300 disabled:opacity-20 text-xs flex items-center justify-center"
                >
                  →
                </button>
                <div className="px-2 py-1.5 text-zinc-300 truncate" title={r.targetValue}>
                  {r.targetValue || <span className="text-zinc-600">—</span>}
                </div>
                <button
                  onClick={() => setForm({ ...form, [r.key]: r.targetValue })}
                  disabled={!r.targetValue}
                  title="현재 → 최종"
                  className="text-zinc-500 hover:text-zinc-200 disabled:opacity-20 text-xs flex items-center justify-center"
                >
                  →
                </button>
                <input
                  value={formVal}
                  onChange={(e) => setForm({ ...form, [r.key]: e.target.value })}
                  placeholder={r.placeholder ?? "비우면 현재값 유지"}
                  className="px-2 py-1 bg-zinc-800/60 text-zinc-100 text-sm border-l border-zinc-800 focus:outline-none focus:bg-zinc-800"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] text-zinc-500">
          {msg ?? "최종 칸이 비어있는 필드는 건드리지 않습니다. source_refs는 자동 누적."}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              startTransition(async () => {
                const finalData = buildFinalData();
                // FinalMergeData 형식에 맞게 캐스팅 (string[] · string · null 허용)
                const res = await confirmDedupe(c.id, finalData as never);
                if (res.error) setMsg(`오류: ${res.error}`);
                else {
                  const flag = res.grape_unknowns?.length
                    ? ` (정규화 미해결 grape: ${res.grape_unknowns.join(", ")})`
                    : "";
                  setMsg(`Merge 완료${flag}`);
                  onChanged();
                }
              })
            }
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            Merge
          </button>
          <button
            onClick={() =>
              startTransition(async () => {
                const res = await rejectDedupe(c.id);
                if (res.error) setMsg(`오류: ${res.error}`);
                else {
                  setMsg("반려");
                  onChanged();
                }
              })
            }
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 5. URL 그룹 (같은 vivino_url 가리키는 다른 와인)
// ─────────────────────────────────────────────────────────

function UrlDupSection({
  wine,
  members,
  onChanged,
}: {
  wine: WineDetail;
  members: DupGroupMember[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!wine.vivino_url) {
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
          href={wine.vivino_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-rose-400 hover:underline mt-2 inline-block"
        >
          {wine.vivino_url}
        </a>
      </Card>
    );
  }

  // 모든 멤버 (현재 와인 + 다른 와인) 비교 행 정의
  type Member = {
    id: string;
    name_ko: string;
    name_en: string;
    producer: string | null;
    country_ko: string;
    region_ko: string | null;
    source: string;
    image_url: string | null;
    isThis: boolean;
  };
  const all: Member[] = [
    {
      id: wine.id,
      name_ko: wine.name_ko,
      name_en: wine.name_en,
      producer: wine.producer,
      country_ko: wine.country_ko,
      region_ko: wine.region_ko,
      source: wine.source,
      image_url: wine.image_url,
      isThis: true,
    },
    ...members.map((m) => ({ ...m, isThis: false })),
  ];

  return (
    <Card>
      <p className="text-sm text-zinc-400 mb-2">
        같은 Vivino URL을 가리키는 와인 {all.length}건 (현재 포함). 잘못 매칭된 와인의 Vivino를 해제하세요.
      </p>
      <a
        href={wine.vivino_url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-rose-400 hover:underline mb-4 inline-block"
      >
        {wine.vivino_url}
      </a>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-[3rem_1.5fr_1fr_1fr_1fr_5rem_5rem] text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-900/80">
          <div></div>
          <div className="px-3 py-2">와인명</div>
          <div className="px-3 py-2">producer</div>
          <div className="px-3 py-2">국가·지역</div>
          <div className="px-3 py-2">source</div>
          <div className="px-3 py-2 text-center">표시</div>
          <div className="px-3 py-2 text-center">액션</div>
        </div>
        {all.map((m) => (
          <div
            key={m.id}
            className={`grid grid-cols-[3rem_1.5fr_1fr_1fr_1fr_5rem_5rem] text-sm border-t border-zinc-800 items-center ${
              m.isThis ? "bg-rose-500/[0.06]" : ""
            }`}
          >
            <div className="px-2 py-2 flex items-center justify-center">
              <img
                src={getWineImage(m.image_url, null)}
                alt={m.name_ko}
                className="w-9 h-9 rounded-lg object-cover border border-zinc-700"
              />
            </div>
            <div className="px-3 py-2 min-w-0">
              {m.isThis ? (
                <span className="text-rose-300 font-medium truncate inline-flex items-center gap-2">
                  {m.name_ko}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    이 와인
                  </span>
                </span>
              ) : (
                <Link
                  href={`/admin/wine-db?wine=${m.id}`}
                  className="text-zinc-200 hover:underline truncate font-medium"
                >
                  {m.name_ko}
                </Link>
              )}
              <p className="text-[11px] text-zinc-500 italic truncate">{m.name_en}</p>
            </div>
            <div className="px-3 py-2 text-zinc-300 truncate">
              {m.producer ?? <span className="text-zinc-600">—</span>}
            </div>
            <div className="px-3 py-2 text-zinc-300 truncate">
              {m.country_ko}
              {m.region_ko ? ` · ${m.region_ko}` : ""}
            </div>
            <div className="px-3 py-2 text-zinc-500 text-xs">{m.source}</div>
            <div className="px-2 py-2 text-center">
              {!m.isThis && (
                <a
                  href={`/admin/wine-db/${m.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  새 탭 ↗
                </a>
              )}
            </div>
            <div className="px-2 py-2 text-center">
              <button
                onClick={() => {
                  const label = m.isThis ? "이 와인의" : `"${m.name_ko}"의`;
                  if (!confirm(`${label} Vivino 매칭을 해제합니다.`)) return;
                  startTransition(async () => {
                    const res = await unlinkVivino(m.id);
                    setMsg(res.error ? `오류: ${res.error}` : "해제 완료");
                    if (!res.error) onChanged();
                  });
                }}
                disabled={pending}
                className="text-[11px] px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
              >
                해제
              </button>
            </div>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs text-zinc-400 mt-3">{msg}</p>}
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

