# 베타 UX 재설계 — 일단 멈춤 (2026-04-25/26)

**상태**: PAUSED. 다음 세션 fresh eyes로 재평가 필요.

## 결론

**Winerary 베타 v1 작업을 일시 정지.** 한 세션 안에서 너무 많이 갈아엎은 결과 "여러 시도의 잔해가 섞인 정체성 없는 상태"가 됨. 유저가 명시적으로 "레거시가 더 나은 기분"이라 판정. 옵션 (A) 잠시 멈춤 선택.

## 오늘 거친 톤·IA 변환 (한 세션 안)

- 톤: **다크 버건디 → 벤토 글래스 → 채널톡 글래스 → 에디토리얼 클린**
- IA 탭: **5탭 → 4탭 → 3탭+FAB → 4탭+중앙+**
- 함께 탭: **도입 → 제거 → 부활 → 모임으로 재정의**
- 카드: **세로 풀블리드 → 가로 compact → 글래스 hybrid → 레거시 다크 포팅 → 라이트 글래스 → 솔리드 flat**

각 결정은 개별로 합리적이었으나 누적된 결과물의 정체성이 없음. 베타가 "노트 앱·레시피 앱·일기 앱"처럼 보이고 와인 정체성이 사라짐.

## 베타에서 살릴 만한 것 (IA 학습)

- **4탭 + 중앙 + 빠른 기록 모달** — 충동 기록 진입 단순화
- **공유 다이어리 → 노트 탭 통합 timeline** — 친구·내 것 한 흐름. 필터 chips로 보기 전환
- **함께 → 모임 재정의** — SNS화 회피. "관계 디렉토리"(공유 노트 그리드 + 친구 아바타)가 본질
- **B/C 톤 마이크로카피** — "DB 매칭" 금지, 감성·경험어 우선. `docs/ux-redesign-plan.md` §7 참조
- **`/beta/*` 공존 라우트 + 진입 토글** — 인프라는 그대로 유지

## 베타에서 버릴 만한 것 (시각 정체성)

- 크림 배경 (#FFFBF5/#FDFBF6)
- atmospheric 블롭 / glass / backdrop-blur
- 솔리드 flat 카드 (에디토리얼 클린)
- Noto Serif KR 도배 — 모든 곳에 한글 세리프는 무겁고 grandma-ish

## 레거시가 가진 강점 (유지 가치)

- 다크 버건디 (#080305) + 루비 레드 (#d32f4c) — **wine bar 정체성**
- 풀블리드 사진 카드 + 그라디언트 오버레이 — 드라마틱
- Playfair serif 영문 타이틀 (한글은 sans Pretendard)
- 일관된 단일 시각 정체성 (혼란 없음)
- **실제 작동하는 앱** (데이터·인증·기록 모두 동작)

## 가장 유력한 다음 방향

**(B) 레거시 DNA 회귀 + 베타 IA 학습 이식.** 시각은 레거시 다크 버건디 그대로, 추가로:
- 4탭 + 중앙 + 빠른 기록 모달
- 공유 다이어리 통합 timeline
- 모임 = 관계 디렉토리 (피드 아님)
- 마이크로카피 B/C 톤

**다음 세션 진입 시**: 이 문서와 `docs/ux-redesign-plan.md` 둘 다 확인. fresh eyes로 "베타에서 뭘 살리고 싶나" 재판정 후 (B) 또는 (C) 베타 폐기 선택.

## 현재 베타 상태 (2026-04-26)

- 라우트: `/beta`, `/beta/together`, `/beta/explore`, `/beta/me` — 정적 prerender
- 진입: 레거시 `/profile` 하단 "베타 버전 체험하기" 카드
- 톤: 에디토리얼 클린 (마지막 상태)
- 데이터: 전부 mock, Supabase 미연결
- 마지막 커밋: `cec9e2a` (모임 탭 재작성, SNS 요소 제거)

레거시는 **건드린 적 없음**. 공존 전략대로 모든 변경은 `/beta/**`와 globals.css의 `[data-theme="beta"]` 스코프에만.

## 다른 PC에서 이어가기

```bash
git clone https://github.com/AidenPark-labs/winerary.git
cd winerary
npm install
# .env.local 별도 복사 (이전 PC 또는 Supabase 대시보드에서)
npm run dev
```

이 문서와 `docs/ux-redesign-plan.md`, `docs/design-system.md`, `docs/shared-diary-design.md` 4개를 새 세션 진입 시 가장 먼저 확인.
