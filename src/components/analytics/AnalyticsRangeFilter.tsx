import { addDaysISO, todayISO } from '../../features/admin/analytics/admin-analytics-params'

interface AnalyticsRangeFilterProps {
  start: string
  end: string
  bucket: string
  onRangeChange: (start: string, end: string) => void
  onBucketChange: (bucket: string) => void
  label?: string
}

interface Preset {
  label: string
  start: string
  end: string
}

function buildPresets(): Preset[] {
  const end = todayISO()
  return [
    { label: '7 days', start: addDaysISO(end, -6), end },
    { label: '30 days', start: addDaysISO(end, -29), end },
    { label: '90 days', start: addDaysISO(end, -89), end },
    { label: '6 months', start: addDaysISO(end, -182), end },
    { label: '1 year', start: addDaysISO(end, -364), end },
    { label: '3 years', start: addDaysISO(end, -1095), end },
  ]
}

/**
 * Date-range + bucket selector shared by the admin and seller analytics pages.
 * State lives in the URL (via the page), so the same query is shareable.
 */
export default function AnalyticsRangeFilter({
  start,
  end,
  bucket,
  onRangeChange,
  onBucketChange,
  label = 'Analytics period',
}: AnalyticsRangeFilterProps) {
  const presets = buildPresets()
  const isPreset = presets.some((p) => p.start === start && p.end === end)

  return (
    <div className="analytics-filter" role="group" aria-label={label}>
      <label className="analytics-filter__field">
        <span>From</span>
        <input
          type="date"
          value={start}
          max={end}
          onChange={(e) => e.target.value !== '' && onRangeChange(e.target.value, end)}
          aria-label={`${label} start date`}
        />
      </label>
      <label className="analytics-filter__field">
        <span>To</span>
        <input
          type="date"
          value={end}
          min={start}
          max={todayISO()}
          onChange={(e) => e.target.value !== '' && onRangeChange(start, e.target.value)}
          aria-label={`${label} end date`}
        />
      </label>
      <div className="analytics-filter__presets" role="group" aria-label="Quick ranges">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={preset.start === start && preset.end === end ? 'chip chip--active' : 'chip'}
            onClick={() => onRangeChange(preset.start, preset.end)}
          >
            {preset.label}
          </button>
        ))}
        {isPreset ? null : (
          <span className="analytics-filter__custom-note" aria-hidden="true">
            custom
          </span>
        )}
      </div>
      <label className="analytics-filter__field">
        <span>Bucket</span>
        <select value={bucket} onChange={(e) => onBucketChange(e.target.value)} aria-label="Chart bucket">
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </label>
    </div>
  )
}