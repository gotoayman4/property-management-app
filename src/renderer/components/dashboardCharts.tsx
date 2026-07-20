/**
 * @file dashboardCharts — standalone SVG chart components and helpers for the Dashboard.
 *
 * INTENT: Extracted from Dashboard.tsx to stay under the 500-line file limit.
 *         Charts are pure inline SVG — no external chart library needed.
 *
 * CONSTRAINT (AGENTS.md): i18n keys only (via `t` prop), theme.palette tokens,
 *         logical CSS properties.
 */

import { Box, Stack, Typography } from '@mui/material'
import React from 'react'

interface TrendsData {
  income: { month: string; total: number; currency: string }[]
  expense: { month: string; total: number; currency: string }[]
  startDate: string
  endDate: string
}

interface OccupiedDonutProps {
  total: number
  rented: number
  t: (key: string) => string
}

interface TrendChartProps {
  trends: TrendsData | null
  t: (key: string) => string
}

/** Occupied vs Vacant donut chart — inline SVG. */
export function OccupiedDonut({ total, rented, t }: OccupiedDonutProps): React.JSX.Element {
  const safeTotal = total || 1
  const vacant = safeTotal - rented
  const pctRented = Math.round((rented / safeTotal) * 100)
  const pctVacant = 100 - pctRented
  const radius = 28
  const circumference = 2 * Math.PI * radius

  return (
    <Box sx={{ textAlign: 'center', py: 1 }}>
      <svg width={80} height={80} viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#e0e0e0" strokeWidth={6} />
        {rented > 0 && (
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#2e7d32"
            strokeWidth={6}
            strokeDasharray={`${circumference * (pctRented / 100)} ${circumference * (pctVacant / 100)}`}
            transform="rotate(-90 32 32)"
            style={{ transition: 'stroke-dasharray 0.5s' }}
          />
        )}
        {vacant > 0 && (
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#d32f2f"
            strokeWidth={6}
            strokeDasharray={`${circumference * (pctVacant / 100)} ${circumference * (pctRented / 100)}`}
            strokeDashoffset={-(circumference * (1 - pctVacant / 100))}
            transform="rotate(-90 32 32)"
            style={{ transition: 'stroke-dasharray 0.5s' }}
          />
        )}
        <text
          x="32"
          y="32"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight="bold"
          fill="currentColor"
        >
          {pctRented}%
        </text>
      </svg>
      <Stack direction="row" spacing={1.5} sx={{ mt: 1, justifyContent: 'center' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#2e7d32' }} />
          <Typography variant="caption">
            {t('dashboard.rentedProperties')}: {rented}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#d32f2f' }} />
          <Typography variant="caption">
            {t('property.statusVacant')}: {vacant}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )
}

/** 12-month income vs expense trend line chart — inline SVG. */
export function TrendChart({ trends, t }: TrendChartProps): React.JSX.Element | null {
  if (!trends) return null
  const allPoints = [...trends.income, ...trends.expense]
  if (allPoints.length === 0) return null
  const maxVal = Math.max(...allPoints.map((p) => p.total), 1)
  const months = Array.from(
    new Set([...trends.income.map((p) => p.month), ...trends.expense.map((p) => p.month)])
  ).sort()
  if (months.length === 0) return null

  const incomeMap = new Map(trends.income.map((p) => [p.month, p.total]))
  const expenseMap = new Map(trends.expense.map((p) => [p.month, p.total]))
  const width = 320
  const height = 120
  const padL = 5
  const padR = 5
  const padT = 5
  const padB = 20
  const chartW = width - padL - padR
  const chartH = height - padT - padB
  const stepX = months.length > 1 ? chartW / (months.length - 1) : chartW / 2

  function linePoints(map: Map<string, number>): string {
    return months
      .map((m, i) => {
        const x = padL + (months.length > 1 ? i * stepX : chartW / 2)
        const y = padT + chartH - ((map.get(m) ?? 0) / maxVal) * chartH
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={padL}
            y1={padT + chartH * (1 - frac)}
            x2={padL + chartW}
            y2={padT + chartH * (1 - frac)}
            stroke="#e0e0e0"
            strokeWidth={0.5}
          />
        ))}
        <polyline points={linePoints(incomeMap)} fill="none" stroke="#2e7d32" strokeWidth={2} />
        <polyline points={linePoints(expenseMap)} fill="none" stroke="#d32f2f" strokeWidth={2} />
        {months.map((m, i) => {
          if (i % 2 !== 0 && i !== months.length - 1) return null
          const x = padL + (months.length > 1 ? i * stepX : chartW / 2)
          return (
            <text key={m} x={x} y={height - 2} textAnchor="middle" fontSize={6} fill="currentColor">
              {m.slice(5)}
            </text>
          )
        })}
      </svg>
      <Stack direction="row" spacing={2} sx={{ mt: 0.5, justifyContent: 'center' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 16, height: 2, bgcolor: '#2e7d32' }} />
          <Typography variant="caption">{t('dashboard.incomeLabel')}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 16, height: 2, bgcolor: '#d32f2f' }} />
          <Typography variant="caption">{t('dashboard.expensesLabel')}</Typography>
        </Stack>
      </Stack>
    </Box>
  )
}

interface ActivityRow {
  entity_type: string
  amount?: number
  currency?: string
  property_name?: string
  contract_number?: string
  entity_name?: string
  entity_code?: string
}

interface ActivityDescriptionProps {
  row: ActivityRow
  t: (key: string, params?: Record<string, string | number>) => string
}

/** Build a localized description string for a recent-activity row. */
export function ActivityDescription({ row, t }: ActivityDescriptionProps): React.JSX.Element {
  const { entity_type: type } = row
  let text = ''
  switch (type) {
    case 'payment':
      text = t('dashboard.activityDesc.payment', {
        amount: Number(row.amount ?? 0).toLocaleString(),
        currency: String(row.currency ?? ''),
        property: String(row.property_name ?? '')
      })
      break
    case 'expense':
      text = t('dashboard.activityDesc.expense', {
        amount: Number(row.amount ?? 0).toLocaleString(),
        currency: String(row.currency ?? ''),
        property: String(row.property_name ?? '')
      })
      break
    case 'contract':
      text = t('dashboard.activityDesc.contract', {
        number: String(row.contract_number ?? ''),
        property: String(row.property_name ?? '')
      })
      break
    case 'property':
      text = t('dashboard.activityDesc.propertyAdded', {
        name: String(row.entity_name ?? ''),
        code: String(row.entity_code ?? '')
      })
      break
    case 'tenant':
      text = t('dashboard.activityDesc.tenantAdded', {
        name: String(row.entity_name ?? ''),
        code: String(row.entity_code ?? '')
      })
      break
  }
  return <>{text}</>
}
