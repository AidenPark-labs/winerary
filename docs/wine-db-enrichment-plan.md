# 와인 DB Enrichment 플랜

> 작성일: 2026-04-11 (2026-04-12 갱신)
> 목적: 마이그레이션(wines-redesign-plan.md) 실행 전, wines 카탈로그를 실용 가능한 수준으로 보강
> 상태: **전략 정리 완료, 크롤 실행은 별도 세션에서 진행**

---

## 왜 enrichment가 먼저인가

재설계된 스키마는 **와인 DB에 정보가 있다는 전제**로 동작합니다:
- `wine_records`에서 이름/생산자/국가/품종 중복 저장을 제거
- 표시·검색·분류 모두 `wines.wine_type`, `wines.country`, `wines.grape_variety` 등을 참조
- view `wine_records_enriched`의 COALESCE 체인이 의미 있으려면 카탈로그 채움이 필요

현재 상태로 마이그레이션하면 **대부분 필드가 NULL**이라 사용자는 기록할 때마다 override를 입력해야 하고, 검색 필터(국가별, 품종별)가 거의 동작하지 않습니다.

---

## 핵심 원칙 (저작권/저장 가능 데이터)

이번 세션에서 확립된 원칙:

| 카테고리 | 저장 가능 여부 | 사례 |
|---|---|---|
| **사실 데이터** | ✅ 저장 가능 | wine_type, country, region, grape, alcohol, vivino_rating, reviews_count |
| **단순 포인터(URL)** | ✅ 저장 가능 | vivino_url, naver_link |
| **창작물 텍스트** | ❌ 직접 저장 불가 | description, tasting note (Naver/Vivino 모두) |
| **워터마크 이미지** | ❌ 사용 불가 | Naver 백과사전 thumbnail |
| **타사 호스팅 이미지** | ⚠️ 링크만, 자체 호스팅 X | vivino 이미지 (워터마크 없으나 저작권 불명) |

→ description류는 **외부 링크로 사용자가 직접 확인**하도록 유도. 자체 description 생성은 후속 LLM 합성 단계에서 검토 (옵션 B 보류 중).

---

## 현재 수집 상태

### wine21 (33,722건, 2026-04-10 수집)
- **보유**: `name_ko`, `name_en`, `producer_ko`, `producer_en`, `source_id`
- **누락**: `wine_type`, `country`, `region`, `grape_variety`, `alcohol`
- **즉시 복구 가능 1**: wine21 수집 청크가 `WINE_TYPE(6) × WINE_NATION(12) = 72청크`로 구성. 청크 메타만으로 `wine_type + country` 복구 가능 (수집 스크립트가 저장 안 했을 뿐).
- **즉시 복구 가능 2**: wine21 list page HTML에 `wine_type`, `country`, `region(area)`, `price`가 이미 노출되고 있음 (`<span class='country'>`, `<span class='nation'>`, `.board-badge`). 추출 로직만 추가해서 재크롤하면 됨.
- **상세 페이지 필요 데이터**: `grape_variety` (한글+영문, 비율 포함), 당도/산도/바디/타닌 프로필, 페어링 정보. 단 페이지당 별도 크롤 필요 (33,722건 부담).

### legacy wines (3,493건)
- 다양한 필드 존재 (기존 Vivino 보강, Naver 쇼핑 데이터)
- 29.5%(1,031건)가 wine21과 겹침
- 겹침 구간의 95%는 이미 Vivino 보강됨
- legacy 전용(wine21에 없음): 2,462건

### Naver 백과사전 API
- 무료, 일일 25,000 호출 한도
- 와인21이 원본 출처라 매칭률 매우 높음
- **PoC 결과 (50건 샘플, 2026-04-12)**:
  - 매칭률 96% (48/50)
  - 정확 매칭(score≥0.95) 96%
  - 0건 결과 4% (2건 — fallback query 필요)
  - description 누락/짧음 7건
  - thumbnail HEAD OK 4/5

### Naver API 응답 필드와 활용성
| 필드 | 저장 가능 | 활용 |
|---|---|---|
| `title` | ✅ | 이미 보유 (검증용) |
| `link` | ✅ | "네이버 백과사전에서 보기" 외부 링크 |
| `description` | ❌ | 창작물 — 직접 저장 불가, LLM 합성 베이스 소스로만 활용 검토 중 |
| `thumbnail` | ❌ | 워터마크 |

### Vivino
- 크롤러: `src/lib/vivino-crawler.ts` 존재
- 추출 필드: `winery`, `grapes`, `region`, `style`, `alcohol`, `description`, `rating`, `reviews`
- PoC 검증 (50건): 단순 크롤 82%, 교차검증+LLM 후 신뢰 72%
- LLM 비용: 33k 기준 $0.60~$1.70

### Vivino 필드 저장 가능성
| 필드 | 저장 가능 | 비고 |
|---|---|---|
| `vivino_url`, `vivino_wine_id` | ✅ | 단순 포인터 |
| `vivino_rating`, `vivino_reviews` | ✅ | 사실 |
| `vivino_winery`, `vivino_grapes`, `vivino_region` | ✅ | 사실 |
| `vivino_alcohol`, `vivino_style` | ✅ | 사실 |
| `vivino_allergens` | ✅ | 라벨 표시 사실 |
| `vivino_description` | ❌ | 창작물 |
| `vivino_image` (있는 경우) | ⚠️ | 워터마크 없음. 자체 호스팅 회피, 링크만 |

---

## Enrichment 전략

세 소스를 **목적별로 분담**, 각 소스는 자기가 가장 잘 하는 일만 담당.

### Track A: wine21 list page 재크롤 (구조화 필드 1차)

**목적**: `wine_type`, `country`, `region`, `price` 채움 (자체 데이터, 무료, 빠름)

**방법**:
1. `scripts/collect-wine21.ts`의 `EXTRACT_SCRIPT` 수정
   - `.country`, `.nation`, `.board-badge`, `.price` 추가 추출
2. `processChunk()`에서 청크 메타로 `wine_type`, `country` 백필 (HTML 추출 결과 교차검증)
3. `upsertBatch()` payload에 새 필드 추가
4. 전체 재크롤 (UNIQUE upsert로 idempotent UPDATE)

**예상 결과**: 33,722건 전부 wine_type/country/region 채움 (region은 wine21이 분류한 단위)
**시간**: 약 40분
**비용**: $0

---

### Track B: Vivino 크롤 (사실 필드 + 평점)

**목적**: `grape_variety`, `alcohol`, `vivino_url`, `vivino_rating`, `vivino_ratings_count`

**방법**:
1. `scripts/scrape-vivino-raw.ts` 작성
   - 대상: `raw_wines WHERE vivino_scraped_at IS NULL`
   - PoC 검증 로직 통합 (producer 매칭 + LLM 판정)
   - 사실 필드만 저장. **`vivino_description`은 raw_payload에 임시 보관**, 최종 wines 테이블에는 저장 안 함
2. 병렬화: 동시 4개 브라우저
3. 체크포인트 100건마다, 재개 지원
4. 야간 실행

**예상 결과**: 약 72%(24,000건) 매칭 성공
**시간**: 8~12시간
**비용**: $1~$3 (LLM 검증)

---

### Track C: Naver 백과사전 API (외부 링크)

**목적**: 사용자가 외부에서 시음 노트/상세 정보 확인할 수 있는 link 제공

**방법**:
1. `scripts/enrich-naver-link.ts` 작성
2. raw_wines 각 와인에 대해 `name_ko`로 검색 API 호출
3. 매칭된 첫 결과의 `link`만 저장 (description, thumbnail 무시)
4. 일일 25,000 호출 한도 → **2일에 분산**
5. 체크포인트 + daily quota tracker
6. 0건 fallback 별도 처리 (producer 단독 query 등)

**예상 결과**: 약 96% 매칭 (PoC 기준)
**시간**: 2일에 걸쳐 약 3시간 active
**비용**: $0

**주의**: `description`은 저작권 문제로 wines 테이블에 저장 안 함. 단, **옵션 B 합성 방식 채택 시**에만 raw_payload에 임시 보관 (사용자 검토 중).

---

### Track D: 합성 LLM 패스 (보류 — 옵션 B 검토 중)

**옵션 A (텍스트 합성)**:
- Naver + Vivino description을 LLM에 입력 → 한국어 자체 description 생성
- 장점: 자연스러운 텍스트
- 리스크: derivative work 논란 가능

**옵션 B (구조화 추출)** ← 사용자 검토 중:
- description에서 사실 정보만 추출 → `tasting_profile jsonb`
- 예: `{ color, aromas[], palate[], body, sweetness, acidity, tannin, finish }`
- 장점: 사실만 저장 (저작권 안전), 검색/필터/추천에 활용 가능
- 단점: 표시 텍스트가 다소 기계적

**상태**: 옵션 B 채택 여부 미결정. 결정 후 실행 예정.

---

### 우선순위

| 순서 | Track | 시간 | 비용 | 의존성 | 상태 |
|---|---|---|---|---|---|
| 1 | A: wine21 list 재크롤 | 12분 | $0 | 없음 | ✅ 완료 (2026-04-12) |
| 2 | C: Naver link 수집 | ~4h (2일) | $0 | 없음 | ✅ 완료 (2026-04-13) |
| 3 | B: Vivino 크롤 | 8~12h 야간 | $1~$3 | 없음 | ⏳ 대기 |
| 4 | D: 합성 LLM (조건부) | 1~2h | ~$20 | A+B+C 완료, 옵션 B 채택 결정 | ⏳ 보류 |

---

## 성공 기준

마이그레이션으로 넘어가도 되는 조건:

1. **커버리지**
   - `wine_type` 채움률 ≥95% (Track A)
   - `country` 채움률 ≥95% (Track A)
   - `region` 채움률 ≥80% (Track A)
   - `grape_variety` 채움률 ≥60% (Track B)
   - `alcohol` 채움률 ≥50% (Track B)
   - `vivino_url` 채움률 ≥70% (Track B)
   - `naver_link` 채움률 ≥90% (Track C)
2. **품질**
   - 랜덤 100건 스팟체크 정확도 ≥90% (wine_type/country)
   - 랜덤 50건 Vivino 매칭 검토 정확도 ≥70%
3. **사용자 시뮬레이션**
   - 실제 "와인 검색 → 매칭 → 인식 확인" 플로우 10건 수동 테스트
   - description 없이도 사용자가 와인을 인식 가능한지 (메타데이터만으로 충분한지)

---

## 리스크

| 리스크 | 완화 |
|---|---|
| Vivino rate limiting | 병렬 수 낮춤 (4→2), 요청 간격 추가 |
| Vivino 구조 변경으로 크롤러 깨짐 | PoC 재검증, 선택자 업데이트 |
| Naver API 일일 한도 초과 | 24,500 안전 마진, 체크포인트 + 다음날 재개 |
| wine21 재크롤 차단 | 기존 청크 구조 + 5초 간격 유지, 동일 UA |
| LLM 판정 오류 (Vivino) | 랜덤 샘플 수동 검토 |
| 카탈로그에 description 없음으로 인한 인식 어려움 | Track A+B+C 완료 후 사용자 시뮬레이션으로 검증, 부족하면 옵션 B 진행 |

---

## 실행 기록

### Track A 결과 (2026-04-12)
- **스크립트**: `scripts/collect-wine21-v2.ts` (AJAX 직접 호출, puppeteer 폐기)
- **발견**: wine21 AJAX 엔드포인트(`proc_wine_list_more.php`)가 JSON으로 전체 필드 반환. 템플릿이 안 쓰는 strALCOHOL, strTEMPERATURE, strUSE_TYPE, dVINTAGE 등 포함.
- **결과**: 34,985건 적재 (2건 wine21 서버 500 — 자동 fallback 회수 후 1건만 손실)
- **채움률**: wine_type 100%, country 100%, region 100%, alcohol_range(raw_payload) 61%
- **wine21 이미지 워터마크 확인됨** → image_url 사용 불가, raw_payload.image_path만 보관
- **grape_variety(strVARIETY_NAME)는 리스트 AJAX에서 항상 빈 문자열** → 상세 페이지 또는 Vivino 필요

### Track C 결과 (2026-04-12~13)
- **스크립트**: `scripts/enrich-naver-link.ts`
- **결과**: 34,919건 처리, **31,540건 매칭 (90.3%)**
- **저장 위치**: `raw_payload.naver_link` (URL), `raw_payload.naver_match_score`
- **API 호출**: 37,577 (Day1 24,500 + Day2 13,077)
- 0건: 616 (1.8%), 저점수: 2,694 (7.7%), 에러: 69 (0.2%)

### 이전 세션의 발견 (참고)
- **Naver 썸네일 워터마크 있음** — 사용 불가
- **Vivino 이미지는 워터마크 없음** — 단 자체 호스팅은 저작권 회피, 링크만
- **description은 모두 창작물** — Naver/Vivino 모두 직접 저장 불가
- **`promote-wine21-names-only.ts` 실행 완료 (2026-04-12)**: 32,917건 wines INSERT, 805건 스킵 (legacy 충돌). 검색 기능 검증 완료.

---

## 재사용 가능한 자산

| 파일 | 역할 | 상태 |
|---|---|---|
| `scripts/collect-wine21.ts` | wine21 수집기 v1 (puppeteer) | **v2로 대체됨** |
| `scripts/collect-wine21-v2.ts` | wine21 수집기 v2 (AJAX) | ✅ Track A 완료 (2026-04-12) |
| `scripts/enrich-naver-link.ts` | Naver 백과사전 link 수집 | ✅ Track C 완료 (2026-04-13) |
| `scripts/poc-naver-encyc.ts` | Naver API PoC (50건) | 참고용 |
| `scripts/promote-wine21-names-only.ts` | wine21 → wines 이름만 promote | 실행 완료 (2026-04-12) |
| `scripts/analyze-wine21-overlap.ts` | wine21 ↔ legacy 겹침 분석 | 참고용 |
| `scripts/test-vivino-wine21.ts` | Vivino PoC | 참고용, Track B 베이스 |
| `scripts/validate-vivino-poc.ts` | Vivino 검증 (producer + LLM) | Track B 통합 |
| `src/lib/vivino-crawler.ts` | Vivino 크롤러 | 그대로 재사용 |
| `supabase/migrations/20260410_raw_wines_and_publish_gate.sql` | staging 스키마 | **마이그레이션 미적용 상태** (`wines.is_published` 컬럼 없음 확인) |

---

## 다음 세션에서 할 일

이 세션은 DB 구조 재설계 토론 중심이었으므로, **enrichment 크롤 작업은 별도 세션**에서 진행한다.

다음 세션:
- [x] Track A 완료 (2026-04-12)
- [x] Track C 완료 (2026-04-13)
- [ ] Track B: Vivino 크롤 (grape_variety, alcohol, vivino_rating)
- [ ] Track D: LLM 합성 (옵션 B 채택 결정 후)
- [ ] enrichment 성공 기준 충족 확인 후 → wines-redesign-plan.md Phase 1 백업으로 이동
