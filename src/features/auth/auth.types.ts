import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '../../types/database'

export type UserRole = Database['public']['Enums']['user_role']
export type AccountStatus = Database['public']['Enums']['account_status']

export type Profile = Tables<'profiles'>
export type ProfileUpdate = TablesUpdate<'profiles'>

export type RecommendationPreferences = Tables<'recommendation_profiles'>
export type RecommendationPreferencesInput = TablesInsert<'recommendation_profiles'>
export type RecommendationPreferencesUpdate = TablesUpdate<'recommendation_profiles'>

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated'

export interface SignUpParams {
  firstName: string
  lastName: string
  displayName: string
  email: string
  password: string
}

export interface ProfileEditableFields {
  first_name: string
  last_name: string
  display_name: string
  phone: string
  city: string
  province: string
}

export const AVATAR_BUCKET = 'avatars'
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
export const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const PROFILE_SELF_UPDATE_COLUMNS = [
  'first_name',
  'last_name',
  'display_name',
  'phone',
  'avatar_url',
  'city',
  'province',
] as const
