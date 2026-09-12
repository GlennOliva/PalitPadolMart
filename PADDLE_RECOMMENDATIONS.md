# PalitPaddleBai Mart — Paddle Recommendations

Phase 6 of the build. A deterministic scoring engine turns a short
questionnaire into ranked, explained paddle recommendations with no external
ML dependency.

## What exists

| Area | Where |
| --- | --- |
| Scoring engine | `src/features/recommendation/scoring.ts` |
| Types / constants | `src/features/recommendation/recommendation.types.ts` |
| Questionnaire form | `src/components/recommendations/QuestionnaireForm.tsx` |
| Result card | `src/components/recommendations/RecommendationCard.tsx` |
| Service (candidates + persistence) | `src/features/recommendation/recommendation.service.ts` |
| Page | `src/pages/recommendations/RecommendationsPage.tsx` |
| Tests | `tests/unit/recommendation-scoring.test.ts`, `recommendation.service.test.ts`, `RecommendationsPage.test.tsx` |

## Questionnaire

Five fields (stored in `recommendation_profiles` when signed in):

- Skill level: beginner / intermediate / advanced
- Playing style: control / power / all-court / balanced / spin
- Control vs power: 1 (control) → 10 (power), 5 = balanced
- Preferred weight (grams, optional)
- Budget (₱, optional)

Guests can answer without an account; signing in persists the profile and
records behavioral events (`recommendation_events`).

## Scoring model (MASTER_BUILD_SPEC §15)

Every component is capped at its weight, so the maximum total is exactly 100:

| Component | Max | Rule |
| --- | --- | --- |
| Budget | 25 | Full at or under budget; linear falloff above; **zero at or above 2× budget** |
| Skill | 20 | Exact match / `all` full; one level away half; two levels away zero |
| Playing style | 20 | Compatibility matrix; `balanced` is a compatible "any" style; opposite styles score low |
| Weight | 15 | Exact gram match full; within ±15 g partial; otherwise zero; weight-class range check first |
| Control/power | 20 | Distance between the paddle's bias and the user's 1–10 preference |

Key decisions:

- **Unset preferences are neutral**, not penalized — an incomplete profile
  still produces reasonable results (each unanswered dimension scores full).
- **A paddle priced at ≥ 2× budget scores zero budget points**, so
  dramatically out-of-budget inventory can never ride high in the rankings.
- Missing paddle metadata (e.g. no `paddle_attributes`) scores a reduced
  signal rather than full marks for the skill/style/weight dimensions.
- Ranking is fully deterministic: highest score first; ties break by price
  (cheapest first), then newest listing first. No randomness.

## Explanations

Each result ships human-readable reasons built by `buildExplanation`, e.g.
"fits your ₱5,000.00 budget", "matches your control playing style", "exceeds
your ₱3,000.00 budget". There is exactly one reason per answered preference.

## Results & empty states

- Guest: results shown immediately with an inline "sign in to save" note.
- Signed-in: profile loaded and `recordRecommendationViewed` logged; saving
  failures never hide results.
- **No candidates** (no active paddles on the marketplace) → "No paddles to
  recommend yet".
- **No budget match** (a budget is set but every candidate scores zero budget
  points) → "No paddle matches your budget" with "Adjust preferences" and
  "Browse all paddles" (`/marketplace?category=paddles`).

## Migrations

| Migration | Purpose |
| --- | --- |
| `20260809000005_phase6_recommendation_events.sql` | `recommendation_events` table + RLS + indexes |

`recommendation_profiles` was created in the Phase 1 schema; Phase 6 only adds
the behavioral events table.

## Verification

Automated: `npm run lint`, `npm run typecheck`, `npm run test` (292 tests),
`npm run build` all pass. Scoring, explanation, ranking, and no-match
behaviour are unit-tested against the current model.
