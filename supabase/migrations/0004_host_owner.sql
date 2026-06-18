-- ============================================================================
-- SundayMarket — OPTIONAL Sunday Account host ownership  (idempotent)
--
-- Adds a NULLABLE owner column to sessions so a signed-in "vert" (host, via the
-- Sunday Account SSO issuer project) can later see + manage + delete the økts
-- they created. This is PURELY ADDITIVE and OPTIONAL:
--
--   * Anonymous hosting is UNCHANGED. The landing-page "Create new session"
--     flow keeps inserting with host_user_id = NULL and the game plays exactly
--     as before (code-based host_id token in localStorage still authoritative
--     for the live control panel at /host/<id>).
--   * Players / joiners / displays / projector are untouched (code-based).
--
-- `host_user_id` references the Sunday Account user id (auth.users on the
-- ISSUER Supabase project). That project is SEPARATE from this DATA project, so
-- we store the uuid WITHOUT a foreign key (no auth.users table here). The app's
-- server layer authorizes the email allowlist; this column only scopes "my
-- økts" listing + owner-gated delete.
--
-- Depends on 0001_market_schema.sql.
-- ============================================================================

create schema if not exists market;

-- ---------- Owner column (nullable, additive) ----------
alter table market.sessions
  add column if not exists host_user_id uuid;

create index if not exists idx_sessions_host_user
  on market.sessions(host_user_id);

-- ---------- Owner-gated delete (SECURITY DEFINER) ----------
-- The browser uses the anon key with open RLS, so we CANNOT trust a raw
-- `delete from sessions` to be owner-scoped. This SECURITY DEFINER function is
-- the single authoritative delete path: it deletes the session ONLY when the
-- caller's Sunday Account user id matches host_user_id. FK cascade
-- (players/trades/buildings/prices all `on delete cascade`) removes children.
--
-- Returns true when a row was deleted, false otherwise (not found / not owner /
-- anonymous session with no owner). The server route resolves the signed-in
-- user id from the session cookie and passes it here — the client never gets to
-- name an arbitrary owner because the route authorizes first.
create or replace function market.delete_session(p_session_id uuid, p_host_user_id uuid)
returns boolean language plpgsql security definer
set search_path = market, public as $$
declare
  deleted int;
begin
  if p_host_user_id is null then
    return false;  -- never allow an anonymous caller to delete via this path
  end if;

  delete from market.sessions
   where id = p_session_id
     and host_user_id = p_host_user_id;

  get diagnostics deleted = row_count;
  return deleted > 0;
end;
$$;

-- Only the service_role (used by the owner-gated server route) may execute the
-- delete. anon/authenticated must NOT call it directly — deletion is always
-- mediated by the server route that checks the email allowlist + ownership.
revoke execute on function market.delete_session(uuid, uuid) from public, anon, authenticated;
grant execute on function market.delete_session(uuid, uuid) to service_role;
