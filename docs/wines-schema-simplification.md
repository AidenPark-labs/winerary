# wines 스키마 단순화 (v4 → v5) — 작업 문서

> **상태**: 📋 **계획 단계**. 실행은 별도 세션에서.
> 이 문서는 다음 세션이 컨텍스트 없이도 이어받을 수 있도록 충분히 상세하게 작성됨.
> 마지막 업데이트: 2026-04-24

---

## 1. 배경

### 왜 이 작업이 필요한가

DB 재설계 v3~v4를 거치면서 wines 테이블에 동일 개념의 중복 컬럼이 누적됨. 현재 60 컬럼 중 절반 이상이 같은 개념 표현. 결과:

- 어느 컬럼을 읽어야 맞는지 개발자마다 혼동
- `wine-display.ts`에 긴 fallback 체인 필요
- promote / merge / edit 코드가 "어느 컬럼에 쓸지" 매번 결정 필요
- 이번 세션에서만 alcohol 관련 버그 2회, 스키마 오해로 인한 버그 여러 번 발생

**목표**: wines를 서빙용 정규 스키마로 재편 (~25 컬럼). 소스별 원본은 `source_snapshot` jsonb로 이동.

### 언제부터

이번 대화 세션(2026-04-23 ~ 24) 끝에 사용자가 "최종적으로는 급진적 정리"를 원한다고 밝힘. 단, 같은 세션에서는 위험이 크므로 **별도 세션으로 분리**.

---

## 2. 이번 세션에서 한 작업 요약 (v4)

다음 세션이 들어왔을 때 "이미 뭐가 되어 있는지" 파악할 수 있도록.

### 2.1 새 아키텍처 원칙 확정

- `raw_wines` = **크롤링 원본 전용** (wine21 / winenara / gangnam / naver_shopping)
- `wines` = **서비스 상태**, 어드민이 자유롭게 편집
- **둘은 독립 레이어.** 동기화 시도 금지. `raw_wines.promoted_wine_id`는 FK 제약 없는 단순 기록.
- admin 추가 / pending 승인 등 "크롤링 아닌" 경로는 `wines` 직접 INSERT (raw_wines 안 거침).

관련 메모리: `feedback_raw_wines_wines_independent.md`, `project_db_schema_current.md`

### 2.2 새 정책 — wines 진입 조건 (4필드)
`name_ko + name_en + country + grape` 전부 있어야 함. winery는 필수 아님.

### 2.3 품종 정책
- wine21: `raw_payload.parsed_grape_varieties` 중 [A] 필터 통과분만 (파싱된 품종이 name_en에 실제 substring으로 존재)
- 나머지 소스: `raw_wines.grape_variety` 컬럼
- **Vivino 출처 품종 사용 금지**

### 2.4 Vivino 자동 승격
- `raw_payload.vivino_match_score >= 0.9` → `vivino_reviewed_at = now()` 자동
- 미만 → `vivino_needs_review = true`, 비노출
- **Vivino 매칭 실패가 wines 진입을 막지 않음** (이전 사고 근본 원인 해결)

### 2.5 적용된 마이그레이션 (DB에 반영됨)
- `20260421_vivino_needs_review.sql` — SALVAGED 마킹 플래그
- `20260421_wine_reports.sql`, `20260421_wine_reports_fix_resolved_by.sql` — 와인 신고 테이블
- `20260422_vivino_reviewed_at.sql` — 재검수 이력 컬럼
- `20260422_wine_dedupe_candidates.sql` — 중복 검수 큐 테이블
- `20260423_restore_is_published.sql` — `is_published` 재도입 + RLS 복구
- `20260424_decouple_raw_wines_fk.sql` — `raw_wines.promoted_wine_id` FK 제거
- `20260424_add_wines_alcohol.sql` — `wines.alcohol` 일반 컬럼 추가

### 2.6 주요 스크립트 (모두 main에 병합됨)
- `scripts/promote-v2.ts` — raw → wines 승격 (dry-run/apply)
- `scripts/audit-existing-wines.ts` — wines 감사
- `scripts/backfill-strip-vintage.ts` — name에서 빈티지 제거 (실행 완료: 134건)
- `scripts/merge-vintage-duplicates.ts` — 빈티지만 다른 wines merge (실행 완료: 12그룹)
- `scripts/backfill-orphan-wines-to-raw.ts` — data_source='user_submission' 고아 wines raw 역삽입 (실행 완료: 3건, **※ 이 backfill은 원칙 재정립 이전이라 실은 불필요했음. 남아있지만 무해**)

### 2.7 어드민 UI 4종 (프로덕션 배포 완료)
- `/admin/vivino-review` — Vivino 매칭 검수. K/U/S, 좌측 wines 필드 편집, 우측 Vivino URL 교체
- `/admin/dedupe-review` — 중복 검수. M/D/S. 533건 pending
- `/admin/raw-wines` — 크롤링 raw 조회·편집·승격. "+ wines에 직접 추가" 모달
- `/admin/pending-wines` — 유저 제출 승인. **wines에 직접 INSERT** (raw 거치지 않음)

### 2.8 promote-v2 실행 결과
- wines 8,507 → **20,599** (+12,092 신규)
- `wine_dedupe_candidates` pending 533건
- `pending_wines` 재연결 19건
- 기존 wines 감사: 4필드 준수 99.99%

### 2.9 현 시점 DB 상태 (핵심만)
- wines 총: 약 20,603 (빈티지 merge 후 +12 secondary가 `is_published=false`로 숨겨짐)
- 컬럼 수: 60 + alcohol 추가 = **61** (새 migration 적용 전제)
- source 분포: wine21 17,205 · naver_shopping 2,048 · gangnam 992 · winenara 351 · user_submission 3

---

## 3. 목표 스키마 (v5, 약 20 컬럼)

```
[식별]
  id, source, source_refs (uuid[]), source_snapshot (jsonb), created_at, updated_at

[이름]
  name_ko, name_en

[분류]
  wine_type, wine_style

[지리]
  country_ko, region_ko

[와인 정보]
  producer, grape_varieties (text[]), alcohol, brand, price

[서빙]
  description, image_url, is_published

[검색]
  search_tsv, search_jamo, embedding, embedded_at, search_query_en

[어드민]
  locked_fields
```

### 분리된 테이블: `vivino_wines`

Vivino 크롤링 데이터는 **별도 테이블로 분리** (2026-04-24 추가 결정).
raw_wines가 크롤링 원본 전용이듯, vivino_wines는 Vivino 크롤링 전용.

```sql
CREATE TABLE vivino_wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wine_id uuid UNIQUE,  -- FK 없는 단순 기록 (raw_wines.promoted_wine_id 원칙과 동일)

  -- Vivino 식별
  vivino_url text NOT NULL UNIQUE,
  vivino_page_url text,
  vivino_wine_id text,
  vivino_name text,

  -- 메트릭
  rating numeric(2,1),
  reviews integer,

  -- 상세
  winery text,
  grapes text,
  region text,
  style text,
  alcohol text,
  description text,
  allergens text,
  image_url text,
  image_storage text,

  -- 검수 / 매칭 신뢰도
  needs_review boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  match_score numeric,
  match_failed boolean DEFAULT false,

  -- 운영
  scraped_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  raw_payload jsonb
);
CREATE INDEX vivino_wines_wine_id_idx ON vivino_wines (wine_id) WHERE wine_id IS NOT NULL;
CREATE INDEX vivino_wines_needs_review_idx ON vivino_wines (needs_review) WHERE needs_review = true;
```

**wines에서 제거될 15개 컬럼:**
`vivino_url / vivino_page_url / vivino_wine_id / vivino_rating / vivino_reviews / vivino_winery / vivino_grapes / vivino_region / vivino_style / vivino_alcohol / vivino_description / vivino_allergens / vivino_name / vivino_needs_review / vivino_reviewed_at`

**관계:**
- `wines` 1 : 0..1 `vivino_wines` (wine_id UNIQUE)
- FK 없음 (독립 레이어 원칙)
- 조회 시 JOIN 또는 별도 쿼리

**유저 화면에 vivino 표시 조건 (기존과 동일):**
`vivino_wines.reviewed_at IS NOT NULL`일 때만 rating/url 노출

## 4. 제거·통합 매핑

| 현재 (제거 대상) | → 목표 |
|---|---|
| `producer` / `producer_ko` / `producer_en` / `winery_en_clean` / `vivino_winery` / `final_producer` | **`producer`** |
| `grape_variety` / `grape_varieties_ko` / `vivino_grapes` / `final_grapes` | **`grape_varieties`** (배열) |
| `country` / `country_ko` / `final_country` | **`country_ko`** |
| `region` / `region_path` / `vivino_region` / `region_ko` / `final_region` | **`region_ko`** |
| `wine_style` / `wine_style_ko` / `vivino_style` / `final_style` | **`wine_style`** |
| `alcohol` / `vivino_alcohol` / `gangnam_alcohol` / `final_alcohol` | **`alcohol`** |
| `description` / `vivino_description` / `final_description` | **`description`** |
| `final_wine_type` | `wine_type`으로 통합 |
| `data_source` | `source` 하나로 |
| `naver_link` / `naver_image` | `source_snapshot.naver` jsonb |
| `vivino_url` / `vivino_page_url` / `vivino_wine_id` / `vivino_rating` / `vivino_reviews` / `vivino_winery` / `vivino_grapes` / `vivino_region` / `vivino_style` / `vivino_alcohol` / `vivino_description` / `vivino_allergens` / `vivino_name` / `vivino_needs_review` / `vivino_reviewed_at` | **신규 `vivino_wines` 테이블로 이동** (이전 안은 `source_snapshot.vivino` jsonb였으나 별도 테이블로 변경) |
| `gangnam_alcohol` | `source_snapshot.gangnam` jsonb |

**wines에서 유지되는 Vivino 흔적**: 없음. 모두 `vivino_wines` 테이블로 분리.

---

## 5. 이행 로드맵

### Phase 0 — 백업
```sql
CREATE TABLE wines_backup_pre_v5 AS SELECT * FROM wines;
```
migration 파일로 남기되 한 달 유지 후 삭제. **이건 반드시 첫 작업.**

### Phase 1 — `source_snapshot` 구조 정의 및 backfill
- `source_snapshot` jsonb 스키마 정의:
  ```jsonc
  {
    "vivino": {
      "name": "...", "winery": "...", "grapes": "...",
      "region": "...", "style": "...", "alcohol": "...",
      "description": "...", "allergens": "...",
      "page_url": "...", "wine_id": 123,
      "scraped_at": "...", "match_score": 0.9
    },
    "gangnam": { "alcohol": "..." },
    "naver": { "link": "...", "image": "..." }
  }
  ```
- 백필 스크립트 (`scripts/backfill-source-snapshot.ts`): 기존 `vivino_*` / `gangnam_*` / `naver_*` 컬럼 → `source_snapshot` JSON 복사
- 기존 컬럼은 그대로 유지 (읽기·쓰기 모두). 이 단계는 중단 없음.

### Phase 2 — 개념별 정리 (8 사이클)
순서: `alcohol` → `wine_style` → `description` → `wine_type` → `grape_varieties` → `region` → `producer` → `country` → **`vivino_*` (별도 테이블로 분리)**

#### Phase 2.9 — Vivino 분리 (별도 테이블)

다른 사이클과 성격 다름. 컬럼 통합이 아니라 **테이블 분리** + **전체 Vivino 흐름 재배선**.

### 영향 범위 (실측)
코드베이스 전수 스캔 결과:
- `src/` 에서 vivino_* 컬럼 참조: **31 파일** (유저 서빙 + 어드민 + API + 타입)
- `scripts/` 에서 참조: 68 파일 (대부분 일회성 분석 스크립트, 활성 경로 ~10개)
- 단순 DB 분리가 아니라 **크롤링·수집·검수·표시의 전체 경로 재작성**

### 분할 실행

**2.9a — 테이블 생성 + 읽기 경로만 JOIN 전환** (wines 컬럼 유지, 롤백 가능)

**2.9b — 쓰기 경로 교체 + 검증 + DROP**

### 상세 체크리스트
➡ **`docs/phase-29-vivino-separation-checklist.md`** 참조.
- 영향받는 파일 전수 목록 (~40 활성 경로)
- sub-phase 별 체크박스
- 롤백 가이드
- 세션 로그 템플릿

### 주요 영향 그룹
1. **수집 계층**: `scripts/scrape-vivino-raw.ts`(raw_wines 대상이라 영향 없음), `crawl-vivino-*.ts`, `update-wine-from-vivino.ts`, `rematch-vivino-v4.ts`, `restore-vivino-from-raw.ts`
2. **어드민 수집/편집**: `/admin/wines/actions.ts` (updateWineVivino / clearWineVivino), `/admin/wines/WinesClient.tsx` 버튼들
3. **Vivino 검수 UI**: `/admin/vivino-review/*` (page / ReviewClient / actions — confirm / unlink / replaceVivinoUrl)
4. **중복 검수 merge**: `/admin/dedupe-review/actions.ts` (confirmDedupe 내 vivino 병합)
5. **Promote 경로**: `scripts/promote-v2.ts`, `src/lib/promote-raw-wine.ts` (buildVivinoFields 계열)
6. **편입 승인**: `/api/admin/pending-wines/route.ts` (insertWineDirectly 호출하므로 5번 반영 시 자동 따라옴)
7. **유저 서빙**: `/wines/[id]`, `/dictionary`, `/find`, `/diary`, `/wishlist`, `/recommend`, `/invite` + API 9개 + `wine-display.ts`, `wine-search.ts`
8. **신고**: `/admin/reports/*` (와인 정보 표시 영역)
9. **타입**: `src/types/index.ts`

### 작업량 추정
- 2.9a: 1~2 세션
- 2.9b: 2~3 세션
- 총 **3~5 세션**. 한 세션당 최소 하나의 완전한 sub-phase.

각 개념마다:
1. 정규 컬럼 1개 결정 (이미 있으면 사용, 없으면 추가)
2. 백필 스크립트: 모든 fallback 소스에서 정규 컬럼으로 값 복사 (NULL인 경우만)
3. `src/lib/wine-display.ts`의 fallback 체인을 단일 컬럼 참조로 변경
4. 유저 측 조회 경로 수정:
   - `src/app/(app)/wines/[id]/page.tsx`
   - `src/app/(app)/dictionary/page.tsx`
   - `src/app/(app)/find/page.tsx`
   - `src/app/api/ai/recommend/route.ts`
   - `src/app/api/wines/search/route.ts`
   - `src/lib/wine-search.ts`
   - 기타 `from("wines").select(` 전부
5. 어드민 측 수정:
   - `src/app/admin/vivino-review/*` (편집 UI 필드)
   - `src/app/admin/dedupe-review/actions.ts` (fillIfEmpty 매핑)
   - `src/app/admin/raw-wines/*`
   - `src/app/admin/wines/WinesClient.tsx` / `actions.ts`
6. promote 쪽 수정:
   - `scripts/promote-v2.ts` buildInsertRow / autoMerge
   - `src/lib/promote-raw-wine.ts` promoteSingleRawWine / insertWineDirectly / autoMerge
7. 검증 ≥ 1주 (유저 기록 영향 없는지 모니터링)
8. 기존 컬럼 DROP migration 작성 + 실행

### Phase 3 — 검색 인프라 재생성
- `search_tsv`, `search_jamo`, `embedding`은 정규 컬럼 기반으로 재계산
- 재계산 스크립트 작성 + 실행

### Phase 4 — 최종 확인 + legacy 제거
- `data_source` → `source` 통합 DROP
- `final_*` 컬럼 전부 DROP (어드민 오버라이드는 이제 정규 컬럼 직접 편집으로 해결)
- `wines_backup_pre_v5` 테이블 DROP (한 달 경과 확인)

---

## 6. 위험 관리

> **맥락 (2026-04-24)**: 와이너리는 실 유저 2명뿐인 초기 프로젝트.
> wine_records 62 / pending_wines 41 / 그 외 이벤트·찜·신고 소수.
> 따라서 아래 "가드"는 큰 서비스 수준이 아니라 이 규모에 맞춰 적용.

### 6.1 반드시 지킬 것 (non-negotiable)
- `wine_records.wine_id` / `pending_wines.promoted_wine_id` FK 무결성 (유저 기록 보존)
- merge/dedupe/삭제 시 유저 기록 재지정 누락 금지
- `raw_wines` append-only (복구 소스)
- 배포 전 타입체크 + 빌드 정상 확인
- 각 사이클 완료 후 `grep` 전수 스캔으로 legacy 참조 남김 없음 확인

### 6.2 완화 가능한 관례
실 유저 영향 미미하므로 다음은 **생략 가능**:
- ~~"배포 후 최소 1주 관찰 후 DROP"~~ → 검증 끝나면 즉시 DROP 가능 (문제 생기면 수 시간 내 복구)
- ~~"한 Phase = 한 세션"~~ → 한 세션에 여러 sub-phase 묶어도 됨
- ~~백업 테이블 한 달 유지~~ → 수 일이면 충분

### 6.3 백업 권장
- Phase 0의 `wines_backup_pre_v5` 전체 복사본 (수 일 유지)
- 각 개념별 대량 UPDATE 전에는 해당 컬럼만 백업 테이블에 덤프

### 6.4 롤백 전략
- 각 sub-phase 독립 커밋으로 `git revert` 가능
- DB 변경은 backup 테이블 + 역방향 migration

### 6.5 frontend 확인
배포 후 5~10개 임의 와인의 상세 페이지 / 사전 / 검색 / 다이어리 빠르게 확인.

### 6.6 search_tsv / search_jamo
컬럼 변경 시 트리거 확인 + 필요하면 재계산 스크립트.

---

## 7. 현재 상태 (Phase 0 이전)

| 항목 | 상태 |
|---|---|
| 백업 테이블 | ❌ 아직 없음 (Phase 0 첫 작업) |
| source_snapshot 컬럼 | ✅ 이미 존재 (migration에 없는 silent 컬럼. 스키마 감사 메모리 참조) |
| `alcohol` 정규 컬럼 | ✅ 추가 완료 (migration `20260424_add_wines_alcohol.sql`) |
| `wine-display.ts` alcohol fallback | ⚠️ `final_alcohol ?? alcohol ?? vivino_alcohol ?? gangnam_alcohol` — 아직 통합 안 됨 |
| promote 경로 alcohol | ✅ raw.alcohol → wines.alcohol 저장 경로 복구됨 |
| 기존 vivino_alcohol / gangnam_alcohol 데이터 backfill | ❌ 아직 안 됨 |

**즉 alcohol만 Phase 2의 1~2단계(정규 컬럼 생성·promote 경로 연결)가 시작된 상태.** 완전한 Phase 2 사이클은 안 돌았음.

---

## 8. 다음 세션 시작 절차

### 8.1 컨텍스트 확인
1. 이 문서 전체 읽기
2. 메모리 파일 확인:
   - `memory/project_db_schema_current.md` (2026-04-23 감사)
   - `memory/feedback_raw_wines_wines_independent.md`
3. 실제 DB 상태 확인:
   ```
   NODE_ENV=development npx tsx scripts/audit-existing-wines.ts
   ```

### 8.2 시작 체크리스트
- [ ] Phase 0 백업 migration 작성·실행 (`20260425_backup_wines_pre_v5.sql`)
- [ ] Phase 1 source_snapshot 구조 설계 (JSON 스키마 정의 문서로)
- [ ] 백필 스크립트 dry-run
- [ ] 백필 실행 후 검증 (샘플 20건 확인)
- [ ] Phase 2 alcohol 사이클 — 가장 작고 이미 부분 진행된 개념. 여기서 전체 프로세스 검증.

### 8.3 첫 Phase 2 사이클 (alcohol) 상세 계획

1. **이미 완료**: `wines.alcohol` 컬럼 존재, promote 경로 연결됨
2. **할 일 1**: backfill migration — NULL인 `wines.alcohol`을 `vivino_alcohol → gangnam_alcohol → final_alcohol` 순으로 복사
3. **할 일 2**: `wine-display.ts` fallback을 `alcohol` 하나만 읽도록 변경
4. **할 일 3**: grep으로 모든 `vivino_alcohol`, `gangnam_alcohol`, `final_alcohol` 참조 찾아 `alcohol` 우선으로 변경
5. **할 일 4**: 배포 + 1주 관찰
6. **할 일 5**: 위 3개 컬럼 DROP migration + 실행

이 사이클이 성공적이면 다음 개념(wine_style)으로. 전체 7개 개념이므로 약 7주 일정.

---

## 9. 관련 파일 목록

### 이 작업에 반드시 영향받는 파일
- `src/lib/wine-display.ts` — 모든 fallback 로직의 중심
- `src/lib/promote-raw-wine.ts` — promoteSingleRawWine / insertWineDirectly / autoMerge
- `scripts/promote-v2.ts` — buildInsertRow / fetchBatch / autoMerge
- `src/app/admin/vivino-review/ReviewClient.tsx` — 좌측 wines 편집 UI 필드
- `src/app/admin/vivino-review/actions.ts` — updateWineFields
- `src/app/admin/dedupe-review/actions.ts` — fillIfEmpty 매핑
- `src/app/admin/raw-wines/RawWinesClient.tsx`, `actions.ts`
- `src/app/admin/wines/WinesClient.tsx`, `actions.ts`
- `src/app/(app)/wines/[id]/page.tsx` — 유저 상세 페이지
- `src/app/(app)/dictionary/page.tsx`, `src/app/(app)/find/page.tsx`
- `src/app/api/ai/recommend/route.ts`, `src/app/api/wines/search/route.ts`
- `src/lib/wine-search.ts`
- `src/types/index.ts` — 타입 정의

### 참고용 문서
- `docs/wines-redesign-plan-v3.md` — 이전 재설계 문서 (v3)
- `docs/wines-redesign-plan.md` — 더 이전
- `docs/wine-db-enrichment-plan.md`
- 이 문서 (`docs/wines-schema-simplification.md`) — v5 단순화 계획

---

## 10. 결정된 것 vs 미결정

### 결정
- 최종 목표는 ~25 컬럼 (위 섹션 3)
- 단계적 이행 (Phase 0 → 4)
- 각 개념 정리 시 약 1주 관찰 후 DROP
- `vivino_url`, `vivino_rating`, `vivino_reviews`, `vivino_needs_review`, `vivino_reviewed_at`은 서빙용으로 유지

### 미결정 (다음 세션이 판단)
- `final_*` 컬럼 완전 제거 vs `locked_fields` 메커니즘으로 대체
- `source_snapshot` jsonb 내부 스키마의 세부 형식 (위는 초안)
- `brand` 컬럼 유지 여부 (LLM 추출값이라 신뢰도 점검 필요)
- Phase 2 순서 조정 (alcohol 먼저 vs 가장 영향 큰 `grape_varieties` 먼저)
- 백업 테이블 유지 기간 (1개월 vs 더 길게)
- Phase 2.9 Vivino 분리 시 `vivino_wines.wine_id` FK 제약 둘지, 안 둘지 (현재 raw_wines 원칙처럼 FK 없음으로 제안. wines 삭제 시 orphan 용인)

### 질문할 사람: 기존 결정자
- 2026-04-21 사고 관련 메모리 참조
- 사용자의 "precision 우선" 원칙 — 의심되면 놓치더라도 정확하게

---

## 11. 이 작업을 시작하는 세션에게

1. 이 문서를 **단순한 계획이 아니라 계약**처럼 여길 것. 사용자가 의도적으로 "별도 세션"으로 분리한 것은 이 작업의 위험을 관리하기 위함.
2. **한 Phase = 한 세션** 원칙을 권장. alcohol 사이클 하나가 한 세션. 다음 개념은 다음 세션.
3. DROP migration은 절대 서두르지 말 것. 사용자가 "precision 우선" 원칙을 여러 번 강조함.
4. 사용자의 이전 사고(2026-04-20~21 wines 17,267→8,507 삭제 사고)를 참고. 같은 실수 반복 금지.
5. 이 문서 자체도 진행되면서 업데이트 필요. 세션마다 "완료된 Phase / 다음 Phase" 섹션 갱신.

**문서 업데이트는 이 파일에 직접.** 이력 쌓기.
