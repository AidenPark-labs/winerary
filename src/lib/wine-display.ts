/**
 * 와인 표시값 결정 (v3):
 *   한글(*_ko) > 정규화 v3 필드 > final_* 수동 오버라이드 > vivino_* > 원본
 * final_*은 v3 이전 수동 오버라이드 잔재 — Phase 5 안정화 후 DROP 예정.
 */

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
