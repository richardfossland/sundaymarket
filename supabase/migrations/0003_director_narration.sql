-- 0003 — AI "town crier" narrator: store the projector narration alongside the
-- world event. Additive + idempotent (safe to re-apply). The narration is plain
-- flavor text shown on the projector; the world event itself remains the only
-- thing that touches game logic, and is still validated server-side before the
-- host applies it.

alter table market.sessions
  add column if not exists narration text;
