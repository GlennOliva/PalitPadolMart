import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import { PrintReportButton } from '../../components/reports/PrintReportButton'
import { ReportHeader } from '../../components/reports/ReportHeader'
import { formatReportTimestamp } from '../../features/admin/reports/report-utils'

interface ReportEntry {
  title: string
  description: string
  to: string
  tags: string[]
}

const REPORTS: readonly ReportEntry[] = [
  {
    title: 'Executive Report',
    description: 'KPI scorecard, sales and growth trends, top sellers, popular listings, categories, and all-time status snapshots on the admin dashboard.',
    to: '/admin',
    tags: ['KPIs', 'Charts', 'Print'],
  },
  {
    title: 'Sales & Revenue Report',
    description: 'Gross and net sales trends, refunds, average order value, conversion rate, and category performance by date range.',
    to: '/admin/analytics',
    tags: ['Revenue', 'Trends'],
  },
  {
    title: 'Orders Report',
    description: 'Order volume, completed and cancelled orders, units sold, plus the all-time order and payment status distributions.',
    to: '/admin/analytics',
    tags: ['Orders', 'Status'],
  },
  {
    title: 'Sellers Report',
    description: 'Top sellers by gross sales, transacted and completed orders, units, and ratings in the selected period.',
    to: '/admin/analytics',
    tags: ['Sellers', 'Ranking'],
  },
  {
    title: 'Products Report',
    description: 'Popular listings by views, favorites, inquiries, units sold, and sales across the selected date range.',
    to: '/admin/analytics',
    tags: ['Listings', 'Ranking'],
  },
  {
    title: 'Payments Report',
    description: 'Payment proof review, payment statuses, and money movement across orders.',
    to: '/admin/payments',
    tags: ['Payments', 'Status'],
  },
  {
    title: 'Reviews Report',
    description: 'Approved review rating distribution and average rating; moderation screens for pending and hidden reviews.',
    to: '/admin/analytics',
    tags: ['Reviews', 'Rating'],
  },
  {
    title: 'Disputes Report',
    description: 'Open, under-review, resolved, and closed disputes with case actions and resolution tracking.',
    to: '/admin/disputes',
    tags: ['Disputes', 'Cases'],
  },
  {
    title: 'Refunds Report',
    description: 'Refund requests by status and the money returned to buyers, tracked in the refunds workspace.',
    to: '/admin/refunds',
    tags: ['Refunds', 'Money'],
  },
]

export default function AdminReportCenterPage() {
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  return (
    <div className="page admin-resource-page admin-report-center">
      <PageHeader
        title="Report Center"
        intro="Choose a printable report. Each opens the workspace that shows the underlying data with its filters intact."
      />

      <div className="analytics-actions no-print">
        <PrintReportButton onPrepare={async () => setGeneratedAt(formatReportTimestamp())} label="Print Report Directory" />
      </div>

      <div className="reports-directory">
        {REPORTS.map((report) => (
          <Link
            key={report.title}
            to={report.to}
            className="glass reports-directory__card"
          >
            <h2 className="reports-directory__title">{report.title}</h2>
            <p className="reports-directory__description">{report.description}</p>
            <p className="reports-directory__tags">
              {report.tags.map((tag) => (
                <span key={tag} className="reports-directory__tag">{tag}</span>
              ))}
            </p>
          </Link>
        ))}
      </div>

      <div className="print-report print-only">
        <ReportHeader
          title="Report Directory"
          subtitle="PalitPaddleBai Mart"
          generatedAt={generatedAt ?? undefined}
          generatedBy="Marketplace administrator"
        />
        <div className="print-block">
          <div className="print-block__heading">
            <h2>Available reports</h2>
            <span>{REPORTS.length} reports</span>
          </div>
          <table className="print-table">
            <caption className="visually-hidden">Available admin reports</caption>
            <thead>
              <tr>
                <th>Report</th>
                <th>Coverage</th>
                <th>Opens in</th>
              </tr>
            </thead>
            <tbody>
              {REPORTS.map((report) => (
                <tr key={report.title}>
                  <td>{report.title}</td>
                  <td>{report.description}</td>
                  <td className="r">{report.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="print-report__footer">
          <p>PalitPaddleBai Mart — Report Directory</p>
          <p>Generated {generatedAt ?? 'on demand'}</p>
        </footer>
      </div>
    </div>
  )
}