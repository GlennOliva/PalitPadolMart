import { useMemo } from 'react'
import { lineY, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/react-charts'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { tooltip } from '@tanstack/charts/tooltip'
import { chartColorFor } from './chart-theme'

export type AdminTrendDatum = Record<string, string | number | null>

export interface AdminLineSeries {
  key: string
  label: string
  accessor: (row: AdminTrendDatum) => number
}

interface AdminLineChartProps {
  rows: readonly AdminTrendDatum[]
  xKey: string
  xFormat: (value: string) => string
  series: readonly AdminLineSeries[]
  formatValue: (value: number) => string
  ariaLabel: string
  ariaDescription?: string
  height?: number
}

export function AdminLineChart({
  rows,
  xKey,
  xFormat,
  series,
  formatValue,
  ariaLabel,
  ariaDescription,
  height = 300,
}: AdminLineChartProps) {
  const definition = useMemo(() => {
    const activeSeries = series.filter((entry) => rows.some((row) => entry.accessor(row) > 0))
    if (activeSeries.length === 0) return null
    return defineChart({
      marks: activeSeries.map((entry, index) =>
        lineY(rows, {
          x: (row) => String(row[xKey] ?? ''),
          y: (row) => {
            const value = entry.accessor(row)
            return Number.isFinite(value) ? value : 0
          },
          stroke: chartColorFor(index),
          strokeWidth: 2,
          points: rows.length <= 31,
        }),
      ),
      scales: {
        x: {
          scale: () => scalePoint<string>().padding(0.5),
          axis: {
            ticks: {
              format: (value) => xFormat(String(value)),
              count: rows.length <= 8 ? 8 : 6,
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            ticks: {
              format: (value) => formatValue(Number(value)),
              count: 6,
            },
          },
        },
      },
      tooltip,
    })
  }, [rows, xKey, xFormat, series, formatValue])

  if (definition == null) return null

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      className="admin-chart admin-chart--line"
    />
  )
}