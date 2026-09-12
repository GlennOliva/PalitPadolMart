import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RecommendationsPage from '../../src/pages/recommendations/RecommendationsPage'
import type { RecommendationCandidate } from '../../src/features/recommendation/recommendation.types'

const { recMocks, authMocks } = vi.hoisted(() => {
  const authMocks = {
    value: { user: null as { id: string } | null, isAuthenticated: false },
  }
  return {
    recMocks: {
      getPaddleCandidates: vi.fn(),
      getRecommendationProfile: vi.fn(),
      saveRecommendationProfile: vi.fn(),
      recordRecommendationViewed: vi.fn(),
      recordRecommendationClick: vi.fn(),
    },
    authMocks,
  }
})

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => authMocks.value,
}))

vi.mock('../../src/features/recommendation/recommendation.service', () => ({
  getPaddleCandidates: recMocks.getPaddleCandidates,
  getRecommendationProfile: recMocks.getRecommendationProfile,
  saveRecommendationProfile: recMocks.saveRecommendationProfile,
  recordRecommendationViewed: recMocks.recordRecommendationViewed,
  recordRecommendationClick: recMocks.recordRecommendationClick,
}))

function candidate(
  id = 'list-1',
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    id,
    title: 'Pro Paddle',
    description: 'A paddle',
    price: 5000,
    listing_condition: 'like_new',
    quantity: 1,
    city: null,
    province: null,
    pickup_available: true,
    delivery_available: false,
    created_at: '2026-01-01T00:00:00Z',
    category: { id: 'c1', name: 'Paddles', slug: 'paddles' },
    brand: { id: 'b1', name: 'Joola' },
    seller: { id: 's1', store_name: 'Ace Paddles' },
    images: [],
    paddle_attributes: {
      weight_grams: 230,
      weight_class: 'Midweight',
      control_score: 5,
      power_score: 5,
      skill_level: 'all',
      playing_style: 'balanced',
    } as RecommendationCandidate['paddle_attributes'],
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/marketplace/:listingId" element={<div>LISTING DETAIL</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function stubCandidates(count = 1) {
  const items = Array.from({ length: count }, (_, index) =>
    candidate(`list-${index + 1}`),
  )
  recMocks.getPaddleCandidates.mockResolvedValue({ data: items, error: null })
  return items
}

function answerQuestionnaire() {
  fireEvent.click(within(screen.getByRole('radiogroup', { name: /Skill level/ })).getByRole('radio', { name: 'Intermediate' }))
  fireEvent.click(within(screen.getByRole('radiogroup', { name: /Playing style/ })).getByRole('radio', { name: /Spin/ }))
  fireEvent.click(within(screen.getByRole('radiogroup', { name: /Control vs power/ })).getByRole('radio', { name: '5' }))
  fireEvent.change(screen.getByLabelText('Preferred weight (grams)'), { target: { value: '230' } })
  fireEvent.change(screen.getByLabelText('Budget (₱)'), { target: { value: '5000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find my paddles' }))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('RecommendationsPage', () => {
  it('shows the questionnaire to guests', async () => {
    authMocks.value = { user: null, isAuthenticated: false }
    stubCandidates()

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Paddle recommendations' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /Skill level/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find my paddles' })).toBeInTheDocument()
  })

  it('ranks paddles and shows the result card after answering', async () => {
    authMocks.value = { user: null, isAuthenticated: false }
    stubCandidates(2)

    renderPage()
    await screen.findByRole('radiogroup', { name: /Skill level/ })

    answerQuestionnaire()

    const links = await screen.findAllByRole('link', { name: 'View listing' })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/marketplace/list-1')
    expect(screen.getAllByText('Pro Paddle')).toHaveLength(2)
    expect(screen.getAllByText('/ 100')).toHaveLength(2)
    expect(screen.getByText(/Top 2 matches out of 2 paddles/)).toBeInTheDocument()
    expect(screen.getAllByText(/Sold by Ace Paddles/)).toHaveLength(2)
    expect(recMocks.recordRecommendationViewed).not.toHaveBeenCalled()
  })

  it('loads a saved profile and shows results immediately', async () => {
    authMocks.value = { user: { id: 'user-1' }, isAuthenticated: true }
    stubCandidates()
    recMocks.getRecommendationProfile.mockResolvedValue({
      data: {
        user_id: 'user-1',
        skill_level: 'intermediate',
        playing_style: 'spin',
        preferred_weight_grams: 230,
        control_power_preference: 5,
        budget: 5000,
      },
      error: null,
    })
    recMocks.recordRecommendationViewed.mockResolvedValue({ error: null })

    renderPage()

    expect(await screen.findByRole('link', { name: 'View listing' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /Skill level/ })).not.toBeInTheDocument()
    expect(recMocks.recordRecommendationViewed).toHaveBeenCalledWith('user-1', 1)
  })

  it('reopens the questionnaire when the user edits preferences', async () => {
    authMocks.value = { user: { id: 'user-1' }, isAuthenticated: true }
    stubCandidates()
    recMocks.getRecommendationProfile.mockResolvedValue({
      data: {
        user_id: 'user-1',
        skill_level: 'beginner',
        playing_style: 'control',
        preferred_weight_grams: null,
        control_power_preference: 3,
        budget: null,
      },
      error: null,
    })
    recMocks.recordRecommendationViewed.mockResolvedValue({ error: null })

    renderPage()
    await screen.findByRole('link', { name: 'View listing' })

    fireEvent.click(screen.getByRole('button', { name: 'Edit preferences' }))
    expect(screen.getByRole('radiogroup', { name: /Skill level/ })).toBeInTheDocument()
    const beginner = within(screen.getByRole('radiogroup', { name: /Skill level/ })).getByRole('radio', { name: 'Beginner' })
    expect(beginner).toHaveAttribute('checked')
  })

  it('saves the profile and records a view when signed in', async () => {
    authMocks.value = { user: { id: 'user-1' }, isAuthenticated: true }
    stubCandidates()
    recMocks.getRecommendationProfile.mockResolvedValue({ data: null, error: null })
    recMocks.saveRecommendationProfile.mockResolvedValue({ data: null, error: null })
    recMocks.recordRecommendationViewed.mockResolvedValue({ error: null })

    renderPage()
    await screen.findByRole('radiogroup', { name: /Skill level/ })

    answerQuestionnaire()

    await waitFor(() =>
      expect(recMocks.saveRecommendationProfile).toHaveBeenCalledWith('user-1', {
        skill_level: 'intermediate',
        playing_style: 'spin',
        preferred_weight_grams: 230,
        control_power_preference: 5,
        budget: 5000,
      }),
    )
    await waitFor(() => expect(recMocks.recordRecommendationViewed).toHaveBeenCalled())
  })

  it('records a click when a signed-in user opens a result', async () => {
    authMocks.value = { user: { id: 'user-1' }, isAuthenticated: true }
    stubCandidates()
    recMocks.getRecommendationProfile.mockResolvedValue({ data: null, error: null })
    recMocks.saveRecommendationProfile.mockResolvedValue({ data: null, error: null })
    recMocks.recordRecommendationViewed.mockResolvedValue({ error: null })
    recMocks.recordRecommendationClick.mockResolvedValue({ error: null })

    renderPage()
    await screen.findByRole('radiogroup', { name: /Skill level/ })

    answerQuestionnaire()
    const link = await screen.findByRole('link', { name: 'View listing' })
    fireEvent.click(link)

    await waitFor(() => expect(recMocks.recordRecommendationClick).toHaveBeenCalledWith('user-1', 'list-1'))
  })

  it('shows the results even when saving the profile fails', async () => {
    authMocks.value = { user: { id: 'user-1' }, isAuthenticated: true }
    stubCandidates()
    recMocks.getRecommendationProfile.mockResolvedValue({ data: null, error: null })
    recMocks.saveRecommendationProfile.mockResolvedValue({
      data: null,
      error: { message: 'db down', code: 'PGRST000', details: '', hint: '' },
    })
    recMocks.recordRecommendationViewed.mockResolvedValue({ error: null })

    renderPage()
    await screen.findByRole('radiogroup', { name: /Skill level/ })

    answerQuestionnaire()

    expect(await screen.findByRole('link', { name: 'View listing' })).toBeInTheDocument()
    expect(
      await screen.findByText(/could not save your preferences to your account/),
    ).toBeInTheDocument()
  })

  it('shows an empty state when there are no candidates', async () => {
    authMocks.value = { user: null, isAuthenticated: false }
    recMocks.getPaddleCandidates.mockResolvedValue({ data: [], error: null })

    renderPage()

    expect(await screen.findByText('No paddles to recommend yet')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /Skill level/ })).not.toBeInTheDocument()
  })

  it('shows a no-match state when every paddle is far above budget', async () => {
    authMocks.value = { user: null, isAuthenticated: false }
    stubCandidates()
    recMocks.getPaddleCandidates.mockResolvedValue({
      data: [candidate('list-1', { price: 20000 })],
      error: null,
    })

    renderPage()
    await screen.findByRole('radiogroup', { name: /Skill level/ })

    fireEvent.click(within(screen.getByRole('radiogroup', { name: /Skill level/ })).getByRole('radio', { name: 'Beginner' }))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /Playing style/ })).getByRole('radio', { name: /Control/ }))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /Control vs power/ })).getByRole('radio', { name: '3' }))
    fireEvent.change(screen.getByLabelText('Budget (₱)'), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my paddles' }))

    expect(await screen.findByText('No paddle matches your budget')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust preferences' })).toBeInTheDocument()
    const browse = screen.getByRole('link', { name: 'Browse all paddles' })
    expect(browse).toHaveAttribute('href', '/marketplace?category=paddles')
  })

  it('links to the paddles marketplace filter from the results header', async () => {
    authMocks.value = { user: null, isAuthenticated: false }
    stubCandidates(2)

    renderPage()
    await screen.findByRole('radiogroup', { name: /Skill level/ })

    answerQuestionnaire()

    const browse = await screen.findByRole('link', { name: 'Browse all paddles' })
    expect(browse).toHaveAttribute('href', '/marketplace?category=paddles')
  })

  it('shows an error state when candidates fail to load', async () => {
    authMocks.value = { user: null, isAuthenticated: false }
    recMocks.getPaddleCandidates.mockResolvedValue({
      data: null,
      error: { message: 'boom', code: 'PGRST000', details: '', hint: '' },
    })

    renderPage()

    expect(
      await screen.findByText('We could not load paddles to recommend. Please try again.'),
    ).toBeInTheDocument()
  })
})
