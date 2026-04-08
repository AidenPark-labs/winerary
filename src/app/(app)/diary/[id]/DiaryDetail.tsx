"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { WineRecord, RecordEvaluation, LinkedRecord } from "@/types";
import { resolveWineDisplay } from "@/lib/wine-display";
import DeleteButton from "./DeleteButton";
import ShareButton from "./ShareButton";
import InviteButton from "./InviteButton";

const FOOD_COLOR_RULES: [RegExp, { bg: string; border: string; text: string }][] = [
  [/스테이크|고기|소고기|돼지|양고기|갈비|삼겹|안심|등심|채끝|립|로스트|미트|바베큐|BBQ|불고기|육/i,
    { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-300" }],
  [/해산물|생선|연어|참치|새우|조개|굴|랍스터|회|초밥|스시|문어|오징어|게|전복|광어|우니|사시미/i,
    { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-300" }],
  [/치즈|까망베르|브리|고르곤졸라|모짜렐라|파르메산|체다|블루치즈|그뤼에르/i,
    { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-300" }],
  [/파스타|피자|빵|리조또|뇨끼|라자냐|크로와상|바게트|포카치아|브루스케타/i,
    { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-300" }],
  [/샐러드|채소|야채|버섯|아보카도|올리브|루꼴라|카프레제|그린/i,
    { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-300" }],
  [/초콜릿|디저트|케이크|타르트|마카롱|아이스크림|과일|베리|딸기|체리|무화과|푸딩|크림/i,
    { bg: "bg-pink-500/10", border: "border-pink-500/20", text: "text-pink-300" }],
  [/닭|치킨|오리|duck|포울트리|터키|꼬치|야키토리/i,
    { bg: "bg-orange-400/10", border: "border-orange-400/20", text: "text-orange-300" }],
  [/감자|튀김|칩|프라이|프렌치|해시|크로켓|너겟/i,
    { bg: "bg-yellow-600/10", border: "border-yellow-600/20", text: "text-yellow-200" }],
  [/햄|살라미|하몽|프로슈토|소시지|베이컨|샤퀴테리/i,
    { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-300" }],
  [/에그|계란|달걀|오믈렛/i,
    { bg: "bg-yellow-400/10", border: "border-yellow-400/20", text: "text-yellow-200" }],
];

const DEFAULT_FOOD_COLOR = { bg: "bg-white/5", border: "border-white/10", text: "text-zinc-200" };

function getFoodColor(name: string) {
  for (const [pattern, color] of FOOD_COLOR_RULES) {
    if (pattern.test(name)) return color;
  }
  return DEFAULT_FOOD_COLOR;
}

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

function renderStars(score: number, max = 5) {
  return Array.from({ length: max }, (_, i) => {
    const star = i + 1;
    const filled = score >= star;
    const half = !filled && score >= star - 0.5;
    return (
      <span key={i} className="relative text-sm w-4 h-4 inline-flex items-center justify-center">
        <span className="text-zinc-700">★</span>
        {filled && <span className="absolute inset-0 flex items-center justify-center text-amber-400">★</span>}
        {half && (
          <span className="absolute inset-0 flex items-center justify-center text-amber-400 overflow-hidden" style={{ clipPath: "inset(0 50% 0 0)" }}>★</span>
        )}
      </span>
    );
  });
}

interface WineData {
  id?: string;
  description?: string | null;
  vivino_url?: string | null;
  vivino_rating?: number | null;
  vivino_reviews?: number | null;
  vivino_winery?: string | null;
  vivino_grapes?: string | null;
  vivino_region?: string | null;
  vivino_style?: string | null;
  vivino_alcohol?: string | null;
  vivino_description?: string | null;
  grape_variety?: string | null;
  region?: string | null;
  country?: string | null;
  producer?: string | null;
  wine_type?: string | null;
  final_grapes?: string | null;
  final_region?: string | null;
  final_country?: string | null;
  final_producer?: string | null;
  final_wine_type?: string | null;
  final_alcohol?: string | null;
  final_style?: string | null;
  final_description?: string | null;
}

const WINE_TYPE_COLORS: Record<string, string> = {
  red: "bg-[#722F37]", white: "bg-[#F7E7CE]", rose: "bg-[#FFC0CB]",
  sparkling: "bg-[#F3E5AB]", fortified: "bg-[#4A0E4E]", other: "bg-zinc-400",
};

export default function DiaryDetail({ record, readOnly = false, wineData = null, evaluations = [], myEvaluation = null, currentUserId = null, ownerNickname = "작성자", currentNickname = "", linkedRecords = [] }: {
  record: WineRecord;
  readOnly?: boolean;
  wineData?: WineData | null;
  evaluations?: RecordEvaluation[];
  myEvaluation?: RecordEvaluation | null;
  currentUserId?: string | null;
  ownerNickname?: string;
  currentNickname?: string;
  linkedRecords?: LinkedRecord[];
}) {
  const photos: string[] = record.photos ?? [];
  const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
  const companions: string[] = record.companions ?? [];
  const tags: string[] = record.tags ?? [];

  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lbScrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lbRef = useCallback((node: HTMLDivElement | null) => {
    lbScrollRef.current = node;
    if (node && lightbox !== null) {
      node.scrollTo({ left: lightbox * node.clientWidth, behavior: "instant" });
    }
  }, [lightbox === null]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    setCurrentPhoto(Math.round(scrollLeft / clientWidth));
  }

  const bgPhoto = photos[currentPhoto] ?? photos[0];
  const hasPhoto = photos.length > 0;

  // 날짜 + 장소 텍스트
  const dateStr = new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const placeStr = record.place_name || record.location;

  // 가격 텍스트
  const priceText = record.price != null ? (() => {
    const unit = record.price_unit === "glass" ? "/잔" : record.price_type === "retail" ? " (소매)" : record.price_type === "market" ? " (매장)" : "";
    return `${record.price.toLocaleString()}원${unit}`;
  })() : null;

  // 종합 평점: 맛 + 가성비 + (음식이 있으면 음식궁합)
  const overallScore = (() => {
    const scores: number[] = [];
    if (record.rating != null) scores.push(Number(record.rating));
    if (record.value_score != null) scores.push(Number(record.value_score));
    if (foods.length > 0 && record.pairing_score != null) scores.push(Number(record.pairing_score));
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  })();

  return (
    <div className="relative min-h-screen bg-black">

      {/* ── 블러 배경 ── */}
      {bgPhoto && (
        <div className="fixed inset-0 z-0 pointer-events-none transition-all duration-1000 ease-out" aria-hidden="true">
          <img src={bgPhoto} alt="" className="w-full h-full object-cover scale-150 blur-3xl saturate-200 opacity-40 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />
        </div>
      )}

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── 사진 히어로 ── */}
        <div className="relative overflow-visible">
          {hasPhoto ? (
            <>
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex snap-x snap-mandatory"
                style={{ overflowX: "scroll", overflowY: "hidden", scrollbarWidth: "none", touchAction: "pan-x pan-y" } as React.CSSProperties}
              >
                {photos.map((url, i) => (
                  <div key={i} className="relative flex-shrink-0 snap-center cursor-pointer" style={{ width: "100svw", height: "60vh" }} onClick={() => setLightbox(i)}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>

              <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
              {/* 하단 → 사진 밖으로 확장되는 그라디언트 */}
              <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: "-4rem", height: "12rem", background: "linear-gradient(to top, transparent 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.6) 60%, transparent 100%)" }} />

              {photos.length > 1 && (
                <div className="absolute bottom-20 inset-x-0 flex justify-center gap-1.5 z-30 pointer-events-none">
                  {photos.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === currentPhoto ? "w-5 bg-white" : "w-1 bg-white/40"}`} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="relative bg-surface border-b border-white/5" style={{ height: "20vh" }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path d="M8 22h8M12 15v7M12 15a6 6 0 0 0 6-6V3H6v6a6 6 0 0 0 6 6z" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* 헤더 — 뒤로 / 수정 / 삭제 */}
          <div className="absolute top-0 inset-x-0 px-4 pt-12 flex items-center justify-between z-20 pointer-events-none">
            {readOnly ? (
              <span className="text-sm font-semibold text-white/70 tracking-widest">winerary</span>
            ) : (
              <a href="/diary" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white text-lg hover:bg-black/60 transition-colors pointer-events-auto">←</a>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2 pointer-events-auto">
                <InviteButton recordId={record.id} inviteCode={(record as unknown as Record<string, unknown>).invite_code as string | null ?? null} />
                {record.visibility === "link" && <ShareButton id={record.id} />}
                <Link
                  href={`/diary/${record.id}/edit`}
                  className="text-xs font-medium px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 transition-colors shadow-lg"
                >
                  수정
                </Link>
                <DeleteButton id={record.id} />
              </div>
            )}
          </div>
        </div>

        {/* ── 컨텐츠 ── */}
        <div className={`flex flex-col gap-4 px-4 relative z-20 ${hasPhoto ? "-mt-12" : "pt-4"} ${readOnly ? "pb-36" : "pb-28"}`}>

          {/* ── 글라스 카드 (별점 + 날짜 + 동행 + 태그) ── */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 px-5 py-3.5 shadow-2xl flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              {overallScore != null && (
                <span className="text-amber-400 text-sm font-bold">★ {overallScore.toFixed(1)}</span>
              )}
              {overallScore != null && <span className="text-white/20">|</span>}
              <span className="text-sm text-white font-medium">{dateStr}</span>
            </div>
            {placeStr && (
              <p className="text-xs text-zinc-400 font-light flex items-center gap-1">
                <svg className="w-3 h-3 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                {placeStr}
              </p>
            )}
            {companions.length > 0 && (
              <p className="text-xs text-zinc-300/70 font-light">
                with{" "}
                {companions.map((c, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {c.startsWith("@") ? (
                      <span className="text-violet-300">{c}</span>
                    ) : (
                      <span className="text-zinc-400">{c}</span>
                    )}
                  </span>
                ))}
              </p>
            )}
          </div>

          {/* ━━━━━━━━━━ 연결된 경험 ━━━━━━━━━━ */}
          {linkedRecords.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-400 text-xs">🔗</span>
              <span className="text-xs text-blue-300 font-light flex-1">
                {linkedRecords.map((lr) => lr.owner_nickname).join(", ")}님과 연결됨
              </span>
              {!readOnly && (
                <Link href={`/diary/${record.id}/link`} className="text-[11px] text-blue-400 hover:text-blue-300">관리</Link>
              )}
            </div>
          )}
          {readOnly && currentUserId && linkedRecords.length === 0 && (
            <Link
              href={`/diary/${record.id}/link-mine`}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/15 transition-colors"
            >
              <span className="text-blue-400 text-xs">🔗</span>
              <span className="text-xs text-blue-300 font-light">나도 이 와인 기록했어요</span>
            </Link>
          )}

          {/* ━━━━━━━━━━ 1. Wine ━━━━━━━━━━ */}
          {(() => {
            const resolved = wineData ? resolveWineDisplay(wineData) : null;
            const displayType = resolved?.wine_type ?? record.wine_type;
            const displayGrapes = resolved?.grapes ?? record.grape_variety;
            const displayCountry = resolved?.country ?? record.wine_country;
            const hasWineScores = record.rating != null || record.value_score != null;

            const hasWineLink = !!(record.wine_id && wineData?.id);

            return (
              <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
                <div className="px-5 pt-4 pb-2">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Wine</p>
                </div>
                {/* 와인명 */}
                {(() => {
                  const nameRow = (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-xs text-zinc-400">와인명</span>
                      <div className="text-right min-w-0 flex-1 ml-4">
                        <p className="text-sm text-white font-medium truncate">{record.name}{record.wine_vintage ? ` ${record.wine_vintage}` : ""}</p>
                        {record.wine_name_original && (
                          <p className="text-[11px] text-zinc-400 italic truncate">{record.wine_name_original}</p>
                        )}
                      </div>
                      {hasWineLink && <span className="text-zinc-500 text-lg ml-2 flex-shrink-0">›</span>}
                    </div>
                  );
                  if (hasWineLink) return <Link href={`/wines/${record.wine_id}`}>{nameRow}</Link>;
                  return nameRow;
                })()}
                {/* 와인 세부 정보 */}
                <div className="flex flex-col pb-2">
                  {displayType && (
                    <div className="flex items-center justify-between px-5 py-2">
                      <span className="text-xs text-zinc-400">타입</span>
                      <span className="text-sm text-white font-medium">{TYPE_KO[displayType] ?? displayType}</span>
                    </div>
                  )}
                  {displayGrapes && (() => {
                    const blendMatch = displayGrapes.match(/^(블렌드|blend)\s*\((.+)\)$/i);
                    if (blendMatch) {
                      const subGrapes = blendMatch[2];
                      return (
                        <div className="px-5 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">품종</span>
                            <span className="text-sm text-white font-medium">블렌드</span>
                          </div>
                          <p className="text-xs text-zinc-500 font-light text-right mt-1 leading-relaxed">{subGrapes}</p>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center justify-between px-5 py-2">
                        <span className="text-xs text-zinc-400">품종</span>
                        <span className="text-sm text-white font-medium text-right">{displayGrapes}</span>
                      </div>
                    );
                  })()}
                  {displayCountry && (
                    <div className="flex items-center justify-between px-5 py-2">
                      <span className="text-xs text-zinc-400">국가</span>
                      <span className="text-sm text-white font-medium">{displayCountry}</span>
                    </div>
                  )}
                  {resolved?.alcohol && (
                    <div className="flex items-center justify-between px-5 py-2">
                      <span className="text-xs text-zinc-400">도수</span>
                      <span className="text-sm text-white font-medium">{resolved.alcohol}</span>
                    </div>
                  )}
                  {priceText && (
                    <>
                      <div className="mx-5 my-2 border-t border-white/5" />
                      <div className="flex items-center justify-between px-5 py-2">
                        <span className="text-xs text-zinc-400">구매가격</span>
                        <span className="text-sm text-white font-medium">{priceText}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ━━━━━━━━━━ 2. Pairing (음식 목록만) ━━━━━━━━━━ */}
          {foods.length > 0 && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Pairing Food</p>
              </div>
              <div className="px-5 pb-3">
                <div className="flex gap-1.5 flex-wrap">
                  {foods.map((f, i) => {
                    const c = getFoodColor(f.name);
                    return (
                      <span key={i} className={`px-3 py-1.5 rounded-xl border text-sm font-light ${c.bg} ${c.border} ${c.text}`}>{f.name}</span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━ Tags ━━━━━━━━━━ */}
          {tags.length > 0 && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Tags</p>
              </div>
              <div className="px-5 pb-3">
                <div className="flex gap-1.5 flex-wrap">
                  {tags.map((tag, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[11px] font-medium">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━ Reviews (평가자별 통합) ━━━━━━━━━━ */}
          <EvaluationSection
            record={record}
            readOnly={readOnly}
            evaluations={evaluations}
            myEvaluation={myEvaluation}
            currentUserId={currentUserId}
            ownerNickname={ownerNickname}
            currentNickname={currentNickname}
            linkedRecords={linkedRecords}
          />
        </div>

      </div>

      {/* ── 풀스크린 라이트박스 ── */}
      {lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setLightbox(null)}>
          <div
            ref={lbRef}
            className="flex-1 flex snap-x snap-mandatory overflow-x-auto"
            style={{ scrollbarWidth: "none", touchAction: "pan-x pan-y" } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
            onScroll={() => {
              if (!lbScrollRef.current) return;
              const { scrollLeft, clientWidth } = lbScrollRef.current;
              setLightbox(Math.round(scrollLeft / clientWidth));
            }}
          >
            {photos.map((url, i) => (
              <div key={i} className="flex-shrink-0 snap-center w-full h-full flex items-center justify-center" style={{ minWidth: "100%" }}>
                <img src={url} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center gap-3 pb-24 pt-4">
            {photos.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === lightbox ? "w-5 bg-white" : "w-1 bg-white/40"}`} />
                ))}
              </div>
            )}
            <button className="text-white/70 hover:text-white text-sm px-5 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Evaluation Card (한 사람의 평가) ─────────────────────────────────────────

function EvalCardContent({ rating, valueScore, pairingScore, memo, repurchaseIntent }: {
  rating: number | null;
  valueScore: number | null;
  pairingScore: number | null;
  memo: string | null;
  repurchaseIntent?: string | null;
}) {
  const hasScores = rating != null || valueScore != null || pairingScore != null;
  return (
    <>
      {hasScores && (
        <div className="flex flex-col gap-2">
          {rating != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">와인 평점</span>
              <div className="flex items-center gap-2">
                <div className="flex">{renderStars(Number(rating), 5)}</div>
              </div>
            </div>
          )}
          {valueScore != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">가성비</span>
              <div className="flex items-center gap-2">
                <div className="flex">{renderStars(Number(valueScore), 5)}</div>
              </div>
            </div>
          )}
          {pairingScore != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">음식 궁합</span>
              <div className="flex items-center gap-2">
                <div className="flex">{renderStars(Number(pairingScore), 5)}</div>
              </div>
            </div>
          )}
        </div>
      )}
      {repurchaseIntent && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-zinc-500">재구매의사</span>
          <span className="text-xs font-medium text-white">
            {{ yes: "👍 있음", maybe: "🤔 고민 중", no: "👋 패스" }[repurchaseIntent] ?? repurchaseIntent}
          </span>
        </div>
      )}
      {memo && (
        <div className="relative mt-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
          <span className="absolute top-1 left-2.5 text-3xl text-white/10 font-serif leading-none select-none pointer-events-none">"</span>
          <p className="text-[13px] text-zinc-300 font-light leading-relaxed whitespace-pre-wrap pl-4">{memo}</p>
          <span className="absolute bottom-0 right-3 text-3xl text-white/10 font-serif leading-none select-none pointer-events-none">"</span>
        </div>
      )}
    </>
  );
}

function calcAvgScore(rating: number | null, valueScore: number | null, pairingScore: number | null) {
  const scores = [rating, valueScore, pairingScore].filter((s): s is number => s != null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function EvalCard({ label, isAuthor, rating, valueScore, pairingScore, memo, repurchaseIntent }: {
  label: string;
  isAuthor?: boolean;
  rating: number | null;
  valueScore: number | null;
  pairingScore: number | null;
  memo: string | null;
  repurchaseIntent?: string | null;
}) {
  const hasScores = rating != null || valueScore != null || pairingScore != null;
  if (!hasScores && !memo && !repurchaseIntent) return null;

  const avg = calcAvgScore(rating, valueScore, pairingScore);

  return (
    <div className="px-5 py-3.5 border-b border-white/10 last:border-b-0">
      <div className="flex items-center justify-between mb-2.5">
        <p className={`text-[11px] font-medium ${isAuthor ? "text-amber-400" : "text-zinc-400"}`}>
          {label}{isAuthor ? " (작성자)" : ""}
        </p>
        {avg != null && (
          <span className={`text-sm font-bold ${isAuthor ? "text-amber-400" : "text-white"}`}>
            ★ {avg.toFixed(1)}
          </span>
        )}
      </div>
      <EvalCardContent rating={rating} valueScore={valueScore} pairingScore={pairingScore} memo={memo} repurchaseIntent={repurchaseIntent} />
    </div>
  );
}

// ─── Evaluation Section ──────────────────────────────────────────────────────

function EvaluationSection({ record, readOnly, evaluations, myEvaluation, currentUserId, ownerNickname, currentNickname, linkedRecords }: {
  record: WineRecord;
  readOnly: boolean;
  evaluations: RecordEvaluation[];
  myEvaluation: RecordEvaluation | null;
  currentUserId: string | null;
  ownerNickname: string;
  currentNickname: string;
  linkedRecords: LinkedRecord[];
}) {
  const isOwner = !readOnly;
  const otherEvals = evaluations.filter((e) => e.user_id !== currentUserId);
  const hasMyEval = !!myEvaluation;

  // 작성자 평가 데이터 (record 자체에서 추출)
  const authorHasEval = record.rating != null || record.value_score != null ||
    record.pairing_score != null || record.memo != null || record.repurchase_intent != null;

  // 본인 기록이면 작성자 평가가 곧 내 평가
  const showEvaluateButton = currentUserId && !hasMyEval && !(isOwner && authorHasEval);

  return (
    <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
      <div className="px-5 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Reviews</p>
      </div>

      {/* 작성자 평가 */}
      {authorHasEval && (() => {
        const authorAvg = calcAvgScore(record.rating, record.value_score, record.pairing_score);
        return (
        <div className="px-5 py-3.5 border-b border-white/10 last:border-b-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-medium text-amber-400">{ownerNickname}</p>
              {authorAvg != null && <span className="text-sm font-bold text-amber-400">★ {authorAvg.toFixed(1)}</span>}
            </div>
            {isOwner && (
              <Link
                href={`/diary/${record.id}/evaluate`}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 transition-colors"
              >
                수정
              </Link>
            )}
          </div>
          <EvalCardContent
            rating={record.rating}
            valueScore={record.value_score}
            pairingScore={record.pairing_score}
            memo={record.memo}
            repurchaseIntent={record.repurchase_intent}
          />
        </div>
        );
      })()}

      {/* 내 평가 (공유받은 유저) */}
      {myEvaluation && (() => {
        const myAvg = calcAvgScore(myEvaluation.rating, myEvaluation.value_score, myEvaluation.pairing_score);
        return (
        <div className="px-5 py-3.5 border-b border-white/10 last:border-b-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-medium text-zinc-400">{currentNickname || "내 평가"}</p>
              {myAvg != null && <span className="text-sm font-bold text-white">★ {myAvg.toFixed(1)}</span>}
            </div>
            <Link
              href={`/diary/${record.id}/evaluate`}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 transition-colors"
            >
              수정
            </Link>
          </div>
          <EvalCardContent
            rating={myEvaluation.rating}
            valueScore={myEvaluation.value_score}
            pairingScore={myEvaluation.pairing_score}
            memo={myEvaluation.memo}
            repurchaseIntent={myEvaluation.repurchase_intent}
          />
        </div>
        );
      })()}

      {/* 다른 평가자들 (record_evaluations) */}
      {otherEvals.map((ev) => (
        <EvalCard
          key={ev.id}
          label={ev.nickname ?? "익명"}
          rating={ev.rating}
          valueScore={ev.value_score}
          pairingScore={ev.pairing_score}
          memo={ev.memo}
          repurchaseIntent={ev.repurchase_intent}
        />
      ))}

      {/* 연결된 경험 기록의 평가 */}
      {linkedRecords.length > 0 && linkedRecords.map((lr) => {
        const lrAvg = calcAvgScore(lr.rating, lr.value_score, lr.pairing_score);
        const hasScores = lr.rating != null || lr.value_score != null || lr.pairing_score != null;
        if (!hasScores && !lr.memo && !lr.repurchase_intent) return null;
        return (
          <div key={lr.record_id} className="px-5 py-3.5 border-b border-white/10 last:border-b-0">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-medium text-blue-400">{lr.owner_nickname}</p>
                {lrAvg != null && <span className="text-sm font-bold text-blue-400">★ {lrAvg.toFixed(1)}</span>}
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400/70 border border-blue-500/20">연결</span>
              </div>
              <Link
                href={`/diary/${lr.record_id}`}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-zinc-500 border border-white/10 hover:bg-white/10 transition-colors"
              >
                기록 보기
              </Link>
            </div>
            <EvalCardContent
              rating={lr.rating}
              valueScore={lr.value_score}
              pairingScore={lr.pairing_score}
              memo={lr.memo}
              repurchaseIntent={lr.repurchase_intent}
            />
          </div>
        );
      })}

      {/* 평가하기 버튼 (하단) */}
      {showEvaluateButton && (
        <div className="px-5 py-4">
          <Link
            href={`/diary/${record.id}/evaluate`}
            className="block w-full py-3 rounded-xl bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25 transition-colors text-sm font-medium text-center"
          >
            평가하기
          </Link>
        </div>
      )}
    </div>
  );
}
