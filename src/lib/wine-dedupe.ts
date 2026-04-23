/**
 * 와인 중복 판정 유틸
 *
 * 원칙:
 *   - 자동 merge는 엄격 기준만 — 정규화된 name_en + name_ko + country 3개 전부 일치
 *   - 애매한 건 wine_dedupe_candidates 테이블로 보내 어드민 검수
 *
 * 정규화:
 *   - NFD 후 combining mark 제거 (악센트): Château → Chateau
 *   - 소문자
 *   - 문자·숫자 외 전부 제거 (공백·구두점·아포스트로피·대시)
 *   - "스톤베이" / "스톤 베이" / "STONE BAY" / "Stone-Bay!" → "stonebay" 동일
 *
 * 빈티지 제거:
 *   - 이름에서 연도(19xx, 20xx) 단독 토큰 제거
 *   - wines는 빈티지 무관 카탈로그이므로 매칭 키에서 연도 배제
 */

/**
 * 이름 끝에 단독으로 오는 19xx/20xx 4자리만 빈티지로 간주하고 제거.
 *
 * 제거 O:
 *   "Kim Crawford Chardonnay 2020"        → "Kim Crawford Chardonnay"
 *   "Chateau Margaux 1982"                → "Chateau Margaux"
 *   "Stonebay Sauvignon Blanc 2019 "      → "Stonebay Sauvignon Blanc"
 *
 * 제거 X (이름의 일부):
 *   "1895"                                → "1895"        (숫자만 있는 이름)
 *   "19 Crimes Cali Red"                  → 그대로        (앞/중간의 19xx)
 *   "Cave de 1895"                        → "Cave de 1895" (연도지만 이름 일부)
 *   "2018 Vintage Reserve"                → 그대로        (앞)
 *
 * 규칙:
 *   - 연도는 문자열의 맨 끝에 있고
 *   - 연도 앞에 최소 다른 토큰 1개 이상 (prefix가 비어있지 않음)
 *   이 두 조건 모두 만족할 때만 제거. 애매한 케이스는 검수 큐로.
 */
export function stripVintage(s: string): string {
  if (!s) return s;
  const m = s.match(/^(.+?)[\s\-,]+(19|20)\d{2}\s*$/);
  if (!m) return s.trim();
  const prefix = m[1].trim();
  if (!prefix) return s.trim();
  return prefix;
}

/**
 * 핵심 정규화: 악센트 제거 + 소문자 + 문자·숫자 외 전부 제거
 * 한글은 그대로 유지 (공백만 제거됨).
 */
export function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return stripVintage(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining marks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export interface MatchKey {
  name_en_n: string;
  name_ko_n: string;
  country: string;
}

export function buildMatchKey(input: {
  name_en: string | null;
  name_ko: string | null;
  country: string | null;
}): MatchKey {
  return {
    name_en_n: normalize(input.name_en),
    name_ko_n: normalize(input.name_ko),
    country: (input.country ?? "").trim(),
  };
}

/**
 * 3요소 전부 일치 → 자동 merge 가능
 */
export function isExactMatch(a: MatchKey, b: MatchKey): boolean {
  if (!a.name_en_n || !a.name_ko_n || !a.country) return false;
  if (!b.name_en_n || !b.name_ko_n || !b.country) return false;
  return a.name_en_n === b.name_en_n && a.name_ko_n === b.name_ko_n && a.country === b.country;
}

/**
 * 검수 큐에 올릴 사유 판정
 *   - 'name_ko_variant': name_en + country 일치, name_ko만 다름 (음차 변형 가능성)
 *   - 'name_en_variant': name_ko + country 일치, name_en만 다름
 *   - 'country_mismatch': name 둘 다 일치하는데 country만 다름
 *   - 'fuzzy_name': 정규화 Levenshtein 거리 ≤ 2
 *   - null: 후보 아님
 */
export type MatchReason =
  | "name_ko_variant"
  | "name_en_variant"
  | "country_mismatch"
  | "fuzzy_name";

export function classifyCandidate(a: MatchKey, b: MatchKey): { reason: MatchReason; score: number } | null {
  if (isExactMatch(a, b)) return null; // 자동 merge 대상이라 검수 큐 아님

  const enEq = a.name_en_n && b.name_en_n && a.name_en_n === b.name_en_n;
  const koEq = a.name_ko_n && b.name_ko_n && a.name_ko_n === b.name_ko_n;
  const countryEq = a.country && b.country && a.country === b.country;

  if (enEq && countryEq && !koEq) return { reason: "name_ko_variant", score: 0.9 };
  if (koEq && countryEq && !enEq) return { reason: "name_en_variant", score: 0.85 };
  if (enEq && koEq && !countryEq) return { reason: "country_mismatch", score: 0.7 };

  // fuzzy: name_en_n만 비교 (가장 안정적)
  if (a.name_en_n && b.name_en_n) {
    const d = levenshtein(a.name_en_n, b.name_en_n);
    const maxLen = Math.max(a.name_en_n.length, b.name_en_n.length);
    if (maxLen > 0 && d <= 2 && d / maxLen <= 0.15) {
      return { reason: "fuzzy_name", score: 1 - d / maxLen };
    }
  }

  return null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
