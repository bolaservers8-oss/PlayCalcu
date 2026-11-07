create table if not exists public.data_maps (
  id text primary key,
  name text not null check (char_length(name) between 1 and 80),
  version integer not null check (version > 0),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  published boolean not null default true,
  data jsonb not null,
  constraint data_maps_payload_object check (jsonb_typeof(data) = 'object')
);

create index if not exists data_maps_published_updated_idx
  on public.data_maps (updated_at desc)
  where published = true;

alter table public.data_maps enable row level security;

drop policy if exists "Anyone can read published maps" on public.data_maps;
create policy "Anyone can read published maps"
  on public.data_maps for select
  using (published = true);

drop policy if exists "Editors can publish maps they own" on public.data_maps;
create policy "Editors can publish maps they own"
  on public.data_maps for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Editors can update maps they own" on public.data_maps;
create policy "Editors can update maps they own"
  on public.data_maps for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Editors can delete maps they own" on public.data_maps;
create policy "Editors can delete maps they own"
  on public.data_maps for delete to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.data_maps to anon, authenticated;
grant insert, update, delete on public.data_maps to authenticated;
