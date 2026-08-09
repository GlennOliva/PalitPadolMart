import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { getProfile } from './auth.service'
import type { AuthStatus, Profile } from './auth.types'

export interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  status: AuthStatus
  profileLoading: boolean
  profileError: string | null
  isAuthenticated: boolean
  isPasswordRecovery: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  clearPasswordRecovery: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const userIdRef = useRef<string | null>(null)

  const refreshProfile = useCallback(async (targetUserId?: string) => {
    const userId = targetUserId ?? userIdRef.current
    if (userId == null) return
    setProfileLoading(true)
    setProfileError(null)
    const { data, error } = await getProfile(userId)
    if (error != null) {
      setProfileError('We could not load your profile. Please try again.')
      setProfile(null)
    } else {
      setProfile(data)
    }
    setProfileLoading(false)
  }, [])

  useEffect(() => {
    let active = true

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === 'INITIAL_SESSION') return
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true)
        }
        if (event === 'SIGNED_OUT') {
          userIdRef.current = null
          setUser(null)
          setSession(null)
          setProfile(null)
          setIsPasswordRecovery(false)
          setStatus('unauthenticated')
          return
        }
        if (nextSession?.user != null) {
          userIdRef.current = nextSession.user.id
          setUser(nextSession.user)
          setSession(nextSession)
          setStatus('authenticated')
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            void refreshProfile(nextSession.user.id)
          }
        }
      },
    )

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const initialSession = data.session
      if (initialSession?.user != null) {
        userIdRef.current = initialSession.user.id
        setUser(initialSession.user)
        setSession(initialSession)
        setStatus('authenticated')
        void refreshProfile(initialSession.user.id)
      } else {
        setStatus('unauthenticated')
      }
    })

    return () => {
      active = false
      authSubscription.subscription.unsubscribe()
    }
  }, [refreshProfile])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error != null) {
      console.error('[auth] sign out failed', error.message)
    }
    // Keep application state consistent even if the remote call failed, so the
    // UI never appears logged in after an explicit sign-out attempt.
    userIdRef.current = null
    setUser(null)
    setSession(null)
    setProfile(null)
    setIsPasswordRecovery(false)
    setStatus('unauthenticated')
  }, [])

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false)
  }, [])

  const value: AuthContextValue = {
    user,
    session,
    profile,
    status,
    profileLoading,
    profileError,
    isAuthenticated: status === 'authenticated',
    isPasswordRecovery,
    signOut,
    refreshProfile: () => refreshProfile(),
    clearPasswordRecovery,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
