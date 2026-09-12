interface ListingSkeletonProps {
  count?: number
}

/** Placeholder cards shown while search results load. */
export default function ListingSkeleton({ count = 6 }: ListingSkeletonProps) {
  return (
    <div className="listing-grid" role="status" aria-label="Loading listings">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="listing-card listing-card--skeleton" aria-hidden="true">
          <div className="listing-card__media skeleton skeleton--media" />
          <div className="listing-card__body">
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--short" />
            <div className="skeleton skeleton--line skeleton--tiny" />
          </div>
        </div>
      ))}
    </div>
  )
}
