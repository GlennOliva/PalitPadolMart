import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { orderErrorLabel } from '../../features/orders/orders.service'
import {
  submitOrderPayment,
  uploadPaymentProof,
} from '../../features/orders/payments.service'
import {
  PAYMENT_METHOD_LABELS,
  isPaymentMethod,
  type PaymentMethod,
  type SellerPaymentMethod,
} from '../../features/orders/payments.types'
import {
  hasPaymentErrors,
  validateDeliveryAddress,
  validateProofFile,
  validateReference,
  type PaymentFormErrors,
} from '../../features/orders/payments-validation'
import type { OrderDetail } from '../../features/orders/orders.types'
import type { DeliveryAddressInput } from '../../features/orders/payments.types'
import FormField from '../common/FormField'
import FormError from '../common/FormError'
import SubmitButton from '../common/SubmitButton'
import GlassPanel from '../common/GlassPanel'
import Alert from '../common/Alert'

interface BuyerPaymentPanelProps {
  order: OrderDetail
  buyerId: string
  methods: SellerPaymentMethod[]
  onUpdated: () => void
}

const EMPTY_DELIVERY: DeliveryAddressInput = {
  recipient_name: '',
  phone: '',
  address: '',
  city: '',
  province: '',
  postal_code: '',
  delivery_notes: '',
}

export default function BuyerPaymentPanel({
  order,
  buyerId,
  methods,
  onUpdated,
}: BuyerPaymentPanelProps) {
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPath, setProofPath] = useState<string | null>(order.payment?.proof_path ?? null)
  const [reference, setReference] = useState(order.payment?.payment_reference ?? '')
  const [delivery, setDelivery] = useState<DeliveryAddressInput>(EMPTY_DELIVERY)
  const [errors, setErrors] = useState<PaymentFormErrors>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const enabledMethods = useMemo(
    () =>
      methods.flatMap((entry) =>
        entry.is_enabled && isPaymentMethod(entry.method)
          ? [{ ...entry, method: entry.method }]
          : [],
      ),
    [methods],
  )
  const isDelivery = order.fulfillment_type === 'delivery'
  const isPickup = order.fulfillment_type === 'pickup'
  const rejected = order.payment?.status === 'rejected'

  useEffect(() => {
    const preferred =
      enabledMethods.find((m) => m.method === 'cash_on_pickup' && isPickup) ??
      enabledMethods.find((m) => m.method === 'cash_on_delivery' && isDelivery) ??
      enabledMethods.find((m) => m.method === 'manual_transfer') ??
      enabledMethods[0] ??
      null
    setMethod(preferred?.method ?? null)
  }, [enabledMethods, isDelivery, isPickup])

  function updateDelivery(field: keyof DeliveryAddressInput) {
    return (value: string) => setDelivery((prev) => ({ ...prev, [field]: value }))
  }

  function handleProofChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file == null) return
    setProofFile(file)
    setErrors((prev) => ({ ...prev, proof: null }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (method == null) {
      setFormError('Choose a payment method to continue.')
      return
    }
    const nextErrors: PaymentFormErrors = {}
    let proofPathToSend = proofPath

    if (method === 'manual_transfer') {
      if (proofFile != null) {
        const fileError = validateProofFile(proofFile)
        if (fileError != null) {
          nextErrors.proof = fileError
        } else {
          try {
            const upload = await uploadPaymentProof(proofFile, order.id, buyerId)
            if (upload.error != null) {
              setFormError(`We could not upload your proof. ${upload.error}`)
              return
            }
            proofPathToSend = upload.path
            setProofPath(upload.path)
          } catch {
            setFormError('We could not upload your proof. Please try again.')
            return
          }
        }
      } else if (proofPathToSend == null) {
        nextErrors.proof = 'Upload your payment proof to submit.'
      }
      const refError = validateReference(reference)
      if (refError != null) nextErrors.reference = refError
    }

    const deliveryError = isDelivery ? validateDeliveryAddress(delivery) : null
    if (deliveryError != null) nextErrors.delivery = deliveryError

    if (hasPaymentErrors(nextErrors)) {
      setErrors(nextErrors)
      setFormError(null)
      return
    }

    setBusy(true)
    setFormError(null)
    setSubmitSuccess(false)
    try {
      const { data, error } = await submitOrderPayment({
        order_id: order.id,
        payment_method: method,
        proof_path: proofPathToSend,
        reference,
        delivery: isDelivery ? delivery : null,
      })
      if (error != null || data == null) {
        setFormError(orderErrorLabel(error?.code ?? 'UNKNOWN'))
        return
      }
      setSubmitSuccess(true)
      onUpdated()
    } catch {
      setFormError('Something went wrong submitting your payment. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const selectedMethodInstructions =
    methods.find((m) => m.method === method)?.instructions ?? null

  return (
    <GlassPanel className="order-detail__panel">
      <h2 className="order-detail__section-title">Payment</h2>
      <p className="order-detail__section-hint">
        Pay {order.seller?.store_name ?? 'the seller'} directly. Your payment details
        are recorded against this order.
      </p>

      {rejected ? (
        <Alert
          variant="error"
          message={
            order.payment?.rejection_reason != null
              ? `Your payment was not approved: ${order.payment.rejection_reason}.`
              : 'Your payment was not approved. You can correct it and submit again.'
          }
        />
      ) : null}
      {submitSuccess ? (
        <Alert
          variant="success"
          message="Your payment details were submitted. The seller will verify them."
        />
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <fieldset className="payment-methods">
          <legend className="form-field__label">Choose how to pay</legend>
          {enabledMethods.map((entry) => (
            <label key={entry.method} className="toggle-field">
              <input
                className="toggle-field__input"
                type="radio"
                name="payment-method"
                value={entry.method}
                checked={method === entry.method}
                onChange={() => setMethod(entry.method)}
              />
              <span className="toggle-field__body">
                <span className="toggle-field__label">
                  {PAYMENT_METHOD_LABELS[entry.method]}
                </span>
                {entry.instructions != null ? (
                  <span className="toggle-field__hint">{entry.instructions}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        {selectedMethodInstructions != null && method !== null ? (
          <p className="payment-method-note">
            <strong>{PAYMENT_METHOD_LABELS[method]}:</strong> {selectedMethodInstructions}
          </p>
        ) : null}

        {method === 'manual_transfer' ? (
          <div className="form-field">
            <label className="form-field__label" htmlFor="payment-proof">
              Payment proof *
            </label>
            {proofPath != null && proofFile == null ? (
              <p className="form-field__hint">Proof already uploaded — uploading a new file replaces it.</p>
            ) : null}
            <div className="proof-upload">
              <label className="proof-upload__drop" htmlFor="payment-proof">
                <input
                  className="proof-upload__input"
                  id="payment-proof"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleProofChange}
                  aria-invalid={errors.proof != null ? true : undefined}
                />
                <span className="proof-upload__body">
                  <span className="proof-upload__title">
                    {proofFile != null ? proofFile.name : 'Choose a file'}
                  </span>
                  <span className="proof-upload__meta">
                    {proofFile != null
                      ? `${Math.ceil(proofFile.size / 1024)} KB — will be uploaded on submit`
                      : 'JPG, PNG, WEBP, or PDF'}
                  </span>
                </span>
              </label>
            </div>
            {errors.proof != null ? <p className="form-field__error">{errors.proof}</p> : null}
            <FormField
              id="payment-reference"
              label="Payment reference"
              value={reference}
              onChange={setReference}
              error={errors.reference}
              maxLength={120}
              hint="Optional reference (e.g. GCash confirmation number) so the seller can match your transfer."
            />
          </div>
        ) : null}

        {isDelivery ? (
          <div className="delivery-form">
            <h3 className="form-field__label">Delivery address</h3>
            <div className="form-grid">
              <FormField
                id="delivery-recipient"
                label="Recipient name"
                required
                value={delivery.recipient_name}
                onChange={updateDelivery('recipient_name')}
                error={errors.delivery?.recipient_name}
                maxLength={80}
              />
              <FormField
                id="delivery-phone"
                label="Phone number"
                required
                type="tel"
                value={delivery.phone}
                onChange={updateDelivery('phone')}
                error={errors.delivery?.phone}
                maxLength={30}
              />
              <FormField
                id="delivery-address"
                label="Street address"
                required
                className="form-grid__full"
                value={delivery.address}
                onChange={updateDelivery('address')}
                error={errors.delivery?.address}
                maxLength={200}
              />
              <FormField
                id="delivery-city"
                label="City"
                required
                value={delivery.city}
                onChange={updateDelivery('city')}
                error={errors.delivery?.city}
                maxLength={80}
              />
              <FormField
                id="delivery-province"
                label="Province / region"
                required
                value={delivery.province}
                onChange={updateDelivery('province')}
                error={errors.delivery?.province}
                maxLength={80}
              />
              <FormField
                id="delivery-postal"
                label="Postal code"
                required
                className="form-grid__full"
                value={delivery.postal_code}
                onChange={updateDelivery('postal_code')}
                error={errors.delivery?.postal_code}
                maxLength={20}
              />
              <div className="form-field form-grid__full">
                <label className="form-field__label" htmlFor="delivery-notes">
                  Delivery notes
                </label>
                <textarea
                  className="form-field__textarea"
                  id="delivery-notes"
                  rows={2}
                  value={delivery.delivery_notes}
                  onChange={(event) => updateDelivery('delivery_notes')(event.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
          </div>
        ) : null}

        {formError != null ? <FormError message={formError} /> : null}
        <SubmitButton loading={busy} loadingLabel="Submitting payment…">
          {rejected ? 'Submit corrected payment' : 'Submit payment details'}
        </SubmitButton>
      </form>
    </GlassPanel>
  )
}
