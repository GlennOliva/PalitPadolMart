interface AdminPaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function AdminPagination({ page, totalPages, onPageChange }: AdminPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="admin-pagination" aria-label="Pagination">
      <span className="admin-pagination__info">
        Page {page} of {totalPages}
      </span>
      <div className="admin-pagination__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}