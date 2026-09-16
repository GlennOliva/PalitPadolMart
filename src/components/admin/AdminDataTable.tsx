import type { ReactNode } from 'react'

interface AdminDataTableColumn {
  key: string
  label: string
  className?: string
}

interface AdminDataTableProps {
  columns: AdminDataTableColumn[]
  rows: ReactNode[]
  emptyMessage?: string
  label: string
}

export default function AdminDataTable({
  columns,
  rows,
  emptyMessage = 'No records found.',
  label,
}: AdminDataTableProps) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <tr className="admin-table__empty-row">
              <td className="admin-table__empty" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}