-- resolved_by는 어드민(auth.users)을 참조. 어드민은 profiles row가 없을 수 있음.
-- user_id(신고자)만 profiles 참조 유지.

alter table public.wine_reports
  drop constraint if exists wine_reports_resolved_by_fkey;

alter table public.wine_reports
  add constraint wine_reports_resolved_by_fkey
    foreign key (resolved_by) references auth.users(id) on delete set null;
