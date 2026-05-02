/**
 * 와인 표시값 결정.
 *
 * v3 (legacy): 한글(*_ko) > v3 정규화 > final_* > vivino_* > 원본
 * v5 (Wine 타입): fallback 없음 — wines_v2가 이미 정규화된 단일 컬럼만 가짐
 *
 * Phase 4 진행 중 — 호출자 점진 전환 (resolveWineDisplay → resolveWineDisplayV2).
 */

import type { Wine } from "@/types";

type WineDisplayInput = {
  // v3 한글/정규화 필드
  country_ko?: string | null;
  region_ko?: string | null;
  grape_varieties_ko?: string[] | null;
  wine_style_ko?: string | null;
  grape_varieties?: string[] | null;
  region_path?: string | null;
  wine_style?: string | null;
  producer_ko?: string | null;
  producer_en?: string | null;

  // 원본 / legacy
  grape_variety?: string | null;
  region?: string | null;
  country?: string | null;
  producer?: string | null;
  wine_type?: string | null;
  description?: string | null;

  // Vivino 원본
  vivino_grapes?: string | null;
  vivino_region?: string | null;
  vivino_winery?: string | null;
  vivino_style?: string | null;
  vivino_alcohol?: string | null;
  vivino_description?: string | null;

  // final_* (legacy 수동 오버라이드)
  final_grapes?: string | null;
  final_region?: string | null;
  final_country?: string | null;
  final_producer?: string | null;
  final_wine_type?: string | null;
  final_alcohol?: string | null;
  final_style?: string | null;
  final_description?: string | null;

  // 일반 alcohol (raw 소스에서 채움)
  alcohol?: string | null;
  gangnam_alcohol?: string | null;
};

function arrToText(arr: string[] | null | undefined): string | null {
  if (!arr || arr.length === 0) return null;
  return arr.filter((x) => x).join(", ");
}

export function resolveWineDisplay(wine: WineDisplayInput) {
  return {
    grapes:
      arrToText(wine.grape_varieties_ko) ??
      wine.final_grapes ??
      arrToText(wine.grape_varieties) ??
      wine.vivino_grapes ??
      wine.grape_variety ??
      null,
    region:
      wine.region_ko ??
      wine.final_region ??
      wine.region_path ??
      wine.vivino_region ??
      wine.region ??
      null,
    country:
      wine.country_ko ??
      wine.final_country ??
      wine.country ??
      null,
    producer:
      wine.producer_ko ??
      wine.final_producer ??
      wine.producer_en ??
      wine.producer ??
      wine.vivino_winery ??
      null,
    wine_type:
      wine.final_wine_type ??
      wine.wine_type ??
      null,
    alcohol:
      wine.final_alcohol ??
      wine.alcohol ??
      wine.vivino_alcohol ??
      wine.gangnam_alcohol ??
      null,
    style:
      wine.wine_style_ko ??
      wine.final_style ??
      wine.wine_style ??
      wine.vivino_style ??
      null,
    description:
      wine.final_description ??
      wine.vivino_description ??
      wine.description ??
      null,
  };
}

// ============================================================================
// v5 — wines_v2 정규 타입 직접 매핑 (fallback 불필요)
// ============================================================================

/**
 * v5 와인 표시값 결정.
 * wines_v2는 이미 단일 표준 언어로 정규화돼 있어 fallback 없음.
 *
 * @param wine wines_v2 행 (Wine 타입의 일부 필드만 있어도 됨)
 * @param vivino vivino_wines 행 (있으면 표시 보강)
 */
export function resolveWineDisplayV2(
  wine: Pick<
    Wine,
    | "country_ko"
    | "region_ko"
    | "producer"
    | "grape_varieties"
    | "grape_blend"
    | "alcohol"
    | "brand"
    | "wine_type"
    | "wine_style"
    | "description"
  >,
) {
  return {
    grapes:
      wine.grape_varieties && wine.grape_varieties.length > 0
        ? wine.grape_varieties.join(", ")
        : null,
    grape_blend: wine.grape_blend ?? null,
    region: wine.region_ko,
    country: wine.country_ko,
    producer: wine.producer,
    wine_type: wine.wine_type,
    alcohol: wine.alcohol != null ? `${wine.alcohol}%` : null,
    style: wine.wine_style,
    description: wine.description,
    brand: wine.brand,
  };
}
