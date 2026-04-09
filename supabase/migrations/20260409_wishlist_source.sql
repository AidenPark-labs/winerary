-- 위시리스트 저장 출처 (ai: 소믈리에 추천, manual: 직접 저장)
ALTER TABLE wine_wishlist ADD COLUMN source text CHECK (source IN ('ai', 'manual')) DEFAULT 'manual';
