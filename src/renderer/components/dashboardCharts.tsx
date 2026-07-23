/**
 * @file dashboardCharts — standalone SVG chart components and helpers for the Dashboard.
 *
 * INTENT: Extracted from Dashboard.tsx to stay under the 500-line file limit.
 *         Charts are pure inline SVG — no external chart library needed.
 *
 * CONSTRAINT (AGENTS.md): i18n keys only (via `t` prop), theme.palette tokens,
 *         logical CSS properties.
 */

import { Box, Stack, Typography, useTheme } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface TrendsData {
  income: { month: string; total: number; currency: string }[]
  expense: { month: string; total: number; currency: string }[]
  startDate: string
  endDate: string
}

interface OccupiedDonutProps {
  total: number
  rented: number
  t?: (key: string) => string
}

interface TrendChartProps {
  trends: TrendsData | null
  t?: (key: string) => string
}

/** Occupied vs Vacant donut chart — inline SVG. */
export function OccupiedDonut({ total, rented, t: propT }: OccupiedDonutProps): React.JSX.Element {
  const { t: hookT } = useTranslation()
  const t = propT || hookT

  const theme = useTheme()
  const safeTotal = total || 1
  const vacant = safeTotal - rented
  const pctRented = Math.round((rented / safeTotal) * 100)
  const pctVacant = 100 - pctRented
  const radius = 28
  const circumference = 2 * Math.PI * radius

  return (
    <Box sx={{ textAlign: 'center', py: 1 }}>
      <svg width={80} height={80} viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={theme.palette.divider}
          strokeWidth={6}
        />
        {rented > 0 && (
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={theme.palette.success.main}
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
            stroke={theme.palette.error.main}
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
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main' }} />
          <Typography variant="caption">
            {t('dashboard.rentedProperties')}: {rented}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main' }} />
          <Typography variant="caption">
            {t('property.statusVacant')}: {vacant}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )
}

/** 12-month income vs expense trend line chart — inline SVG. */
export function TrendChart({ trends, t: propT }: TrendChartProps): React.JSX.Element | null {
  const { t: hookT } = useTranslation()
  const t = propT || hookT
  const theme = useTheme()
  if (!trends) return null
  const allPoints = [...trends.income, ...trends.expense]
  if (allPoints.length === 0) return null
  const maxVal = Math.max(...allPoints.map((p) => p.total), 1)
  const months = [
    ...new Set([...trends.income.map((p) => p.month), ...trends.expense.map((p) => p.month)])
  ].sort()
  if (months.length === 0) return null

  const incMap = new Map(trends.income.map((p) => [p.month, p.total]))
  const expMap = new Map(trends.expense.map((p) => [p.month, p.total]))

  const width = 360
  const height = 110
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

  const incPoints = linePoints(incMap)
  const expPoints = linePoints(expMap)

  return (
    <Box>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          stroke={theme.palette.success.main}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={incPoints}
        />
        <polyline
          fill="none"
          stroke={theme.palette.error.main}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={expPoints}
        />
        {months.map((m, i) => {
          const x = padL + (months.length > 1 ? i * stepX : chartW / 2)
          return (
            <text
              key={m}
              x={x}
              y={height - 4}
              fontSize="9"
              fill={theme.palette.text.secondary}
              textAnchor="middle"
            >
              {m.slice(5)}
            </text>
          )
        })}
      </svg>
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'center', mt: 0.5 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main' }} />
          <Typography variant="caption">{t('dashboard.incomeLabel')}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main' }} />
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
  t?: (key: string, params?: Record<string, string | number>) => string
}

/** Build a localized description string for a recent-activity row. */
export function ActivityDescription({
  row,
  t: propT
}: ActivityDescriptionProps): React.JSX.Element {
  const { t: hookT } = useTranslation()
  const t = propT || hookT
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
