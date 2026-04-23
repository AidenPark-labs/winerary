# Phase 2.9 — Vivino 데이터 분리 체크리스트

> `docs/wines-schema-simplification.md`의 Phase 2.9 상세판.
> v5 리팩터 중 **가장 광범위한 사이클**. 체크박스로 진행 추적.

---

## 0. 작업 목표

wines에서 Vivino 관련 15개 컬럼을 **별도 `vivino_wines` 테이블**로 완전 분리.
- 수집·검수·서빙 경로 전부 재배선
- wines 1 : 0..1 vivino_wines (wine_id UNIQUE, FK 없음)
- 완료 시 wines.vivino_* 15개 컬럼 DROP

---

## 1. Phase 2.9a — 테이블 생성 + 읽기 경로만 전환

**목표**: vivino_wines 테이블 도입하되 wines.vivino_* 컬럼은 유지 (롤백 가능 상태).

### 1.1 마이그레이션
- [ ] `vivino_wines` 테이블 생성 migration 파일 작성
- [ ] 인덱스: `wine_id` unique, `needs_review` partial, `reviewed_at` null first
- [ ] RLS: service_role 전용 (어드민 서비스 클라이언트로만 접근)

### 1.2 백필
- [ ] `scripts/migrate-vivino-to-table.ts` 작성 (dry-run 포함)
  - wines.vivino_url IS NOT NULL인 모든 레코드 대상
  - 각 컬럼 → vivino_wines 매핑
  - wine_id = wines.id
  - UNIQUE 충돌 시 기존 값 UPDATE (재실행 안전)
- [ ] dry-run 집계 확인 (예상 ~12,136건)
- [ ] apply 실행
- [ ] 검증: wines에서 vivino_url 있는 건수 == vivino_wines 레코드 수

### 1.3 wine-display 리팩터
- [ ] `src/lib/wine-display.ts` — `WineDisplayInput`에서 vivino_* 필드 제거
- [ ] 새 파라미터: `VivinoWineInput` 별도 객체로 받음
- [ ] `resolveWineDisplay(wine, vivino?)` 시그니처로 변경

### 1.4 유저 서빙 경로 JOIN 전환 (31 파일)

#### 조회 쿼리 수정 (wines 읽는 모든 곳)
- [ ] `src/app/(app)/wines/[id]/page.tsx` — wines 조회 후 vivino_wines 별도 쿼리 또는 embedded
- [ ] `src/app/(app)/dictionary/page.tsx`
- [ ] `src/app/(app)/dictionary/DictionaryClient.tsx` — 타입 수정
- [ ] `src/app/(app)/find/page.tsx`
- [ ] `src/app/(app)/diary/[id]/page.tsx`
- [ ] `src/app/(app)/diary/[id]/DiaryDetail.tsx`
- [ ] `src/app/(app)/diary/new/page.tsx`
- [ ] `src/app/(app)/wishlist/page.tsx`
- [ ] `src/app/(app)/recommend/page.tsx`
- [ ] `src/app/invite/[code]/page.tsx`
- [ ] `src/app/(app)/wines/[id]/VivinoRating.tsx` — props 구조 변경
- [ ] `src/app/(app)/wines/[id]/WineActions.tsx` — Vivino 링크 source
- [ ] `src/lib/wine-search.ts` — 검색 결과 빌드

#### API 엔드포인트
- [ ] `src/app/api/vivino/rating/route.ts` — vivino_wines에서 조회
- [ ] `src/app/api/wines/search/route.ts` — JOIN 포함
- [ ] `src/app/api/wine/[id]/route.ts`
- [ ] `src/app/api/wishlist/route.ts`
- [ ] `src/app/api/record/[id]/prefill/route.ts`
- [ ] `src/app/api/ai/identify/route.ts`
- [ ] `src/app/api/ai/identify-by-name/route.ts`
- [ ] `src/app/api/ai/suggest/route.ts`

#### 타입 정의
- [ ] `src/types/index.ts` — Wine 타입에서 vivino_* 제거 + VivinoWine 신설

### 1.5 검증
- [ ] 로컬 dev에서 주요 화면 전부 확인
  - 와인 상세: 별점/평가수/매칭 표시
  - 사전: 별점 표시
  - 다이어리: 기록 카드의 와인 정보
  - 추천 / 찜 / 공유 페이지
- [ ] 배포 후 프로덕션 하드 리프레시 확인
- [ ] 1주 이상 관찰

---

## 2. Phase 2.9b — 쓰기 경로 교체

**목표**: 모든 write 경로를 vivino_wines로 재라우팅. 완료 후 wines.vivino_* DROP.

### 2.1 어드민 쓰기 (wines/actions.ts)
- [ ] `src/app/admin/wines/actions.ts`
  - `updateWineVivino()` → vivino_wines UPSERT (wine_id 기준)
    - 기존 term_dict 매핑 로직은 wines 쪽 (country_ko, region_ko, grape_varieties 보강)은 그대로 유지
    - vivino 자체 필드만 vivino_wines로
  - `clearWineVivino()` → vivino_wines DELETE (wine_id 기준)
- [ ] `src/app/admin/wines/WinesClient.tsx`
  - 카드 표시 Vivino 섹션 props 변경
  - "이름으로 수집", "URL로 수집", "해제" 버튼의 action 경로 확인
- [ ] `src/app/admin/wines/page.tsx` — 와인 목록 쿼리에 vivino_wines JOIN
- [ ] `src/app/admin/page.tsx` — 대시보드 통계 (Vivino 매칭 건수 등)

### 2.2 Vivino 검수 UI
- [ ] `src/app/admin/vivino-review/page.tsx`
  - 쿼리 기준을 vivino_wines 기반으로 변경 (needs_review=true 또는 전체)
  - wines는 JOIN
- [ ] `src/app/admin/vivino-review/ReviewClient.tsx`
  - 우측 카드 data source: current.vivino_* → current.vivino.*
  - 타입 분리
- [ ] `src/app/admin/vivino-review/actions.ts`
  - `confirmVivinoMatch(wineId)` → vivino_wines UPDATE (needs_review=false, reviewed_at=now)
  - `unlinkVivinoMatch(wineId)` → vivino_wines DELETE
  - `replaceVivinoUrl(wineId, url)` → crawlByUrl 호출 후 vivino_wines UPSERT
  - `updateWineFields()` — 그대로 (wines 테이블만 다룸)

### 2.3 중복 검수 merge
- [ ] `src/app/admin/dedupe-review/actions.ts`
  - `confirmDedupe` 내 vivino_fields 병합 부분 → vivino_wines UPSERT/MERGE
  - primary에 vivino_wines 있으면 유지, 없으면 secondary 것을 primary.wine_id로 이관
- [ ] `src/app/admin/dedupe-review/page.tsx`, `ReviewClient.tsx` — vivino 정보 표시 (현재 쓰는지 확인)

### 2.4 Promote 경로
- [ ] `scripts/promote-v2.ts`
  - `buildVivinoFields()`, `buildInsertRow()`, `executeAutoMerge()`, `executeNewPromote()` 전면 재작성
  - wines INSERT 후 vivino_wines INSERT (있는 경우)
- [ ] `src/lib/promote-raw-wine.ts`
  - `promoteSingleRawWine`, `insertWineDirectly`, `autoMerge`
  - `buildVivinoFields`, `buildVivinoFieldsDirect` → vivino_wines INSERT/UPDATE 반환
  - `WineCreateInput` 구조 재정의 (vivino_* 필드들 별도 섹션으로 또는 별도 객체)

### 2.5 편입 대기 승인
- [ ] `src/app/api/admin/pending-wines/route.ts` — `insertWineDirectly` 호출하니 2.4 반영 시 자동 따라옴. 단독 테스트 필요.

### 2.6 신고 기능
- [ ] `src/app/admin/reports/page.tsx` — 신고 컨텍스트에서 와인 Vivino 정보 표시 여부 확인
- [ ] `src/app/admin/reports/ReportsClient.tsx` — 동일

### 2.7 활성 벌크 스크립트
- [ ] `scripts/scrape-vivino-raw.ts` — raw_wines.raw_payload에만 저장하므로 **영향 없음** (raw_wines 테이블은 그대로)
- [ ] `scripts/update-wine-from-vivino.ts` — 쓰는지 확인 후 vivino_wines로
- [ ] `scripts/rematch-vivino-v4.ts` — 동일
- [ ] `scripts/restore-vivino-from-raw.ts` — raw_payload → vivino_wines로 복원 로직 교체
- [ ] `scripts/crawl-vivino-v2.ts`, `crawl-vivino-ratings.ts`, `crawl-vivino-puppeteer.ts` — 활성이면 vivino_wines로
- [ ] 비활성 분석 스크립트(analyze-*, check-*, debug-*, audit-*)는 **건드리지 않음** (일회성 히스토리)

### 2.8 검증 (배포 후 ≥ 1주)
- [ ] 프로덕션 핵심 화면 모두 정상
- [ ] `/admin/vivino-review` K/U/URL교체 전부 동작
- [ ] `/admin/wines`에서 Vivino 수집/해제 버튼 동작
- [ ] `/admin/dedupe-review` merge 시 Vivino 병합도 정상
- [ ] promote-v2 dry-run + 소규모 실행 결과 정상
- [ ] 에러 로그 모니터링 (빈 Vivino 표시, 매칭 누락 등)

### 2.9 DROP
- [ ] wines.vivino_* 15개 컬럼 DROP migration 작성
- [ ] 실행 전 `wines_backup_pre_v5`에서 vivino_* 데이터 확인 (이중 안전)
- [ ] DROP 실행
- [ ] 배포 후 확인

---

## 3. 작업량 추정

> **맥락**: 실 유저 2명 프로젝트라 대기·관찰 버퍼 최소화.

- Phase 2.9a: 1 세션 내 완료 가능
- Phase 2.9b: 1~2 세션 내 완료 가능
- 총 **2~3 세션** (더 줄일 수 있음)

한 세션에서 **2.9a + 2.9b 일부까지 묶어 진행** 가능.
프로덕션 "1주 관찰" 버퍼는 불필요 — 검증 끝나면 바로 DROP.

---

## 4. 롤백 가이드

### Phase 2.9a 롤백
- vivino_wines 테이블 DROP
- 수정한 읽기 경로 코드 revert
- wines.vivino_* 컬럼은 그대로라 데이터 손실 없음

### Phase 2.9b 롤백
- DROP 전까지는 읽기/쓰기 양쪽 지원 가능하게 dual-write 유지 검토
- DROP 후 롤백은 `wines_backup_pre_v5`에서 컬럼 복원 + 데이터 재이전

### 중간 실패 대비
- Phase 2.9a / 2.9b 각각 독립 커밋
- 배포 후 문제 생기면 해당 커밋만 revert
- `wines_backup_pre_v5`는 Phase 2.9 완료 후 수 일 유지 (실 유저 소수라 길게 안 둬도 됨)

---

## 5. 의존성 / 선행 조건

- [ ] `wines_backup_pre_v5` 테이블 존재 (Phase 0에서 생성)
- [ ] 기존 `raw_wines` ↔ wines 독립 원칙 유지 (변경 없음)
- [ ] `vivino_reviewed_at` 서빙 노출 조건 정책 유지 (reviewed_at IS NOT NULL일 때만)

---

## 6. 진행 기록

세션마다 이 파일 하단에 간단히 기록:

```
## 세션 로그
### 2026-MM-DD (세션 N)
- 완료: 1.1 ~ 1.3
- 미결: 1.4 (와인 상세 페이지만 남음)
- 이슈: ...
```
