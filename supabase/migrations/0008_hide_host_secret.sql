-- 0008 — stop leaking the host bearer secret (audit 2026-07-07).
--
-- host_id is a client-minted random UUID that authorises the host's control RPCs
-- (set_phase / run_production, gated in 0006). But `sessions` has an "Anyone can
-- read sessions" (using true) SELECT policy + a table-level anon SELECT grant,
-- and the host/projector/player pages all `select('*')`. So ANY anon caller
-- could read a live session's host_id
--   GET /rest/v1/sessions?select=host_id
-- and then call set_phase(session_id, host_id, …) to grief the game. 0006's
-- host_id gate is only as strong as host_id being secret — and it wasn't
-- (verified against prod).
--
-- Fix: hide just the host_id column from anon/authenticated while keeping the
-- rest of the row public for gameplay, and add is_host() so the host page can
-- still answer "am I the host?" from its localStorage bearer WITHOUT the secret
-- ever crossing the wire. Postgres note: a column REVOKE cannot subtract from a
-- table-level grant, so we drop the table-level SELECT and re-grant SELECT on
-- every column EXCEPT host_id. The accompanying app change selects explicit
-- columns (never `*`, never host_id).
--
-- Idempotent (revoke + re-grant + create-or-replace are all re-runnable).

revoke select on market.sessions from anon, authenticated;
grant select (
  id, code, phase, round, max_rounds, trade_seconds,
  phase_started_at, world_event, created_at, narration, host_user_id
) on market.sessions to anon, authenticated;

-- Self-authorising host check: returns true only to a caller that already holds
-- the session's host_id bearer. SECURITY DEFINER so it can read host_id (which
-- anon no longer can) without exposing it.
create or replace function market.is_host(p_session_id uuid, p_host_id text)
returns boolean
language sql stable security definer
set search_path = market, public as $$
  select exists (
    select 1 from market.sessions
    where id = p_session_id and host_id = p_host_id
  );
$$;

revoke execute on function market.is_host(uuid, text) from public;
grant execute on function market.is_host(uuid, text) to anon, authenticated, service_role;
