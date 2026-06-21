-- 0005 — harden direct client writes (night security audit 2026-06-13).
--
-- Two fixes that are safe + non-breaking (verified against the client 2026-06-20):
--
-- #1 (open UPDATE-RLS on players): 0001 left `for update using(true)` + a broad
--    UPDATE grant, so ANY anon caller could `PATCH /rest/v1/players` to forge
--    score/resources. The CLIENT never updates `players` directly — every
--    resource/score mutation goes through a SECURITY DEFINER RPC (run_production,
--    accept_trade, build_structure, finalize_game, …). So we drop the open
--    UPDATE policy AND revoke the UPDATE grant for anon/authenticated. The
--    definer-owned RPCs are unaffected; the forge path is closed.
--
-- #8 (negative-trade minting): accept_trade had no non-negative guard and
--    `trades.insert` is open, so a trade with `request:{wood:-50}` minted
--    resources from nothing. A row-level CHECK rejects negative offer/request
--    amounts for EVERY writer (client or service-role). NOT VALID so ephemeral
--    legacy rows can't block the deploy; every NEW insert/update is validated.
--
-- NOT fixed here (needs a join-RPC + host-phase-RPC refactor + rig verification,
-- per the audit): the open players INSERT (a forged join can set starting
-- resources/score) and the open sessions UPDATE (host phase changes go direct).
-- Tracked separately — they require client changes best validated on a real rig.
--
-- Idempotent / safe to re-run.

-- #1 ----------------------------------------------------------------------------
drop policy if exists "Anyone can update players" on market.players;
revoke update on market.players from anon, authenticated;

-- #8 ----------------------------------------------------------------------------
alter table market.trades drop constraint if exists trades_non_negative;
alter table market.trades add constraint trades_non_negative check (
  coalesce((offer->>'wood')::int,   0) >= 0 and coalesce((offer->>'stone')::int,   0) >= 0 and
  coalesce((offer->>'food')::int,   0) >= 0 and coalesce((offer->>'gold')::int,    0) >= 0 and
  coalesce((request->>'wood')::int, 0) >= 0 and coalesce((request->>'stone')::int, 0) >= 0 and
  coalesce((request->>'food')::int, 0) >= 0 and coalesce((request->>'gold')::int,  0) >= 0
) not valid;
