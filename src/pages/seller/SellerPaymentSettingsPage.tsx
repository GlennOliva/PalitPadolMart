import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useSeller } from '../../features/seller/useSeller'
import {
  getSellerPaymentMethods,
  setSellerPaymentMethod,
} from '../../features/orders/payments.service'
import {
  isPaymentMethod,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../../features/orders/payments.types'
import type { SellerPaymentMethod } from '../../features/orders/payments.types'
import { orderErrorLabel } from '../../features/orders/orders.service'
import GlassPanel from '../../components/common/GlassPanel'
import Alert from '../../components/common/Alert'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import LoadingState from '../../components/common/LoadingState'

interface MethodFormState {
  is_enabled: boolean
  instructions: string
}

interface MethodErrors {
  manual_transfer?: string | null
  cash_on_pickup?: string | null
  cash_on_delivery?: string | null
}

const MAX_INSTRUCTIONS_LENGTH = 300

const METHOD_HINTS: Record<PaymentMethod, string> = {
  manual_transfer:
    'Buyers transfer payment to your account. Add your GCash, Maya, or bank details here.',
  cash_on_pickup:
    'Buyers pay in cash when they pick up the item in person.',
  cash_on_delivery:
    'Buyers pay in cash when the item is delivered.',
}

function rowToForm(row: SellerPaymentMethod): MethodFormState {
  return {
    is_enabled: row.is_enabled,
    instructions: row.instructions ?? '',
  }
}

function validateInstructions(method: PaymentMethod, value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_INSTRUCTIONS_LENGTH) {
    return `Instructions must be ${MAX_INSTRUCTIONS_LENGTH} characters or fewer.`
  }
  if (method === 'manual_transfer' && trimmed.length === 0) {
    return 'Add your transfer details so buyers know where to send payment.'
  }
  return null
}

export default function SellerPaymentSettingsPage() {
  const { user } = useAuth()
  const { sellerProfile, sellerLoading } = useSeller()

  const [form, setForm] = useState<Record<PaymentMethod, MethodFormState>>({
    manual_transfer: { is_enabled: true, instructions: '' },
    cash_on_pickup: { is_enabled: true, instructions: '' },
    cash_on_delivery: { is_enabled: true, instructions: '' },
  })
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<MethodErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (sellerProfile == null) return
    let cancelled = false
    void getSellerPaymentMethods(sellerProfile.id).then(({ data }) => {
      if (cancelled) return
      if (data != null) {
        const next = {
          manual_transfer: { is_enabled: true, instructions: '' },
          cash_on_pickup: { is_enabled: true, instructions: '' },
          cash_on_delivery: { is_enabled: true, instructions: '' },
        }
        for (const row of data) {
          if (isPaymentMethod(row.method)) next[row.method] = rowToForm(row)
        }
        setForm(next)
      }
      setLoading(false)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [sellerProfile])

  if (user == null || sellerProfile == null || sellerLoading) {
    return <LoadingState label="Loading your payment methods…" />
  }
  if (!loaded && loading) {
    return <LoadingState label="Loading your payment methods…" />
  }

  const seller = sellerProfile

  function updateMethod(
    method: PaymentMethod,
    patch: Partial<MethodFormState>,
  ) {
    setForm((prev) => ({ ...prev, [method]: { ...prev[method], ...patch } }))
    if (patch.instructions != null) {
      setErrors((prev) => ({ ...prev, [method]: null }))
    }
  }

  function toggleMethod(method: PaymentMethod) {
    setForm((prev) => ({
      ...prev,
      [method]: { ...prev[method], is_enabled: !prev[method].is_enabled },
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: MethodErrors = {}
    for (const method of PAYMENT_METHODS) {
      const error = validateInstructions(method, form[method].instructions)
      if (error != null) nextErrors[method] = error
    }
    if (Object.values(nextErrors).some((value) => value != null)) {
      setErrors(nextErrors)
      setSaveError(null)
      setSaveSuccess(false)
      return
    }
    setErrors({})
    setSaveError(null)
    setSaveSuccess(false)
    setSaving(true)
    for (const method of PAYMENT_METHODS) {
      const { error } = await setSellerPaymentMethod(
        seller.id,
        method,
        form[method].is_enabled,
        form[method].instructions,
      )
      if (error != null) {
        setSaving(false)
        setSaveError(orderErrorLabel(error.code ?? 'UNKNOWN'))
        return
      }
    }
    setSaving(false)
    setSaveSuccess(true)
  }

  return (
    <div className="container page">
      <h1 className="page__title">Payment methods</h1>

      <GlassPanel className="order-detail__panel">
        <p className="order-detail__section-hint">
          Choose how buyers can pay you and add instructions they will see at
          checkout. Cash options only show for orders that match your pickup or
          delivery availability.
        </p>

        <form className="seller-form" onSubmit={handleSubmit} noValidate>
          {PAYMENT_METHODS.map((method) => (
            <div key={method} className="seller-form__method">
              <label className="toggle-field">
                <input
                  className="toggle-field__input"
                  type="checkbox"
                  checked={form[method].is_enabled}
                  onChange={() => toggleMethod(method)}
                />
                <span className="toggle-field__body">
                  <span className="toggle-field__label">{PAYMENT_METHOD_LABELS[method]}</span>
                  <span className="toggle-field__hint">{METHOD_HINTS[method]}</span>
                </span>
              </label>
              <div className="form-field">
                <label className="form-field__label" htmlFor={`method-instructions-${method}`}>
                  Instructions
                </label>
                <textarea
                  className="form-field__textarea"
                  id={`method-instructions-${method}`}
                  rows={3}
                  value={form[method].instructions}
                  onChange={(event) =>
                    updateMethod(method, { instructions: event.target.value })
                  }
                  maxLength={MAX_INSTRUCTIONS_LENGTH}
                  aria-invalid={errors[method] != null ? true : undefined}
                />
                {errors[method] != null ? (
                  <p className="form-field__error">{errors[method]}</p>
                ) : null}
              </div>
            </div>
          ))}

          {saveError != null ? <FormError message={saveError} /> : null}
          {saveSuccess ? (
            <Alert variant="success" message="Your payment methods were updated." />
          ) : null}
          <SubmitButton loading={saving} loadingLabel="Saving…">
            Save payment methods
          </SubmitButton>
        </form>
      </GlassPanel>

      <p className="page-note">
        <Link to="/seller/dashboard">Back to seller dashboard</Link>
      </p>
    </div>
  )
}
