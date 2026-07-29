import { ErrorOutlined, InboxOutlined } from '@mui/icons-material'
import { Box, Typography, Button, Paper, Skeleton, alpha } from '@mui/material'
import {
  DataGrid,
  GridColDef,
  GridValidRowModel,
  GridRowId,
  GridColumnVisibilityModel,
  GridRowSelectionModel
} from '@mui/x-data-grid'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDirection } from '../hooks/useDirection'
import { getGridLocaleText } from '../utils/dataGridLocale'

const STORAGE_PREFIX = 'table-state:'
const DEBOUNCE_MS = 500

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
  /** Unique identifier — when provided, column visibility is persisted to localStorage. */
  tableId?: string
  /** Enable the leading checkbox-selection column. */
  checkboxSelection?: boolean
  rowSelectionModel?: GridRowSelectionModel
  onRowSelectionModelChange?: (model: GridRowSelectionModel) => void
}

function readPersistedVisibility(tableId: string): GridColumnVisibilityModel {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableId)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && 'columnVisibility' in parsed) {
      return parsed.columnVisibility as GridColumnVisibilityModel
    }
  } catch {
    /* corrupted data — ignore */
  }
  return {}
}

function writePersistedVisibility(tableId: string, model: GridColumnVisibilityModel): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableId, JSON.stringify({ columnVisibility: model }))
  } catch {
    /* localStorage may be full or unavailable */
  }
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
  pageSizeOptions = [10, 25, 50],
  tableId,
  checkboxSelection = false,
  rowSelectionModel,
  onRowSelectionModelChange
}: StandardTableProps): React.JSX.Element {
  const { t } = useTranslation()
  const isRtl = useDirection()
  const localeText = getGridLocaleText(t)

  // --- Column visibility persistence ---
  const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(() =>
    tableId ? readPersistedVisibility(tableId) : {}
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleColumnVisibilityChange = useCallback(
    (model: GridColumnVisibilityModel) => {
      setColumnVisibility(model)
      if (tableId) {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(
          () => writePersistedVisibility(tableId, model),
          DEBOUNCE_MS
        )
      }
    },
    [tableId]
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // 1. Loading State (Shimmer Skeletons)
  if (loading) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          minHeight: 400,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 0
        }}
      >
        <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={52}
            sx={{ borderRadius: 1, opacity: 1 - i * 0.15 }}
          />
        ))}
      </Paper>
    )
  }

  // 2. Error State
  if (error) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 0,
          bgcolor: (theme) => alpha(theme.palette.error.main, 0.04)
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2
          }}
        >
          <ErrorOutlined color="error" sx={{ fontSize: 40 }} />
        </Box>
        <Typography variant="h6" color="error.dark" gutterBottom sx={{ fontWeight: 600 }}>
          {t('common.error')}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          align="center"
          sx={{ mb: 3, maxWidth: 400 }}
        >
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
        elevation={0}
        sx={{
          p: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 0
        }}
      >
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2
          }}
        >
          <InboxOutlined color="action" sx={{ fontSize: 40 }} />
        </Box>
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
      elevation={0}
      sx={{
        width: '100%',
        borderRadius: 0,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Box sx={{ height: 400, width: '100%' }} dir={isRtl ? 'rtl' : 'ltr'}>
        <DataGrid
          rows={rows}
          columns={columns}
          localeText={localeText}
          columnVisibilityModel={columnVisibility}
          onColumnVisibilityModelChange={handleColumnVisibilityChange}
          initialState={{
            pagination: {
              paginationModel: { pageSize }
            }
          }}
          pageSizeOptions={pageSizeOptions}
          getRowId={getRowId}
          checkboxSelection={checkboxSelection}
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={onRowSelectionModelChange}
          disableRowSelectionOnClick
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: (theme) => alpha(theme.palette.background.default, 0.9),
              backdropFilter: 'blur(8px)',
              borderBottom: '2px solid',
              borderColor: 'divider',
              position: 'sticky',
              top: 0,
              zIndex: 1,
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 700,
                fontSize: '0.8125rem',
                color: 'text.primary',
                letterSpacing: isRtl ? 0 : 0.5
              }
            },
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              fontSize: '0.875rem',
              py: 1
            },
            '& .MuiDataGrid-row': {
              transition: 'background-color 0.15s ease-in-out'
            },
            '& .MuiDataGrid-row:nth-of-type(even)': {
              bgcolor: (theme) =>
                alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.07 : 0.035)
            },
            '& .MuiDataGrid-row:hover': {
              bgcolor: (theme) =>
                alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.07)
            },
            '& .MuiDataGrid-row.Mui-selected': {
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
              '&:hover': {
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.18)
              }
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default'
            }
          }}
        />
      </Box>
    </Paper>
  )
}
