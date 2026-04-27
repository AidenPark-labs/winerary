-- wines.review_image_url: 어드민 검수 전용 이미지 URL.
--
-- 배경:
--   wine21에서 수집한 와인 이미지는 워터마크가 박혀 있어 사용자 노출 image_url에는
--   의도적으로 넣지 않았음 (collect-wine21-v2.ts:39 "wines.image_url 에 절대 넣지 않음").
--   다만 어드민이 Vivino 매칭을 검수할 때 좌측 와이너리 DB 카드와 우측 Vivino 카드를
--   시각 대조할 수 있으려면 이미지가 있어야 함.
--
--   raw_wines.raw_payload.image_path는 보존돼 있으나 promote 시 wines로 옮겨지지 않음.
--   본 마이그레이션 후 backfill 스크립트가 절대 URL로 조립해 채우고,
--   다음부터는 promote-raw-wine.ts가 자동으로 채움.
--
-- 사용자 노출 금지:
--   wines_display view에는 추가하지 않음. 어드민 화면에서만 SELECT.

ALTER TABLE wines ADD COLUMN IF NOT EXISTS review_image_url text;

COMMENT ON COLUMN wines.review_image_url IS
  '어드민 검수 전용 이미지 URL. 사용자 노출 image_url과 별개. 워터마크 포함 가능성 있음.';
