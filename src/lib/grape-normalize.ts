/**
 * 와인 품종 정규화 — term_dict 기반.
 *
 * 입력: ["Cab Sauv", "까베르네 소비뇽", "샤도네", "알수없는품종"]
 * 결과:
 *   normalized_en: ["Cabernet Sauvignon", "Chardonnay"]   (표준 영문, dedup)
 *   normalized_ko: ["카베르네 소비뇽", "샤도네이"]         (표준 한글, 순서 동일)
 *   unknowns:      ["알수없는품종"]                       (사전 매칭 실패)
 *
 * 매칭:
 *   - 입력을 normKey (소문자+공백/구두점 제거+악센트 제거)로 변환
 *   - term_dict(category='grape')의 en/ko/aliases 를 같은 normKey로 lookup 테이블화
 *   - 매칭된 entry의 표준 en + ko 반환
 *
 * 사용:
 *   const dict = await loadGrapeDict(sb);
 *   const result = normalizeGrapes(inputs, dict);
 *   // wines.grape_varieties = result.normalized_en
 *   // wines.grape_varieties_ko = result.normalized_ko
 *   // result.unknowns가 있으면 UI에 경고
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface GrapeDictEntry {
  en: string;
  ko: string;
  aliases: string[];
}

export function normKey(s: string): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export async function loadGrapeDict(sb: SupabaseClient): Promise<GrapeDictEntry[]> {
  const all: GrapeDictEntry[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("term_dict")
      .select("en, ko, aliases")
      .eq("category", "grape")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ en: string; ko: string; aliases: string[] | null }>) {
      all.push({
        en: r.en,
        ko: r.ko,
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
      });
    }
    if (data.length < PAGE) break;
    from += data.length;
  }
  return all;
}

export interface GrapeNormalizeResult {
  normalized_en: string[];
  normalized_ko: string[];
  unknowns: string[];
}

/**
 * 입력 배열(자유 형식)을 term_dict에 매칭해 표준 en/ko로 정규화.
 * 중복 제거됨. 사전 매칭 실패한 항목은 unknowns로.
 */
export function normalizeGrapes(inputs: Array<string | null | undefined>, dict: GrapeDictEntry[]): GrapeNormalizeResult {
  const lookup = new Map<string, GrapeDictEntry>();
  for (const e of dict) {
    const keyEn = normKey(e.en);
    const keyKo = normKey(e.ko);
    if (keyEn) lookup.set(keyEn, e);
    if (keyKo) lookup.set(keyKo, e);
    for (const a of e.aliases) {
      const ka = normKey(a);
      if (ka) lookup.set(ka, e);
    }
  }

  const matchedEn: string[] = [];
  const matchedKo: string[] = [];
  const seen = new Set<string>();
  const unknowns: string[] = [];

  for (const raw of inputs) {
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const key = normKey(trimmed);
    if (!key) continue;
    const entry = lookup.get(key);
    if (entry) {
      if (!seen.has(entry.en)) {
        seen.add(entry.en);
        matchedEn.push(entry.en);
        matchedKo.push(entry.ko);
      }
    } else if (!unknowns.includes(trimmed)) {
      unknowns.push(trimmed);
    }
  }

  return { normalized_en: matchedEn, normalized_ko: matchedKo, unknowns };
}

/**
 * 문자열 하나(쉼표/세미콜론/슬래시 구분) → 정규화 결과.
 */
export function normalizeGrapeString(s: string | null | undefined, dict: GrapeDictEntry[]): GrapeNormalizeResult {
  if (!s) return { normalized_en: [], normalized_ko: [], unknowns: [] };
  const parts = String(s).split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
  return normalizeGrapes(parts, dict);
}
