import { useId } from 'react'

interface AdminFilterSelectOption {
  value: string
  label: string
}

interface AdminFilterSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: AdminFilterSelectOption[]
}

export default function AdminFilterSelect({
  label,
  value,
  onChange,
  options,
}: AdminFilterSelectProps) {
  const controlId = useId()
  return (
    <label className="admin-filter-select" htmlFor={controlId}>
      <span className="admin-filter-select__label">{label}</span>
      <select
        id={controlId}
        className="admin-filter-select__control"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}