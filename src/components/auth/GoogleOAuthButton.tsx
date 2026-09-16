import { useState } from 'react'
import { signInWithGoogle } from '../../features/auth/auth.service'
import { mapAuthError } from '../../features/auth/auth-errors'

interface GoogleOAuthButtonProps {
  returnPath?: unknown
  disabled?: boolean
  onError: (message: string | null) => void
}

export default function GoogleOAuthButton({
  returnPath,
  disabled = false,
  onError,
}: GoogleOAuthButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    if (loading || disabled) return
    onError(null)
    setLoading(true)
    const { error } = await signInWithGoogle(returnPath)
    if (error != null) {
      onError(mapAuthError(error).message)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn--secondary btn--block google-auth-button"
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={() => void handleGoogleSignIn()}
    >
      <span className="google-auth-button__mark" aria-hidden="true">G</span>
      {loading ? 'Opening Google...' : 'Continue with Google'}
    </button>
  )
}
