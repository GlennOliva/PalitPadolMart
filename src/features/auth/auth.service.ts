import { supabase } from '../../lib/supabase/client'
import type {
  Profile,
  ProfileEditableFields,
  RecommendationPreferences,
  RecommendationPreferencesInput,
  SignUpParams,
} from './auth.types'
import { buildAvatarPath } from './avatar'
import { AVATAR_BUCKET } from './auth.types'
import { resolveReturnPath } from './auth-utils'

const PROFILES_SELECT = '*'

export async function signUp(params: SignUpParams) {
  return supabase.auth.signUp({
    email: params.email.trim().toLowerCase(),
    password: params.password,
    options: {
      data: {
        first_name: params.firstName.trim(),
        last_name: params.lastName.trim(),
        display_name: params.displayName.trim(),
      },
    },
  })
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
}

export function signInWithGoogle(returnPath?: unknown) {
  const callbackUrl = new URL('/auth/callback', window.location.origin)
  callbackUrl.searchParams.set('next', resolveReturnPath(returnPath))

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl.toString(),
      scopes: 'openid email profile',
    },
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export function resetPasswordForEmail(email: string) {
  const redirectTo = `${window.location.origin}/reset-password`
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  })
}

export function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword })
}

export async function getProfile(userId: string) {
  return supabase
    .from('profiles')
    .select(PROFILES_SELECT)
    .eq('id', userId)
    .maybeSingle<Profile>()
}

export async function updateProfile(userId: string, fields: ProfileEditableFields) {
  return supabase
    .from('profiles')
    .update({
      first_name: fields.first_name.trim() || null,
      last_name: fields.last_name.trim() || null,
      display_name: fields.display_name.trim() || null,
      phone: fields.phone.trim() || null,
      city: fields.city.trim() || null,
      province: fields.province.trim() || null,
    })
    .eq('id', userId)
    .select(PROFILES_SELECT)
    .single<Profile>()
}

export async function setProfileAvatar(userId: string, avatarPath: string) {
  return supabase
    .from('profiles')
    .update({ avatar_url: avatarPath })
    .eq('id', userId)
    .select(PROFILES_SELECT)
    .single<Profile>()
}

export async function clearProfileAvatar(userId: string) {
  return supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId)
    .select(PROFILES_SELECT)
    .single<Profile>()
}

export async function getRecommendationPreferences(userId: string) {
  return supabase
    .from('recommendation_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<RecommendationPreferences>()
}

export async function saveRecommendationPreferences(
  userId: string,
  input: Omit<RecommendationPreferencesInput, 'user_id'>,
) {
  return supabase
    .from('recommendation_profiles')
    .upsert({ ...input, user_id: userId })
    .select('*')
    .single<RecommendationPreferences>()
}

export async function uploadAvatar(userId: string, file: File) {
  const path = buildAvatarPath(userId, file.name)
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })
  if (uploadError != null) return { path: null as string | null, error: uploadError }

  const { error: dbError } = await setProfileAvatar(userId, path)
  if (dbError != null) return { path: null as string | null, error: dbError }

  return { path, error: null }
}

export async function getAvatarSignedUrl(avatarPath: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath, expiresIn)
  return { url: data?.signedUrl ?? null, error }
}

export async function removeAvatarObject(avatarPath: string) {
  return supabase.storage.from(AVATAR_BUCKET).remove([avatarPath])
}
