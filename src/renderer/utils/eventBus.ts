/**
 * INTENT: Custom DOM event bus for notifying components (e.g. Dashboard) when data mutates (FR-DASH-11).
 * CONSTRAINT: Lightweight, zero extra dependencies, React hook wrapper for clean lifecycle cleanup.
 */
import { useEffect } from 'react'

export const DATA_CHANGED_EVENT = 'app:data-changed'

export function notifyDataChanged(): void {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
}

export function useDataChangedListener(callback: () => void): void {
  useEffect(() => {
    const handler = (): void => {
      callback()
    }
    window.addEventListener(DATA_CHANGED_EVENT, handler)
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handler)
    }
  }, [callback])
}
