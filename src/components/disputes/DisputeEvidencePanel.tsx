import { useRef, useState } from 'react'
import {
  disputeEvidenceUrl,
  uploadDisputeEvidence,
} from '../../features/disputes/disputes.service'
import type { DisputeEvidenceDisplay } from '../../features/disputes/disputes.types'
import { validateDisputeEvidence } from '../../features/disputes/disputes-validation'
import { formatDateTime } from '../../utils/format'
import Alert from '../common/Alert'
import SubmitButton from '../common/SubmitButton'

interface DisputeEvidencePanelProps {
  disputeId: string
  evidence: DisputeEvidenceDisplay[]
  userId: string
  view: 'buyer' | 'seller'
  active: boolean
  onUpdated: () => void
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return 'Size unavailable'
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DisputeEvidencePanel({
  disputeId,
  evidence,
  userId,
  view,
  active,
  onUpdated,
}: DisputeEvidencePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const participantLabel = (uploaderId: string | null) => {
    if (uploaderId === userId) return 'You'
    return view === 'buyer' ? 'Seller' : 'Buyer'
  }

  return (
    <section className="dispute-section" aria-labelledby="dispute-evidence-title">
      <div className="dispute-section__heading">
        <div>
          <p className="dispute-section__eyebrow">Private attachments</p>
          <h2 id="dispute-evidence-title">Evidence</h2>
        </div>
        <span>{evidence.length} file{evidence.length === 1 ? '' : 's'}</span>
      </div>

      {evidence.length === 0 ? (
        <p className="dispute-empty-copy">No evidence has been added.</p>
      ) : (
        <ul className="dispute-evidence-list">
          {evidence.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.original_filename ?? 'Evidence file'}</strong>
                <span>
                  {item.mime_type ?? 'File'} - {formatFileSize(item.size_bytes)}
                </span>
                <span>
                  Added by {participantLabel(item.uploader.id)} on {formatDateTime(item.created_at)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={openingId === item.id}
                onClick={() => {
                  setOpeningId(item.id)
                  setActionError(null)
                  void disputeEvidenceUrl(item.storage_path)
                    .then(({ data, error }) => {
                      if (error != null || data == null) {
                        setActionError(error?.message ?? 'Evidence could not be opened. Please try again.')
                        return
                      }
                      const anchor = document.createElement('a')
                      anchor.href = data
                      anchor.target = '_blank'
                      anchor.rel = 'noopener noreferrer'
                      anchor.click()
                    })
                    .catch(() => setActionError('Evidence could not be opened. Please try again.'))
                    .finally(() => setOpeningId(null))
                }}
              >
                {openingId === item.id ? 'Opening...' : 'View evidence'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {actionError != null ? <Alert variant="error" message={actionError} /> : null}

      {active ? (
        <form
          className="dispute-evidence-form"
          onSubmit={(event) => {
            event.preventDefault()
            const validation = validateDisputeEvidence(file)
            setFileError(validation.file ?? null)
            setActionError(null)
            if (validation.file != null || file == null) return
            setUploading(true)
            void uploadDisputeEvidence(userId, disputeId, file)
              .then(({ error }) => {
                if (error != null) {
                  setActionError(error.message)
                  return
                }
                setFile(null)
                if (inputRef.current != null) inputRef.current.value = ''
                onUpdated()
              })
              .catch(() => setActionError('Evidence could not be uploaded. Please try again.'))
              .finally(() => setUploading(false))
          }}
        >
          <div className="form-field">
            <label className="form-field__label" htmlFor="dispute-evidence-file">
              Add evidence
            </label>
            <input
              ref={inputRef}
              id="dispute-evidence-file"
              className="form-field__input"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-invalid={fileError != null ? true : undefined}
              aria-describedby="dispute-evidence-help"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                setFile(nextFile)
                setFileError(validateDisputeEvidence(nextFile).file ?? null)
              }}
            />
            <p
              id="dispute-evidence-help"
              className={fileError == null ? 'form-field__hint' : 'form-field__error'}
            >
              {fileError ?? 'JPG, PNG, WebP, or PDF. Maximum 5 MB.'}
            </p>
          </div>
          <div className="dispute-form__actions">
            <SubmitButton loading={uploading} loadingLabel="Uploading..." disabled={file == null}>
              Upload evidence
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </section>
  )
}
