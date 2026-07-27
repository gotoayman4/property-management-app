/**
 * @file ReportPreview — renders the data preview grid for the Reports page.
 *
 * INTENT: Extract the preview section (currency-group tables, consolidated group, notes) so
 *         Reports.tsx stays under the 500-line limit. Handles loading, error, and empty states
 *         via StandardTable.
 *
 * CONSTRAINT: StandardTable handles all four states (loading, error, empty, success).
 *             getRowId uses makeRowId for reports without stable IDs (vacancy, P&L).
 */
import { Box, Typography } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import React from 'react'
import { useTranslation } from 'react-i18next'
import StandardTable from '../../components/StandardTable'
import type { ReportData } from './reportTypes'
import { makeRowId } from './reportTypes'

interface ReportPreviewProps {
  data: ReportData | null
  gridColumns: GridColDef[]
  previewRows: Record<string, unknown>[]
  error: string | null
  onRetry: () => void
}

export default function ReportPreview({
  data,
  gridColumns,
  previewRows,
  error,
  onRetry
}: ReportPreviewProps): React.ReactElement {
  const { t } = useTranslation()

  if (data) {
    return (
      <Box>
        {data.consolidatedGroup && (
          <Box
            sx={{
              mb: 3,
              p: 2,
              border: '1px solid',
              borderColor: 'primary.main',
              borderRadius: 1,
              bgcolor: 'action.hover'
            }}
          >
            <Typography variant="h6" sx={{ mb: 0.5, fontWeight: 700, color: 'primary.main' }}>
              {t('reports.consolidatedGroup')}: {data.consolidatedGroup.currency}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('reports.consolidatedSnapshotNote')}
            </Typography>
            <StandardTable
              columns={gridColumns}
              rows={data.consolidatedGroup.rows}
              emptyMessage={t('reports.noData')}
              getRowId={makeRowId(`consolidated-${data.consolidatedGroup.currency}`)}
              pageSize={25}
              pageSizeOptions={[10, 25, 50, 100]}
              tableId="reports-consolidated"
            />
          </Box>
        )}
        {data.groups.map((g) => (
          <Box key={g.currency} sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              {t('reports.currencyGroup')}: {g.currency}
            </Typography>
            <StandardTable
              columns={gridColumns}
              rows={g.rows}
              emptyMessage={t('reports.noData')}
              getRowId={makeRowId(g.currency)}
              pageSize={25}
              pageSizeOptions={[10, 25, 50, 100]}
              tableId="reports-currency"
            />
          </Box>
        ))}
        {data.consolidatedNote && (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 1 }}>
            {data.consolidatedNote.startsWith('reports.')
              ? t(data.consolidatedNote)
              : data.consolidatedNote}
          </Typography>
        )}
      </Box>
    )
  }

  // No data yet — show empty table or error state
  if (error) {
    return (
      <StandardTable
        columns={[]}
        rows={[]}
        error={error}
        onRetry={onRetry}
        emptyMessage={t('reports.noData')}
      />
    )
  }

  return (
    <StandardTable
      columns={[]}
      rows={previewRows}
      loading={false}
      emptyMessage={t('reports.noData')}
    />
  )
}
