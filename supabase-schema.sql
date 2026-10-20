-- ============================================================================
--  ملاحظاتي — مخطط Supabase الكامل
--  انسخ هذا الملف كاملاً والصقه في:  Supabase Dashboard → SQL Editor → New query
--  ثم اضغط Run. (آمن للتشغيل أكثر من مرة)
-- ============================================================================

-- ── 1) امتدادات ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";


-- ── 2) جدول الملف الشخصي ──────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text        not null default '',
  theme        text        not null default 'light',
  layout       text        not null default 'grid',
  sort_order   text        not null default 'updated',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ── 3) جدول التصنيفات ─────────────────────────────────────────────────────
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  name       text        not null check (char_length(btrim(name)) between 1 and 60),
  color      text        not null default '#6366f1',
  created_at timestamptz not null default now()
);


-- ── 4) جدول الملاحظات ─────────────────────────────────────────────────────
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  title       text        not null default '',
  body        text        not null default '',
  tags        text[]      not null default '{}',
  color       text        not null default '#6366f1',
  category_id uuid        references public.categories(id) on delete set null,
  pinned      boolean     not null default false,
  favorite    boolean     not null default false,
  archived    boolean     not null default false,
  trashed     boolean     not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notes_title_limit check (char_length(title) <= 140)
);


-- ── 5) الفهارس ────────────────────────────────────────────────────────────
create index if not exists notes_user_id_idx        on public.notes(user_id);
create index if not exists notes_user_updated_idx   on public.notes(user_id, updated_at desc);
create index if not exists notes_user_trashed_idx   on public.notes(user_id, trashed);
create index if not exists notes_user_archived_idx  on public.notes(user_id, archived);
create index if not exists notes_category_id_idx    on public.notes(category_id);
create index if not exists notes_tags_gin_idx       on public.notes using gin (tags);
create index if not exists categories_user_id_idx   on public.categories(user_id);


-- ── 6) دالة تحديث updated_at تلقائياً ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ── 7) إنشاء ملف شخصي تلقائياً عند تسجيل حساب جديد ──────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'مستخدم'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── 8) تفعيل حماية الصفوف (RLS) ──────────────────────────────────────────
alter table public.profiles   enable row level security;
alter table public.categories enable row level security;
alter table public.notes      enable row level security;

-- profiles: المستخدم يرى وتعدّل ملفه فقط
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- categories: المستخدم يرى تصنيفاته فقط
drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id);

-- notes: المستخدم يرى ملاحظاته فقط
drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ── 9) الصلاحيات ──────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles   to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.notes      to authenticated;

-- لا صلاحيات لغير المسجّلين (anon) على الإطلاق
revoke all on public.profiles   from anon;
revoke all on public.categories from anon;
revoke all on public.notes      from anon;


-- ── 10) دالة بحث على الخادم (اختيارية لكن مفيدة) ─────────────────────────
create or replace function public.search_notes(q text)
returns setof public.notes
language sql
stable
security invoker
set search_path = public
as $$
  select n.*
  from public.notes n
  where n.user_id = (select auth.uid())
    and not n.trashed
    and not n.archived
    and (
      coalesce(btrim(q), '') = ''
      or n.title ilike '%' || q || '%'
      or n.body  ilike '%' || q || '%'
      or array_to_string(n.tags, ' ') ilike '%' || q || '%'
    )
  order by n.pinned desc, n.updated_at desc;
$$;

revoke all on function public.search_notes(text) from anon;
grant execute on function public.search_notes(text) to authenticated;


-- ── 11) دالة حذف الحساب وكل بياناته ──────────────────────────────────────
-- تُستدعى من الخادم فقط (service_role) — لا تُمنح للمستخدم.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  delete from public.notes      where user_id = (select auth.uid());
  delete from public.categories where user_id = (select auth.uid());
  delete from public.profiles   where id      = (select auth.uid());
end;
$$;

revoke all on function public.delete_own_account() from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  انتهى المخطط.
--  ما بعده اختياري: إعداد بريد التأكيد.
-- ════════════════════════════════════════════════════════════════════════════
--  إذا أردت تسجيل دخول فوري دون رسالة تأكيد:
--    Dashboard → Authentication → Sign In / Providers → Email
--    أطفئ خيار "Confirm email"  (أو فعّل Confirmations في البريد المخصص)
-- ════════════════════════════════════════════════════════════════════════════
