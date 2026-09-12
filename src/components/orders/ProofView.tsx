import { useEffect, useState } from 'react'
import { paymentProofUrl } from '../../features/orders/payments.service'

/** Renders a payment proof (signed URL) as a thumbnail + open link. */
export default function ProofView({ path }: { path: string | null | undefined }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (path == null || path.length === 0) {
      setUrl(null)
      return
    }
    void paymentProofUrl(path).then((signed) => {
      if (!cancelled) setUrl(signed)
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (url == null) return null

  return (
    <div className="proof-view">
      {path?.toLowerCase().match(/\.(jpe?g|png|webp)$/) != null ? (
        <a href={url} target="_blank" rel="noreferrer" className="proof-view__thumb-link">
          <img className="proof-view__thumb" src={url} alt="Payment proof" />
        </a>
      ) : (
        <a className="btn btn--secondary" href={url} target="_blank" rel="noreferrer">
          View proof
        </a>
      )}
    </div>
  )
}
