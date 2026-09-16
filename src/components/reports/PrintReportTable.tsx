interface PrintColumn {
  key: string
  label: string
  numeric?: boolean
}

interface PrintReportTableProps {
  caption: string
  columns: readonly PrintColumn[]
  rows: readonly (Record<string, string | number | null | undefined>)[]
  note?: string
}

export function PrintReportTable({ caption, columns, rows, note }: PrintReportTableProps) {
  if (rows.length === 0) return null
  return (
    <div className="print-block">
      <div className="print-block__heading">
        <h2>{caption}</h2>
        <span>{rows.length} rows</span>
      </div>
      <table className="print-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.numeric ? 'r' : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${String(row[columns[0]?.key] ?? '')}`}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? 'r' : undefined}>
                  {String(row[column.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {note != null ? <p className="print-block__note">{note}</p> : null}
    </div>
  )
}