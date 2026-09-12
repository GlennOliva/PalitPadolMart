import { useEffect, useState } from 'react'

/**
 * Returns `value` after `delay` ms have passed without a change. Used to keep
 * the marketplace search box responsive while only hitting the database after
 * the user pauses typing.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
