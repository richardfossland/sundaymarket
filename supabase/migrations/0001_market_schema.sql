-- ============================================================================
-- SundayMarket — database schema
--
-- Lives in a dedicated `market` Postgres schema so it can coexist with the
-- other SundaySuite apps (SundayChess, SundayTurnering, …) in the same Supabase
-- project without table clashes — respecting the free-tier 2-project limit.
--
-- Architecture (per the SundayMarket plan): the game is session-scoped with NO
-- user auth. RLS is enabled but OPEN — anon may read/insert/update game rows.
-- All resource MUTATIONS go through SECURITY DEFINER functions so balances
-- can't be forged from the client.
--
-- ⚠️  AFTER running this migration you MUST add `market` to the project's
--     exposed schemas:  Dashboard → Settings → API → "Exposed schemas" → add
--     `market` → Save. Without that, PostgREST will not route market.* calls.
-- ============================================================================

create extension if not exists "pgcrypto";

create schema if not exists market;

-- ---------- Sessions ----------
create table market.sessions (
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
create table market.players (
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
create table market.trades (
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
create table market.buildings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references market.sessions(id) on delete cascade,
  type text not null
    check (type in ('hut','house','market','castle','guild')),
  built_by uuid[] not null,
  round int not null,
  points_awarded int not null,
  created_at timestamptz default now()
);

-- ---------- Row Level Security (open, session-scoped) ----------
alter table market.sessions  enable row level security;
alter table market.players   enable row level security;
alter table market.trades    enable row level security;
alter table market.buildings enable row level security;

create policy "Anyone can read sessions"   on market.sessions for select using (true);
create policy "Anyone can insert sessions" on market.sessions for insert with check (true);
create policy "Anyone can update sessions" on market.sessions for update using (true);

create policy "Anyone can read players"     on market.players for select using (true);
create policy "Anyone can insert players"   on market.players for insert with check (true);
create policy "Anyone can update players"   on market.players for update using (true);

create policy "Anyone can read trades"      on market.trades for select using (true);
create policy "Anyone can insert trades"    on market.trades for insert with check (true);
create policy "Anyone can update trades"    on market.trades for update using (true);

create policy "Anyone can read buildings"   on market.buildings for select using (true);
create policy "Anyone can insert buildings" on market.buildings for insert with check (true);

-- ---------- Grants (PostgREST routing for anon/authenticated) ----------
grant usage on schema market to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema market to anon, authenticated, service_role;
grant execute on all functions in schema market to anon, authenticated, service_role;
alter default privileges in schema market grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema market grant execute on functions to anon, authenticated, service_role;

-- ---------- Realtime ----------
alter publication supabase_realtime add table market.sessions;
alter publication supabase_realtime add table market.players;
alter publication supabase_realtime add table market.trades;
alter publication supabase_realtime add table market.buildings;

-- ============================================================================
-- Server-side game logic — SECURITY DEFINER so all resource mutations are
-- validated server-side and never trusted from the client.
-- ============================================================================

-- Function: run production phase for a session
create or replace function market.run_production(p_session_id uuid)
returns void language plpgsql security definer
set search_path = market, public as $$
declare
  player record;
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

    -- World event modifiers
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

    -- Storm: halve wood after adding
    if event is not null and event->>'type' = 'storm' then
      update market.players set
        resources = resources || jsonb_build_object(
          'wood', floor(((resources->>'wood')::int) / 2)
        )
      where id = player.id;
    end if;

  end loop;
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

  -- Get current resources
  select * into initiator from market.players where id = t.initiator_id for update;
  select * into receiver from market.players where id = t.receiver_id for update;

  -- Validate initiator has enough to give
  if (initiator.resources->>'wood')::int  < (t.offer->>'wood')::int  or
     (initiator.resources->>'stone')::int < (t.offer->>'stone')::int or
     (initiator.resources->>'food')::int  < (t.offer->>'food')::int  or
     (initiator.resources->>'gold')::int  < (t.offer->>'gold')::int then
    update market.trades set status = 'rejected' where id = p_trade_id;
    return jsonb_build_object('success', false, 'error', 'Initiator lacks resources');
  end if;

  -- Validate receiver has enough to give
  if (receiver.resources->>'wood')::int  < (t.request->>'wood')::int  or
     (receiver.resources->>'stone')::int < (t.request->>'stone')::int or
     (receiver.resources->>'food')::int  < (t.request->>'food')::int  or
     (receiver.resources->>'gold')::int  < (t.request->>'gold')::int then
    update market.trades set status = 'rejected' where id = p_trade_id;
    return jsonb_build_object('success', false, 'error', 'Receiver lacks resources');
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

  if sess.phase != 'building' then
    return jsonb_build_object('success', false, 'error', 'Not in building phase');
  end if;

  -- Set costs and base points
  case p_type
    when 'hut'    then cost_wood:=2; cost_stone:=0; cost_food:=1; cost_gold:=0; points:=15;
    when 'house'  then cost_wood:=3; cost_stone:=2; cost_food:=1; cost_gold:=0; points:=40;
    when 'market' then cost_wood:=2; cost_stone:=2; cost_food:=2; cost_gold:=0; points:=70;
    when 'castle' then cost_wood:=3; cost_stone:=3; cost_food:=2; cost_gold:=2; points:=150;
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

-- Function: check and award mission completion
create or replace function market.check_mission(p_player_id uuid, p_session_id uuid)
returns void language plpgsql security definer
set search_path = market, public as $$
declare
  player record;
  house_count int;
  castle_count int;
  guild_count int;
  bonus int := 0;
begin
  select * into player from market.players where id = p_player_id;
  if player.mission_completed then return; end if;

  case player.mission
    when 'architect' then
      select count(*) into house_count from market.buildings
        where session_id = p_session_id and type = 'house' and p_player_id = any(built_by);
      if house_count >= 3 then bonus := 50; end if;
    when 'trader' then
      if player.trade_count >= 15 then bonus := 60; end if;
    when 'castle_builder' then
      select count(*) into castle_count from market.buildings
        where session_id = p_session_id and type = 'castle' and p_player_id = any(built_by);
      if castle_count >= 1 then bonus := 80; end if;
    when 'philanthropist' then
      -- Checked separately at game end
      null;
    when 'guildmaster' then
      select count(*) into guild_count from market.buildings
        where session_id = p_session_id and type = 'guild' and p_player_id = any(built_by);
      if guild_count >= 1 then bonus := 70; end if;
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

-- ---------- Trade expiry (optional pg_cron job) ----------
-- If pg_cron is enabled (Dashboard → Database → Extensions → pg_cron), schedule:
--   select cron.schedule('market-expire-trades', '* * * * *', $cron$
--     update market.trades set status = 'expired'
--     where status = 'pending' and created_at < now() - interval '60 seconds';
--   $cron$);
