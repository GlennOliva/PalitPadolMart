import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSellerDisputes } from '../../features/disputes/disputes.service'
import type { DisputeSummary } from '../../features/disputes/disputes.types'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import PageHeader from '../../components/common/PageHeader'
import DisputeList from '../../components/disputes/DisputeList'

export default function SellerDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void getSellerDisputes().then(({ data, error }) => {
      setDisputes(data ?? [])
      setError(error?.message ?? null)
      setLoading(false)
    })
  }, [])

  useEffect(() => load(), [load])

  return (
    <div className="container page dispute-page">
      <PageHeader title="Store disputes" intro="Review and respond to issues raised for your orders." />
      {loading ? (
        <LoadingState label="Loading store disputes..." />
      ) : error != null ? (
        <div className="dispute-state">
          <Alert variant="error" message={error} />
          <button type="button" className="btn btn--primary" onClick={load}>Try again</button>
        </div>
      ) : disputes.length === 0 ? (
        <EmptyState
          title="No store disputes"
          body="Order issues raised by your buyers will appear here."
          action={<Link className="btn btn--secondary" to="/seller/orders">View incoming orders</Link>}
        />
      ) : (
        <DisputeList disputes={disputes} view="seller" />
      )}
      <p className="page-note"><Link to="/seller/dashboard">Back to seller dashboard</Link></p>
    </div>
  )
}
