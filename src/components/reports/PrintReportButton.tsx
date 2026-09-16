import { useState } from 'react'

interface PrintReportButtonProps {
  label?: string
  disabled?: boolean
  onPrepare?: () => Promise<void>
}

export function PrintReportButton({
  label = 'Print Report',
  disabled = false,
  onPrepare,
}: PrintReportButtonProps) {
  const [preparing, setPreparing] = useState(false)

  async function handlePrint() {
    if (preparing) return
    setPreparing(true)
    try {
      if (onPrepare != null) {
        await onPrepare()
      }
      window.print()
    } finally {
      setPreparing(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn--secondary print-report__trigger"
      onClick={() => {
        void handlePrint()
      }}
      disabled={disabled || preparing}
      aria-busy={preparing}
    >
      <span aria-hidden="true">🖨</span>
      {preparing ? 'Preparing report…' : label}
    </button>
  )
}