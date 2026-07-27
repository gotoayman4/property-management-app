/**
 * INTENT: Reusable dialog for managing countries — add, edit, deactivate, set default.
 *         Used from both Settings page and PropertyForm.
 * CONSTRAINT (AGENTS.md): logical CSS, i18n keys only, explicit dir on portal,
 *         no console.log, no hex colors, no placeholders.
 * DECISION: Standalone component that manages its own data loading so it works
 *           identically regardless of which parent renders it.
 */
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EditIcon from '@mui/icons-material/Edit'
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle'
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { worldCountries, type WorldCountry } from '../data/worldCountries'
import { useDirection } from '../hooks/useDirection'
import { getLocalizedCountryName } from '../utils/countryUtils'
import ConfirmDialog from './ConfirmDialog'
import { CountryFormCard } from './CountryFormCard'

interface CountryRow {
  id: number
  code: string
  name: string
  default_currency: string
  is_active: number
}

interface CountryManagerDialogProps {
  open: boolean
  onClose: () => void
  /** Called after any CRUD so the parent can refresh its country list. */
  onChange?: () => void
}

export default function CountryManagerDialog({
  open,
  onClose,
  onChange
}: CountryManagerDialogProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = useDirection()

  // Data state
  const [countries, setCountries] = useState<CountryRow[]>([])
  const [defaultCountry, setDefaultCountry] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedWorldCountry, setSelectedWorldCountry] = useState<WorldCountry | null>(null)
  const [addError, setAddError] = useState('')

  // Return the localized country name based on current UI language
  const localizedName = useCallback(
    (wc: WorldCountry): string => (i18n.language === 'ar' ? wc.nameAr : wc.name),
    [i18n.language]
  )

  // Countries that are not yet in the user's list — available for adding, sorted by localized name
  const availableWorldCountries = useMemo(
    () =>
      worldCountries
        .filter((wc) => !countries.some((c) => c.code === wc.code))
        .sort((a, b) => localizedName(a).localeCompare(localizedName(b), i18n.language)),
    [countries, localizedName, i18n.language]
  )

  // Edit state — null means no country being edited; holds { id, name, default_currency }
  const [editingId, setEditingId] = useState<{
    id: number
    name: string
    default_currency: string
  } | null>(null)

  // Delete confirmation
  const [deletingCode, setDeletingCode] = useState<string | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [countryList, settingsData] = await Promise.all([
        window.api.countries.listAll(),
        window.api.settings.get()
      ])
      setCountries(countryList)
      setDefaultCountry(settingsData?.default_country ?? null)
    } catch {
      // Silent — parent handles errors via snackbar
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData()
      // Reset transient UI state
      setShowAddForm(false)
      setSelectedWorldCountry(null)
      setAddError('')
      setEditingId(null)
      setDeletingCode(null)
      setDeleteBlocked(false)
    }
  }, [open, loadData])

  const handleSetDefault = async (code: string | null): Promise<void> => {
    try {
      await window.api.settings.update({ default_country: code })
      setDefaultCountry(code)
    } catch {
      // Silent
    }
  }

  const handleAdd = async (): Promise<void> => {
    if (!selectedWorldCountry) return

    try {
      await window.api.countries.create({
        code: selectedWorldCountry.code,
        name: selectedWorldCountry.name,
        default_currency: selectedWorldCountry.default_currency
      })
      setShowAddForm(false)
      setSelectedWorldCountry(null)
      setAddError('')
      await loadData()
      onChange?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'COUNTRY_CODE_DUPLICATE') {
        setAddError(t('countries.codeDuplicate'))
      } else {
        setAddError(t('common.error'))
      }
    }
  }

  const handleEditSave = async (): Promise<void> => {
    if (!editingId) return
    const payload: { id: number; name?: string; default_currency?: string } = { id: editingId.id }
    if (editingId.name.trim()) payload.name = editingId.name.trim()
    if (editingId.default_currency.trim().length === 3)
      payload.default_currency = editingId.default_currency.trim().toUpperCase()

    try {
      await window.api.countries.update(payload)
      setEditingId(null)
      await loadData()
      onChange?.()
    } catch {
      // Silent
    }
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deletingCode) return
    const code = deletingCode
    setDeletingCode(null)
    setDeleteBlocked(false)
    try {
      await window.api.countries.delete(code)
      await loadData()
      onChange?.()
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'COUNTRY_IN_USE') {
        setDeleteBlocked(true)
      }
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidth="sm"
        fullWidth
        aria-labelledby="country-manager-title"
      >
        <DialogTitle id="country-manager-title">{t('countries.manageCountries')}</DialogTitle>
        <DialogContent>
          {loading ? (
            <Typography color="text.secondary">{t('common.loading')}</Typography>
          ) : (
            <>
              {/* Default Country Selector */}
              <FormControl fullWidth size="small" sx={{ mb: 3 }}>
                <InputLabel>{t('countries.defaultCountryLabel')}</InputLabel>
                <Select
                  value={defaultCountry ?? ''}
                  label={t('countries.defaultCountryLabel')}
                  onChange={(e) => handleSetDefault(e.target.value || null)}
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  <MenuItem value="">
                    <em>{t('common.none')}</em>
                  </MenuItem>
                  {countries
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <MenuItem key={c.code} value={c.code}>
                        {t(`countries.${c.code}`, c.name)}
                      </MenuItem>
                    ))}
                </Select>
                <FormHelperText>{t('countries.defaultCountryHelp')}</FormHelperText>
              </FormControl>

              {/* Country List */}
              {countries.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  {t('countries.noCountries')}
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {countries.map((c) => {
                    const isDefault = c.code === defaultCountry
                    const isEditing = editingId?.id === c.id
                    return (
                      <Card
                        key={c.id}
                        variant="outlined"
                        sx={{
                          opacity: c.is_active ? 1 : 0.55,
                          borderColor: isDefault ? 'primary.main' : undefined
                        }}
                      >
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Grid container spacing={1} sx={{ alignItems: 'center' }}>
                            {/* Code + default badge */}
                            <Grid size={{ xs: 12, sm: 2 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                  {c.code}
                                </Typography>
                                {isDefault && (
                                  <Tooltip title={t('countries.defaultCountryLabel')}>
                                    <CheckCircleIcon color="primary" fontSize="small" />
                                  </Tooltip>
                                )}
                              </Box>
                            </Grid>

                            {/* Name */}
                            <Grid size={{ xs: 12, sm: 4 }}>
                              {isEditing ? (
                                <TextField
                                  fullWidth
                                  size="small"
                                  value={editingId.name}
                                  onChange={(e) =>
                                    setEditingId({ ...editingId, name: e.target.value })
                                  }
                                  label={t('countries.name')}
                                />
                              ) : (
                                <Typography variant="body2">
                                  {getLocalizedCountryName(c.code, i18n.language, c.name)}
                                </Typography>
                              )}
                            </Grid>

                            {/* Default Currency */}
                            <Grid size={{ xs: 12, sm: 3 }}>
                              {isEditing ? (
                                <TextField
                                  fullWidth
                                  size="small"
                                  value={editingId.default_currency}
                                  onChange={(e) =>
                                    setEditingId({ ...editingId, default_currency: e.target.value })
                                  }
                                  label={t('countries.defaultCurrency')}
                                />
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  {c.default_currency}
                                </Typography>
                              )}
                            </Grid>

                            {/* Active badge */}
                            <Grid size={{ xs: 6, sm: 1.5 }}>
                              <Typography
                                variant="caption"
                                color={c.is_active ? 'success.main' : 'text.disabled'}
                              >
                                {c.is_active ? t('countries.active') : t('countries.inactive')}
                              </Typography>
                            </Grid>

                            {/* Actions */}
                            <Grid
                              size={{ xs: 6, sm: 1.5 }}
                              sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}
                            >
                              {isEditing ? (
                                <>
                                  <Button size="small" variant="contained" onClick={handleEditSave}>
                                    {t('common.save')}
                                  </Button>
                                  <Button size="small" onClick={() => setEditingId(null)}>
                                    {t('common.cancel')}
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Tooltip title={t('common.edit')}>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      aria-label={t('common.edit')}
                                      onClick={() =>
                                        setEditingId({
                                          id: c.id,
                                          name: c.name,
                                          default_currency: c.default_currency
                                        })
                                      }
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  {c.is_active ? (
                                    <Tooltip title={t('common.deactivate')}>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        aria-label={t('common.deactivate')}
                                        onClick={() => {
                                          setDeletingCode(c.code)
                                          setDeleteBlocked(false)
                                        }}
                                      >
                                        <RemoveCircleIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                                </>
                              )}
                            </Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    )
                  })}
                </Box>
              )}

              {/* In-use warning shown inline when deactivation blocked */}
              {deleteBlocked && (
                <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                  {t('countries.inUseWarning')}
                </Typography>
              )}

              {/* Add Country Form */}
              <CountryFormCard
                showAddForm={showAddForm}
                setShowAddForm={setShowAddForm}
                availableWorldCountries={availableWorldCountries}
                selectedWorldCountry={selectedWorldCountry}
                setSelectedWorldCountry={setSelectedWorldCountry}
                localizedName={localizedName}
                handleAddSubmit={async () => {
                  await handleAdd()
                }}
                addError={addError}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={onClose} variant="outlined">
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deletingCode !== null}
        title={t('countries.deleteConfirmTitle')}
        message={t('countries.deleteConfirm', {
          code: deletingCode ?? '',
          name: countries.find((c) => c.code === deletingCode)?.name ?? ''
        })}
        confirmLabel={t('common.deactivate')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeletingCode(null)
          setDeleteBlocked(false)
        }}
        severity="warning"
      />
    </>
  )
}
