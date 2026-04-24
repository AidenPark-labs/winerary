# 공유 다이어리 설계안

## 배경

기존에 "같이 마신 와인을 함께 기록하기" 위한 기능이 3가지로 분산되어 있음:
- 멘션 공유 (@userCode) → 읽기 권한 부여
- 경험 연결 (link/link-mine) → 두 기록을 수동으로 묶음
- 평가 초대 (invite_code) → 게스트 평가

"연결하기"는 개념 자체가 어렵고, 기능 간 관계를 설명하기 어려움.

## 핵심 아이디어

**개인 다이어리와 공유 다이어리를 분리한다.**

```
내 다이어리 (개인) ── 나만의 기록 (기존과 동일)
공유 다이어리 A ────── "와인 동호회" (5명)
공유 다이어리 B ────── "부부 와인일지" (2명)
공유 다이어리 C ────── "회사 모임" (8명)
```

- 공유 다이어리는 여러 개 생성 가능
- 멤버 초대로 참여
- 다이어리 내 기록은 공동 소유 — 멤버 누구나 생성/수정 가능
- 기록의 평가(평점, 메모 등)는 각 멤버가 독립적으로 남김
- 개인 기록 → 공유 다이어리: **이동** 허용 (원본은 공유 다이어리로 옮겨짐). 추후 필요하면 "복사 후 유지" 옵션 추가 가능.
- 공유 다이어리 기록 → 개인: **복사** 우선 방향 (원본은 공유 다이어리에 남음). 최종 확정 보류.

## 데이터 모델

### ERD

```
shared_diaries          1 ── N  shared_diary_members
       │
       1
       │
       N
wine_records (diary_id) 1 ── N  record_participants (각자 평가)
                        1 ── N  record_history (수정 이력)
```

### 테이블 정의

#### shared_diaries (공유 다이어리)

```sql
CREATE TABLE shared_diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cover_image text,
  invite_code text UNIQUE,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### shared_diary_members (멤버)

```sql
CREATE TABLE shared_diary_members (
  diary_id uuid REFERENCES shared_diaries(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (diary_id, user_id)
);
```

- `owner`: 다이어리 생성자. 다이어리 설정/삭제, 멤버 관리, 기록 강제 삭제 가능
- `member`: 기록 CRUD, 자기 평가 관리

#### wine_records 확장

```sql
ALTER TABLE wine_records
  ADD COLUMN diary_id uuid REFERENCES shared_diaries(id) ON DELETE SET NULL,
  ADD COLUMN created_by uuid REFERENCES profiles(id);
```

- `diary_id` NULL = 개인 기록 (기존과 동일)
- `diary_id` 있음 = 공유 다이어리 기록
- `created_by` = 공유 기록에서 최초 작성자 추적용

#### record_participants (참여자별 평가)

```sql
CREATE TABLE record_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES wine_records(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  rating numeric(3,1),
  value_score numeric(3,1),
  pairing_score integer,
  memo text,
  repurchase_intent text,  -- 'yes' | 'maybe' | 'no'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(record_id, user_id)
);
```

#### record_history (수정 이력)

```sql
CREATE TABLE record_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES wine_records(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES profiles(id),
  action text NOT NULL,  -- 'create' | 'update' | 'delete' | 'restore'
  changes jsonb,         -- { field: { old, new } }
  created_at timestamptz DEFAULT now()
);
```

- 변경된 필드만 기록 (전체 스냅샷 아님)
- 예시: `{ "photos": { "old": ["a.jpg"], "new": ["a.jpg", "b.jpg"] } }`

#### wine_records 삭제 예정 컬럼

```sql
ALTER TABLE wine_records
  ADD COLUMN deleting_at timestamptz;
```

- NULL = 정상
- 미래 시각 = "X일 후 삭제 예정" 표시
- 과거 시각 = cron 또는 조회 시 soft delete 처리

## 개인 기록 vs 공유 기록

|  | 개인 기록 | 공유 기록 |
|--|----------|----------|
| `diary_id` | NULL | 공유 다이어리 ID |
| `created_by` | 본인 | 최초 작성자 |
| 수정 권한 | 본인만 | 멤버 전원 |
| 평점 저장 | `wine_records`에 직접 (기존 방식) | `record_participants`에 각자 |
| 평균 평점 | 없음 | 참여자 평점 평균으로 표시 |

개인 기록은 기존 구조를 그대로 유지한다. 변경 최소화.

## 삭제 규칙

| 상황 | 동작 |
|------|------|
| 다른 멤버 평가 없음 | 즉시 삭제 (soft delete) |
| 다른 멤버 평가 있음 + 일반 멤버 | 삭제 불가 ("다른 멤버의 평가가 있어 삭제할 수 없어요") |
| 다른 멤버 평가 있음 + 다이어리 owner | "삭제 예정" 상태 → 3일 후 삭제 |

- 삭제 예정 상태에서 멤버들이 자기 평가를 확인/백업할 시간 확보
- owner가 삭제 예정을 취소할 수 있음 (`deleting_at`을 NULL로)
- `record_history`에 삭제/복원 이력 기록

## RLS 정책

```sql
-- 개인 기록: 본인만
-- 공유 기록: 다이어리 멤버만
CREATE POLICY "wine_records access" ON wine_records
  USING (
    (diary_id IS NULL AND user_id = auth.uid())
    OR
    (diary_id IN (
      SELECT diary_id FROM shared_diary_members
      WHERE user_id = auth.uid()
    ))
  );

-- 참여자 평가: 같은 다이어리 멤버는 모두 읽기, 본인 것만 쓰기
CREATE POLICY "record_participants read" ON record_participants
  FOR SELECT USING (
    record_id IN (
      SELECT wr.id FROM wine_records wr
      JOIN shared_diary_members sdm ON sdm.diary_id = wr.diary_id
      WHERE sdm.user_id = auth.uid()
    )
  );

CREATE POLICY "record_participants write" ON record_participants
  FOR ALL USING (user_id = auth.uid());
```

## UX 흐름

### 다이어리 목록 (메인)

```
┌─────────────────────────┐
│ 📖 내 다이어리      (32) │
│ 📖 와인 동호회      (15) │  ← 5명
│ 📖 부부 와인일지     (8) │  ← 2명
│                         │
│ [+ 공유 다이어리 만들기]  │
└─────────────────────────┘
```

### 공유 다이어리 내부

```
📖 와인 동호회                    [설정] [멤버]
─────────────────────────────────
4/12  샤또 마고 2018         ⭐ 4.2 (3명)
      작성: 민수 · 수정: 지영

4/10  바롤로 2019            ⭐ 4.0 (2명)
      작성: 지영

[+ 기록 추가]  [개인 기록에서 복사]
```

### 공유 기록 상세

```
📖 와인 동호회

🍷 샤또 마고 2018
📍 르봉마르쉐 · 2026-04-12
🍽️ 스테이크, 치즈
💰 12만원 (매장)
📸 [사진1] [사진2] [사진3]

── 평가 ──────────────────────────
⭐ 평균 4.2 (3명 참여)

👤 민수    ⭐ 4.5  💰 4.0  📝 "체리향이 진하고..."
👤 지영    ⭐ 4.0  💰 3.5  📝 "탄닌이 강했지만 좋았다"
👤 현우    아직 평가를 남기지 않았어요

[내 평가 남기기]

── 이력 ──────────────────────────
4/13 지영 — 사진 2장 추가
4/12 민수 — 기록 작성

[수정]  [삭제]
```

### 삭제 예정 상태 표시

```
⚠️ 이 기록은 4/16에 삭제될 예정입니다 (owner 민수)
   [삭제 취소] ← owner만 보임
```

### 초대

```
[멤버 초대] → 초대 링크 생성 → 카톡/문자 공유
  → 회원: 바로 참여
  → 비회원: 가입 후 참여
```

## 기존 기능 정리

### 제거 대상

| 기능 | 관련 테이블/코드 | 대체 |
|------|-----------------|------|
| 경험 연결 | `shared_experiences`, `shared_experience_records` | 같은 다이어리에 기록 |
| 평가 초대 | `wine_records.invite_code`, `record_evaluations` | 다이어리 초대 + `record_participants` |
| 연결하기 UI | `/diary/[id]/link`, `/diary/[id]/link-mine` | 삭제 |
| InviteButton | `/diary/[id]/InviteButton.tsx` | 삭제 |

### 유지

| 기능 | 이유 |
|------|------|
| 공유 링크 (ShareButton) | 외부 SNS 공유는 별도 니즈 |
| visibility | 공개 범위 제어 유지 |
| companions (텍스트) | 비회원 동행인 이름 기록용 |
| 멘션 공유 (@userCode) → `record_mentions` | **유지**. UX 재설계 v1에서 멘션은 경량 액션으로 유지하되 검색 범위를 **수락된 친구로 제한**. 공유 다이어리와는 별개 기능(다이어리 = 모임 단위, 멘션 = 일회성 태그). |

### 마이그레이션 전략

1. 새 테이블 생성 (`shared_diaries`, `shared_diary_members`, `record_participants`, `record_history`)
2. `wine_records`에 `diary_id`, `created_by`, `deleting_at` 컬럼 추가
3. 기존 `record_mentions` → **유지.** UX 재설계 v1에서 멘션 기능 유지 결정됨(수락된 친구 범위로 제한).
4. 기존 `record_evaluations` → 데이터 보존, 신규 기능에서는 `record_participants` 사용
5. 기존 `shared_experiences` / `shared_experience_records` → 데이터 보존, 코드에서 제거
6. 기존 데이터의 자동 변환은 하지 않음 (개인 기록은 그대로 개인 기록으로 유지)
