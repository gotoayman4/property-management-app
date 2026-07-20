/**
 * INTENT: Property images tab — shows uploaded images for the property as a card grid.
 *         Images are stored in the documents table (ADR-002 unified schema) with
 *         document_type='image' and filtered by image MIME types.
 * CONSTRAINT: i18n keys only, MUI components, theme tokens, logical CSS.
 * DECISION: Card grid with thumbnails instead of table — images are visual, tabular layout
 *           hides the content. Click to preview in a dialog.
 */
import { Delete as DeleteIcon } from '@mui/icons-material'
import { Box, Card, CardMedia, CardContent, Typography, Grid, IconButton } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StandardDialog from '../../components/StandardDialog'
import { useSnackbar } from '../../hooks/useSnackbar'

interface DocumentRow {
  id: number
  file_name: string
  mime_type: string
  description: string | null
  uploaded_at: string
}

interface PropertyImagesTabProps {
  propertyId: number
}

export default function PropertyImagesTab({
  propertyId
}: PropertyImagesTabProps): React.ReactElement {
  const { t } = useTranslation()
  const { showError, showSuccess } = useSnackbar()
  const [images, setImages] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState<DocumentRow | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const data = (await window.api.documents.list({
          entity_type: 'property',
          entity_id: propertyId
        })) as DocumentRow[]
        if (cancelled) return
        const imageDocs = data.filter((d) => d.mime_type.startsWith('image/'))
        setImages(imageDocs)
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [propertyId])

  const handleDelete = async (docId: number): Promise<void> => {
    try {
      await window.api.documents.delete(docId)
      showSuccess('common.deleteSuccess')
      setImages((prev) => prev.filter((img) => img.id !== docId))
    } catch {
      showError('common.deleteError')
    }
  }

  if (loading) return <></>

  return (
    <Box>
      {images.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          {t('propertyDetail.noImages')}
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {images.map((img) => (
            <Grid key={img.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card
                sx={{
                  cursor: 'pointer',
                  '&:hover': { boxShadow: 6 },
                  transition: 'box-shadow 0.2s'
                }}
                onClick={() => setPreviewImage(img)}
              >
                <CardMedia
                  component="img"
                  height="160"
                  image={`atomic://documents/read/${img.id}`}
                  alt={img.file_name}
                  sx={{ objectFit: 'cover' }}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="body2" noWrap>
                    {img.file_name}
                  </Typography>
                  <Box
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {img.uploaded_at}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(img.id)
                      }}
                      aria-label={t('common.delete')}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Image preview dialog */}
      {previewImage && (
        <StandardDialog
          open
          onClose={() => setPreviewImage(null)}
          title={previewImage.file_name}
          maxWidth="md"
        >
          <Box
            component="img"
            src={`atomic://documents/read/${previewImage.id}`}
            alt={previewImage.file_name}
            sx={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
          {previewImage.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {previewImage.description}
            </Typography>
          )}
        </StandardDialog>
      )}
    </Box>
  )
}
