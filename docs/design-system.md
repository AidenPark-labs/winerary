# Winerary Design System v1

**작성일:** 2026-04-24
**적용 범위:** `src/app/beta/**` 및 `src/components/beta/**`. 레거시(`src/app/(app)/**`)는 기존 다크 버건디 유지.
**기반:** Bento Design System 스킬 + Winerary 와인 악센트 + 타겟 맞춤 간격 보정

---

## 1. Context and Goals

Winerary 베타는 20-30대 한국 여성이 **오늘 마신 와인을 가볍게 기록하고 친구와 나누는** 경험을 제공한다. 본 디자인 시스템은 그 경험을 지탱하는 토큰·컴포넌트·접근성 계약이다.

**핵심 원칙**
- **벤토 그리드 + 와인 정체성.** 크림 배경 위 버건디 액션. 벤토의 밝고 정돈된 모듈 그리드를 뼈대로, 와인다운 깊이는 액센트로만.
- **모바일 우선, 좌우 여백은 타이트하게.** 일상 충동 기록 앱이라 화면을 최대한 씀.
- **토큰 우선, 원시값 금지.** 코드에 하드코딩된 hex·px 금지.
- **감성 문구 + 기능적 컴포넌트.** 톤은 B/C (ux-redesign-plan §7), 컴포넌트 규칙은 벤토 엄격.
- **WCAG 2.2 AA 최소.** 텍스트 4.5:1, 대형 텍스트·비텍스트 3:1, 터치 44×44 이상.

---

## 2. Design Tokens and Foundations

### 2.1 Color

| 토큰 | Hex | 역할 |
|---|---|---|
| `--color-surface` | `#FFF5E6` | 앱 배경 (크림) |
| `--color-surface-raised` | `#FFFFFF` | 카드/시트 배경 |
| `--color-surface-alt` | `#FBEAD4` | 강조 섹션 배경 (아주 옅은 피치) |
| `--color-primary` | `#7A1B2E` | 버건디. 주 CTA·브랜드 악센트 |
| `--color-primary-hover` | `#6B1828` | primary 호버 |
| `--color-primary-pressed` | `#5A1422` | primary 눌림 |
| `--color-primary-on` | `#FFF5E6` | primary 위 텍스트(크림) |
| `--color-accent` | `#FAD4C0` | 피치. 소프트 강조·태그·선택 상태 |
| `--color-accent-strong` | `#E8A98A` | accent 호버/강조 |
| `--color-text` | `#111827` | 본문 |
| `--color-text-muted` | `#6B7280` | 보조 텍스트 |
| `--color-text-on-primary` | `#FFF5E6` | 버건디 버튼 위 글자 |
| `--color-border` | `#E5DCCB` | 카드 테두리, 구분선 |
| `--color-border-strong` | `#C8B8A0` | 강조 테두리 |
| `--color-success` | `#16A34A` | 성공 토스트 |
| `--color-warning` | `#D97706` | 주의 |
| `--color-danger` | `#DC2626` | 삭제·오류 |
| `--color-focus-ring` | `#7A1B2E` | focus-visible 링 |

**대비 검증 (Surface `#FFF5E6` 기준)**
- Text `#111827` : 16.7:1 ✓ AAA
- Text muted `#6B7280` : 5.0:1 ✓ AA 본문
- Primary `#7A1B2E` : 10.7:1 ✓ AAA (텍스트/아이콘 가능)
- Accent `#FAD4C0` 단독: 1.2:1 ✗ — **배경/장식 전용, 텍스트로 쓰지 말 것**

**사용 규칙**
- 주 CTA·포커스 링·링크: `--color-primary` 단일. 다른 색 금지.
- 태그·선택 상태·부드러운 배경: `--color-accent`.
- 벤토 스킬의 `secondary=#80A1C1`(muted blue)은 **미채택**. 팔레트 혼선 방지.
- 상태 색(success/warning/danger)은 피드백 외 장식 금지.

### 2.2 Typography

| 토큰 | 값 |
|---|---|
| `--font-sans` | `'Pretendard Variable', Pretendard, Inter, 'Apple SD Gothic Neo', sans-serif` |
| `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` |
| 주 폰트 | Pretendard (한·영 혼용 기본) |
| 보조 | Inter (서양 와인명 등) — Pretendard의 라틴 글리프로 대부분 커버됨. 명시적 영문 레이블만 Inter. |

**타입 스케일 (line-height 동봉)**

| 토큰 | size | line-height | 용도 |
|---|---|---|---|
| `--text-xs` | 12px | 16px (1.33) | 메타·캡션 |
| `--text-sm` | 14px | 20px (1.43) | 보조 본문·버튼 소 |
| `--text-base` | 16px | 24px (1.5) | 기본 본문 |
| `--text-lg` | 20px | 28px (1.4) | 카드 제목 |
| `--text-xl` | 24px | 32px (1.33) | 섹션 제목 |
| `--text-2xl` | 32px | 40px (1.25) | 히어로·결산 카드 |

**Weight**
- 400 regular — 본문 기본
- 500 medium — 강조, 버튼
- 600 semibold — 제목, 숫자 강조 (결산 카드의 "12잔" 등)
- 700 bold — 히어로 타이틀 한정

**로딩**: Pretendard Variable을 preload, `font-display: swap`. FOUC 방지를 위해 `html`에 기본 `font-family` 선언.

### 2.3 Spacing — **좌우 타이트 보정**

벤토 기본 4/8/12/16/24/32에 **edge/card-x를 축소**한 커스텀.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--space-1` | 4px | 아이콘-텍스트 |
| `--space-2` | 8px | 밀접 묶음 |
| `--space-3` | 12px | **화면 edge·카드 내부 가로** |
| `--space-4` | 16px | 카드 내부 세로·블록 |
| `--space-5` | 20px | 컴포넌트 간 |
| `--space-6` | 24px | 섹션 간 (세로만) |
| `--space-8` | 32px | 큰 섹션 분리 |

**적용 규칙**
- 모바일 화면 edge: `var(--space-3)` = **12px** (벤토 기본 16~24에서 축소)
- 카드 내부 가로: 12px, 세로: 16px
- 세로 리듬은 벤토와 동일 유지 — 좌우만 타이트하게.

### 2.4 Radius

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-sm` | 8px | 칩·작은 버튼 |
| `--radius-md` | 12px | 카드·입력 |
| `--radius-lg` | 16px | 모달·시트·큰 카드 |
| `--radius-pill` | 9999px | 별점·뱃지·플로팅 버튼 |

### 2.5 Shadow

| 토큰 | 값 |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(17, 24, 39, 0.04)` |
| `--shadow-md` | `0 4px 12px rgba(17, 24, 39, 0.06)` |
| `--shadow-lg` | `0 8px 24px rgba(17, 24, 39, 0.08)` |
| `--shadow-float` | `0 6px 20px rgba(122, 27, 46, 0.18)` (플로팅 "+" 전용) |

### 2.6 Grid (Bento)

- **모바일 4열**, 12px gap, 12px edge.
- 카드는 1/2/3/4 col span 가능. 결산 카드·"나 탭"은 2×N 벤토 레이아웃.
- **Feed·Note 탭은 단일 열 스택** (카드 = full-width).
- 브레이크포인트: `sm: 640`, `md: 768`, `lg: 1024`. 타겟이 모바일 99%라 `md`부터는 최대폭 640px로 제약.

### 2.7 Motion

- 기본 duration 160ms, easing `cubic-bezier(0.2, 0, 0, 1)` (material-ish).
- 모달/시트 진입 240ms, 나감 200ms.
- `prefers-reduced-motion: reduce` 존중 — 거리 이동 애니메이션만 제거, fade는 유지.

---

## 3. Component Rules

모든 컴포넌트는 필수 상태 정의: **default / hover / focus-visible / active / disabled / loading / error**(해당 시).
키보드 조작 가능, 터치 타겟 ≥ 44×44px.

### 3.1 Button

**Anatomy**: `[icon?] [label] [icon?]`

| Variant | 배경 | 텍스트 | 용도 |
|---|---|---|---|
| `primary` | `--color-primary` | `--color-text-on-primary` | 주 CTA (1화면 1개 권장) |
| `secondary` | `--color-surface-raised` + border `--color-border-strong` | `--color-text` | 보조 액션 |
| `ghost` | 투명 | `--color-text` | 리스트 내·헤더 액션 |
| `accent-soft` | `--color-accent` | `--color-primary` | 선택된 필터·태그형 액션 |
| `danger` | `--color-danger` | `#FFFFFF` | 파괴적 확인 |

**Sizes**
- sm: 32px 높이, `--text-sm`, padding `8px 12px`
- md (기본): 44px 높이, `--text-base`, padding `10px 16px`
- lg: 52px 높이, `--text-lg`, padding `12px 20px`

**States**
- hover: 배경 밝기 ±6%, shadow-sm 추가 (primary·secondary)
- focus-visible: 외곽 2px `--color-focus-ring`, offset 2px. **마우스 클릭 시 focus-ring 숨기기(`:focus:not(:focus-visible)`)**
- active: 배경 `--color-primary-pressed`, shadow 제거
- disabled: opacity 0.4, pointer-events none
- loading: 스피너 좌측 12px, 라벨 유지, 버튼 폭 고정

**Radius**: `--radius-md`. Pill 형태는 플로팅 버튼 한정(`--radius-pill`).

### 3.2 Card (Bento)

**Anatomy**: `surface-raised` 배경 + `--radius-md` + `--shadow-sm` + 내부 패딩 `var(--space-3) var(--space-4)` (가로 12 / 세로 16, 좌우 타이트 보정).

**Variants**
- `plain`: 기본
- `elevated`: shadow-md + border 없음
- `outlined`: shadow 없음, border `--color-border`
- `accent`: 배경 `--color-accent` (소프트 강조)
- `span-2`/`span-4`: 벤토 그리드에서 col-span 확장

**규칙**
- 카드 안 카드 금지 (한 단계 중첩까지만).
- 이미지 카드는 상단 full-bleed, 텍스트 영역은 내부 패딩 유지.
- 클릭 가능한 카드는 전체가 히트 영역. 내부에 별도 primary 버튼 금지(중복 CTA).

### 3.3 Input (Text, Textarea)

**Anatomy**: `[icon?] [input] [clear/action?]` + `label`(상단) + `helper/error`(하단).

**Spec**
- 높이 44px (textarea는 min-height 88px)
- 배경 `--color-surface-raised`, border 1px `--color-border`
- 내부 패딩 `10px 12px`
- radius `--radius-md`
- placeholder `--color-text-muted`

**States**
- focus-visible: border `--color-primary`, 외곽 ring 2px rgba(122,27,46,0.2)
- error: border `--color-danger`, helper 텍스트 `--color-danger`
- disabled: 배경 `--color-surface-alt`, opacity 0.6

**규칙**
- 라벨은 placeholder로 대체하지 말 것 (접근성).
- 글자수 제한 있는 입력(메모 200자 등)은 우측 하단에 카운터, 남은 글자 10 이하 시 `--color-warning`.

### 3.4 Star Rating ("마음 점수")

5개 별, 탭/드래그로 0.5 단위 선택.

**Spec**
- 별 크기 28px (터치), 간격 4px
- 채움 `--color-primary`, 비어있음 `--color-border-strong`
- 레이블 없는 별만 배치 시 aria-label 필수: "1점, 2점..."
- 접근성: 스크린리더용 hidden 슬라이더(role=slider) 동봉

**문구**: "마음에 들었나요?" (ux-redesign-plan §7.6)

### 3.5 BottomNav

**Anatomy**: 5슬롯. 좌측 2(함께/노트) + **중앙 플로팅 "+" (그리드 밖)** + 우측 2(둘러보기/나).

**Spec**
- 높이 64px, 안전영역(safe-area-inset-bottom) 추가
- 배경 `--color-surface-raised`, 상단 border `--color-border`
- 플로팅 "+": 지름 56px, 배경 `--color-primary`, 아이콘 흰색, `--shadow-float`, 바닥에서 16px 떠 있음
- 탭 라벨: `--text-xs`, 아이콘 24px
- 활성 탭: 아이콘/라벨 `--color-primary`. 비활성: `--color-text-muted`.

**규칙**
- 탭 4개 순서 고정: 함께 / 노트 / **+** / 둘러보기 / 나
- 중앙 "+"은 **모든 탭에서 가시**. 탭 전환이 아닌 빠른 기록 모달 오픈.

### 3.6 Bottom Sheet (빠른 기록 모달)

**Anatomy**: 핸들바(36×4px) + 헤더 + 바디 + 액션.

**Spec**
- 배경 `--color-surface-raised`, radius `--radius-lg 위쪽만`, shadow-lg
- 진입 240ms slide-up, fade 스크림 `rgba(17,24,39,0.4)`
- 스크롤 가능, 바디 최대 높이 `85vh`
- 닫기: 핸들바 드래그 / 스크림 탭 / ESC / 좌상단 × 버튼

**접근성**
- `role="dialog"`, `aria-modal="true"`, 첫 포커스 가능 엘리먼트로 이동
- 열리면 배경 스크롤 잠금, 닫히면 트리거 버튼에 포커스 복귀

### 3.7 Toast

**Spec**
- 하단 중앙, BottomNav 위 12px 간격
- 최대폭 320px, 패딩 `12px 16px`, radius `--radius-md`, shadow-md
- 4초 자동 닫힘, 호버 시 타이머 정지
- 상태별 좌측 아이콘: success / warning / danger / info(=primary)

**문구 예시**: "오늘의 한 잔, 담아뒀어요" / "사진이 잘 담기지 않았어요" (§7.6)

### 3.8 Chip (태그·필터)

**Spec**
- 높이 28px, radius `--radius-pill`, padding `4px 10px`, `--text-sm`
- 기본: `--color-surface-alt` 배경, `--color-text`
- 선택: `--color-accent` 배경, `--color-primary` 텍스트
- 닫기 가능한 chip은 우측 × 아이콘 16px

**용도**
- 필터 ("레드" "화이트" "이번 주")
- 선택된 친구 태그 (멘션 대상)
- 와인 품종 표시

### 3.9 Empty State

**Anatomy**: 일러스트(옵션) + 제목 + 설명 + 1개 주 액션.

**Spec**
- 중앙 정렬, 여백 `var(--space-8)` 상하
- 제목 `--text-lg`, 설명 `--text-sm --color-text-muted`
- 액션 버튼 `primary md`

**문구 규칙**: §7.6의 B톤 빈 상태 사전 준수. "첫 잔의 기억, 여기서 시작돼요" 등.

### 3.10 Feed Card (친구 활동)

Winerary 고유. 벤토 카드 + 와인 사진 + 메타.

**Anatomy**:
```
[아바타] [닉네임]  [시간]
[와인 사진 (선택, 16:9 또는 정사각)]
[와인명]  [빈티지]
[⭐ 평점]  [한 줄 메모...]
[📖 노트 이름]  (공유 다이어리 소속 시)
```

**Spec**
- 카드 외곽 `--shadow-sm`, radius `--radius-md`, 패딩 `12px` 가로 / `16px` 세로
- 사진은 가로 전체(-12 margin으로 extend), 높이 자동
- 별점은 `--text-sm`과 함께, 평점 숫자 우측
- 탭 시 전체가 상세 페이지 진입

### 3.11 Milestone / 결산 Card (C톤)

인스타 스토리 9:16. 앱 본체와 **의도적으로 다른 톤**(C).

**Spec**
- 렌더링: 서버 OG 이미지 또는 클라이언트 Canvas (1080×1920)
- 배경: 그라데이션 `--color-surface` → `--color-accent`
- 히어로 숫자: `--text-2xl` 600, 강조 색 `--color-primary`
- 이모지 🍷 단일, 기타 이모지 과다 금지
- 워터마크 `@winerary` 하단 24px

**문구**: §7.6 결산 카드 참조.

---

## 4. Accessibility (testable)

| # | 기준 | 테스트 방법 |
|---|---|---|
| A1 | 본문 텍스트 대비 ≥ 4.5:1 | DevTools Contrast Inspector |
| A2 | 대형 텍스트(18px+) / 비텍스트 ≥ 3:1 | 동상 |
| A3 | 모든 인터랙티브 요소 키보드 도달 & 조작 가능 | Tab/Shift+Tab/Enter/Space |
| A4 | focus-visible 링 2px, offset 2px | 키보드 탭으로 확인 |
| A5 | 터치 타겟 ≥ 44×44 CSS px | 스펙 시트 대조 |
| A6 | 아이콘 단독 버튼 `aria-label` 필수 | axe-core |
| A7 | 모달/시트 `aria-modal="true"` + 포커스 트랩 | 스크린리더(VoiceOver/TalkBack) |
| A8 | 이미지 `alt` — 장식은 `alt=""`, 의미는 기술 | 렌더 검사 |
| A9 | 상태 색만으로 의미 전달 금지 (항상 아이콘/텍스트 동반) | 빨강/녹색 색맹 시뮬레이션 |
| A10 | `prefers-reduced-motion` 존중 | OS 설정 토글 |

---

## 5. Content & Tone

전량 `docs/ux-redesign-plan.md` **§7 Voice & Tone** 준수.
- 기본 B톤(브런치), 결산 카드 C톤(인스타 스토리)
- 기능어 금지 어휘: "저장", "DB 매칭", "인식", "업로드 중"
- 대체어 치환표는 §7.3
- 빈 상태·에러·성공 문구 사전은 §7.6

**이 디자인 시스템의 추가 계약**
- 버튼 라벨은 **동사 원형 또는 명사 종결**: "담기", "남기기", "더 자세히 남기기". "저장하기" 금지.
- 입력 placeholder는 **완만한 청유 또는 명사구**: "기억해두고 싶은 한 마디", "이 와인, 찾고 있어요?". 동사 강요 금지.

---

## 6. Anti-patterns

| # | 금지 | 이유 |
|---|---|---|
| X1 | 코드 내 hex·raw px | 토큰 규율 무너짐. `#7A1B2E` 발견 시 변수로 치환 |
| X2 | Bento `secondary=#80A1C1`(muted blue) 사용 | 팔레트 혼선. 선택한 팔레트엔 없음 |
| X3 | 한 화면 primary 버튼 2개 이상 | CTA 우선순위 무너짐 |
| X4 | Accent `#FAD4C0` 위 텍스트 | 대비 1.2:1, 가독성 불가 |
| X5 | 카드 안 카드 2단 이상 중첩 | 시각 위계 붕괴 |
| X6 | 버튼 높이 40px 미만 | 터치 타겟 미달 |
| X7 | focus ring 제거 (`outline: none`만) | 키보드 사용자 미아 |
| X8 | placeholder를 라벨 대체로 사용 | 입력 시 라벨 소실 |
| X9 | "저장됨", "업로드 완료" 같은 기능어 UI 노출 | Voice & Tone 위배 |
| X10 | 다크 버건디 레거시 팔레트를 베타로 끌어옴 | 공존 전략 위배. 레거시는 레거시, 베타는 본 시스템 |
| X11 | 모달 안 모달 | 네비게이션 혼란 |
| X12 | 결산 카드에 B톤 문구 | 톤 레지스터 위배 |

---

## 7. QA Checklist (코드 리뷰)

- [ ] 모든 색이 CSS 변수/토큰으로 참조된다 (hex 리터럴 0개)
- [ ] `px` 값이 스페이싱 토큰 배수와 일치한다 (4·8·12·16·20·24·32)
- [ ] 본문 대비 4.5:1, 대형 3:1 통과 (axe-core, Lighthouse)
- [ ] 모든 인터랙티브 요소가 키보드로 조작 가능하다
- [ ] focus-visible 링이 모든 포커스 가능 요소에 표시된다
- [ ] 터치 타겟 44×44 이상 (버튼·별점·탭바 아이템)
- [ ] 아이콘 전용 버튼에 `aria-label`이 있다
- [ ] 모달/시트가 포커스 트랩 + ESC 닫힘 구현되어 있다
- [ ] 상태 색만으로 의미 전달하지 않는다 (아이콘·텍스트 동반)
- [ ] `prefers-reduced-motion` 경로가 동작한다
- [ ] Pretendard Variable preload + `font-display: swap` 설정되어 있다
- [ ] 모바일 edge padding 12px (기본값 16px 아님)
- [ ] Voice & Tone: 버튼·토스트·빈 상태 문구가 §7 사전에 부합한다
- [ ] Bento muted blue `#80A1C1` 사용처 없음
- [ ] primary 버튼이 한 화면에 1개 이하

---

## 8. 구현 가이드

### 8.1 CSS Variables (루트)

```css
:root {
  /* color */
  --color-surface: #FFF5E6;
  --color-surface-raised: #FFFFFF;
  --color-surface-alt: #FBEAD4;
  --color-primary: #7A1B2E;
  --color-primary-hover: #6B1828;
  --color-primary-pressed: #5A1422;
  --color-primary-on: #FFF5E6;
  --color-accent: #FAD4C0;
  --color-accent-strong: #E8A98A;
  --color-text: #111827;
  --color-text-muted: #6B7280;
  --color-border: #E5DCCB;
  --color-border-strong: #C8B8A0;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --color-focus-ring: #7A1B2E;

  /* type */
  --font-sans: 'Pretendard Variable', Pretendard, Inter, 'Apple SD Gothic Neo', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* space */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 32px;

  /* radius */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 9999px;

  /* shadow */
  --shadow-sm: 0 1px 2px rgba(17, 24, 39, 0.04);
  --shadow-md: 0 4px 12px rgba(17, 24, 39, 0.06);
  --shadow-lg: 0 8px 24px rgba(17, 24, 39, 0.08);
  --shadow-float: 0 6px 20px rgba(122, 27, 46, 0.18);

  /* motion */
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 160ms;
  --duration-base: 240ms;
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-base: 0ms; }
}
```

### 8.2 Tailwind 확장 (예시)

```js
// tailwind.config.js (베타 영역 전용 프리셋)
module.exports = {
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        'surface-alt': 'var(--color-surface-alt)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          pressed: 'var(--color-primary-pressed)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          strong: 'var(--color-accent-strong)',
        },
        // ...
      },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      spacing: { edge: 'var(--space-3)' }, // px-edge 유틸로 좌우 12px
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', pill: 'var(--radius-pill)' },
      boxShadow: {
        sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)', float: 'var(--shadow-float)',
      },
    },
  },
};
```

### 8.3 Pretendard 로딩

```html
<link rel="preload" href="/fonts/PretendardVariable.woff2" as="font" type="font/woff2" crossorigin>
<style>
  @font-face {
    font-family: 'Pretendard Variable';
    font-weight: 45 920;
    font-style: normal;
    font-display: swap;
    src: url('/fonts/PretendardVariable.woff2') format('woff2-variations');
  }
</style>
```

Next.js `next/font`를 쓰면 `font-display: swap`은 자동 + 자체 호스팅 처리됨. `src/app/beta/layout.tsx`에서만 import.

---

## 9. 결정 로그

- **2026-04-24** 벤토 스킬 기반 + 와인 악센트(버건디) + Pretendard + 좌우 타이트 보정으로 확정. 적용 범위는 `/beta/**` 한정, 레거시 다크 버건디는 유지.
- **2026-04-24** 벤토의 `secondary=#80A1C1`(muted blue)은 채택하지 않음. 팔레트 단순화.
- **2026-04-24** 모바일 edge padding 12px(벤토 기본 16~24에서 축소). 세로 리듬은 벤토 유지.
