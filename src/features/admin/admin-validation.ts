import type { AdminBrandInput, AdminCategoryInput } from './admin.types'

export const ADMIN_REASON_MIN_LENGTH = 5
export const ADMIN_REASON_MAX_LENGTH = 1000
export const ADMIN_TAXONOMY_NAME_MIN_LENGTH = 2
export const ADMIN_TAXONOMY_NAME_MAX_LENGTH = 100
export const ADMIN_TAXONOMY_SLUG_MIN_LENGTH = 2
export const ADMIN_TAXONOMY_SLUG_MAX_LENGTH = 80
export const ADMIN_TAXONOMY_DESCRIPTION_MAX_LENGTH = 1000
export const ADMIN_BRAND_LOGO_MAX_LENGTH = 500
export const ADMIN_CATEGORY_SORT_MAX = 10_000

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type AdminCategoryFieldErrors = Partial<Record<keyof AdminCategoryInput, string>>
export type AdminBrandFieldErrors = Partial<Record<keyof AdminBrandInput, string>>

export function trimAdminReason(value: string): string {
  return value.trim()
}

export function validateAdminReason(value: string): string | null {
  const reason = trimAdminReason(value)
  if (reason.length < ADMIN_REASON_MIN_LENGTH || reason.length > ADMIN_REASON_MAX_LENGTH) {
    return `Reason must contain ${ADMIN_REASON_MIN_LENGTH} to ${ADMIN_REASON_MAX_LENGTH} characters.`
  }
  return null
}

export function normalizeTaxonomySlug(value: string): string {
  return value.trim().toLowerCase()
}

export function validateTaxonomyName(value: string): string | null {
  const name = value.trim()
  if (name.length < ADMIN_TAXONOMY_NAME_MIN_LENGTH || name.length > ADMIN_TAXONOMY_NAME_MAX_LENGTH) {
    return `Name must contain ${ADMIN_TAXONOMY_NAME_MIN_LENGTH} to ${ADMIN_TAXONOMY_NAME_MAX_LENGTH} characters.`
  }
  return null
}

export function validateTaxonomySlug(value: string): string | null {
  const slug = normalizeTaxonomySlug(value)
  if (
    slug.length < ADMIN_TAXONOMY_SLUG_MIN_LENGTH
    || slug.length > ADMIN_TAXONOMY_SLUG_MAX_LENGTH
    || !SLUG_PATTERN.test(slug)
  ) {
    return 'Slug must use 2 to 80 lowercase letters, numbers, and single hyphens.'
  }
  return null
}

export function validateTaxonomyDescription(value: string): string | null {
  return value.trim().length > ADMIN_TAXONOMY_DESCRIPTION_MAX_LENGTH
    ? `Description must be ${ADMIN_TAXONOMY_DESCRIPTION_MAX_LENGTH} characters or fewer.`
    : null
}

export function validateBrandLogoUrl(value: string): string | null {
  return value.trim().length > ADMIN_BRAND_LOGO_MAX_LENGTH
    ? `Logo URL must be ${ADMIN_BRAND_LOGO_MAX_LENGTH} characters or fewer.`
    : null
}

export function validateCategorySortOrder(value: number): string | null {
  return Number.isInteger(value) && value >= 0 && value <= ADMIN_CATEGORY_SORT_MAX
    ? null
    : `Sort order must be a whole number between 0 and ${ADMIN_CATEGORY_SORT_MAX}.`
}

export function validateAdminCategory(input: AdminCategoryInput): AdminCategoryFieldErrors {
  const errors: AdminCategoryFieldErrors = {}
  const name = validateTaxonomyName(input.name)
  const slug = validateTaxonomySlug(input.slug)
  const description = validateTaxonomyDescription(input.description)
  const sortOrder = validateCategorySortOrder(input.sortOrder)
  const reason = validateAdminReason(input.reason)
  if (name != null) errors.name = name
  if (slug != null) errors.slug = slug
  if (description != null) errors.description = description
  if (sortOrder != null) errors.sortOrder = sortOrder
  if (reason != null) errors.reason = reason
  return errors
}

export function validateAdminBrand(input: AdminBrandInput): AdminBrandFieldErrors {
  const errors: AdminBrandFieldErrors = {}
  const name = validateTaxonomyName(input.name)
  const slug = validateTaxonomySlug(input.slug)
  const description = validateTaxonomyDescription(input.description)
  const logoUrl = validateBrandLogoUrl(input.logoUrl)
  const reason = validateAdminReason(input.reason)
  if (name != null) errors.name = name
  if (slug != null) errors.slug = slug
  if (description != null) errors.description = description
  if (logoUrl != null) errors.logoUrl = logoUrl
  if (reason != null) errors.reason = reason
  return errors
}
