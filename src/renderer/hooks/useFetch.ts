/**
 * @file useFetch — generic data-fetching hook replacing repeated loading/error/data boilerplate.
 *
 * INTENT: Eliminate the 17+ duplicated `useState(loading/error) + useCallback + useEffect +
 *         window.api.* + setLoading/setError` patterns across list and detail pages.
 *
 * CONSTRAINT: The caller must memoize `fetcher` (via `useCallback`) if it depends on props/state.
 *             Without memoization, useFetch re-fetches on every render — which is correct for
 *             mount-only fetchers but not for parameterized ones.
 *
 * CAVEAT: Initial state is `{ data: undefined, loading: true, error: null }`. If your component
 *         needs a different initial value (e.g. `[]`), initialize `data` yourself after the hook.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface UseFetchResult<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Fetches data on mount and exposes `{ data, loading, error, refetch }`.
 *
 * @param fetcher - Async function that returns the data. Called once on mount and again on refetch.
 */
export function useFetch<T>(fetcher: () => Promise<T>): UseFetchResult<T> {
  const { t } = useTranslation()
  const [state, setState] = useState<{
    data: T | undefined
    loading: boolean
    error: string | null
  }>({ data: undefined, loading: true, error: null })

  // Keep fetcher ref current so the callback never goes stale.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const result = await fetcherRef.current()
      setState({ data: result, loading: false, error: null })
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.error(err)
      setState((prev) => ({ ...prev, loading: false, error: t('common.error') }))
    }
  }, [t])

  // Initial fetch on mount. Subsequent fetches are triggered by refetch().
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- async data-fetch is the standard
       React pattern; setState fires when the Promise resolves, not synchronously */
    fetchData()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchData])

  return { data: state.data, loading: state.loading, error: state.error, refetch: fetchData }
}
