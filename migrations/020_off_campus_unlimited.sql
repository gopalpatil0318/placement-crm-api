-- ============================================================================
-- Migration 020: Allow unlimited off-campus placements
-- ============================================================================
-- Off-campus placements (self-report + admin direct recording) are now unlimited.
-- On-campus and pool-campus placements remain limited by max_active_offers.
--
-- Drop the partial unique index that enforces 1 accepted/joined placement per
-- student+college. Application-level checkOfferPolicy() is now the enforcer,
-- and it is drive_type-aware (only counts on_campus/pool_campus).
-- ============================================================================

DROP INDEX IF EXISTS idx_one_active_placement_per_student;
