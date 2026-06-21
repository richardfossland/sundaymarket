-- 0006 — close the two write holes 0005 explicitly deferred (audit 2026-06-13).
--
-- 1A players INSERT-forge: 0001 left `players` INSERT open (`with check (true)`
--    + an anon INSERT grant), so a hand-rolled `POST /rest/v1/players` could set
--    score / resources / trade_count / mission_completed on join and start a
--    player already winning. The LEGIT join (src/app/page.tsx) always inserts
--    ZEROED resources/score, so a BEFORE INSERT trigger that resets the
--    server-controlled columns for untrusted writers closes the forge with NO
--    client change and zero effect on the legit path. role/mission/name stay
--    client-chosen (cosmetic; enum-checked by the table CHECK).
--
-- 1B sessions phase-forge: 0001 left `sessions` UPDATE open (`for update
--    using (true)` + an anon UPDATE grant), so any anon holding the session UUID
--    could `PATCH /rest/v1/sessions` to change phase/round/world_event and grief
--    a live game (host identity was only checked client-side). Replace the open
--    UPDATE with a host_id-gated SECURITY DEFINER set_phase() — the single
--    authoritative phase-write path — and revoke the grant. Mirrors the
--    delete_session() pattern from 0004.
--
-- Self-contained + idempotent: re-asserts its own revokes, so it is correct
-- whether or not 0005 reached prod, and safe to re-run (the harness applies it
-- twice).

-- ── 1A. players INSERT-forge ────────────────────────────────────────────────
-- SECURITY INVOKER (the default — NOT `security definer`) so `current_user` is
-- the REAL caller role (anon / authenticated, set by PostgREST), not the function
-- owner. Resets the score-bearing columns for every untrusted writer; exempts
-- service_role (server RPCs) and postgres (migrations / Dashboard / the Docker
-- test seeds, which insert players with non-zero resources directly).
create or replace function market.players_force_defaults()
returns trigger language plpgsql
set search_path = market, public as $$
begin
  if current_user not in ('service_role', 'postgres') then
    new.resources         := '{"wood":0,"stone":0,"food":0,"gold":0}'::jsonb;
    new.score             := 0;
    new.trade_count       := 0;
    new.mission_completed := false;
    new.is_online         := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_players_force_defaults on market.players;
create trigger trg_players_force_defaults
  before insert on market.players
  for each row execute function market.players_force_defaults();

-- ── 1B. sessions phase-forge ────────────────────────────────────────────────
-- Remove the open UPDATE path entirely; the host_id-gated RPC below becomes the
-- only way to change a session row.
drop policy if exists "Anyone can update sessions" on market.sessions;
revoke update on market.sessions from anon, authenticated;

-- set_phase: the single authoritative phase-write path. Self-authorises on the
-- host_id bearer token the browser already holds (localStorage
-- sundaymarket_host_id). Covers all four client write-sites:
--   * lobby/building → production : phase + round + world_event + narration (+ started_at)
--   * production → trading        : phase (+ started_at) with an expected_phase guard
--   * trading → building          : phase only (no started_at stamp)
-- NULL p_round / p_world_event leaves that column unchanged. p_narration follows
-- the client's existing semantics under one parameter: NULL = leave, '' = clear,
-- else set (beginProduction passes '' when there is no AI suggestion).
create or replace function market.set_phase(
  p_session_id     uuid,
  p_host_id        text,
  p_phase          text,
  p_round          int     default null,
  p_world_event    jsonb   default null,
  p_narration      text    default null,
  p_set_started    boolean default true,
  p_expected_phase text    default null
) returns boolean
language plpgsql security definer
set search_path = market, public as $$
declare
  updated int;
begin
  if p_host_id is null then
    return false;  -- never allow an unauthenticated phase change
  end if;
  if p_phase not in ('lobby','production','trading','building','ended') then
    return false;  -- enum guard mirrors the table CHECK → clean false, not a 500
  end if;

  update market.sessions s
     set phase            = p_phase,
         round            = coalesce(p_round, s.round),
         world_event      = case when p_world_event is not null then p_world_event else s.world_event end,
         narration        = case when p_narration is null then s.narration
                                 when p_narration = ''    then null
                                 else p_narration end,
         phase_started_at = case when p_set_started then now() else s.phase_started_at end
   where s.id = p_session_id
     and s.host_id = p_host_id
     and (p_expected_phase is null or s.phase = p_expected_phase);

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

-- anon MAY execute it (the browser holds the host_id secret and the function
-- self-authorises on it); it can only ever mutate the row whose host_id matches.
revoke execute on function market.set_phase(uuid, text, text, int, jsonb, text, boolean, text) from public;
grant  execute on function market.set_phase(uuid, text, text, int, jsonb, text, boolean, text)
  to anon, authenticated, service_role;
