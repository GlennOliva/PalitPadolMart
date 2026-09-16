import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  getPaddleCandidates,
  getRecommendationProfile,
  recordRecommendationClick,
  recordRecommendationViewed,
  saveRecommendationProfile,
} from '../../features/recommendation/recommendation.service'
import { rankPaddles } from '../../features/recommendation/scoring'
import type {
  PlayingStyle,
  RecommendationCandidate,
  RecommendationFormValues,
  RecommendationProfile,
  SkillLevel,
} from '../../features/recommendation/recommendation.types'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import GlassPanel from '../../components/common/GlassPanel'
import QuestionnaireForm from '../../components/recommendations/QuestionnaireForm'
import RecommendationCard from '../../components/recommendations/RecommendationCard'

const TOP_RESULTS = 6

function toFormValues(profile: RecommendationProfile | null): RecommendationFormValues {
  return {
    skill_level: profile?.skill_level ?? '',
    playing_style: profile?.playing_style ?? '',
    control_power_preference:
      profile?.control_power_preference != null ? String(profile.control_power_preference) : '',
    preferred_weight_grams:
      profile?.preferred_weight_grams != null ? String(profile.preferred_weight_grams) : '',
    budget: profile?.budget != null ? String(profile.budget) : '',
  }
}

function toProfile(values: RecommendationFormValues): RecommendationProfile {
  return {
    skill_level: (values.skill_level || null) as SkillLevel | null,
    playing_style: (values.playing_style || null) as PlayingStyle | null,
    control_power_preference:
      values.control_power_preference === '' ? null : Number(values.control_power_preference),
    preferred_weight_grams:
      values.preferred_weight_grams.trim() === '' ? null : Number(values.preferred_weight_grams),
    budget: values.budget.trim() === '' ? null : Number(values.budget),
  }
}

export default function RecommendationsPage() {
  const { user, isAuthenticated } = useAuth()
  const userId = user?.id ?? null

  const [candidates, setCandidates] = useState<RecommendationCandidate[] | null>(null)
  const [candidatesError, setCandidatesError] = useState<string | null>(null)
  const [activeProfile, setActiveProfile] = useState<RecommendationProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getPaddleCandidates().then(({ data, error }) => {
      if (!active) return
      if (error != null) {
        setCandidatesError('We could not load paddles to recommend. Please try again.')
      } else {
        setCandidates(data ?? [])
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (userId == null) {
      setProfileLoaded(true)
      return
    }
    let active = true
    void getRecommendationProfile(userId).then(({ data, error }) => {
      if (!active) return
      if (error == null && data != null) {
        const profile: RecommendationProfile = {
          skill_level: (data.skill_level ?? null) as SkillLevel | null,
          playing_style: (data.playing_style ?? null) as PlayingStyle | null,
          preferred_weight_grams: data.preferred_weight_grams,
          control_power_preference: data.control_power_preference,
          budget: data.budget,
        }
        setActiveProfile(profile)
      }
      setProfileLoaded(true)
    })
    return () => {
      active = false
    }
  }, [userId])

  const results = useMemo(() => {
    if (candidates == null || activeProfile == null) return null
    return rankPaddles(activeProfile, candidates)
  }, [candidates, activeProfile])

  // Spec §6.27: when a budget is set but no paddle is anywhere near it (every
  // candidate scores zero budget points), don't pad the results with
  // irrelevant products — show a "no match" state with clear next actions.
  const noBudgetMatches =
    activeProfile?.budget != null &&
    results != null &&
    results.length > 0 &&
    results.every((result) => result.breakdown.budget === 0)

  useEffect(() => {
    if (results == null || results.length === 0 || userId == null) return
    void recordRecommendationViewed(userId, results.length)
  }, [results, userId])

  const handleSubmit = (values: RecommendationFormValues) => {
    const profile = toProfile(values)
    setActiveProfile(profile)
    setEditing(false)
    setSaveError(null)
    if (userId == null) return
    setSaving(true)
    void saveRecommendationProfile(userId, profile).then(({ error }) => {
      setSaving(false)
      if (error != null) {
        setSaveError('Your matches are ready, but we could not save your preferences to your account.')
      }
    })
  }

  const loading = (candidates == null && candidatesError == null) || !profileLoaded

  if (loading) {
    return (
      <div className="container page">
        <PageHeader
          title="Paddle recommendations"
          intro="Tell us how you play and we'll rank the paddles on the marketplace for you."
        />
        <LoadingState label="Preparing recommendations…" />
      </div>
    )
  }

  if (candidatesError != null) {
    return (
      <div className="container page">
        <PageHeader title="Paddle recommendations" />
        <Alert variant="error" message={candidatesError} />
      </div>
    )
  }

  if (candidates == null || candidates.length === 0) {
    return (
      <div className="container page">
        <PageHeader
          title="Paddle recommendations"
          intro="Tell us how you play and we'll rank the paddles on the marketplace for you."
        />
        <EmptyState
          title="No paddles to recommend yet"
          body="Sellers haven't listed paddles with recommendation details yet. Check the marketplace for new arrivals."
        />
      </div>
    )
  }

  const showQuestionnaire = activeProfile == null || editing

  return (
    <div className="container page">
      <PageHeader
        title="Paddle recommendations"
        intro="Tell us how you play and we'll rank the paddles on the marketplace for your game and budget."
      />

      {showQuestionnaire ? (
        <GlassPanel intensity="soft" className="questionnaire-panel">
          <QuestionnaireForm
            initialValues={toFormValues(activeProfile)}
            onSubmit={handleSubmit}
            submitting={saving}
            onCancel={editing ? () => setEditing(false) : undefined}
          />
        </GlassPanel>
      ) : noBudgetMatches ? (
        <GlassPanel intensity="soft" className="rec-results">
          <EmptyState
            title="No paddle matches your budget"
            body="Every paddle on the marketplace is currently above your budget. Try raising it or broadening your other preferences."
            action={
              <span className="rec-results__actions">
                <button type="button" className="btn btn--primary" onClick={() => setEditing(true)}>
                  Adjust preferences
                </button>
                <Link className="btn btn--secondary" to="/marketplace?category=paddles">
                  Browse all paddles
                </Link>
              </span>
            }
          />
        </GlassPanel>
      ) : (
        <div className="rec-results">
          {saveError != null ? (
            <Alert variant="error" message={saveError} />
          ) : !isAuthenticated ? (
            <Alert
              variant="info"
              message="You're viewing matches as a guest. Sign in to save your preferences."
            />
          ) : null}

          <div className="rec-results__header">
            <p className="rec-results__summary">
              Top {Math.min(TOP_RESULTS, results?.length ?? 0)} matches out of {candidates.length}{' '}
              paddles on the marketplace.
            </p>
            <span className="rec-results__actions">
              <Link className="btn btn--ghost btn--sm" to="/marketplace?category=paddles">
                Browse all paddles
              </Link>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
                Edit preferences
              </button>
            </span>
          </div>

          <div className="rec-results__grid">
            {results?.slice(0, TOP_RESULTS).map((result, index) => (
              <RecommendationCard
                key={result.listing.id}
                rank={index + 1}
                result={result}
                onSelect={
                  userId != null ? (listingId) => void recordRecommendationClick(userId, listingId) : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
