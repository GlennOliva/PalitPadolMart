import { useMemo } from 'react'
import { barX, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/react-charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { chartColorFor } from './chart-theme'

export interface AdminHBarRow {
  label: string
  value: number
}

interface AdminHBarChartProps {
  rows: readonly AdminHBarRow[]
  formatValue: (value: number) => string
  ariaLabel: string
  ariaDescription?: string
  height?: number
}

export function AdminHBarChart({
  rows,
  formatValue,
  ariaLabel,
  ariaDescription,
  height = 300,
}: AdminHBarChartProps) {
  const definition = useMemo(() => {
    const data = rows.slice(0, 12)
    if (data.length === 0) return null
    const maxValue = Math.max(...data.map((row) => row.value), 1)
    return defineChart({
      marks: [
        barX(data, {
          x: 'value',
          y: 'label',
          fill: chartColorFor(0),
          inset: 3,
          radius: 2,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          domain: [0, maxValue],
          axis: {
            label: 'Count',
            ticks: {
              format: (value) => formatValue(Number(value)),
              count: 6,
            },
          },
        },
        y: {
          scale: () => scaleBand<string>().paddingInner(0.24).paddingOuter(0.06),
        },
      },
      tooltip,
    })
  }, [rows, formatValue])

  if (definition == null) return null

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      className="admin-chart admin-chart--hbar"
    />
  )
}