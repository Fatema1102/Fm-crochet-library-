-- ============================================================
-- FM Crochet Library — Supabase migration
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- TABLES ----------

create table if not exists categories (
  id text primary key,
  en text not null,
  ar text not null,
  tone text not null default 'sage',
  position int not null default 0
);

create table if not exists projects (
  id bigint generated always as identity primary key,
  title_en text not null default '',
  title_ar text not null default '',
  cat text references categories(id) on delete set null,
  tone text not null default 'sage',
  status text not null default 'notStarted',
  visibility text not null default 'public',
  featured boolean not null default false,
  pattern_id text,
  cover_image text,
  gallery text[] not null default '{}',
  notes_en text default '',
  notes_ar text default '',
  created_at timestamptz not null default now()
);

create table if not exists patterns (
  id text primary key,
  title_en text not null default '',
  title_ar text not null default '',
  designer_en text default '',
  designer_ar text default '',
  cat text references categories(id) on delete set null,
  tone text not null default 'sage',
  pdf_url text,
  youtube_url text,
  etsy_url text,
  pinterest_url text,
  cover_image text,
  notes_en text default '',
  notes_ar text default '',
  created_at timestamptz not null default now()
);

-- Single-row table holding all "Customize" settings as JSON
-- (brand name, hero text, about text, hero/about photo URLs — per language)
create table if not exists site_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);
insert into site_settings (id, data) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

-- ---------- SEED DATA (your current demo categories) ----------
-- Safe to skip/edit if you'd rather start empty — remove this block if so.
insert into categories (id, en, ar, tone, position) values
  ('doilies', 'Doilies', 'مفارش', 'lavender', 0),
  ('wearables', 'Wearables', 'ملابس', 'sage', 1),
  ('bags', 'Bags', 'حقائب', 'butter', 2),
  ('amigurumi', 'Amigurumi', 'أميغورومي', 'sage', 3),
  ('accessories', 'Accessories', 'إكسسوارات', 'lavender', 4),
  ('homeDecor', 'Home Decor', 'ديكور منزلي', 'butter', 5),
  ('other', 'Other', 'أخرى', 'sage', 6)
on conflict (id) do nothing;

-- ---------- ROW LEVEL SECURITY ----------

alter table categories enable row level security;
alter table projects enable row level security;
alter table patterns enable row level security;
alter table site_settings enable row level security;

-- Public (anyone visiting the site) can read categories, patterns, and site settings
create policy "Public can read categories" on categories
  for select using (true);
create policy "Public can read patterns" on patterns
  for select using (true);
create policy "Public can read site settings" on site_settings
  for select using (true);

-- Projects: the public only sees ones marked "public"; a logged-in admin sees everything
create policy "Public can read visible projects" on projects
  for select using (visibility = 'public' or auth.role() = 'authenticated');

-- Writes are restricted to a logged-in (authenticated) user — i.e. you, the admin
create policy "Authenticated can insert categories" on categories
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update categories" on categories
  for update using (auth.role() = 'authenticated');
create policy "Authenticated can delete categories" on categories
  for delete using (auth.role() = 'authenticated');

create policy "Authenticated can insert projects" on projects
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update projects" on projects
  for update using (auth.role() = 'authenticated');
create policy "Authenticated can delete projects" on projects
  for delete using (auth.role() = 'authenticated');

create policy "Authenticated can insert patterns" on patterns
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update patterns" on patterns
  for update using (auth.role() = 'authenticated');
create policy "Authenticated can delete patterns" on patterns
  for delete using (auth.role() = 'authenticated');

create policy "Authenticated can update site settings" on site_settings
  for update using (auth.role() = 'authenticated');

-- ---------- STORAGE: "images" bucket ----------

-- Make the bucket public so uploaded photos have plain public URLs
update storage.buckets set public = true where id = 'images';

-- Anyone can view/download images (needed for the site to display them)
create policy "Public can view images"
  on storage.objects for select
  using (bucket_id = 'images');

-- Only a logged-in admin can upload/replace/delete images
create policy "Authenticated can upload images"
  on storage.objects for insert
  with check (bucket_id = 'images' and auth.role() = 'authenticated');
create policy "Authenticated can update images"
  on storage.objects for update
  using (bucket_id = 'images' and auth.role() = 'authenticated');
create policy "Authenticated can delete images"
  on storage.objects for delete
  using (bucket_id = 'images' and auth.role() = 'authenticated');

-- ============================================================
-- After running this:
-- 1. Go to Authentication → Users → Add user, and create yourself
--    an admin account (email + password). That's what you'll log
--    in with on the site's Admin page.
-- 2. Go to Project Settings → API and copy the "Publishable key"
--    (anon key) — you'll paste that into the app.
-- ============================================================
