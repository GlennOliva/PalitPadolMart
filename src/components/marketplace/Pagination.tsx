interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

/**
 * Numeric pager. Both the previous/next buttons and the page buttons announce
 * their action so keyboard and screen-reader users get explicit targets.
 */
export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const maxVisible = 5
  const start = Math.max(1, Math.min(page - 2, totalPages - maxVisible + 1))
  const visible = Array.from(
    { length: Math.min(maxVisible, totalPages) },
    (_, index) => start + index,
  )

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="pagination__button"
        disabled={page <= 1}
        aria-label="Previous page"
        onClick={() => onPageChange(page - 1)}
      >
        ← Prev
      </button>
      <div className="pagination__pages">
        {visible.map((number) => (
          <button
            key={number}
            type="button"
            className={number === page ? 'pagination__page pagination__page--active' : 'pagination__page'}
            aria-label={`Page ${number}`}
            aria-current={number === page ? 'page' : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="pagination__button"
        disabled={page >= totalPages}
        aria-label="Next page"
        onClick={() => onPageChange(page + 1)}
      >
        Next →
      </button>
    </nav>
  )
}
