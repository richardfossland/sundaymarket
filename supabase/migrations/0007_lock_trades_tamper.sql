-- 0007 — close the trades write-tamper hole left open by 0001 (audit 2026-07-06).
--
-- 0001 created `trades` with `for update using (true)` + an open anon UPDATE/
-- DELETE grant, and 0005/0006 never touched it (0005 only added the
-- non-negative CHECK; 0006 only covered sessions + the players INSERT-forge).
-- So any anon holding a session UUID + a trade id can still:
--   * repoint a PENDING trade's parties (initiator_id/receiver_id/session_id),
--   * rewrite its offer/request amounts before the receiver accepts,
--   * flip an arbitrary trade to 'accepted' (UI confusion) or DELETE it.
--
-- The LEGIT anon path is narrow (src/components/game/TradeTab.tsx): INSERT a
-- 'pending' trade, and UPDATE status → 'rejected' on decline / failed accept.
-- Everything economic (accept_trade, expire_pending_trades) runs through
-- SECURITY DEFINER RPCs owned by postgres. So a BEFORE UPDATE trigger that, for
-- untrusted writers, freezes the economic + party columns and allows only a
-- status transition to rejected/expired closes the hole with NO client change;
-- and DELETE has no legit direct caller, so it is revoked outright.
--
-- SECURITY INVOKER (default) so current_user is the REAL caller (anon /
-- authenticated via PostgREST), exempting service_role + postgres (RPCs,
-- migrations, Docker test seeds) — mirrors 0006's players_force_defaults.
--
-- Idempotent / safe to re-run.

create or replace function market.trades_guard_update()
returns trigger language plpgsql
set search_path = market, public as $$
begin
  if current_user not in ('service_role', 'postgres') then
    -- Economic columns + parties are immutable for untrusted writers: a pending
    -- trade cannot be repointed or have its amounts inflated before acceptance.
    if new.session_id   is distinct from old.session_id
       or new.initiator_id is distinct from old.initiator_id
       or new.receiver_id  is distinct from old.receiver_id
       or new.offer        is distinct from old.offer
       or new.request      is distinct from old.request then
      raise exception 'trade economic/party columns are immutable';
    end if;
    -- The only legit untrusted status change is a cancel/decline.
    if new.status is distinct from old.status
       and new.status not in ('rejected', 'expired') then
      raise exception 'untrusted writers may only reject/expire a trade';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trades_guard_update on market.trades;
create trigger trg_trades_guard_update
  before update on market.trades
  for each row execute function market.trades_guard_update();

-- No legit direct client DELETE of a trade — the RPCs never delete, they flip
-- status. Revoke it so an anon caller cannot erase trade history.
revoke delete on market.trades from anon, authenticated;
