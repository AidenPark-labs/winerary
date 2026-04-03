-- profiles
create table profiles (
  id uuid references auth.users primary key,
  nickname text not null,
  avatar_url text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "profiles: own" on profiles for all using (auth.uid() = id);

-- wine_records (v2: experience-first)
create table wine_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  wine_vivino_url text,
  photos text[] default '{}',
  location text,
  drunk_at date default current_date,
  companions text[],
  memo text,
  pairing_score integer check (pairing_score between 1 and 5),
  rating numeric(3,1),
  foods jsonb default '[]',
  price integer,
  value_score numeric(3,1) check (value_score between 1 and 5),
  visibility text default 'private' check (visibility in ('private','link','public')),
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table wine_records enable row level security;
create policy "wine_records: own" on wine_records for all using (auth.uid() = user_id);
create policy "wine_records: public read" on wine_records for select using (visibility = 'public' and deleted_at is null);

-- wine_wishlist (추천 와인 저장)
create table wine_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  name_ko text not null,
  name_en text not null,
  created_at timestamptz default now()
);
alter table wine_wishlist enable row level security;
create policy "wine_wishlist: own" on wine_wishlist for all using (auth.uid() = user_id);

-- sessions (공유 세션)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid references profiles(id) not null,
  title text,
  wine_snapshot jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table sessions enable row level security;
create policy "sessions: host manage" on sessions for all using (auth.uid() = host_id);
create policy "sessions: anyone read active" on sessions for select using (is_active = true);

-- session_evaluations
create table session_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade not null,
  user_id uuid,
  nickname text not null,
  balance numeric(3,1),
  complexity numeric(3,1),
  value_score numeric(3,1),
  rating numeric(3,1),
  memo text,
  created_at timestamptz default now()
);
alter table session_evaluations enable row level security;
create policy "session_evaluations: anyone" on session_evaluations for all using (true);

-- session_comments
create table session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade not null,
  user_id uuid,
  nickname text not null,
  content text not null,
  created_at timestamptz default now()
);
alter table session_comments enable row level security;
create policy "session_comments: anyone" on session_comments for all using (true);
