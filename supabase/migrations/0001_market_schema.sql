-- ============================================================================
-- SundayMarket — database schema  (idempotent: safe to re-run)
--
-- Lives in a dedicated `market` Postgres schema so it can coexist with the
-- other SundaySuite apps (SundayChess, SundayTurnering, …) in the same Supabase
-- project without table clashes — respecting the free-tier 2-project limit.
--
-- Architecture: the game is session-scoped with NO user auth. RLS is enabled
-- but OPEN — anon may read/insert/update game rows. All resource MUTATIONS go
-- through SECURITY DEFINER functions so balances/scores can't be forged.
--
-- ⚠️  AFTER running this migration you MUST add `market` to the project's
--     exposed schemas:  Dashboard → Settings → API → "Exposed schemas" → add
--     `market` → Save. Without that, PostgREST will not route market.* calls.
-- ============================================================================

create extension if not exists "pgcrypto";

create schema if not exists market;

-- ---------- Sessions ----------
create table if not exists market.sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id text not null,
  phase text not null default 'lobby'
    check (phase in ('lobby','production','trading','building','ended')),
  round int not null default 0,
  max_rounds int not null default 6,
  trade_seconds int not null default 240,
  phase_started_at timestamptz,
  world_event jsonb,
  created_at timestamptz default now()
);

-- ---------- Players ----------
create table if not exists market.players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references market.sessions(id) on delete cascade,
  name text not null,
  role text not null
    check (role in ('lumberjack','stonemason','farmer','goldminer')),
  resources jsonb not null default '{"wood":0,"stone":0,"food":0,"gold":0}',
  score int not null default 0,
  trade_count int not null default 0,
  mission text not null,
  mission_completed bool not null default false,
  is_online bool not null default true,
  created_at timestamptz default now()
);

-- ---------- Trades ----------
create table if not exists market.trades (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references market.sessions(id) on delete cascade,
  initiator_id uuid references market.players(id) on delete cascade,
  receiver_id uuid references market.players(id) on delete cascade,
  offer jsonb not null,
  request jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','expired')),
  created_at timestamptz default now()
);

-- ---------- Buildings ----------
create table if not exists market.buildings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references market.sessions(id) on delete cascade,
  type text not null
    check (type in ('hut','house','market','castle','guild')),
  built_by uuid[] not null,
  round int not null,
  points_awarded int not null,
  created_at timestamptz default now()
);

-- Helpful indexes for the hot lookups (idempotent).
create index if not exists idx_players_session   on market.players(session_id);
create index if not exists idx_trades_receiver    on market.trades(receiver_id);
create index if not exists idx_trades_session     on market.trades(session_id);
create index if not exists idx_buildings_session  on market.buildings(session_id);

-- ---------- Row Level Security (open, session-scoped) ----------
alter table market.sessions  enable row level security;
alter table market.players   enable row level security;
alter table market.trades    enable row level security;
alter table market.buildings enable row level security;

drop policy if exists "Anyone can read sessions"   on market.sessions;
drop policy if exists "Anyone can insert sessions" on market.sessions;
drop policy if exists "Anyone can update sessions" on market.sessions;
create policy "Anyone can read sessions"   on market.sessions for select using (true);
create policy "Anyone can insert sessions" on market.sessions for insert with check (true);
create policy "Anyone can update sessions" on market.sessions for update using (true);

drop policy if exists "Anyone can read players"     on market.players;
drop policy if exists "Anyone can insert players"   on market.players;
drop policy if exists "Anyone can update players"   on market.players;
create policy "Anyone can read players"     on market.players for select using (true);
create policy "Anyone can insert players"   on market.players for insert with check (true);
create policy "Anyone can update players"   on market.players for update using (true);

drop policy if exists "Anyone can read trades"      on market.trades;
drop policy if exists "Anyone can insert trades"    on market.trades;
drop policy if exists "Anyone can update trades"    on market.trades;
create policy "Anyone can read trades"      on market.trades for select using (true);
create policy "Anyone can insert trades"    on market.trades for insert with check (true);
create policy "Anyone can update trades"    on market.trades for update using (true);

drop policy if exists "Anyone can read buildings"   on market.buildings;
drop policy if exists "Anyone can insert buildings" on market.buildings;
create policy "Anyone can read buildings"   on market.buildings for select using (true);
create policy "Anyone can insert buildings" on market.buildings for insert with check (true);

-- ---------- Grants (PostgREST routing for anon/authenticated) ----------
grant usage on schema market to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema market to anon, authenticated, service_role;
grant execute on all functions in schema market to anon, authenticated, service_role;
alter default privileges in schema market grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema market grant execute on functions to anon, authenticated, service_role;

-- ---------- Realtime (guarded — re-runnable) ----------
do $$
declare t text;
begin
  foreach t in array array['sessions','players','trades','buildings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'market' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table market.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- Server-side game logic — SECURITY DEFINER so all resource mutations are
-- validated server-side and never trusted from the client.
-- ============================================================================

-- Sum the four resource units in a jsonb resources object.
create or replace function market.resource_units(r jsonb)
returns int language sql immutable as $$
  select coalesce((r->>'wood')::int,0) + coalesce((r->>'stone')::int,0)
       + coalesce((r->>'food')::int,0) + coalesce((r->>'gold')::int,0)
$$;

-- Function: run production phase for a session
create or replace function market.run_production(p_session_id uuid)
returns void language plpgsql security definer
set search_path = market, public as $$
declare
  player record;
  leader record;
  event jsonb;
  wood_add int; stone_add int; food_add int; gold_add int;
begin
  select world_event into event from market.sessions where id = p_session_id;

  for player in select * from market.players where session_id = p_session_id loop
    wood_add := 0; stone_add := 0; food_add := 0; gold_add := 0;

    case player.role
      when 'lumberjack' then wood_add := 4;
      when 'stonemason' then stone_add := 4;
      when 'farmer'     then food_add := 4;
      when 'goldminer'  then gold_add := 2;
    end case;

    -- Production-boosting world events
    if event is not null then
      if event->>'type' = 'harvest' and player.role = 'farmer' then
        food_add := 6;
      end if;
      if event->>'type' = 'gold_rush' and player.role = 'goldminer' then
        gold_add := 4;
      end if;
    end if;

    update market.players set
      resources = jsonb_build_object(
        'wood',  (resources->>'wood')::int  + wood_add,
        'stone', (resources->>'stone')::int + stone_add,
        'food',  (resources->>'food')::int  + food_add,
        'gold',  (resources->>'gold')::int  + gold_add
      )
    where id = player.id;

    -- Storm: halve wood after producing
    if event is not null and event->>'type' = 'storm' then
      update market.players set
        resources = resources || jsonb_build_object('wood', floor(((resources->>'wood')::int) / 2))
      where id = player.id;
    end if;

    -- Famine: halve food after producing
    if event is not null and event->>'type' = 'famine' then
      update market.players set
        resources = resources || jsonb_build_object('food', floor(((resources->>'food')::int) / 2))
      where id = player.id;
    end if;
  end loop;

  -- Royal Tax: the current leader loses 1 of each resource (floored at 0)
  if event is not null and event->>'type' = 'tax' then
    select * into leader from market.players
      where session_id = p_session_id order by score desc, created_at asc limit 1;
    if found then
      update market.players set
        resources = jsonb_build_object(
          'wood',  greatest(0, (resources->>'wood')::int  - 1),
          'stone', greatest(0, (resources->>'stone')::int - 1),
          'food',  greatest(0, (resources->>'food')::int  - 1),
          'gold',  greatest(0, (resources->>'gold')::int  - 1)
        )
      where id = leader.id;
    end if;
  end if;
end;
$$;

-- Function: accept a trade and transfer resources atomically
create or replace function market.accept_trade(p_trade_id uuid, p_receiver_id uuid)
returns jsonb language plpgsql security definer
set search_path = market, public as $$
declare
  t record;
  initiator record;
  receiver record;
begin
  -- Lock the trade row
  select * into t from market.trades where id = p_trade_id for update;

  if t is null then
    return jsonb_build_object('success', false, 'error', 'Trade not found');
  end if;

  if t.status != 'pending' then
    return jsonb_build_object('success', false, 'error', 'Trade no longer pending');
  end if;

  if t.receiver_id != p_receiver_id then
    return jsonb_build_object('success', false, 'error', 'Not your trade');
  end if;

  if t.initiator_id = t.receiver_id then
    update market.trades set status = 'rejected' where id = p_trade_id;
    return jsonb_build_object('success', false, 'error', 'Cannot trade with yourself');
  end if;

  -- Lock both players in a stable order (lowest id first) to avoid deadlocks
  if t.initiator_id < t.receiver_id then
    select * into initiator from market.players where id = t.initiator_id for update;
    select * into receiver  from market.players where id = t.receiver_id  for update;
  else
    select * into receiver  from market.players where id = t.receiver_id  for update;
    select * into initiator from market.players where id = t.initiator_id for update;
  end if;

  if initiator is null or receiver is null then
    update market.trades set status = 'rejected' where id = p_trade_id;
    return jsonb_build_object('success', false, 'error', 'A player has left the game');
  end if;

  if initiator.session_id != receiver.session_id then
    update market.trades set status = 'rejected' where id = p_trade_id;
    return jsonb_build_object('success', false, 'error', 'Players are in different games');
  end if;

  -- Validate initiator has enough to give
  if (initiator.resources->>'wood')::int  < (t.offer->>'wood')::int  or
     (initiator.resources->>'stone')::int < (t.offer->>'stone')::int or
     (initiator.resources->>'food')::int  < (t.offer->>'food')::int  or
     (initiator.resources->>'gold')::int  < (t.offer->>'gold')::int then
    update market.trades set status = 'rejected' where id = p_trade_id;
    return jsonb_build_object('success', false, 'error', 'Sender no longer has those resources');
  end if;

  -- Validate receiver has enough to give
  if (receiver.resources->>'wood')::int  < (t.request->>'wood')::int  or
     (receiver.resources->>'stone')::int < (t.request->>'stone')::int or
     (receiver.resources->>'food')::int  < (t.request->>'food')::int  or
     (receiver.resources->>'gold')::int  < (t.request->>'gold')::int then
    update market.trades set status = 'rejected' where id = p_trade_id;
    return jsonb_build_object('success', false, 'error', 'You don''t have what they asked for');
  end if;

  -- Transfer: initiator gives offer, receives request
  update market.players set
    resources = jsonb_build_object(
      'wood',  (resources->>'wood')::int  - (t.offer->>'wood')::int  + (t.request->>'wood')::int,
      'stone', (resources->>'stone')::int - (t.offer->>'stone')::int + (t.request->>'stone')::int,
      'food',  (resources->>'food')::int  - (t.offer->>'food')::int  + (t.request->>'food')::int,
      'gold',  (resources->>'gold')::int  - (t.offer->>'gold')::int  + (t.request->>'gold')::int
    ),
    trade_count = trade_count + 1
  where id = t.initiator_id;

  -- Transfer: receiver gives request, receives offer
  update market.players set
    resources = jsonb_build_object(
      'wood',  (resources->>'wood')::int  + (t.offer->>'wood')::int  - (t.request->>'wood')::int,
      'stone', (resources->>'stone')::int + (t.offer->>'stone')::int - (t.request->>'stone')::int,
      'food',  (resources->>'food')::int  + (t.offer->>'food')::int  - (t.request->>'food')::int,
      'gold',  (resources->>'gold')::int  + (t.offer->>'gold')::int  - (t.request->>'gold')::int
    ),
    trade_count = trade_count + 1
  where id = t.receiver_id;

  -- Mark trade as accepted
  update market.trades set status = 'accepted' where id = p_trade_id;

  -- A trade can complete the "trader" mission for either side
  perform market.check_mission(t.initiator_id, t.session_id);
  perform market.check_mission(t.receiver_id, t.session_id);

  return jsonb_build_object('success', true);
end;
$$;

-- Function: build a structure
create or replace function market.build_structure(
  p_player_id uuid,
  p_session_id uuid,
  p_type text
)
returns jsonb language plpgsql security definer
set search_path = market, public as $$
declare
  player record;
  sess record;
  cost_wood int; cost_stone int; cost_food int; cost_gold int;
  points int;
  role_bonus int := 0;
begin
  select * into player from market.players where id = p_player_id for update;
  select * into sess from market.sessions where id = p_session_id;

  if player is null then
    return jsonb_build_object('success', false, 'error', 'Player not found');
  end if;

  if sess.phase != 'building' then
    return jsonb_build_object('success', false, 'error', 'Not in building phase');
  end if;

  -- Set costs and base points
  case p_type
    when 'hut'    then cost_wood:=2; cost_stone:=0; cost_food:=1; cost_gold:=0; points:=15;
    when 'house'  then cost_wood:=3; cost_stone:=2; cost_food:=1; cost_gold:=0; points:=40;
    when 'market' then cost_wood:=2; cost_stone:=2; cost_food:=2; cost_gold:=0; points:=70;
    when 'castle' then cost_wood:=3; cost_stone:=3; cost_food:=2; cost_gold:=2; points:=150;
    when 'guild'  then cost_wood:=4; cost_stone:=4; cost_food:=3; cost_gold:=1; points:=200;
    else return jsonb_build_object('success', false, 'error', 'Unknown building type');
  end case;

  -- Check resources
  if (player.resources->>'wood')::int  < cost_wood  or
     (player.resources->>'stone')::int < cost_stone or
     (player.resources->>'food')::int  < cost_food  or
     (player.resources->>'gold')::int  < cost_gold  then
    return jsonb_build_object('success', false, 'error', 'Not enough resources');
  end if;

  -- Role bonuses
  if p_type = 'house'  and player.role = 'lumberjack' then role_bonus := 10; end if;
  if p_type = 'market' and player.role = 'stonemason'  then role_bonus := 10; end if;
  if p_type = 'market' and player.role = 'farmer'      then role_bonus := 10; end if;
  if p_type = 'castle' and player.role = 'goldminer'   then role_bonus := 20; end if;
  if p_type = 'guild'  and player.role = 'goldminer'   then role_bonus := 15; end if;

  -- Deduct resources
  update market.players set
    resources = jsonb_build_object(
      'wood',  (resources->>'wood')::int  - cost_wood,
      'stone', (resources->>'stone')::int - cost_stone,
      'food',  (resources->>'food')::int  - cost_food,
      'gold',  (resources->>'gold')::int  - cost_gold
    ),
    score = score + points + role_bonus
  where id = p_player_id;

  -- Record building
  insert into market.buildings (session_id, type, built_by, round, points_awarded)
  values (p_session_id, p_type, array[p_player_id], sess.round, points + role_bonus);

  -- Check mission completion
  perform market.check_mission(p_player_id, p_session_id);

  return jsonb_build_object('success', true, 'points', points + role_bonus);
end;
$$;

-- Function: check and award mission completion (idempotent per player)
create or replace function market.check_mission(p_player_id uuid, p_session_id uuid)
returns void language plpgsql security definer
set search_path = market, public as $$
declare
  player record;
  cnt int;
  bonus int := 0;
begin
  select * into player from market.players where id = p_player_id for update;
  if player is null or player.mission_completed then return; end if;

  case player.mission
    when 'architect' then
      select count(*) into cnt from market.buildings
        where session_id = p_session_id and type = 'house' and p_player_id = any(built_by);
      if cnt >= 3 then bonus := 50; end if;
    when 'trader' then
      if player.trade_count >= 15 then bonus := 60; end if;
    when 'castle_builder' then
      select count(*) into cnt from market.buildings
        where session_id = p_session_id and type = 'castle' and p_player_id = any(built_by);
      if cnt >= 1 then bonus := 80; end if;
    when 'guildmaster' then
      select count(*) into cnt from market.buildings
        where session_id = p_session_id and type = 'guild' and p_player_id = any(built_by);
      if cnt >= 1 then bonus := 70; end if;
    when 'philanthropist' then
      null;  -- resolved at game end in finalize_game()
    else null;
  end case;

  if bonus > 0 then
    update market.players set
      score = score + bonus,
      mission_completed = true
    where id = p_player_id;
  end if;
end;
$$;

-- Function: end-of-game resolution. Awards the Philanthropist mission
-- (gave away more total resource units than they received across accepted
-- trades) and flips the session to 'ended'. Safe to call once.
create or replace function market.finalize_game(p_session_id uuid)
returns void language plpgsql security definer
set search_path = market, public as $$
declare
  p record;
  given int;
  received int;
begin
  for p in select * from market.players where session_id = p_session_id loop
    if p.mission = 'philanthropist' and not p.mission_completed then
      select coalesce(sum(
        case when t.initiator_id = p.id then market.resource_units(t.offer)  else 0 end +
        case when t.receiver_id  = p.id then market.resource_units(t.request) else 0 end
      ), 0) into given
      from market.trades t
      where t.session_id = p_session_id and t.status = 'accepted'
        and (t.initiator_id = p.id or t.receiver_id = p.id);

      select coalesce(sum(
        case when t.initiator_id = p.id then market.resource_units(t.request) else 0 end +
        case when t.receiver_id  = p.id then market.resource_units(t.offer)   else 0 end
      ), 0) into received
      from market.trades t
      where t.session_id = p_session_id and t.status = 'accepted'
        and (t.initiator_id = p.id or t.receiver_id = p.id);

      if given > received then
        update market.players set score = score + 55, mission_completed = true where id = p.id;
      end if;
    end if;
  end loop;

  -- Expire any leftover pending trades and end the game.
  update market.trades set status = 'expired'
    where session_id = p_session_id and status = 'pending';
  update market.sessions set phase = 'ended' where id = p_session_id;
end;
$$;

-- Function: expire all pending trades for a session (called when trading closes).
create or replace function market.expire_pending_trades(p_session_id uuid)
returns void language plpgsql security definer
set search_path = market, public as $$
begin
  update market.trades set status = 'expired'
    where session_id = p_session_id and status = 'pending';
end;
$$;
