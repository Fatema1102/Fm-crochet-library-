-- ============================================================
-- FM Crochet Library — Phase 2 migration (Yarn Inventory + Materials)
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- (Run AFTER the original supabase_migration.sql)
-- ============================================================

-- ---------- TABLES ----------

create table if not exists yarn_inventory (
  id bigint generated always as identity primary key,
  photo text,
  brand text default '',
  collection text default '',
  color_name text default '',
  color_number text default '',
  weight text default '',
  fiber_type text default '',
  hook_size text default '',
  dye_lot text default '',
  quantity numeric not null default 0,
  unit text not null default 'skeins',
  low_stock_threshold numeric not null default 0,
  store text default '',
  purchase_price numeric,
  purchase_date date,
  notes text default '',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists materials (
  id bigint generated always as identity primary key,
  photo text,
  name text not null default '',
  category text default '',
  quantity numeric not null default 0,
  unit text default '',
  notes text default '',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Links yarn to projects (a project can use several yarns; a yarn can be used on several projects)
create table if not exists project_yarn (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  yarn_id bigint references yarn_inventory(id) on delete set null,
  quantity_used numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- AUTO STOCK DEDUCTION ----------
-- Whenever a project_yarn row is added/changed/removed, adjust the yarn's
-- remaining quantity to match. Editing a project's yarn list works by
-- deleting its old rows and inserting fresh ones — this trigger correctly
-- restores stock on delete and deducts it again on insert either way.

create or replace function adjust_yarn_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if new.yarn_id is not null then
      update yarn_inventory set quantity = quantity - new.quantity_used where id = new.yarn_id;
    end if;
    return new;
  elsif TG_OP = 'UPDATE' then
    if old.yarn_id is not null then
      update yarn_inventory set quantity = quantity + old.quantity_used where id = old.yarn_id;
    end if;
    if new.yarn_id is not null then
      update yarn_inventory set quantity = quantity - new.quantity_used where id = new.yarn_id;
    end if;
    return new;
  elsif TG_OP = 'DELETE' then
    if old.yarn_id is not null then
      update yarn_inventory set quantity = quantity + old.quantity_used where id = old.yarn_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_adjust_yarn_stock on project_yarn;
create trigger trg_adjust_yarn_stock
  after insert or update or delete on project_yarn
  for each row execute function adjust_yarn_stock();

-- ---------- ROW LEVEL SECURITY ----------

alter table yarn_inventory enable row level security;
alter table materials enable row level security;
alter table project_yarn enable row level security;

-- Public sees only "public" + non-archived yarn/materials; you (signed in) see everything
create policy "Public can read visible yarn" on yarn_inventory
  for select using ((visibility = 'public' and archived = false) or auth.role() = 'authenticated');
create policy "Public can read visible materials" on materials
  for select using ((visibility = 'public' and archived = false) or auth.role() = 'authenticated');

-- project_yarn is just a link table (no sensitive fields of its own) — readable by anyone
create policy "Public can read project_yarn" on project_yarn
  for select using (true);

-- Writes restricted to you (signed-in admin)
create policy "Authenticated can insert yarn" on yarn_inventory for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update yarn" on yarn_inventory for update using (auth.role() = 'authenticated');
create policy "Authenticated can delete yarn" on yarn_inventory for delete using (auth.role() = 'authenticated');

create policy "Authenticated can insert materials" on materials for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update materials" on materials for update using (auth.role() = 'authenticated');
create policy "Authenticated can delete materials" on materials for delete using (auth.role() = 'authenticated');

create policy "Authenticated can insert project_yarn" on project_yarn for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update project_yarn" on project_yarn for update using (auth.role() = 'authenticated');
create policy "Authenticated can delete project_yarn" on project_yarn for delete using (auth.role() = 'authenticated');

-- ============================================================
-- Note: the trigger adjusts stock automatically. If you ever need to
-- correct a quantity by hand (e.g. after a manual recount), just edit
-- the yarn's "Quantity" field directly in Admin — that bypasses the
-- trigger entirely since it's not going through project_yarn.
-- ============================================================
