import { useEffect, useRef, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

interface AdminSearchBarProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export default function AdminSearchBar({
  value,
  onChange,
  placeholder = 'Search',
}: AdminSearchBarProps) {
  const [text, setText] = useState(value)
  const acked = useRef(value)
  const debounced = useDebouncedValue(text, 350)

  useEffect(() => {
    if (debounced === acked.current) return
    acked.current = debounced
    onChange(debounced)
  }, [debounced, onChange])

  useEffect(() => {
    if (value === acked.current) return
    setText(value)
    acked.current = value
  }, [value])

  return (
    <input
      type="search"
      className="admin-search-bar"
      value={text}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => setText(event.target.value)}
    />
  )
}