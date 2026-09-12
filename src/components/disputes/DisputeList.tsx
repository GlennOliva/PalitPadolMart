import { Link } from 'react-router-dom'
import { DISPUTE_REASON_LABELS } from '../../features/disputes/disputes.types'
import type { DisputeSummary } from '../../features/disputes/disputes.types'
import { formatCurrency, formatDateTime } from '../../utils/format'
import Badge from '../common/Badge'

interface DisputeListProps {
  disputes: DisputeSummary[]
  view: 'buyer' | 'seller'
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export default function DisputeList({ disputes, view }: DisputeListProps) {
  return (
    <ul className="dispute-list" aria-label={view === 'buyer' ? 'Your disputes' : 'Store disputes'}>
      {disputes.map((dispute) => {
        const href = view === 'buyer'
          ? `/disputes/${dispute.id}`
          : `/seller/disputes/${dispute.id}`
        const party = view === 'buyer'
          ? dispute.seller.store_name ?? 'Seller'
          : dispute.buyer_name ?? 'Buyer'
        return (
          <li key={dispute.id}>
            <Link className="dispute-card" to={href}>
              <div className="dispute-card__header">
                <div>
                  <p className="dispute-card__eyebrow">{dispute.order.order_number}</p>
                  <h2>{DISPUTE_REASON_LABELS[dispute.reason]}</h2>
                </div>
                <Badge variant={dispute.status}>{statusLabel(dispute.status)}</Badge>
              </div>
              <dl className="dispute-card__meta">
                <div>
                  <dt>{view === 'buyer' ? 'Seller' : 'Buyer'}</dt>
                  <dd>{party}</dd>
                </div>
                <div>
                  <dt>Opened</dt>
                  <dd>{formatDateTime(dispute.created_at)}</dd>
                </div>
                {dispute.refund != null ? (
                  <div>
                    <dt>Refund</dt>
                    <dd>
                      {statusLabel(dispute.refund.status)} - {formatCurrency(dispute.refund.amount)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <span className="dispute-card__link">View details</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
