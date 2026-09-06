alter table public.tournaments add column if not exists registration_close_date date;

create table if not exists public.tournament_phase_dates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage text not null check (stage in ('group','round_of_16','quarter_final','semi_final','final')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  unique (tournament_id, stage)
);

alter table public.tournament_phase_dates enable row level security;
create policy "public reads tournament phase dates" on public.tournament_phase_dates for select using (true);
create policy "admins manage tournament phase dates" on public.tournament_phase_dates for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.register_tournament_pair(
  p_category_id uuid,
  p_player_one_first_name text, p_player_one_last_name text, p_player_one_alias text, p_player_one_dni text,
  p_player_two_first_name text, p_player_two_last_name text, p_player_two_alias text, p_player_two_dni text,
  p_contact_phone text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tournament public.tournaments;
  v_category public.tournament_categories;
  v_pair_id uuid;
begin
  select c.* into v_category from public.tournament_categories c where c.id = p_category_id;
  if not found then raise exception 'Categoría inválida'; end if;
  select t.* into v_tournament from public.tournaments t where t.id = v_category.tournament_id;
  if v_tournament.status <> 'open' then raise exception 'Las inscripciones no están abiertas'; end if;
  if v_tournament.registration_close_date is not null and current_date > v_tournament.registration_close_date then raise exception 'La inscripción ya cerró'; end if;
  if p_player_one_dni !~ '^[0-9]+$' or p_player_two_dni !~ '^[0-9]+$' or p_contact_phone !~ '^[0-9]+$' then raise exception 'DNI y teléfono solo admiten números'; end if;
  insert into public.pairs(category_id,player_one_alias,player_two_alias,status) values (p_category_id,trim(p_player_one_alias),trim(p_player_two_alias),'pending') returning id into v_pair_id;
  insert into public.pair_private_data(pair_id,player_one_first_name,player_one_last_name,player_one_dni,player_one_category,player_two_first_name,player_two_last_name,player_two_dni,player_two_category,contact_phone)
  values (v_pair_id,trim(p_player_one_first_name),trim(p_player_one_last_name),trim(p_player_one_dni),v_category.name,trim(p_player_two_first_name),trim(p_player_two_last_name),trim(p_player_two_dni),v_category.name,trim(p_contact_phone));
  return v_pair_id;
end;
$$;

revoke all on function public.register_tournament_pair(uuid,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.register_tournament_pair(uuid,text,text,text,text,text,text,text,text,text) to anon, authenticated;
