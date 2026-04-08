/**
 * 와인 표시값 결정: final_* > vivino_* > naver 소스 우선순위
 * final_*이 null이면 자동 선택, 값이 있으면 수동 오버라이드
 */
export function resolveWineDisplay(wine: {
  grape_variety?: string | null;
  region?: string | null;
  country?: string | null;
  producer?: string | null;
  wine_type?: string | null;
  description?: string | null;
  vivino_grapes?: string | null;
  vivino_region?: string | null;
  vivino_winery?: string | null;
  vivino_style?: string | null;
  vivino_alcohol?: string | null;
  vivino_description?: string | null;
  final_grapes?: string | null;
  final_region?: string | null;
  final_country?: string | null;
  final_producer?: string | null;
  final_wine_type?: string | null;
  final_alcohol?: string | null;
  final_style?: string | null;
  final_description?: string | null;
}) {
  return {
    grapes:      wine.final_grapes      ?? wine.vivino_grapes      ?? wine.grape_variety ?? null,
    region:      wine.final_region       ?? wine.vivino_region      ?? wine.region        ?? null,
    country:     wine.final_country      ?? wine.country            ?? null,
    producer:    wine.final_producer     ?? wine.vivino_winery      ?? wine.producer      ?? null,
    wine_type:   wine.final_wine_type    ?? wine.wine_type          ?? null,
    alcohol:     wine.final_alcohol      ?? wine.vivino_alcohol     ?? null,
    style:       wine.final_style        ?? wine.vivino_style       ?? null,
    description: wine.final_description  ?? wine.vivino_description ?? wine.description   ?? null,
  };
}
