create extension if not exists pgcrypto;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) >= 4),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  location text not null,
  registration_price numeric(12,2),
  whatsapp_number text not null check (whatsapp_number ~ '^[0-9]+$'),
  status text not null default 'draft' check (status in ('draft','open','in_progress','finished')),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.tournament_categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  created_at timestamptz not null default now()
);

-- Public aliases only. Names, DNI and phone are intentionally stored separately.
create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  player_one_alias text not null,
  player_two_alias text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  group_name text,
  created_at timestamptz not null default now()
);

create table public.pair_private_data (
  pair_id uuid primary key references public.pairs(id) on delete cascade,
  player_one_first_name text not null,
  player_one_last_name text not null,
  player_one_dni text not null check (player_one_dni ~ '^[0-9]+$'),
  player_one_category text not null,
  player_two_first_name text not null,
  player_two_last_name text not null,
  player_two_dni text not null check (player_two_dni ~ '^[0-9]+$'),
  player_two_category text not null,
  contact_phone text not null check (contact_phone ~ '^[0-9]+$')
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  name text not null
);
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  stage text not null check (stage in ('group','round_of_16','quarter_final','semi_final','final')),
  group_id uuid references public.groups(id) on delete set null,
  pair_one_id uuid references public.pairs(id) on delete set null,
  pair_two_id uuid references public.pairs(id) on delete set null,
  score text,
  winner_pair_id uuid references public.pairs(id) on delete set null,
  played_at timestamptz
);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index tournaments_dates_idx on public.tournaments(start_date,end_date);
create index categories_tournament_idx on public.tournament_categories(tournament_id);
create index pairs_category_idx on public.pairs(category_id);
create index matches_category_idx on public.matches(category_id);

alter table public.tournaments enable row level security;
alter table public.tournament_categories enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_private_data enable row level security;
alter table public.groups enable row level security;
alter table public.matches enable row level security;
alter table public.admins enable row level security;

create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;

create policy "public reads published tournaments" on public.tournaments for select using (status <> 'draft' or public.is_admin());
create policy "public reads categories" on public.tournament_categories for select using (true);
create policy "public reads pair aliases" on public.pairs for select using (status = 'confirmed' or public.is_admin());
create policy "public reads groups" on public.groups for select using (true);
create policy "public reads matches" on public.matches for select using (true);
create policy "admins manage tournaments" on public.tournaments for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage categories" on public.tournament_categories for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage pairs" on public.pairs for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage private registrations" on public.pair_private_data for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage groups" on public.groups for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage matches" on public.matches for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read admins" on public.admins for select using (public.is_admin());

-- After creating your first Auth user, run this manually in SQL Editor:
-- insert into public.admins (user_id) select id from auth.users where email = 'YOUR_ADMIN_EMAIL';