import { useState, type FormEvent } from 'react'
import { orderErrorLabel } from '../../features/orders/orders.service'
import {
  markOrderReadyForPickup,
  markOrderShipped,
  startOrderPreparation,
} from '../../features/orders/fulfillment.service'
import { validateCourier, validateTrackingNumber } from '../../features/orders/payments-validation'
import type { OrderDetail } from '../../features/orders/orders.types'
import FormField from '../common/FormField'
import FormError from '../common/FormError'
import SubmitButton from '../common/SubmitButton'
import GlassPanel from '../common/GlassPanel'

interface SellerFulfillmentActionsProps {
  order: OrderDetail
  onUpdated: () => void
}

export default function SellerFulfillmentActions({
  order,
  onUpdated,
}: SellerFulfillmentActionsProps) {
  const [shipping, setShipping] = useState(false)
  const [courier, setCourier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [courierError, setCourierError] = useState<string | null>(null)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isDelivery = order.fulfillment_type === 'delivery'

  async function run(rpc: () => Promise<{ error: { code: string } | null }>) {
    setBusy(true)
    setFormError(null)
    const { error } = await rpc()
    setBusy(false)
    if (error != null) {
      setFormError(orderErrorLabel(error.code ?? 'UNKNOWN'))
      return
    }
    setShipping(false)
    onUpdated()
  }

  function handlePrepare() {
    void run(() => startOrderPreparation(order.id))
  }

  function handleReadyForPickup() {
    void run(() => markOrderReadyForPickup(order.id))
  }

  function handleShip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const courierErrorValue = validateCourier(courier)
    const trackingErrorValue = validateTrackingNumber(trackingNumber)
    setCourierError(courierErrorValue)
    setTrackingError(trackingErrorValue)
    if (courierErrorValue != null || trackingErrorValue != null) return
    void run(() => markOrderShipped(order.id, trackingNumber, courier))
  }

  const showStart = order.status === 'confirmed' || order.status === 'paid'
  const showReadyForPickup = order.status === 'preparing' && !isDelivery
  const showShip = order.status === 'preparing' && isDelivery

  if (!showStart && !showReadyForPickup && !showShip) return null

  return (
    <GlassPanel className="order-detail__panel">
      <h2 className="order-detail__section-title">Fulfillment</h2>

      {showStart ? (
        <div className="order-detail__actions">
          <p className="order-detail__section-hint">
            {order.status === 'paid'
              ? 'Payment verified — start working this order.'
              : 'The buyer selected a cash method. Start preparing, then collect cash at the handoff.'}
          </p>
          <SubmitButton loading={busy} loadingLabel="Starting…" onClick={handlePrepare}>
            Start preparation
          </SubmitButton>
        </div>
      ) : null}

      {showReadyForPickup ? (
        <div className="order-detail__actions">
          <p className="order-detail__section-hint">
            Tell the buyer the item is ready to be picked up.
          </p>
          <SubmitButton loading={busy} loadingLabel="Updating…" onClick={handleReadyForPickup}>
            Mark ready for pickup
          </SubmitButton>
        </div>
      ) : null}

      {showShip ? (
        shipping ? (
          <form className="order-detail__shipping" onSubmit={handleShip} noValidate>
            <p className="order-detail__section-hint">Add the courier and tracking number for the buyer.</p>
            <FormField
              id="ship-courier"
              label="Courier"
              required
              value={courier}
              onChange={setCourier}
              error={courierError}
              maxLength={80}
              placeholder="e.g. J&T Express"
            />
            <FormField
              id="ship-tracking"
              label="Tracking number"
              required
              value={trackingNumber}
              onChange={setTrackingNumber}
              error={trackingError}
              maxLength={100}
            />
            {formError != null ? <FormError message={formError} /> : null}
            <div className="order-detail__action-row">
              <SubmitButton loading={busy} loadingLabel="Marking shipped…">
                Mark as shipped
              </SubmitButton>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setShipping(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="order-detail__actions">
            <p className="order-detail__section-hint">
              Once handed to the courier, add the tracking details for the buyer.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => setShipping(true)}
            >
              Mark as shipped
            </button>
          </div>
        )
      ) : null}

      {!shipping && formError != null ? <FormError message={formError} /> : null}
    </GlassPanel>
  )
}
