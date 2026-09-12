import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useSeller } from '../../features/seller/useSeller'
import {
  getMyInquiries,
  getUnreadCounts,
} from '../../features/inquiries/inquiries.service'
import type { InquiryListItem } from '../../features/inquiries/inquiries.types'
import { formatDate } from '../../utils/format'
import PageHeader from '../../components/common/PageHeader'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'

function statusLabel(status: InquiryListItem['status']): string {
  const labels: Record<InquiryListItem['status'], string> = {
    open: 'Open',
    answered: 'Answered',
    closed: 'Closed',
  }
  return labels[status]
}

export default function InquiriesPage() {
  const { user } = useAuth()
  const { sellerProfile, sellerLoading } = useSeller()
  const [inquiries, setInquiries] = useState<InquiryListItem[]>([])
  const [unread, setUnread] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (user == null || sellerLoading) return
    setLoading(true)
    setError(null)
    const sellerId = sellerProfile?.id ?? null
    void getMyInquiries(user.id, sellerId).then(({ data, error: loadError }) => {
      if (loadError != null) {
        setError('We could not load your inquiries. Please try again.')
        setInquiries([])
        setLoading(false)
        return
      }
      setInquiries(data)
      void getUnreadCounts(
        user.id,
        data.map((inquiry) => inquiry.id),
      ).then(({ data: counts, error: countsError }) => {
        if (countsError == null) setUnread(counts)
      })
      setLoading(false)
    })
  }, [user, sellerLoading, sellerProfile?.id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <LoadingState label="Loading your inquiries…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <button type="button" className="btn btn--primary" onClick={load}>
          Try again
        </button>
      </div>
    )
  }

  if (inquiries.length === 0) {
    return (
      <div className="container page">
        <PageHeader
          title="Inquiries"
          intro="Messages between you and sellers about specific listings."
        />
        <EmptyState
          title="No inquiries yet"
          body="Ask a seller a question from any listing page and your conversations will appear here."
          action={
            <Link className="btn btn--primary" to="/marketplace">
              Browse the marketplace
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container page">
      <PageHeader
        title="Inquiries"
        intro="Messages between you and sellers about specific listings."
      />

      <ul className="inquiry-list">
        {inquiries.map((inquiry) => {
          const isBuyer = inquiry.buyer_id === user?.id
          const counterparty = isBuyer
            ? (inquiry.seller?.store_name ?? 'Seller')
            : (inquiry.buyer_name ?? 'Buyer')
          const unreadCount = unread.get(inquiry.id) ?? 0

          return (
            <li key={inquiry.id}>
              <Link
                className="inquiry-list__item"
                to={`/inquiries/${inquiry.id}`}
              >
                <div className="inquiry-list__head">
                  <strong className="inquiry-list__subject">
                    {inquiry.subject}
                  </strong>
                  <span className={`inquiry-status inquiry-status--${inquiry.status}`}>
                    {statusLabel(inquiry.status)}
                  </span>
                </div>
                <p className="inquiry-list__listing">
                  {inquiry.listing_title ?? 'Listing'} · {counterparty}
                </p>
                <p className="inquiry-list__preview">{inquiry.message}</p>
                <div className="inquiry-list__meta">
                  <span>{formatDate(inquiry.updated_at)}</span>
                  {unreadCount > 0 ? (
                    <span className="inquiry-list__unread" aria-label={`${unreadCount} unread messages`}>
                      {unreadCount} new
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
