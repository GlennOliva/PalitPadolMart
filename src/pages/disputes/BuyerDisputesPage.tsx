import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBuyerDisputes } from '../../features/disputes/disputes.service'
import type { DisputeSummary } from '../../features/disputes/disputes.types'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import PageHeader from '../../components/common/PageHeader'
import DisputeList from '../../components/disputes/DisputeList'

export default function BuyerDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void getBuyerDisputes().then(({ data, error }) => {
      setDisputes(data ?? [])
      setError(error?.message ?? null)
      setLoading(false)
    })
  }, [])

  useEffect(() => load(), [load])

  return (
    <div className="container page dispute-page">
      <PageHeader title="Disputes" intro="Track problems reported for your marketplace orders." />
      {loading ? (
        <LoadingState label="Loading your disputes..." />
      ) : error != null ? (
        <div className="dispute-state">
          <Alert variant="error" message={error} />
          <button type="button" className="btn btn--primary" onClick={load}>Try again</button>
        </div>
      ) : disputes.length === 0 ? (
        <EmptyState
          title="No disputes"
          body="If you report a problem from an eligible order, it will appear here."
          action={<Link className="btn btn--primary" to="/orders">View my orders</Link>}
        />
      ) : (
        <DisputeList disputes={disputes} view="buyer" />
      )}
      <p className="page-note"><Link to="/dashboard">Back to dashboard</Link></p>
    </div>
  )
}
