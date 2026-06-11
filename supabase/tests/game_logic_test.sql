\set ON_ERROR_STOP on
set search_path = market, public;

create or replace function pg_temp.assert_eq(actual int, expected int, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL [%]: expected %, got %', label, expected, actual; end if;
  raise notice 'PASS [%] = %', label, actual;
end $$;
create or replace function pg_temp.assert_true(cond bool, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL [%]: expected true', label; end if;
  raise notice 'PASS [%]', label;
end $$;

-- ============ Scenario A: production (no event) + a trade ============
do $$
declare sid uuid; lj uuid; sm uuid; tid uuid; r jsonb; res jsonb;
begin
  insert into sessions(code,host_id,phase) values ('TEST-A','h','production') returning id into sid;
  insert into players(session_id,name,role,mission) values (sid,'Log','lumberjack','trader') returning id into lj;
  insert into players(session_id,name,role,mission) values (sid,'Rock','stonemason','architect') returning id into sm;

  perform run_production(sid);
  select resources into res from players where id=lj;
  perform pg_temp.assert_eq((res->>'wood')::int, 4, 'A: lumberjack wood after production');
  select resources into res from players where id=sm;
  perform pg_temp.assert_eq((res->>'stone')::int, 4, 'A: stonemason stone after production');

  -- lumberjack offers 2 wood, wants 2 stone
  insert into trades(session_id,initiator_id,receiver_id,offer,request)
    values (sid,lj,sm,'{"wood":2,"stone":0,"food":0,"gold":0}','{"wood":0,"stone":2,"food":0,"gold":0}')
    returning id into tid;
  r := accept_trade(tid, sm);
  perform pg_temp.assert_true((r->>'success')::bool, 'A: trade accepted');
  select resources into res from players where id=lj;
  perform pg_temp.assert_eq((res->>'wood')::int, 2, 'A: lumberjack wood after trade');
  perform pg_temp.assert_eq((res->>'stone')::int, 2, 'A: lumberjack stone after trade');
  perform pg_temp.assert_eq((select trade_count from players where id=lj), 1, 'A: lumberjack trade_count');
  perform pg_temp.assert_eq((select trade_count from players where id=sm), 1, 'A: stonemason trade_count');
end $$;

-- ============ Scenario B: self-trade + insufficient-resource guards ============
do $$
declare sid uuid; p1 uuid; p2 uuid; tid uuid; r jsonb;
begin
  insert into sessions(code,host_id,phase) values ('TEST-B','h','trading') returning id into sid;
  insert into players(session_id,name,role,mission,resources) values (sid,'A','farmer','trader','{"wood":0,"stone":0,"food":1,"gold":0}') returning id into p1;
  insert into players(session_id,name,role,mission) values (sid,'B','goldminer','trader') returning id into p2;

  -- self trade
  insert into trades(session_id,initiator_id,receiver_id,offer,request)
    values (sid,p1,p1,'{"wood":0,"stone":0,"food":1,"gold":0}','{"wood":0,"stone":0,"food":0,"gold":0}') returning id into tid;
  r := accept_trade(tid,p1);
  perform pg_temp.assert_true(not (r->>'success')::bool, 'B: self-trade rejected');

  -- insufficient: p1 offers 5 food but has 1
  insert into trades(session_id,initiator_id,receiver_id,offer,request)
    values (sid,p1,p2,'{"wood":0,"stone":0,"food":5,"gold":0}','{"wood":0,"stone":0,"food":0,"gold":1}') returning id into tid;
  r := accept_trade(tid,p2);
  perform pg_temp.assert_true(not (r->>'success')::bool, 'B: insufficient-resource trade rejected');
end $$;

-- ============ Scenario C: building + role bonus + missions ============
do $$
declare sid uuid; lj uuid; gm uuid; r jsonb;
begin
  insert into sessions(code,host_id,phase,round) values ('TEST-C','h','building',1) returning id into sid;
  -- lumberjack with enough for 3 houses (3w,2s,1f each => 9w,6s,3f) + architect mission
  insert into players(session_id,name,role,mission,resources)
    values (sid,'Arch','lumberjack','architect','{"wood":9,"stone":6,"food":3,"gold":0}') returning id into lj;
  -- goldminer with enough for a guild (4w,4s,3f,1g) + guildmaster mission
  insert into players(session_id,name,role,mission,resources)
    values (sid,'Guild','goldminer','guildmaster','{"wood":4,"stone":4,"food":3,"gold":1}') returning id into gm;

  r := build_structure(lj,sid,'house');
  -- house 40 + lumberjack bonus 10 = 50
  perform pg_temp.assert_eq((r->>'points')::int, 50, 'C: house points w/ lumberjack bonus');
  r := build_structure(lj,sid,'house');
  r := build_structure(lj,sid,'house');
  -- after 3rd house: score = 50*3 + architect bonus 50 = 200, mission_completed
  perform pg_temp.assert_eq((select score from players where id=lj), 200, 'C: architect total score');
  perform pg_temp.assert_true((select mission_completed from players where id=lj), 'C: architect mission completed');

  -- goldminer builds guild: 200 + goldminer guild bonus 15 = 215, + guildmaster mission 70 = 285
  r := build_structure(gm,sid,'guild');
  perform pg_temp.assert_eq((r->>'points')::int, 215, 'C: guild points w/ goldminer bonus');
  perform pg_temp.assert_eq((select score from players where id=gm), 285, 'C: guildmaster total score');
  perform pg_temp.assert_true((select mission_completed from players where id=gm), 'C: guildmaster mission completed');
end $$;

-- ============ Scenario D: world events (storm/famine/harvest/gold_rush/tax) ============
do $$
declare sid uuid; lj uuid; fa uuid; gmn uuid; rich uuid; res jsonb;
begin
  -- storm: lumberjack 0 -> +4 wood -> floor(4/2)=2
  insert into sessions(code,host_id,phase,world_event) values ('TEST-D1','h','production','{"type":"storm"}') returning id into sid;
  insert into players(session_id,name,role,mission) values (sid,'L','lumberjack','trader') returning id into lj;
  perform run_production(sid);
  select resources into res from players where id=lj;
  perform pg_temp.assert_eq((res->>'wood')::int, 2, 'D: storm halves wood');

  -- famine: farmer +4 food -> 2
  insert into sessions(code,host_id,phase,world_event) values ('TEST-D2','h','production','{"type":"famine"}') returning id into sid;
  insert into players(session_id,name,role,mission) values (sid,'F','farmer','trader') returning id into fa;
  perform run_production(sid);
  select resources into res from players where id=fa;
  perform pg_temp.assert_eq((res->>'food')::int, 2, 'D: famine halves food');

  -- harvest: farmer +6 food
  insert into sessions(code,host_id,phase,world_event) values ('TEST-D3','h','production','{"type":"harvest"}') returning id into sid;
  insert into players(session_id,name,role,mission) values (sid,'F2','farmer','trader') returning id into fa;
  perform run_production(sid);
  select resources into res from players where id=fa;
  perform pg_temp.assert_eq((res->>'food')::int, 6, 'D: harvest gives farmer 6 food');

  -- gold_rush: goldminer +4 gold
  insert into sessions(code,host_id,phase,world_event) values ('TEST-D4','h','production','{"type":"gold_rush"}') returning id into sid;
  insert into players(session_id,name,role,mission) values (sid,'G','goldminer','trader') returning id into gmn;
  perform run_production(sid);
  select resources into res from players where id=gmn;
  perform pg_temp.assert_eq((res->>'gold')::int, 4, 'D: gold_rush gives goldminer 4 gold');

  -- tax: leader loses 1 of each
  insert into sessions(code,host_id,phase,world_event) values ('TEST-D5','h','production','{"type":"tax"}') returning id into sid;
  insert into players(session_id,name,role,mission,score,resources)
    values (sid,'Rich','farmer','trader',100,'{"wood":3,"stone":3,"food":3,"gold":3}') returning id into rich;
  insert into players(session_id,name,role,mission,score) values (sid,'Poor','lumberjack','trader',0);
  perform run_production(sid);
  select resources into res from players where id=rich;
  -- farmer +4 food first => food 7, then tax -1 each => wood2 stone2 food6 gold2
  perform pg_temp.assert_eq((res->>'wood')::int, 2, 'D: tax leader wood -1');
  perform pg_temp.assert_eq((res->>'gold')::int, 2, 'D: tax leader gold -1');
  perform pg_temp.assert_eq((res->>'food')::int, 6, 'D: tax leader food (+4 prod, -1 tax)');
end $$;

-- ============ Scenario E: trader mission via trades + philanthropist via finalize ============
do $$
declare sid uuid; giver uuid; taker uuid; tid uuid; i int;
begin
  insert into sessions(code,host_id,phase) values ('TEST-E','h','trading') returning id into sid;
  insert into players(session_id,name,role,mission,resources,trade_count)
    values (sid,'Giver','lumberjack','philanthropist','{"wood":50,"stone":0,"food":0,"gold":0}',0) returning id into giver;
  insert into players(session_id,name,role,mission,resources,trade_count)
    values (sid,'Taker','stonemason','trader','{"wood":0,"stone":50,"food":0,"gold":0}',14) returning id into taker;

  -- giver hands 1 wood to taker for nothing, accepted -> giver gives more than receives
  insert into trades(session_id,initiator_id,receiver_id,offer,request)
    values (sid,giver,taker,'{"wood":3,"stone":0,"food":0,"gold":0}','{"wood":0,"stone":0,"food":0,"gold":0}') returning id into tid;
  perform accept_trade(tid,taker);
  -- taker had 14 trades, now 15 -> trader mission completes (+60)
  perform pg_temp.assert_true((select mission_completed from players where id=taker), 'E: trader mission completes at 15 trades');

  -- finalize: giver gave 3 units, received 0 -> philanthropist (+55)
  perform finalize_game(sid);
  perform pg_temp.assert_true((select mission_completed from players where id=giver), 'E: philanthropist mission completes');
  perform pg_temp.assert_eq((select phase='ended' from sessions where id=sid)::int, 1, 'E: finalize sets phase ended');
end $$;

\echo ''
\echo '================= ALL GAME-LOGIC TESTS PASSED ================='
