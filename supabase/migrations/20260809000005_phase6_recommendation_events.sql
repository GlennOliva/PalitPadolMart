-- Phase 6 — Paddle recommendation system.
--
-- Adds a `recommendation_view` event type so the recommendation flow can be
-- tracked for later analytics (e.g. "how often were recommendations viewed /
-- clicked"). The existing `view`/`click`/`favorite`/`inquiry`/`order` types
-- stay untouched. The per-user event index for analytics already exists
-- (idx_recommendation_events_user). recommendation_profiles (questionnaire
-- answers) and its own-row RLS were created in Phase 1 and need no changes.

alter table public.recommendation_events
  drop constraint if exists recommendation_events_event_type_check;

alter table public.recommendation_events
  add constraint recommendation_events_event_type_check
  check (event_type in ('view', 'click', 'favorite', 'inquiry', 'order', 'recommendation_view'));
