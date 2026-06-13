-- ============================================================================
-- SundayMarket — live market price index  (idempotent: safe to re-run)
--
-- Adds a derived price signal per resource per session. On every accepted
-- trade, `market.recompute_prices` blends the realized exchange ratios of that
-- trade (how much of resource X changed hands for resource Y) into a smoothed
-- running average, then nudges each price by current SCARCITY (the rarer a
-- resource is across all players, the more it is worth).
--
-- Prices are server-authoritative: the only writer is the SECURITY DEFINER
-- `recompute_prices`, called from inside `accept_trade`. The projector ticker
-- and the player trade hint merely read `market.prices` over realtime.
--
-- Depends on 0001_market_schema.sql. After running, `market.prices` is added to
-- the realtime publication below — no extra dashboard step needed for it (the
-- `market` schema is already exposed for 0001).
-- ============================================================================

create schema if not exists market;

-- ---------- Prices ----------
-- One row per (session, resource). `price` is the live blended index, anchored
-- so Wood ≈ 1.0 at the start. `prev_price` lets the UI draw up/down arrows.
create table if not exists market.prices (
  session_id uuid not null references market.sessions(id) on delete cascade,
  resource   text not null check (resource in ('wood','stone','food','gold')),
  price      numeric(8,3) not null default 1.000,
  prev_price numeric(8,3) not null default 1.000,
  trades_seen int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, resource)
);

create index if not exists idx_prices_session on market.prices(session_id);

-- ---------- RLS (open read, mutations only via SECURITY DEFINER) ----------
alter table market.prices enable row level security;

drop policy if exists "Anyone can read prices" on market.prices;
create policy "Anyone can read prices" on market.prices for select using (true);
-- No insert/update/delete policy: anon cannot forge prices. The SECURITY
-- DEFINER `recompute_prices` runs as owner and bypasses RLS to write.

-- ---------- Grants ----------
grant usage on schema market to anon, authenticated, service_role;
grant select on market.prices to anon, authenticated, service_role;
grant select, insert, update, delete on market.prices to service_role;

-- ---------- Realtime (guarded — re-runnable) ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'market' and tablename = 'prices'
  ) then
    execute 'alter publication supabase_realtime add table market.prices';
  end if;
end $$;

-- ============================================================================
-- Price model
-- ============================================================================

-- Baseline anchor weights — the "fair" relative value of each resource if
-- supply were perfectly even. Mirrors how scarce each role's output is
-- (a goldminer makes 2 gold/round vs a lumberjack's 4 wood). Wood = 1.0 anchor.
create or replace function market.base_price(p_resource text)
returns numeric language sql immutable as $$
  select case p_resource
    when 'wood'  then 1.0
    when 'stone' then 1.0
    when 'food'  then 1.0
    when 'gold'  then 2.0
    else 1.0
  end::numeric
$$;

-- recompute_prices: re-derive the live price index for a session after a trade.
--
-- Two signals, blended:
--   1. SCARCITY — sum each resource across every player in the session. The
--      rarer a resource (smaller share of total supply), the higher its
--      scarcity multiplier. Anchored so an even split leaves prices at base.
--   2. REALIZED RATIO — for the accepted trade, the implied exchange rate
--      between what was given and what was requested feeds a smoothed running
--      average (EMA), so a flurry of "lots of wood for a little gold" trades
--      drags wood down / gold up over time.
--
-- The final price is base × scarcity × realized, then EMA-smoothed against the
-- previous price for a calm ticker. `prev_price` snapshots the value before
-- this update so the UI can show an up/down arrow.
create or replace function market.recompute_prices(p_session_id uuid, p_trade_id uuid default null)
returns void language plpgsql security definer
set search_path = market, public as $$
declare
  res text;
  resources_arr text[] := array['wood','stone','food','gold'];
  totals jsonb;
  grand_total numeric;
  scarcity numeric;
  share numeric;
  t record;
  offer_units numeric;
  request_units numeric;
  realized numeric;
  target numeric;
  old_price numeric;
  new_price numeric;
  -- EMA smoothing factor: 0 = frozen, 1 = jumps instantly. 0.35 = responsive
  -- but not jittery on a classroom-sized session.
  alpha numeric := 0.35;
begin
  -- 1. Current supply per resource across all players in the session.
  select jsonb_build_object(
           'wood',  coalesce(sum((resources->>'wood')::int), 0),
           'stone', coalesce(sum((resources->>'stone')::int),0),
           'food',  coalesce(sum((resources->>'food')::int), 0),
           'gold',  coalesce(sum((resources->>'gold')::int), 0)
         )
    into totals
    from market.players where session_id = p_session_id;

  grand_total := coalesce((totals->>'wood')::numeric,0) + coalesce((totals->>'stone')::numeric,0)
               + coalesce((totals->>'food')::numeric,0) + coalesce((totals->>'gold')::numeric,0);

  -- 2. Realized exchange ratio from the just-accepted trade (if any). We treat
  --    the trade as "offer units bought request units"; resources flowing OUT
  --    of the initiator (the offer) are being spent to acquire the request, so
  --    requested resources gain value and offered resources lose value,
  --    proportional to the size mismatch.
  realized := 1.0;  -- neutral default when no trade context
  if p_trade_id is not null then
    select * into t from market.trades where id = p_trade_id;
    if found and t.status = 'accepted' then
      offer_units   := market.resource_units(t.offer);
      request_units := market.resource_units(t.request);
    end if;
  end if;

  -- 3. Recompute each resource price.
  foreach res in array resources_arr loop
    -- Scarcity multiplier: even split => 0.25 share => multiplier 1.0.
    -- Rarer than even => >1.0, more abundant => <1.0. Clamped to keep the
    -- ticker readable.
    if grand_total > 0 then
      share := coalesce((totals->>res)::numeric, 0) / grand_total;
      if share <= 0 then
        scarcity := 2.5;  -- nonexistent resource is maximally precious
      else
        scarcity := least(2.5, greatest(0.4, 0.25 / share));
      end if;
    else
      scarcity := 1.0;
    end if;

    -- Realized-ratio nudge for this specific resource from the trade.
    target := market.base_price(res) * scarcity;
    if p_trade_id is not null and offer_units is not null and request_units is not null
       and offer_units > 0 and request_units > 0 then
      -- If this resource was REQUESTED (acquired), it traded at a premium;
      -- if it was OFFERED (given away), at a discount. Magnitude scaled by the
      -- units of that resource in the trade vs the trade size.
      if coalesce((t.request->>res)::numeric,0) > 0 then
        realized := offer_units / request_units;        -- >1 => paid a lot for it
        target := target * least(2.0, greatest(0.5, realized));
      elsif coalesce((t.offer->>res)::numeric,0) > 0 then
        realized := request_units / offer_units;         -- got little for it
        target := target * least(2.0, greatest(0.5, realized));
      end if;
    end if;

    -- EMA-smooth toward the target against the existing price.
    select price into old_price from market.prices
      where session_id = p_session_id and resource = res;
    if old_price is null then
      old_price := market.base_price(res);
    end if;
    new_price := round(old_price * (1 - alpha) + target * alpha, 3);
    -- Keep prices in a sane, display-friendly band.
    new_price := least(9.999, greatest(0.1, new_price));

    insert into market.prices (session_id, resource, price, prev_price, trades_seen, updated_at)
    values (p_session_id, res, new_price, old_price, case when p_trade_id is null then 0 else 1 end, now())
    on conflict (session_id, resource) do update set
      prev_price  = market.prices.price,
      price       = excluded.price,
      trades_seen = market.prices.trades_seen + case when p_trade_id is null then 0 else 1 end,
      updated_at  = now();
  end loop;
end;
$$;

grant execute on function market.recompute_prices(uuid, uuid) to anon, authenticated, service_role;
grant execute on function market.base_price(text) to anon, authenticated, service_role;

-- ============================================================================
-- Wire recompute_prices into accept_trade. We re-create the function verbatim
-- from 0001 with a single added line near the end (after the trade is marked
-- accepted) so this migration stays self-contained and idempotent.
-- ============================================================================
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

  -- Re-derive the live market price index from the new supply + this trade.
  perform market.recompute_prices(t.session_id, p_trade_id);

  return jsonb_build_object('success', true);
end;
$$;
