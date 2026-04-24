-- wine_records에 grape_varieties / grape_varieties_ko 배열 컬럼 추가
--
-- 배경:
--   wine_records.grape_variety (단수 string)는 블렌드 포맷 "블렌드 (품종1, 품종2)" 로 저장 — 파싱 취약.
--   wines 카탈로그는 이미 grape_varieties (string[]) + grape_varieties_ko (string[]) 사용.
--   유저 기록도 같은 구조로 통일해 display / 검색 / 통계 일관성 확보.
--
-- 전략:
--   1) 새 배열 컬럼 추가 (마이그레이션)
--   2) 백필: grape_variety 문자열을 파싱해 배열로 변환 + term_dict 정규화 (별도 스크립트)
--   3) 쓰기 경로 전환 (UI/액션) — 신규 기록부터 배열 사용
--   4) 읽기 경로 전환 — 배열 우선, 없으면 grape_variety fallback
--   5) legacy grape_variety 컬럼 DROP은 v5 단순화 세션에서 (호환 기간 유지)

ALTER TABLE wine_records ADD COLUMN IF NOT EXISTS grape_varieties text[];
ALTER TABLE wine_records ADD COLUMN IF NOT EXISTS grape_varieties_ko text[];

-- pending_wines는 이미 grape_varieties 있음. grape_varieties_ko만 추가.
ALTER TABLE pending_wines ADD COLUMN IF NOT EXISTS grape_varieties_ko text[];
