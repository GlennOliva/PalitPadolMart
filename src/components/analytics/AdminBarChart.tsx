import { useMemo } from 'react'
import { barY, defineChart, group } from '@tanstack/charts'
import { Chart } from '@tanstack/react-charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { chartColorFor } from './chart-theme'

export type AdminGroupedRow = Record<string, string | number | null>

export interface AdminBarSeries {
  key: string
  label: string
  accessor: (row: AdminGroupedRow) => number
}

interface AdminBarChartProps {
  rows: readonly AdminGroupedRow[]
  xKey: string
  xLabel?: string
  xFormat: (value: string) => string
  series: readonly AdminBarSeries[]
  formatValue: (value: number) => string
  ariaLabel: string
  ariaDescription?: string
  height?: number
}

interface LongRow {
  x: string
  z: string
  y: number
  fill: string
}

export function AdminBarChart({
  rows,
  xKey,
  xLabel,
  xFormat,
  series,
  formatValue,
  ariaLabel,
  ariaDescription,
  height = 300,
}: AdminBarChartProps) {
  const definition = useMemo(() => {
    const activeSeries = series.filter((entry) => rows.some((row) => entry.accessor(row) > 0))
    if (activeSeries.length === 0) return null

    const longRows: LongRow[] = []
    for (const row of rows) {
      for (let index = 0; index < activeSeries.length; index += 1) {
        const entry = activeSeries[index]
        const value = entry.accessor(row)
        if (!Number.isFinite(value) || value <= 0) continue
        longRows.push({
          x: String(row[xKey] ?? ''),
          z: entry.label,
          y: value,
          fill: chartColorFor(index),
        })
      }
    }
    if (longRows.length === 0) return null

    return defineChart({
      marks: [
        barY(longRows, {
          x: 'x',
          y: 'y',
          z: 'z',
          fill: 'fill',
          layout: group(),
          inset: 2,
          radius: 2,
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().padding(0.2),
          axis: {
            label: xLabel,
            ticks: {
              format: (value) => xFormat(String(value)),
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
            },
          },
        },
      },
      tooltip,
    })
  }, [rows, xKey, xLabel, xFormat, series, formatValue])

  if (definition == null) return null

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      className="admin-chart admin-chart--bar"
    />
  )
}