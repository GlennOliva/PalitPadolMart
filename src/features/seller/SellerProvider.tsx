import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/useAuth'
import { getMySellerProfile } from './seller.service'
import type { SellerProfile } from './seller.types'

export interface SellerContextValue {
  sellerProfile: SellerProfile | null
  sellerLoading: boolean
  sellerError: string | null
  refreshSellerProfile: () => Promise<void>
}

export const SellerContext = createContext<SellerContextValue | null>(null)

interface SellerProviderProps {
  children: ReactNode
}

/**
 * Loads the current user's seller profile once per session and shares it with
 * the whole app (nav, route guard, pages) so seller state is consistent and
 * pages do not duplicate the query.
 */
export function SellerProvider({ children }: SellerProviderProps) {
  const { user } = useAuth()
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null)
  const [sellerLoading, setSellerLoading] = useState(false)
  const [sellerError, setSellerError] = useState<string | null>(null)

  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const userId = user?.id ?? null
    userIdRef.current = userId
    if (userId == null) {
      setSellerProfile(null)
      setSellerError(null)
      setSellerLoading(false)
      return () => {
        active = false
      }
    }
    setSellerLoading(true)
    setSellerError(null)
    void getMySellerProfile(userId).then(({ data, error }) => {
      if (!active) return
      if (error != null) {
        setSellerError('We could not load your seller account. Please try again.')
        setSellerProfile(null)
      } else {
        setSellerProfile(data)
      }
      setSellerLoading(false)
    })
    return () => {
      active = false
    }
  }, [user])

  const refreshSellerProfile = useCallback(async () => {
    const userId = userIdRef.current
    if (userId == null) return
    setSellerLoading(true)
    setSellerError(null)
    const { data, error } = await getMySellerProfile(userId)
    if (error != null) {
      setSellerError('We could not load your seller account. Please try again.')
      setSellerProfile(null)
    } else {
      setSellerProfile(data)
    }
    setSellerLoading(false)
  }, [])

  const value: SellerContextValue = {
    sellerProfile,
    sellerLoading,
    sellerError,
    refreshSellerProfile: () => refreshSellerProfile(),
  }

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>
}
