/**
 * INTENT: FR-SET-08 — Per-language notification template editor with live preview.
 *         Opens as a Dialog from Settings. Users can edit the message_body for each
 *         trigger type × language combination, see a live preview with sample data,
 *         and reset individual templates to defaults.
 *
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS, theme.palette tokens, explicit dir
 *             on the portal Dialog, no console.log, no hex colors in JSX.
 * CONSTRAINT (NFR-I18N-02): All visible text via t() keys.
 * DECISION: Uses Accordion per trigger type with Tabs for language switching — compact
 *           layout that scales to 7 types × 3 languages without overwhelming the user.
 */
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SaveIcon from '@mui/icons-material/Save'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from '@mui/material'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDirection } from '../hooks/useDirection'
import ConfirmDialog from './ConfirmDialog'

type TriggerType =
  | 'rent_due'
  | 'overdue'
  | 'contract_expiring'
  | 'escalation_upcoming'
  | 'recurring_expense_due'
  | 'document_expiring'
  | 'backup_failed'

type TemplateLanguage = 'ar' | 'tr' | 'en'

interface TemplateRow {
  id: number
  name: string
  trigger_type: TriggerType
  language: TemplateLanguage
  message_body: string
}

interface NotificationTemplateManagerProps {
  open: boolean
  onClose: () => void
}

const TRIGGER_TYPES: TriggerType[] = [
  'rent_due',
  'overdue',
  'contract_expiring',
  'escalation_upcoming',
  'recurring_expense_due',
  'document_expiring',
  'backup_failed'
]

const LANGUAGES: TemplateLanguage[] = ['ar', 'en', 'tr']

/** Sample data for live preview — realistic placeholder values per trigger type. */
const SAMPLE_DATA: Record<TriggerType, Record<string, string>> = {
  rent_due: {
    tenant_name: 'أحمد محمد',
    amount: '500 JOD',
    due_date: '2026-08-01',
    property_name: 'محل تجاري - العبدلي'
  },
  overdue: {
    tenant_name: 'سارة العلي',
    amount: '1,200 TRY',
    due_date: '2026-07-01',
    property_name: 'شقة سكنية - شارع الملك حسين'
  },
  contract_expiring: {
    tenant_name: 'علي حسن',
    due_date: '2026-12-31',
    property_name: 'محل تجاري - صويلح'
  },
  escalation_upcoming: {
    tenant_name: 'فاطمة الزهراء',
    due_date: '2027-01-01',
    property_name: 'شقة سكنية - الدوار الثاني'
  },
  recurring_expense_due: {
    property_name: 'تنظيف شهري - العمارة',
    due_date: '2026-08-05',
    amount: '150 JOD'
  },
  document_expiring: {
    document_type: 'عقد التأمين',
    due_date: '2026-09-15',
    property_name: 'محل تجاري - جبل الحسين'
  },
  backup_failed: {
    due_date: '2026-07-20'
  }
}

/** Placeholders available per trigger type. */
const AVAILABLE_VARS: Record<TriggerType, string[]> = {
  rent_due: ['tenant_name', 'amount', 'due_date', 'property_name'],
  overdue: ['tenant_name', 'amount', 'due_date', 'property_name'],
  contract_expiring: ['tenant_name', 'due_date', 'property_name'],
  escalation_upcoming: ['tenant_name', 'due_date', 'property_name'],
  recurring_expense_due: ['property_name', 'due_date', 'amount'],
  document_expiring: ['document_type', 'due_date', 'property_name'],
  backup_failed: ['due_date']
}

/** Render a preview string by replacing {var} placeholders with sample values. */
function renderPreview(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

export default function NotificationTemplateManager({
  open,
  onClose
}: NotificationTemplateManagerProps): React.JSX.Element {
  const { t } = useTranslation()
  const isRtl = useDirection()

  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedType, setExpandedType] = useState<TriggerType | null>('rent_due')
  const [activeLangTab, setActiveLangTab] = useState<Record<TriggerType, TemplateLanguage>>({
    rent_due: 'ar',
    overdue: 'ar',
    contract_expiring: 'ar',
    escalation_upcoming: 'ar',
    recurring_expense_due: 'ar',
    document_expiring: 'ar',
    backup_failed: 'ar'
  })
  /** Dirty edits keyed by template row ID. Only keys present here override the DB value. */
  const [edits, setEdits] = useState<Record<number, string>>({})
  /** Track which templates have unsaved changes for save button state. */
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set())

  /** Reset confirmation state. */
  const [resetTarget, setResetTarget] = useState<{
    triggerType: TriggerType
    language: TemplateLanguage
  } | null>(null)

  const loadTemplates = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const data = (await window.api.templates.list()) as TemplateRow[]
      setTemplates(data)
    } catch {
      // Silent — parent handles errors via snackbar
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function init(): Promise<void> {
      setLoading(true)
      setEdits({})
      setDirtyIds(new Set())
      setResetTarget(null)
      try {
        const data = (await window.api.templates.list()) as TemplateRow[]
        if (!cancelled) setTemplates(data)
      } catch {
        // Silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [open])

  /** Group templates by trigger type for the accordion layout. */
  const grouped = useMemo(() => {
    const map = new Map<TriggerType, Map<TemplateLanguage, TemplateRow>>()
    for (const type of TRIGGER_TYPES) {
      map.set(type, new Map())
    }
    for (const tpl of templates) {
      map.get(tpl.trigger_type)?.set(tpl.language, tpl)
    }
    return map
  }, [templates])

  /** Get the effective body text for a template row (dirty edit or DB value). */
  const getEffectiveBody = useCallback(
    (tpl: TemplateRow): string =>
      dirtyIds.has(tpl.id) ? (edits[tpl.id] ?? tpl.message_body) : tpl.message_body,
    [edits, dirtyIds]
  )

  const handleBodyChange = useCallback((tplId: number, value: string): void => {
    setEdits((prev) => ({ ...prev, [tplId]: value }))
    setDirtyIds((prev) => {
      const next = new Set(prev)
      next.add(tplId)
      return next
    })
  }, [])

  const handleSave = useCallback(
    async (tplId: number): Promise<void> => {
      const body = edits[tplId]
      if (!body || !body.trim()) return
      try {
        await window.api.templates.update({ id: tplId, message_body: body.trim() })
        setDirtyIds((prev) => {
          const next = new Set(prev)
          next.delete(tplId)
          return next
        })
        await loadTemplates()
      } catch {
        // Silent — could add snackbar here
      }
    },
    [edits, loadTemplates]
  )

  const handleResetConfirm = useCallback(async (): Promise<void> => {
    if (!resetTarget) return
    try {
      await window.api.templates.resetDefaults({
        trigger_type: resetTarget.triggerType,
        language: resetTarget.language
      })
      setResetTarget(null)
      await loadTemplates()
    } catch {
      // Silent
    }
  }, [resetTarget, loadTemplates])

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidth="md"
        fullWidth
        fullScreen={false}
        aria-labelledby="template-manager-title"
      >
        <DialogTitle id="template-manager-title">{t('settings.notificationTemplates')}</DialogTitle>

        <DialogContent dividers>
          {loading ? (
            <Typography color="text.secondary">{t('common.loading')}</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {TRIGGER_TYPES.map((type) => {
                const langMap = grouped.get(type)
                const isExpanded = expandedType === type
                const currentLang = activeLangTab[type]
                const tpl = langMap?.get(currentLang)
                const sampleVars = SAMPLE_DATA[type]
                const availableVars = AVAILABLE_VARS[type]
                const effectiveBody = tpl ? getEffectiveBody(tpl) : ''
                const isDirty = tpl ? dirtyIds.has(tpl.id) : false

                return (
                  <Accordion
                    key={type}
                    expanded={isExpanded}
                    onChange={(_, expanded) => setExpandedType(expanded ? type : null)}
                    disableGutters
                  >
                    <AccordionSummary>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {t(`notifications.type.${type}`)}
                      </Typography>
                    </AccordionSummary>

                    <AccordionDetails>
                      {/* Language Tabs */}
                      <Tabs
                        value={LANGUAGES.indexOf(currentLang)}
                        onChange={(_, idx) =>
                          setActiveLangTab((prev) => ({
                            ...prev,
                            [type]: LANGUAGES[idx]
                          }))
                        }
                        sx={{ mb: 2, minHeight: 36 }}
                      >
                        <Tab label={t('settings.langAr')} sx={{ minHeight: 36, py: 0 }} />
                        <Tab label={t('settings.langEn')} sx={{ minHeight: 36, py: 0 }} />
                        <Tab label={t('settings.langTr')} sx={{ minHeight: 36, py: 0 }} />
                      </Tabs>

                      {tpl ? (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2
                          }}
                        >
                          {/* Editable message body */}
                          <Box
                            component="textarea"
                            value={effectiveBody}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                              handleBodyChange(tpl.id, e.target.value)
                            }
                            rows={3}
                            dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
                            sx={{
                              width: '100%',
                              fontFamily:
                                currentLang === 'ar'
                                  ? "'Tajawal', 'Cairo', system-ui"
                                  : "'Inter', system-ui",
                              fontSize: '0.95rem',
                              lineHeight: 1.6,
                              p: 1.5,
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              resize: 'vertical',
                              bgcolor: 'background.paper',
                              color: 'text.primary',
                              '&:focus': {
                                outline: 'none',
                                borderColor: 'primary.main'
                              }
                            }}
                            aria-label={t('settings.templateBody')}
                          />

                          {/* Save + Reset buttons */}
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<SaveIcon />}
                              disabled={!isDirty || !effectiveBody.trim()}
                              onClick={() => handleSave(tpl.id)}
                            >
                              {t('common.save')}
                            </Button>
                            <Tooltip title={t('settings.resetTemplate')}>
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() =>
                                  setResetTarget({
                                    triggerType: type,
                                    language: currentLang
                                  })
                                }
                              >
                                <RestartAltIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>

                          {/* Available variables */}
                          <Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ mb: 0.5, display: 'block' }}
                            >
                              {t('settings.templateVariables')}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {availableVars.map((v) => (
                                <Chip
                                  key={v}
                                  label={`{${v}}`}
                                  size="small"
                                  variant="outlined"
                                  onClick={() => {
                                    const textarea = document.querySelector(
                                      `[aria-label="${t('settings.templateBody')}"]`
                                    ) as HTMLTextAreaElement | null
                                    if (textarea) {
                                      const pos = textarea.selectionStart || effectiveBody.length
                                      const newVal =
                                        effectiveBody.slice(0, pos) +
                                        `{${v}}` +
                                        effectiveBody.slice(pos)
                                      handleBodyChange(tpl.id, newVal)
                                    }
                                  }}
                                  sx={{ cursor: 'pointer' }}
                                />
                              ))}
                            </Box>
                          </Box>

                          {/* Live Preview */}
                          <Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ mb: 0.5, display: 'block' }}
                            >
                              {t('settings.templatePreview')}
                            </Typography>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                bgcolor: 'action.hover',
                                fontFamily:
                                  currentLang === 'ar'
                                    ? "'Tajawal', 'Cairo', system-ui"
                                    : "'Inter', system-ui",
                                fontSize: '0.95rem',
                                lineHeight: 1.6,
                                direction: currentLang === 'ar' ? 'rtl' : 'ltr'
                              }}
                            >
                              {renderPreview(effectiveBody, sampleVars)}
                            </Paper>
                          </Box>
                        </Box>
                      ) : (
                        <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          {t('common.loading')}
                        </Typography>
                      )}
                    </AccordionDetails>
                  </Accordion>
                )
              })}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Divider sx={{ width: '100%', mb: 1 }} />
          <Button onClick={onClose} variant="outlined">
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset confirmation */}
      <ConfirmDialog
        open={resetTarget !== null}
        title={t('settings.resetTemplate')}
        message={t('settings.resetTemplateConfirm')}
        confirmLabel={t('common.confirm')}
        onConfirm={handleResetConfirm}
        onCancel={() => setResetTarget(null)}
        severity="warning"
      />
    </>
  )
}
