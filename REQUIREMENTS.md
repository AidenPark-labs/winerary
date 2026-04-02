# Winerary — 요구사항 문서

> 버전: 2.0  
> 최종 수정: 2026-04-03  
> 한 줄 정의: 와인과 함께한 식사 경험을 기록하고 공유하는 앱

---

## 1. 앱 개념

Winerary는 "와인 라벨 스캐너"가 아니라 **식사 경험 다이어리**다.  
어떤 와인을 마셨는지보다, **언제, 누구와, 무엇을 먹으면서, 어떤 경험을 했는지**가 핵심이다.  
와인 정보는 Vivino 링크로 대체하여 별도 DB 구축 없이 외부 레퍼런스를 활용한다.

---

## 2. 핵심 기능

### 2-1. 경험 기록 (다이어리)

| 항목 | 설명 |
|------|------|
| 날짜 | 마신 날짜 |
| 와인 | 이름 검색 → 선택 → Vivino 링크 자동 연결 |
| 페어링 음식 | 함께 먹은 음식 (복수 입력 가능) |
| 사진 | 식사/와인 사진 (여러 장 업로드 가능) |
| 장소 | 레스토랑명, 집 등 자유 입력 |
| 동반자 | 함께한 사람 (선택) |
| 평점 | 종합 평점 (0.5 단위, 5점 만점) |
| 페어링 궁합 | 와인-음식 궁합 평점 (1~5) |
| 메모 | 자유 텍스트 |

### 2-2. 와인 검색 (AI 제안)

1. 한국어로 와인명 일부 입력 (예: "샤또 마고", "오퍼스 원")
2. AI가 가능성 있는 와인 목록 5~8개 제안 (이름, 생산국, 종류, 빈티지 범위)
3. 사용자가 목록에서 선택
4. 선택된 와인의 Vivino 검색 링크 자동 생성
5. 와인 확정 후 경험 기록 폼으로 이동

### 2-3. 사진 공유

- 기록에 여러 장 사진 첨부 가능
- 공유 링크 생성 시 사진 포함하여 공유
- 사진은 식사 장면, 와인 병, 음식 등 자유롭게

### 2-4. 기록 목록 / 피드

- 내 기록 타임라인
- 각 기록 카드: 와인명, 날짜, 대표 사진, 평점, 페어링 음식 태그
- 공개 설정: 비공개 / 링크 공유 / 전체 공개

### 2-5. 실시간 공유 세션 (선택 기능)

- 같은 자리에서 함께 마신 사람들이 각자 평점/메모 남기기
- 호스트가 세션 생성 → QR 코드 / 링크로 참여
- 세션 종료 후 개인 다이어리에 저장

---

## 3. 와인 검색 상세 스펙

### 입력
- 한국어 또는 영어로 와인명 일부 입력
- 최소 2자 이상 입력 시 검색 활성화

### AI 제안 방식
- Claude API를 통해 입력어에 맞는 와인 후보 목록 생성
- 각 후보 항목: `{ name, producer, country, type, vintage_range, vivino_query }`
- 모델: claude-haiku (빠른 응답)

### Vivino 링크
- Vivino 직접 API 없음 → 검색 URL 방식 사용
- 형식: `https://www.vivino.com/search/wines?q={와인명+생산자}`
- 사용자가 해당 링크로 Vivino에서 상세 정보 확인 가능

### UI 흐름
```
[검색 입력창]
    ↓ 입력
[AI 제안 목록] — 와인명 / 생산국 / 종류 / 빈티지
    ↓ 선택
[와인 확정 표시] + [Vivino에서 보기 →] 버튼
    ↓
[경험 기록 폼] — 날짜, 음식, 사진, 평점, 메모
```

---

## 4. 데이터 모델

### wine_records (경험 기록)
```
id, user_id, created_at, updated_at
wine_name       TEXT          -- 확정된 와인명
wine_vivino_url TEXT          -- Vivino 검색 링크
drunk_at        DATE
location        TEXT
companions      TEXT[]
memo            TEXT
rating          NUMERIC(2,1)  -- 0.5 단위, 5점 만점
pairing_score   INTEGER       -- 페어링 궁합 1~5
foods           JSONB         -- [{name, note}]
photos          TEXT[]        -- Supabase Storage URL 배열
visibility      TEXT          -- private | link | public
```

### (기존 항목 제거)
- `vintage`, `country`, `region`, `grapes`, `producer`, `type`, `alcohol` — Vivino 링크로 대체
- `balance`, `complexity`, `value_score` — 단순화하여 `rating` + `pairing_score`만 유지
- `label_image_url` — `photos[]` 배열로 통합

---

## 5. 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 인증 | Supabase Auth (이메일/비밀번호) |
| DB | Supabase PostgreSQL |
| 스토리지 | Supabase Storage |
| AI | Anthropic Claude API (Haiku — 와인 제안, Opus — 기타) |
| 외부 와인 정보 | Vivino 검색 URL |
| 배포 | Vercel |

---

## 6. 비기능 요구사항

- 모바일 우선 UI (375px 기준)
- 와인 검색 응답: 3초 이내
- 사진 업로드: 이미지당 최대 5MB, JPEG 변환
- 다크 테마 고정

---

## 7. 범위 외 (현재 버전)

- 와인 자체 DB 구축
- Vivino / Wine-Searcher API 직접 연동
- SNS 팔로우/피드
- 추천 알고리즘
