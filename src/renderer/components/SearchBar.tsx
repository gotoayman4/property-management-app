/**
 * INTENT: Global search bar in the AppBar. Type-ahead search across all entities.
 *         Results appear in a dropdown with entity type grouping and navigation.
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS, portal dir prop for Popper.
 */
import BusinessIcon from '@mui/icons-material/Business'
import DescriptionIcon from '@mui/icons-material/Description'
import PaymentsIcon from '@mui/icons-material/Payments'
import PeopleIcon from '@mui/icons-material/People'
import SearchIcon from '@mui/icons-material/Search'
import {
  Box,
  TextField,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Typography,
  ClickAwayListener
} from '@mui/material'
import React, { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

interface SearchResult {
  entity_type: string
  entity_id: number
  title: string
  subtitle: string
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  property: <BusinessIcon fontSize="small" />,
  tenant: <PeopleIcon fontSize="small" />,
  contract: <DescriptionIcon fontSize="small" />,
  payment: <PaymentsIcon fontSize="small" />
}

const ENTITY_ROUTES: Record<string, (id: number) => string> = {
  property: () => '/properties',
  tenant: () => '/tenants',
  contract: () => '/contracts',
  payment: () => '/payments'
}

export default function SearchBar(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputCallbackRef = useCallback((node: HTMLInputElement | null) => {
    setAnchorEl(node)
  }, [])

  const doSearch = useCallback(async (q: string): Promise<void> => {
    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    try {
      const data = await window.api.search.global(q)
      setResults(data)
      setOpen(data.length > 0)
    } catch {
      setResults([])
      setOpen(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): Promise<void> | undefined => {
    const value = e.target.value
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(value)
    }, 300)
    return undefined
  }

  const handleSelect = (result: SearchResult): void => {
    setOpen(false)
    setQuery('')
    const route = ENTITY_ROUTES[result.entity_type]
    if (route) {
      navigate(route(result.entity_id))
    }
  }

  const handleClickAway = (): void => {
    setOpen(false)
  }

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box sx={{ position: 'relative' }}>
        <TextField
          size="small"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={handleChange}
          inputRef={inputCallbackRef}
          slotProps={{
            input: {
              startAdornment: (
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary', marginInlineEnd: 1 }} />
              )
            }
          }}
          sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <Popper
          open={open}
          anchorEl={anchorEl}
          placement="bottom-start"
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{ zIndex: 1300 }}
        >
          <Paper elevation={3} sx={{ width: 380, maxHeight: 320, overflow: 'auto', mt: 0.5 }}>
            <List dense disablePadding>
              {results.map((r, i) => (
                <ListItem
                  key={`${r.entity_type}-${r.entity_id}-${i}`}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => handleSelect(r)}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {ENTITY_ICONS[r.entity_type] ?? <SearchIcon fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {r.title}
                      </Typography>
                    }
                    secondary={r.subtitle}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  )
}
