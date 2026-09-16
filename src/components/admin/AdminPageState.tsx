import GlassPanel from '../common/GlassPanel'
import PageHeader from '../common/PageHeader'

interface AdminPageStateProps {
  title: string
}

export default function AdminPageState({ title }: AdminPageStateProps) {
  return (
    <div className="page admin-page-state">
      <PageHeader
        title={title}
        intro={`The ${title.toLowerCase()} workspace is reserved for its secure Phase 13 operations.`}
      />
      <GlassPanel intensity="soft" className="admin-page-state__panel">
        <p className="admin-dashboard__eyebrow">Workspace pending</p>
        <h2>No administrative actions are connected yet</h2>
        <p>
          This route is ready for its authorized interface. It does not display placeholder
          records or marketplace totals.
        </p>
      </GlassPanel>
    </div>
  )
}
