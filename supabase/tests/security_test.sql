-- Security regressions for the 2026-06-13 audit fixes (migrations 0005 + 0006).
-- Runs after the migrations on the throwaway Postgres. The DO blocks run as the
-- postgres superuser, so they bypass RLS/grants — GRANT checks are asserted via
-- has_table_privilege, and CHECKs fire for every writer. To exercise the 0006
-- INSERT-forge trigger (which exempts postgres) we briefly `set role anon` so the
-- insert runs as an untrusted PostgREST-style caller.
set search_path = market, public;

-- #1 — direct UPDATE on players must be denied to anon/authenticated; SELECT and
-- the SECURITY DEFINER RPC path stay intact.
do $$
begin
  assert not has_table_privilege('anon', 'market.players', 'UPDATE'),
    '#1: anon can still UPDATE players';
  assert not has_table_privilege('authenticated', 'market.players', 'UPDATE'),
    '#1: authenticated can still UPDATE players';
  assert has_table_privilege('anon', 'market.players', 'SELECT'),
    '#1: anon unexpectedly lost SELECT on players';
  raise notice 'PASS #1: direct UPDATE on players revoked (anon/authenticated); reads intact';
end $$;

-- #8 — a trade with a negative offer/request amount must be rejected; a normal
-- non-negative trade still inserts.
do $$
declare
  s uuid; p1 uuid; p2 uuid; rejected boolean := false;
begin
  insert into market.sessions (code, host_id, phase) values ('SECTST', 'h', 'trading') returning id into s;
  insert into market.players (session_id, name, role, mission, resources)
    values (s, 'A', 'lumberjack', 'm', '{"wood":10,"stone":10,"food":10,"gold":10}') returning id into p1;
  insert into market.players (session_id, name, role, mission, resources)
    values (s, 'B', 'farmer', 'm', '{"wood":10,"stone":10,"food":10,"gold":10}') returning id into p2;

  begin
    insert into market.trades (session_id, initiator_id, receiver_id, offer, request)
      values (s, p1, p2, '{"wood":1,"stone":0,"food":0,"gold":0}', '{"wood":-50,"stone":0,"food":0,"gold":0}');
  exception when check_violation then rejected := true;
  end;
  assert rejected, '#8: a negative trade request was NOT rejected (trades_non_negative missing)';

  insert into market.trades (session_id, initiator_id, receiver_id, offer, request)
    values (s, p1, p2, '{"wood":1,"stone":0,"food":0,"gold":0}', '{"wood":2,"stone":0,"food":0,"gold":0}');
  raise notice 'PASS #8: negative trade rejected; valid trade accepted';
end $$;

-- 0006 1A — a forged player INSERT by an untrusted (anon) caller has its
-- score-bearing columns reset by the trigger; client-chosen identity is kept.
insert into market.sessions (code, host_id, phase) values ('SEC06A', 'h', 'lobby');
set role anon;
insert into market.players (session_id, name, role, mission, resources, score, trade_count, mission_completed)
  select id, 'Forger', 'goldminer', 'trader',
         '{"wood":999,"stone":999,"food":999,"gold":999}', 5000, 99, true
    from market.sessions where code = 'SEC06A';
reset role;
do $$
declare r record;
begin
  select p.* into r from market.players p
    join market.sessions s on s.id = p.session_id where s.code = 'SEC06A';
  assert r.score = 0,                 '0006 1A: forged score not reset';
  assert r.trade_count = 0,           '0006 1A: forged trade_count not reset';
  assert r.mission_completed = false, '0006 1A: forged mission_completed not reset';
  assert market.resource_units(r.resources) = 0, '0006 1A: forged resources not reset';
  assert r.name = 'Forger' and r.role = 'goldminer' and r.mission = 'trader',
                                      '0006 1A: client-chosen identity fields unexpectedly altered';
  raise notice 'PASS 0006 1A: forged player INSERT neutralised; identity preserved';
end $$;

-- 0006 1B — open sessions UPDATE removed; set_phase is host_id-gated + guarded,
-- and persists round/world_event/narration with NULL-leaves / ''-clears semantics.
do $$
declare s uuid;
begin
  assert not has_table_privilege('anon', 'market.sessions', 'UPDATE'),
    '0006 1B: anon can still UPDATE sessions';
  assert not has_table_privilege('authenticated', 'market.sessions', 'UPDATE'),
    '0006 1B: authenticated can still UPDATE sessions';
  assert has_table_privilege('anon', 'market.sessions', 'SELECT'),
    '0006 1B: anon unexpectedly lost SELECT on sessions';

  insert into market.sessions (code, host_id, phase) values ('SEC06B', 'secret-host', 'lobby') returning id into s;

  -- wrong host_id: rejected, row unchanged
  assert market.set_phase(s, 'WRONG', 'production') = false, '0006 1B: set_phase accepted a wrong host_id';
  assert (select phase from market.sessions where id = s) = 'lobby', '0006 1B: phase changed on bad host_id';

  -- correct host_id: advances phase, persists round + world_event + narration
  assert market.set_phase(s, 'secret-host', 'production', 1, '{"type":"harvest"}'::jsonb, 'Hør, hør!') = true,
    '0006 1B: set_phase rejected the correct host';
  assert (select phase from market.sessions where id = s) = 'production',          '0006 1B: phase not advanced';
  assert (select round from market.sessions where id = s) = 1,                     '0006 1B: round not set';
  assert (select world_event->>'type' from market.sessions where id = s) = 'harvest', '0006 1B: world_event not persisted';
  assert (select narration from market.sessions where id = s) = 'Hør, hør!',       '0006 1B: narration not persisted';

  -- expected_phase guard: a stale guard ('lobby' when row is 'production') is a no-op
  assert market.set_phase(s, 'secret-host', 'trading', null, null, null, true, 'lobby') = false,
    '0006 1B: expected_phase guard did not block a stale transition';
  assert (select phase from market.sessions where id = s) = 'production', '0006 1B: phase changed despite a failed guard';

  -- '' clears narration; the guarded production→trading still succeeds
  assert market.set_phase(s, 'secret-host', 'trading', null, null, '', false, 'production') = true,
    '0006 1B: guarded production→trading rejected';
  assert (select narration from market.sessions where id = s) is null, '0006 1B: empty-string narration did not clear';
  raise notice 'PASS 0006 1B: sessions UPDATE locked; set_phase host-gated + guarded';
end $$;

-- 0007 — trades write-tamper lock. An untrusted (anon) writer may only flip a
-- pending trade to rejected/expired; economic + party columns are frozen, and
-- DELETE is revoked. The SECURITY DEFINER path (postgres) is unaffected.
-- Follows the 0006 1A pattern: `set role anon` at the TOP LEVEL (not inside a
-- DO block) so the guarded operations run as an untrusted PostgREST-style caller.
do $$
declare s uuid; p1 uuid; p2 uuid; p3 uuid;
begin
  insert into market.sessions (code, host_id, phase) values ('SEC07', 'h', 'trading') returning id into s;
  insert into market.players (session_id, name, role, mission, resources)
    values (s, 'A', 'lumberjack', 'm', '{"wood":10,"stone":10,"food":10,"gold":10}') returning id into p1;
  insert into market.players (session_id, name, role, mission, resources)
    values (s, 'B', 'farmer', 'm', '{"wood":10,"stone":10,"food":10,"gold":10}') returning id into p2;
  insert into market.players (session_id, name, role, mission, resources)
    values (s, 'C', 'goldminer', 'm', '{"wood":10,"stone":10,"food":10,"gold":10}') returning id into p3;
  insert into market.trades (session_id, initiator_id, receiver_id, offer, request)
    values (s, p1, p2, '{"wood":1,"stone":0,"food":0,"gold":0}', '{"wood":2,"stone":0,"food":0,"gold":0}');
  assert not has_table_privilege('anon', 'market.trades', 'DELETE'),
    '0007: anon can still DELETE trades';
  assert has_table_privilege('anon', 'market.trades', 'INSERT'),
    '0007: anon unexpectedly lost INSERT on trades (legit propose path)';
end $$;

set role anon;
do $$
declare tr uuid; p3 uuid; blocked boolean;
begin
  select t.id into tr from market.trades t join market.sessions s on s.id = t.session_id where s.code = 'SEC07';
  select p.id into p3 from market.players p join market.sessions s on s.id = p.session_id
    where s.code = 'SEC07' and p.name = 'C';

  -- legit: decline a pending trade
  update market.trades set status = 'rejected' where id = tr;

  -- forbidden: inflate the request amount
  blocked := false;
  begin update market.trades set request = '{"wood":9999,"stone":0,"food":0,"gold":0}' where id = tr;
  exception when others then blocked := true; end;
  assert blocked, '0007: untrusted writer could rewrite a trade request amount';

  -- forbidden: repoint the receiver
  blocked := false;
  begin update market.trades set receiver_id = p3 where id = tr;
  exception when others then blocked := true; end;
  assert blocked, '0007: untrusted writer could repoint a trade party';

  -- forbidden: forge an accepted status directly (only the RPC may)
  blocked := false;
  begin update market.trades set status = 'accepted' where id = tr;
  exception when others then blocked := true; end;
  assert blocked, '0007: untrusted writer could forge status=accepted';
end $$;
reset role;

do $$
declare st text;
begin
  select t.status into st from market.trades t join market.sessions s on s.id = t.session_id where s.code = 'SEC07';
  assert st = 'rejected', '0007: the legit reject did not persist / a forbidden write leaked through';
  raise notice 'PASS 0007: trade economic/party columns frozen for untrusted writers; only reject/expire allowed; DELETE revoked';
end $$;

select 'ALL SECURITY TESTS PASSED' as result;
