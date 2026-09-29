-- Migración 003: Padrón Único de Jugadoras (registro unívoco por DNI)
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  dni text not null unique check (dni ~ '^[0-9]+$'),
  first_name text not null check (char_length(trim(first_name)) >= 1),
  last_name text not null check (char_length(trim(last_name)) >= 1),
  alias text not null,
  category text,
  phone text check (phone is null or phone ~ '^[0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists players_dni_idx on public.players(dni);
create index if not exists players_names_idx on public.players(last_name, first_name);

alter table public.players enable row level security;
create policy "public reads players" on public.players for select using (true);
create policy "admins manage players" on public.players for all using (public.is_admin()) with check (public.is_admin());

-- Poblar padrón inicial desde los registros existentes en pair_private_data
insert into public.players (dni, first_name, last_name, alias, category, phone)
select distinct on (d.player_one_dni)
  d.player_one_dni as dni,
  trim(d.player_one_first_name) as first_name,
  trim(d.player_one_last_name) as last_name,
  trim(p.player_one_alias) as alias,
  d.player_one_category as category,
  d.contact_phone as phone
from public.pair_private_data d
join public.pairs p on p.id = d.pair_id
where d.player_one_dni ~ '^[0-9]+$'
on conflict (dni) do update set
  category = coalesce(excluded.category, public.players.category),
  phone = coalesce(excluded.phone, public.players.phone);

insert into public.players (dni, first_name, last_name, alias, category, phone)
select distinct on (d.player_two_dni)
  d.player_two_dni as dni,
  trim(d.player_two_first_name) as first_name,
  trim(d.player_two_last_name) as last_name,
  trim(p.player_two_alias) as alias,
  d.player_two_category as category,
  d.contact_phone as phone
from public.pair_private_data d
join public.pairs p on p.id = d.pair_id
where d.player_two_dni ~ '^[0-9]+$'
on conflict (dni) do update set
  category = coalesce(excluded.category, public.players.category),
  phone = coalesce(excluded.phone, public.players.phone);
