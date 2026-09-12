import { SCORE_WEIGHTS } from '../../features/recommendation/scoring'
import type { ScoreBreakdown } from '../../features/recommendation/recommendation.types'

const ROWS = [
  { key: 'budget', label: 'Budget fit' },
  { key: 'skill', label: 'Skill level' },
  { key: 'style', label: 'Playing style' },
  { key: 'weight', label: 'Weight' },
  { key: 'controlPower', label: 'Control / power' },
] as const

interface ScoreBreakdownProps {
  breakdown: ScoreBreakdown
}

/** Per-component score bars shown inside each recommendation card. */
export default function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  return (
    <div className="score-breakdown" aria-label="Score breakdown">
      {ROWS.map((row) => {
        const max = SCORE_WEIGHTS[row.key]
        const value = breakdown[row.key]
        return (
          <div key={row.key} className="score-breakdown__row">
            <span className="score-breakdown__label">{row.label}</span>
            <span className="score-breakdown__bar" aria-hidden="true">
              <span
                className="score-breakdown__fill"
                style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
              />
            </span>
            <span className="score-breakdown__value">
              {value}/{max}
            </span>
          </div>
        )
      })}
    </div>
  )
}
