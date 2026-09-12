-- ============================================================================
-- PHASE 9 — PAYMENT STATUS EXTENSION (enum only)
-- ============================================================================
-- Adds the manual-proof-review states to payment_status. Isolated in its own
-- migration because PostgreSQL cannot safely reference a newly-added enum
-- value in the same transaction that adds it (SQLSTATE 55P04); the values
-- must be committed before the Phase 9 RPCs/policies can use them.
-- ============================================================================

alter type public.payment_status add value if not exists 'submitted';
alter type public.payment_status add value if not exists 'rejected';
