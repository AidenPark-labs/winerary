-- wine_reports: 사용자가 신고한 와인 정보 오류
--
-- report_type
--   vivino_link: Vivino 링크 오류 (잘못 매칭됨)
--   wine_name:   와인명 오류 (한글/영문)
--   other_info:  기타 정보 오류 (국가/지역/품종/생산자 등)
--   custom:      직접 입력 (description 필수)
--
-- status
--   open:       미처리 (기본값)
--   resolved:   처리 완료 (관련 정보 수정됨)
--   dismissed:  기각 (오신고·중복)

create table if not exists public.wine_reports (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid not null references public.wines(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  report_type text not null check (report_type in ('vivino_link', 'wine_name', 'other_info', 'custom')),
  description text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_note text
);

create index if not exists wine_reports_wine_id_idx on public.wine_reports (wine_id);
create index if not exists wine_reports_status_created_idx on public.wine_reports (status, created_at desc);
create index if not exists wine_reports_user_idx on public.wine_reports (user_id, created_at desc);

alter table public.wine_reports enable row level security;

-- 본인이 작성한 신고만 조회 가능 (어드민은 service_role로 RLS 우회)
drop policy if exists wine_reports_select_own on public.wine_reports;
create policy wine_reports_select_own on public.wine_reports
  for select using (auth.uid() = user_id);

-- 로그인 사용자만 본인 이름으로 신고 등록 가능
drop policy if exists wine_reports_insert_auth on public.wine_reports;
create policy wine_reports_insert_auth on public.wine_reports
  for insert with check (auth.uid() is not null and auth.uid() = user_id);
