/**
 * INTENT: Company information card (FR-SET-12) — lets the user set the company name,
 *         upload/remove a logo (reports + receipt header) and an authorized-signature
 *         image that appears automatically on payment receipts.
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS.
 * DECISION: Extracted from Settings.tsx to keep it under the 500-line limit.
 */
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnackbar } from '../hooks/useSnackbar'

interface CompanyData {
  company_name?: string | null
  company_logo?: string | null
  company_signature?: string | null
}

interface CompanyInfoCardProps {
  /** When true, renders content without Card/CardContent wrapper (for embedding in SettingsSection). */
  compact?: boolean
}

export default function CompanyInfoCard({
  compact = false
}: CompanyInfoCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { showSuccess, showError } = useSnackbar()
  const [data, setData] = useState<CompanyData | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const result = (await window.api.settings.get()) as CompanyData
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) showError('common.error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showError])

  const updateField = useCallback(
    async (field: keyof CompanyData, value: string | null): Promise<void> => {
      try {
        await window.api.settings.update({ [field]: value })
        setData((prev) => (prev ? { ...prev, [field]: value } : prev))
        showSuccess('common.saveSuccess')
      } catch {
        showError('common.saveError')
      }
    },
    [showSuccess, showError]
  )

  /** Shared image-picker flow for logo and signature. Returns the picked base64 or null. */
  const pickImage = useCallback(async (): Promise<string | null> => {
    try {
      const result = await window.api.dialog.pickImage()
      if (result.error) {
        // The file failed magic-byte validation in the main process. Map the machine code to a
        // localized message so the user understands why their selection was rejected.
        const errorKey: Record<string, string> = {
          IMAGE_EMPTY: 'settings.logoErrorEmpty',
          IMAGE_TOO_LARGE: 'settings.logoErrorTooLarge',
          INVALID_IMAGE_TYPE: 'settings.logoErrorInvalidType'
        }
        showError(errorKey[result.error] ?? 'common.saveError')
        return null
      }
      if (!result.canceled && result.base64) return result.base64
      return null
    } catch {
      showError('common.saveError')
      return null
    }
  }, [showError])

  const handlePickLogo = async (): Promise<void> => {
    const base64 = await pickImage()
    if (base64) await updateField('company_logo', base64)
  }

  const handlePickSignature = async (): Promise<void> => {
    const base64 = await pickImage()
    if (base64) await updateField('company_signature', base64)
  }

  if (!data) return <></>

  const content = (
    <>
      <TextField
        fullWidth
        label={t('settings.companyName')}
        value={data.company_name ?? ''}
        onChange={(e) => updateField('company_name', e.target.value || null)}
        sx={{ mb: 3 }}
      />
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        {t('settings.companyLogo')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {data.company_logo ? (
          <Box
            component="img"
            src={data.company_logo}
            alt={t('settings.companyLogo')}
            sx={{
              width: 80,
              height: 80,
              objectFit: 'contain',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              p: 0.5,
              bgcolor: 'background.paper'
            }}
          />
        ) : (
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: 1,
              border: '1px dashed',
              borderColor: 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              fontSize: '0.8rem',
              textAlign: 'center',
              p: 1
            }}
          >
            {t('settings.noLogo')}
          </Box>
        )}
        <Stack spacing={1}>
          <Button variant="outlined" size="small" onClick={handlePickLogo}>
            {t('settings.changeLogo')}
          </Button>
          {data.company_logo && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => updateField('company_logo', null)}
            >
              {t('common.remove')}
            </Button>
          )}
        </Stack>
      </Box>

      {/* Authorized signature — printed on payment receipts above the signature line */}
      <Typography variant="subtitle2" sx={{ mb: 1, mt: 3, fontWeight: 600 }}>
        {t('settings.companySignature')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {data.company_signature ? (
          <Box
            component="img"
            src={data.company_signature}
            alt={t('settings.companySignature')}
            sx={{
              width: 140,
              height: 60,
              objectFit: 'contain',
              objectPosition: 'bottom',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              px: 0.5,
              bgcolor: 'background.paper'
            }}
          />
        ) : (
          <Box
            sx={{
              width: 140,
              height: 60,
              borderRadius: 1,
              border: '1px dashed',
              borderColor: 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              fontSize: '0.8rem',
              textAlign: 'center',
              p: 1
            }}
          >
            {t('settings.noSignature')}
          </Box>
        )}
        <Stack spacing={1}>
          <Button variant="outlined" size="small" onClick={handlePickSignature}>
            {data.company_signature ? t('settings.changeSignature') : t('settings.uploadSignature')}
          </Button>
          {data.company_signature && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => updateField('company_signature', null)}
            >
              {t('common.remove')}
            </Button>
          )}
        </Stack>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t('settings.signatureHint')}
      </Typography>
    </>
  )

  if (compact) return content

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 2.5 }}>
          {t('settings.companyInfo')}
        </Typography>
        {content}
      </CardContent>
    </Card>
  )
}
