import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  IconButton,
  Chip,
  Card,
  Grid
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { GridColDef } from '@mui/x-data-grid'
import StandardTable from '../../components/StandardTable'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import { useSnackbar } from '../../hooks/useSnackbar'
import PropertyForm from './PropertyForm'
import BusinessIcon from '@mui/icons-material/Business'

interface Property {
  id: number
  code: string
  name: string
  type: 'apartment' | 'shop'
  country: string
  currency: string
  address?: string
  area_sqm?: number
  status: 'vacant' | 'rented' | 'maintenance'
  monthly_rent_default: number
  notes?: string
}

interface Country {
  id: number
  code: string
  name: string
  default_currency: string
  is_active: number
}

export default function PropertyList(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  // State
  const [properties, setProperties] = useState<Property[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [country, setCountry] = useState('')

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  // Property awaiting deletion confirmation (null = dialog closed)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const fetchProperties = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.properties.list({
        search: search || undefined,
        type: type || undefined,
        status: status || undefined,
        country: country || undefined
      })
      setProperties(data as Property[])
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [search, type, status, country, t])

  const fetchCountries = useCallback(async (): Promise<void> => {
    try {
      const data = await window.api.countries.list()
      setCountries(data as Country[])
    } catch (err) {
      console.error('Failed to load countries:', err)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCountries()
  }, [fetchCountries])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProperties()
  }, [fetchProperties])

  const handleAddClick = (): void => {
    setEditingProperty(null)
    setDialogOpen(true)
  }

  const handleEditClick = (property: Property): void => {
    setEditingProperty(property)
    setDialogOpen(true)
  }

  // Open the shared confirm dialog instead of window.confirm()
  const handleDeleteClick = (id: number): void => {
    setPendingDeleteId(id)
  }

  // Actually archive the property after the user confirms in ConfirmDialog
  const confirmDelete = async (): Promise<void> => {
    if (pendingDeleteId === null) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    try {
      await window.api.properties.delete(id)
      showSuccess('common.deleteSuccess')
      fetchProperties()
    } catch (err) {
      console.error('Failed to delete property:', err)
      showError('common.deleteError')
    }
  }

  const handleFormSuccess = (): void => {
    setDialogOpen(false)
    fetchProperties()
  }

  // DataGrid Columns Definition
  const columns: GridColDef[] = [
    {
      field: 'code',
      headerName: t('property.code'),
      flex: 1,
      minWidth: 100
    },
    {
      field: 'name',
      headerName: t('property.name'),
      flex: 1.5,
      minWidth: 150
    },
    {
      field: 'type',
      headerName: t('property.type'),
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <Typography variant="body2">
          {params.value === 'apartment' ? t('property.apartment') : t('property.shop')}
        </Typography>
      )
    },
    {
      field: 'country',
      headerName: t('property.country'),
      flex: 0.8,
      minWidth: 100
    },
    {
      field: 'status',
      headerName: t('common.status'),
      flex: 1,
      minWidth: 120,
      renderCell: (params) => {
        let label = ''
        let color: 'success' | 'warning' | 'default' = 'default'
        switch (params.value) {
          case 'vacant':
            label = t('property.statusVacant')
            color = 'success'
            break
          case 'rented':
            label = t('property.statusRented')
            color = 'default'
            break
          case 'maintenance':
            label = t('property.statusMaintenance')
            color = 'warning'
            break
        }
        return <Chip label={label} color={color} size="small" variant="outlined" />
      }
    },
    {
      field: 'monthly_rent_default',
      headerName: t('property.monthlyRent'),
      flex: 1.2,
      minWidth: 140,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {params.value.toLocaleString()} {params.row.currency}
        </Typography>
      )
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      sortable: false,
      flex: 1,
      minWidth: 110,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEditClick(params.row)}
            aria-label={t('common.edit')}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteClick(params.row.id)}
            aria-label={t('common.delete')}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )
    }
  ]

  return (
    <Box>
      <PageHeader
        icon={<BusinessIcon />}
        title={t('property.title')}
        action={
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
          >
            {t('property.add')}
          </Button>
        }
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4, md: 3 }}>
            <TextField
              fullWidth
              label={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('property.type')}</InputLabel>
              <Select
                value={type}
                label={t('property.type')}
                onChange={(e) => setType(e.target.value)}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                <MenuItem value="apartment">{t('property.apartment')}</MenuItem>
                <MenuItem value="shop">{t('property.shop')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('common.status')}</InputLabel>
              <Select
                value={status}
                label={t('common.status')}
                onChange={(e) => setStatus(e.target.value)}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                <MenuItem value="vacant">{t('property.statusVacant')}</MenuItem>
                <MenuItem value="rented">{t('property.statusRented')}</MenuItem>
                <MenuItem value="maintenance">{t('property.statusMaintenance')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('property.country')}</InputLabel>
              <Select
                value={country}
                label={t('property.country')}
                onChange={(e) => setCountry(e.target.value)}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {countries.map((c) => (
                  <MenuItem key={c.code} value={c.code}>
                    {c.code === 'JO' && (isRtl ? 'الأردن' : 'Jordan')}
                    {c.code === 'TR' && (isRtl ? 'تركيا' : 'Turkey')}
                    {c.code === 'QA' && (isRtl ? 'قطر' : 'Qatar')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid
            size={{ xs: 12, sm: 4, md: 1.5 }}
            sx={{ display: 'flex', justifyContent: 'flex-end' }}
          >
            <Button
              variant="outlined"
              onClick={() => {
                setSearch('')
                setType('')
                setStatus('')
                setCountry('')
              }}
              fullWidth
            >
              {t('common.reset')}
            </Button>
          </Grid>
        </Grid>
      </Card>

      {/* Properties Table */}
      <StandardTable
        columns={columns}
        rows={properties}
        loading={loading}
        error={error}
        onRetry={fetchProperties}
        emptyMessage={
          search || type || status || country
            ? t('property.noPropertiesFiltered')
            : t('property.noProperties')
        }
        onEmptyAction={handleAddClick}
        emptyActionText={t('property.add')}
        getRowId={(row) => row.id}
      />

      {/* Property Create/Edit Dialog */}
      {dialogOpen && (
        <PropertyForm
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={handleFormSuccess}
          property={editingProperty}
          countries={countries}
        />
      )}

      {/* Archive confirmation */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('common.confirmArchive')}
        message={t('common.confirmArchive')}
        confirmLabel={t('common.archive')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
