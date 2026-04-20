-- wine_events: 와인 인기도 측정용 이벤트 로그
--
-- 이벤트 유형
--   view:     검색 결과 클릭 → 상세 페이지 진입 (가중치 1)
--   wishlist: 찜 추가 (가중치 3)
--   record:   다이어리 기록 (가중치 5)
--
-- 집계: top_wines_by_events(window_days, k)

create table if not exists wine_events (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid not null references wines(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'record', 'wishlist')),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists wine_events_wine_created_idx on wine_events (wine_id, created_at desc);
create index if not exists wine_events_type_created_idx on wine_events (event_type, created_at desc);
create index if not exists wine_events_created_idx       on wine_events (created_at desc);

-- RLS: insert는 누구나(anon 포함), select는 본인 이벤트 또는 service_role만
alter table wine_events enable row level security;

drop policy if exists wine_events_insert_any on wine_events;
create policy wine_events_insert_any on wine_events
  for insert with check (true);

drop policy if exists wine_events_select_own on wine_events;
create policy wine_events_select_own on wine_events
  for select using (
    user_id is not null and user_id = auth.uid()
  );

-- RPC: 기간 내 가중치 합산 점수 상위 k 와인
--   window_days 기본 30일, k 기본 20
create or replace function top_wines_by_events(
  window_days int default 30,
  k int default 20
)
returns table (
  wine_id uuid,
  score int,
  event_count int
)
language sql
security definer
stable
as $$
  select
    e.wine_id,
    sum(case e.event_type
      when 'view'     then 1
      when 'wishlist' then 3
      when 'record'   then 5
      else 0
    end)::int as score,
    count(*)::int as event_count
  from wine_events e
  where e.created_at > now() - make_interval(days => window_days)
  group by e.wine_id
  having sum(case e.event_type
      when 'view'     then 1
      when 'wishlist' then 3
      when 'record'   then 5
      else 0
    end) > 0
  order by score desc, event_count desc
  limit k;
$$;

grant execute on function top_wines_by_events(int, int) to anon, authenticated;
