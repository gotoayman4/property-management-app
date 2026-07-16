import React from 'react'
import { DataGrid, GridColDef, GridValidRowModel, GridRowId } from '@mui/x-data-grid'
import { Box, Typography, Button, CircularProgress, Paper } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { ErrorOutlined, InboxOutlined } from '@mui/icons-material'

interface StandardTableProps {
  columns: GridColDef[]
  rows: readonly GridValidRowModel[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyMessage?: string
  onEmptyAction?: () => void
  emptyActionText?: string
  getRowId?: (row: GridValidRowModel) => GridRowId
  pageSize?: number
  pageSizeOptions?: number[]
}

export default function StandardTable({
  columns,
  rows,
  loading = false,
  error = null,
  onRetry,
  emptyMessage,
  onEmptyAction,
  emptyActionText,
  getRowId,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50]
}: StandardTableProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'

  // 1. Loading State
  if (loading) {
    return (
      <Paper
        elevation={1}
        sx={{
          p: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 4
        }}
      >
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">
          {t('common.loading')}
        </Typography>
      </Paper>
    )
  }

  // 2. Error State
  if (error) {
    return (
      <Paper
        elevation={1}
        sx={{
          p: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 4,
          bgcolor: 'error.lighter'
        }}
      >
        <ErrorOutlined color="error" sx={{ fontSize: 48, mb: 2 }} />
        <Typography variant="h6" color="error.dark" gutterBottom sx={{ fontWeight: 600 }}>
          {t('common.error')}
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3, maxW: 400 }}>
          {error}
        </Typography>
        {onRetry && (
          <Button variant="contained" color="error" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </Paper>
    )
  }

  // 3. Empty State
  if (rows.length === 0) {
    return (
      <Paper
        elevation={1}
        sx={{
          p: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 4
        }}
      >
        <InboxOutlined color="action" sx={{ fontSize: 48, mb: 2 }} />
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }}>
          {emptyMessage || t('common.noData')}
        </Typography>
        {onEmptyAction && emptyActionText && (
          <Button variant="contained" color="primary" onClick={onEmptyAction}>
            {emptyActionText}
          </Button>
        )}
      </Paper>
    )
  }

  // 4. Success Grid State
  return (
    <Paper
      elevation={1}
      sx={{
        width: '100%',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Box sx={{ height: 400, width: '100%', direction: isRtl ? 'rtl' : 'ltr' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: {
              paginationModel: { pageSize }
            }
          }}
          pageSizeOptions={pageSizeOptions}
          getRowId={getRowId}
          disableRowSelectionOnClick
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'background.default',
              borderBottom: '1px solid',
              borderColor: 'divider',
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 700,
                color: 'text.primary'
              }
            },
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center'
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: '1px solid',
              borderColor: 'divider'
            }
          }}
        />
      </Box>
    </Paper>
  )
}
