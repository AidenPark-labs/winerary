@AGENTS.md

# 언어

- 항상 한국어로 응답할 것

# 와인 데이터 크롤링 컨텍스트

## Vivino 크롤링 (Track B)

### 실행 방법
```bash
NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts
NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --workers=2
NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --limit=100
NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --resume
NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --dry-run
```

### 사전 조건
- Node.js, Chrome 설치
- `.env.local`에 Supabase 키 설정 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

### 크롤링 방식 (매건 새 브라우저)
1. 매 와인마다 새 브라우저를 launch → 크롤 → close (세션 오염 방지)
2. Vivino 홈페이지 검색바에 와인 영문명 입력
3. 자동완성 후보에서 stop words 제외 핵심 단어 매칭 (≥ 0.7)
4. 상세 페이지 진입 → JSON-LD + Facts 텍스트 파싱
5. 교차 검증: 상세페이지 와인명과 검색어 매칭 ≥ 0.7 시 저장
6. 이미지는 큐에 넣고 배치 사이에 비동기 업로드 (Supabase Storage)

### 핵심 규칙: 브라우저 재사용 금지
- 브라우저 재사용 시 Vivino autocomplete가 세션/쿠키 오염 → 매칭률 ~33%로 급락
- 매건 새 브라우저로는 거의 100% 매칭 확인됨
- 속도는 느리지만 (~14초/건) 매칭률이 압도적이므로 반드시 매건 새 브라우저 유지

### 주의사항
- `browser` 실패 건만 자동 재시도 대상 (match/search 실패는 스킵)
- 체크포인트 50건마다 저장, `--resume`으로 이어서 실행 가능
- Chrome 경로가 macOS 기준 하드코딩됨 — 윈도우에서는 수정 필요

### 진행 상태 (2026-04-17 기준)
- 매칭 성공: 13,297건 / 34,986건 (38%)
- match 실패: ~19,000건
- browser 실패: ~2,000건
- search 실패: ~400건

### 관련 파일
- `scripts/scrape-vivino-raw.ts` — 메인 크롤링 스크립트
- `src/lib/vivino-crawler.ts` — crawlSingleWine 함수
- 체크포인트: `/tmp/vivino_scrape_checkpoint.json`

## 기타 수집 스크립트
- `scripts/collect-wine21.ts`, `collect-wine21-v2.ts` — Wine21 수집
- `scripts/collect-winenara.ts` — 와인나라 수집
- `scripts/collect-gangnam.ts` — 강남 와인 수집
- `scripts/enrich-naver-link.ts` — 네이버 링크 보강

## 향후 과제
- **wine_id 매칭**: wine_records에 wine_id FK 추가하여 wines 테이블과 연결 (현재 이름 문자열 비교 의존)
- **와인명 구조 분리**: LLM 파싱으로 winery/brand/grape/region 분리 → 검색 품질 향상. Vivino 크롤링 완료 후 진행 예정
