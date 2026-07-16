import React from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Typography, Grid, Card, CardContent } from '@mui/material'
import BusinessIcon from '@mui/icons-material/Business'
import PeopleIcon from '@mui/icons-material/People'
import WalletIcon from '@mui/icons-material/AccountBalanceWallet'

export default function Dashboard(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        {t('sidebar.dashboard')}
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  bgcolor: 'primary.lighter',
                  color: 'primary.main',
                  display: 'flex',
                  marginInline: 2
                }}
              >
                <BusinessIcon fontSize="large" />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('sidebar.properties')}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  --
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  bgcolor: 'secondary.lighter',
                  color: 'secondary.main',
                  display: 'flex',
                  marginInline: 2
                }}
              >
                <PeopleIcon fontSize="large" />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('sidebar.tenants')}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  --
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  bgcolor: 'success.lighter',
                  color: 'success.main',
                  display: 'flex',
                  marginInline: 2
                }}
              >
                <WalletIcon fontSize="large" />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('sidebar.ledger')}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  --
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
