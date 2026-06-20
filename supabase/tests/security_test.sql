-- Security regressions for the 2026-06-13 audit fixes (migration 0005). Runs
-- after the migrations (which include 0005) on the throwaway Postgres. The DO
-- blocks run as the postgres superuser, so they bypass RLS/grants — the GRANT
-- check (#1) is asserted via has_table_privilege, and the CHECK (#8) fires for
-- every writer including superuser.
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

select 'ALL SECURITY TESTS PASSED' as result;
