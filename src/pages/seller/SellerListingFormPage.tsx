import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import { describeSupabaseError } from '../../features/auth/auth-errors'
import {
  createListing,
  getActiveBrands,
  getActiveCategories,
  getSellerListing,
  removePaddleAttributes,
  savePaddleAttributes,
  updateListing,
  uploadListingImage,
} from '../../features/marketplace/marketplace.service'
import {
  hasListingFieldErrors,
  LISTING_CONDITIONS,
  LISTING_STATUS_OPTIONS,
  PADDLE_PLAYING_STYLES,
  PADDLE_SKILL_LEVELS,
  validateListingForm,
  type ListingFieldErrors,
} from '../../features/marketplace/marketplace-validation'
import { isPaddleCategorySlug } from '../../features/marketplace/marketplace-utils'
import type {
  Brand,
  Category,
  ListingEditableFields,
  ListingFormValues,
  PaddleAttributeInput,
  SellerListing,
  StagedListingImage,
} from '../../features/marketplace/marketplace.types'
import ListingImageManager from '../../components/marketplace/ListingImageManager'
import StagedImagePicker from '../../components/marketplace/StagedImagePicker'
import FormField from '../../components/common/FormField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'
import PageHeader from '../../components/common/PageHeader'

const EMPTY_LISTING: ListingEditableFields = {
  category_id: '',
  brand_id: '',
  title: '',
  description: '',
  listing_condition: 'new',
  price: '',
  quantity: '1',
  listing_status: 'draft',
  city: '',
  province: '',
  pickup_available: false,
  delivery_available: false,
}

const EMPTY_PADDLE: PaddleAttributeInput = {
  weight_grams: '',
  weight_class: '',
  control_score: '',
  power_score: '',
  skill_level: '',
  playing_style: '',
}

function listingToForm(listing: SellerListing): ListingFormValues {
  const paddle = listing.paddle_attributes
  return {
    listing: {
      category_id: listing.category?.id ?? '',
      brand_id: listing.brand?.id ?? '',
      title: listing.title,
      description: listing.description,
      listing_condition: listing.listing_condition,
      price: String(listing.price),
      quantity: String(listing.quantity),
      listing_status: listing.listing_status,
      city: listing.city ?? '',
      province: listing.province ?? '',
      pickup_available: listing.pickup_available,
      delivery_available: listing.delivery_available,
    },
    paddle: {
      weight_grams: paddle?.weight_grams != null ? String(paddle.weight_grams) : '',
      weight_class: paddle?.weight_class ?? '',
      control_score: paddle?.control_score != null ? String(paddle.control_score) : '',
      power_score: paddle?.power_score != null ? String(paddle.power_score) : '',
      skill_level: paddle?.skill_level ?? '',
      playing_style: paddle?.playing_style ?? '',
    },
  }
}

export default function SellerListingFormPage() {
  const { listingId = '' } = useParams()
  const { sellerProfile } = useSeller()
  const navigate = useNavigate()
  const location = useLocation()
  const isEditing = listingId.length > 0
  const createdState = (location.state as { created?: boolean; uploadFailed?: boolean } | null) ?? {}

  const [categories, setCategories] = useState<Category[] | null>(null)
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [listing, setListing] = useState<SellerListing | null>(null)
  const [form, setForm] = useState<ListingFormValues>({
    listing: EMPTY_LISTING,
    paddle: EMPTY_PADDLE,
  })
  const [stagedImages, setStagedImages] = useState<StagedListingImage[]>([])
  const [fieldErrors, setFieldErrors] = useState<ListingFieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([getActiveCategories(), getActiveBrands()]).then(
      ([categoriesResult, brandsResult]) => {
        if (!active) return
        if (categoriesResult.error != null || brandsResult.error != null) {
          setLoadError('We could not load listing options. Please try again.')
          return
        }
        setCategories(categoriesResult.data ?? [])
        setBrands(brandsResult.data ?? [])
      },
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!isEditing || sellerProfile == null) return
    void getSellerListing(sellerProfile.id, listingId).then(({ data, error }) => {
      if (!active) return
      if (error != null) {
        setLoadError('We could not load this listing. Please try again.')
        return
      }
      if (data == null) {
        setLoadError('This listing could not be found in your store.')
        return
      }
      setListing(data)
      setForm(listingToForm(data))
    })
    return () => {
      active = false
    }
  }, [isEditing, sellerProfile, listingId])

  if (sellerProfile == null || (isEditing && listing == null && loadError == null)) {
    return <LoadingState label="Loading listing form…" />
  }

  if (loadError != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={loadError} />
        <p className="page-note">
          <Link to="/seller/listings">Back to your listings</Link>
        </p>
      </div>
    )
  }

  const categoriesReady = categories != null && brands != null
  const selectedCategory = (categories ?? []).find(
    (category) => category.id === form.listing.category_id,
  )
  const isPaddle = isPaddleCategorySlug(selectedCategory?.slug ?? '')
  const statusLocked = isEditing && ['archived', 'sold', 'removed'].includes(form.listing.listing_status)

  function updateListingField(field: keyof ListingEditableFields) {
    return (value: string) =>
      setForm((prev) => ({ ...prev, listing: { ...prev.listing, [field]: value } }))
  }

  function updatePaddleField(field: keyof PaddleAttributeInput) {
    return (value: string) =>
      setForm((prev) => ({ ...prev, paddle: { ...prev.paddle, [field]: value } }))
  }

  function toggleListingField(field: 'pickup_available' | 'delivery_available') {
    setForm((prev) => ({
      ...prev,
      listing: { ...prev.listing, [field]: !prev.listing[field] },
    }))
  }

  function reloadListing() {
    if (sellerProfile == null || !isEditing) return
    void getSellerListing(sellerProfile.id, listingId).then(({ data }) => {
      if (data != null) {
        setListing(data)
        setForm(listingToForm(data))
      }
    })
  }

  async function uploadStagedImages(listingId: string): Promise<number> {
    const sellerId = sellerProfile!.id
    let failed = 0
    for (const staged of stagedImages) {
      const { error } = await uploadListingImage(sellerId, listingId, staged.file)
      if (error != null) failed += 1
    }
    return failed
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateListingForm(form, isPaddle)
    if (hasListingFieldErrors(errors)) {
      setFieldErrors(errors)
      setSaveError(null)
      return
    }
    setFieldErrors({})
    setSaveError(null)
    setImageError(null)
    setSaving(true)
    const sellerId = sellerProfile!.id
    try {
      if (isEditing && listing != null) {
        const { error: updateError } = await updateListing(sellerId, listing.id, form.listing)
        if (updateError != null) {
          setSaveError(describeSupabaseError(updateError))
          return
        }
        if (isPaddle) {
          const { error: paddleError } = await savePaddleAttributes(listing.id, form.paddle)
          if (paddleError != null) {
            setSaveError(describeSupabaseError(paddleError))
            return
          }
        } else {
          const { error: clearError } = await removePaddleAttributes(listing.id)
          if (clearError != null) {
            setSaveError(describeSupabaseError(clearError))
            return
          }
        }
        reloadListing()
        setSaveError(null)
        setSaveSuccess('Your listing changes have been saved.')
      } else {
        const { data: created, error: createError } = await createListing(
          sellerId,
          form.listing,
        )
        if (createError != null) {
          setSaveError(describeSupabaseError(createError))
          return
        }
        if (created == null) {
          setSaveError('We could not create your listing. Please try again.')
          return
        }
        if (isPaddle) {
          const { error: paddleError } = await savePaddleAttributes(created.id, form.paddle)
          if (paddleError != null) {
            setSaveError(describeSupabaseError(paddleError))
            return
          }
        }
        const failed = await uploadStagedImages(created.id)
        navigate(`/seller/listings/${created.id}/edit`, {
          state: { created: true, uploadFailed: failed > 0 },
        })
      }
    } catch {
      setSaveError('We could not save your listing. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container page">
      <PageHeader
        title={isEditing ? 'Edit listing' : 'Create listing'}
        intro={
          isEditing
            ? 'Update your listing and photos.'
            : 'Tell buyers what you are selling. Save as a draft and add photos any time.'
        }
        actions={
          <Link className="btn btn--ghost" to="/seller/listings">
            Back to your listings
          </Link>
        }
      />

      {createdState.created ? (
        <Alert
          variant={createdState.uploadFailed ? 'info' : 'success'}
          message={
            createdState.uploadFailed
              ? 'Your listing was created, but some photos could not be uploaded. You can add them below.'
              : 'Your listing was created. Add more photos or edit any details below.'
          }
        />
      ) : null}

      <form className="seller-form" onSubmit={handleSubmit} noValidate>
        <section className="seller-form__section glass glass--soft">
          <h2 className="seller-form__section-title">Listing basics</h2>
          <FormField
            id="listing-title"
            label="Title"
            required
            value={form.listing.title}
            onChange={updateListingField('title')}
            error={fieldErrors.title}
            maxLength={120}
          />

          <div className="form-field">
            <label className="form-field__label" htmlFor="listing-description">
              Description
              <span className="form-field__required"> *</span>
            </label>
            <textarea
              className="form-field__textarea"
              id="listing-description"
              rows={5}
              value={form.listing.description}
              onChange={(event) => updateListingField('description')(event.target.value)}
              maxLength={2000}
              aria-invalid={fieldErrors.description != null ? true : undefined}
            />
            {fieldErrors.description != null ? (
              <p className="form-field__error">{fieldErrors.description}</p>
            ) : null}
          </div>
        </section>

        {!categoriesReady ? (
          <LoadingState label="Loading listing options…" />
        ) : (
          <>
            <section className="seller-form__section glass glass--soft">
              <h2 className="seller-form__section-title">Category & pricing</h2>
              <div className="form-field">
              <label className="form-field__label" htmlFor="listing-category">
                Category
                <span className="form-field__required"> *</span>
              </label>
              <select
                className="form-field__input"
                id="listing-category"
                value={form.listing.category_id}
                onChange={(event) => updateListingField('category_id')(event.target.value)}
                aria-invalid={fieldErrors.category_id != null ? true : undefined}
              >
                <option value="">Choose a category…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {fieldErrors.category_id != null ? (
                <p className="form-field__error">{fieldErrors.category_id}</p>
              ) : null}
            </div>

            <div className="form-field">
              <label className="form-field__label" htmlFor="listing-brand">
                Brand
              </label>
              <select
                className="form-field__input"
                id="listing-brand"
                value={form.listing.brand_id ?? ''}
                onChange={(event) => updateListingField('brand_id')(event.target.value)}
              >
                <option value="">No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
              <p className="form-field__hint">Optional — pick a brand if the item is branded.</p>
            </div>

            <div className="form-field">
              <label className="form-field__label" htmlFor="listing-condition">
                Condition
                <span className="form-field__required"> *</span>
              </label>
              <select
                className="form-field__input"
                id="listing-condition"
                value={form.listing.listing_condition}
                onChange={(event) => updateListingField('listing_condition')(event.target.value)}
                aria-invalid={fieldErrors.listing_condition != null ? true : undefined}
              >
                {LISTING_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition.replace('_', ' ')}
                  </option>
                ))}
              </select>
              {fieldErrors.listing_condition != null ? (
                <p className="form-field__error">{fieldErrors.listing_condition}</p>
              ) : null}
            </div>

            <div className="form-grid">
              <FormField
                id="listing-price"
                label="Price (₱)"
                required
                value={form.listing.price}
                onChange={updateListingField('price')}
                error={fieldErrors.price}
                inputMode="decimal"
                placeholder="0.00"
              />
              <FormField
                id="listing-quantity"
                label="Quantity"
                required
                value={form.listing.quantity}
                onChange={updateListingField('quantity')}
                error={fieldErrors.quantity}
                inputMode="numeric"
                placeholder="1"
              />
            </div>

            <div className="form-field">
              <label className="form-field__label" htmlFor="listing-status">
                Status
              </label>
              <select
                className="form-field__input"
                id="listing-status"
                value={form.listing.listing_status}
                onChange={(event) => updateListingField('listing_status')(event.target.value)}
                disabled={statusLocked}
              >
                {LISTING_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status === 'draft' ? 'Draft — not shown publicly' : 'Active — shown publicly'}
                  </option>
                ))}
              </select>
              {statusLocked ? (
                <p className="form-field__hint">
                  This listing is {form.listing.listing_status.replace('_', ' ')}. Archived and
                  sold listings stay hidden from the marketplace.
                </p>
              ) : (
                <p className="form-field__hint">
                  An active listing needs at least 1 item in stock.
                </p>
              )}
            </div>
            </section>

            {isPaddle ? (
              <section className="seller-form__section glass glass--soft">
                <h2 className="seller-form__section-title">Paddle details</h2>
                <fieldset className="seller-form__toggles">
                <legend className="visually-hidden">Paddle attributes</legend>
                <div className="form-grid">
                  <FormField
                    id="paddle-weight"
                    label="Weight (grams)"
                    value={form.paddle.weight_grams}
                    onChange={updatePaddleField('weight_grams')}
                    error={fieldErrors.weight_grams}
                    inputMode="numeric"
                    placeholder="220"
                  />
                  <FormField
                    id="paddle-weight-class"
                    label="Weight class"
                    value={form.paddle.weight_class}
                    onChange={updatePaddleField('weight_class')}
                    error={fieldErrors.weight_class}
                    placeholder="e.g. Lightweight"
                  />
                  <FormField
                    id="paddle-control"
                    label="Control score (1–10)"
                    value={form.paddle.control_score}
                    onChange={updatePaddleField('control_score')}
                    error={fieldErrors.control_score}
                    inputMode="numeric"
                    placeholder="7"
                  />
                  <FormField
                    id="paddle-power"
                    label="Power score (1–10)"
                    value={form.paddle.power_score}
                    onChange={updatePaddleField('power_score')}
                    error={fieldErrors.power_score}
                    inputMode="numeric"
                    placeholder="8"
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="paddle-skill">
                    Skill level
                  </label>
                  <select
                    className="form-field__input"
                    id="paddle-skill"
                    value={form.paddle.skill_level}
                    onChange={(event) => updatePaddleField('skill_level')(event.target.value)}
                    aria-invalid={fieldErrors.skill_level != null ? true : undefined}
                  >
                    <option value="">Not specified</option>
                    {PADDLE_SKILL_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.skill_level != null ? (
                    <p className="form-field__error">{fieldErrors.skill_level}</p>
                  ) : null}
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="paddle-style">
                    Playing style
                  </label>
                  <select
                    className="form-field__input"
                    id="paddle-style"
                    value={form.paddle.playing_style}
                    onChange={(event) => updatePaddleField('playing_style')(event.target.value)}
                    aria-invalid={fieldErrors.playing_style != null ? true : undefined}
                  >
                    <option value="">Not specified</option>
                    {PADDLE_PLAYING_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.playing_style != null ? (
                    <p className="form-field__error">{fieldErrors.playing_style}</p>
                  ) : null}
                </div>
                </fieldset>
              </section>
            ) : null}

            <section className="seller-form__section glass glass--soft">
              <h2 className="seller-form__section-title">Location & fulfillment</h2>
              <FormField
                id="listing-city"
                label="City"
                value={form.listing.city}
                onChange={updateListingField('city')}
                error={fieldErrors.city}
                maxLength={100}
              />
              <FormField
                id="listing-province"
                label="Province / region"
                value={form.listing.province}
                onChange={updateListingField('province')}
                error={fieldErrors.province}
                maxLength={100}
              />

              <fieldset className="seller-form__toggles">
                <legend className="seller-form__toggles-title">How can buyers get this?</legend>
                <label className="toggle-field">
                  <input
                    className="toggle-field__input"
                    type="checkbox"
                    checked={form.listing.pickup_available}
                    onChange={() => toggleListingField('pickup_available')}
                  />
                  <span className="toggle-field__body">
                    <span className="toggle-field__label">Pickup available</span>
                    <span className="toggle-field__hint">Buyers can pick up the item in person</span>
                  </span>
                </label>
                <label className="toggle-field">
                  <input
                    className="toggle-field__input"
                    type="checkbox"
                    checked={form.listing.delivery_available}
                    onChange={() => toggleListingField('delivery_available')}
                  />
                  <span className="toggle-field__body">
                    <span className="toggle-field__label">Delivery available</span>
                    <span className="toggle-field__hint">You can ship the item to buyers</span>
                  </span>
                </label>
              </fieldset>
            </section>
          </>
        )}

        <fieldset className="seller-form__images">
          <legend className="seller-form__toggles-title">Photos</legend>
          {isEditing && listing != null ? (
            <ListingImageManager
              sellerId={sellerProfile.id}
              listingId={listing.id}
              images={listing.images}
              onMutated={reloadListing}
              onError={(message) => setImageError(message)}
            />
          ) : (
            <StagedImagePicker
              images={stagedImages}
              onChange={setStagedImages}
              onError={setImageError}
              disabled={saving}
            />
          )}
        </fieldset>

        {imageError != null ? <FormError message={imageError} /> : null}
        {saveError != null ? <FormError message={saveError} /> : null}
        {saveSuccess != null ? <Alert variant="success" message={saveSuccess} /> : null}

        <SubmitButton loading={saving} loadingLabel="Saving listing…">
          {isEditing ? 'Save changes' : 'Create listing'}
        </SubmitButton>
      </form>
    </div>
  )
}
