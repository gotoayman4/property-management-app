/**
 * @file useUpdateStatus — shared subscription to app metadata + updater state over IPC.
 *
 * INTENT: Single source for the update UI surfaces (Settings › About card, topbar About
 *         dialog, UpdateNotifier). Fetches AppInfo once, snapshots the updater state on
 *         mount (updates:getState) and stays live via the updates:state push channel.
 * DECISION: A hook instead of a store — update state is already owned by the main process;
 *           each consumer just mirrors it, so no cross-component client state is needed.
 * CAVEAT: The mount-time getState snapshot matters — the updater may already be mid-download
 *         when a consumer mounts (state is global in main and survives navigation).
 */
import { useEffect, useState } from 'react'
import type { AppInfo, UpdateState } from '../../preload/index.d'

export interface UseUpdateStatusReturn {
  /** Static app/runtime metadata (version, Electron/Chromium/Node, links). */
  info: AppInfo | null
  /** Live updater state machine snapshot; null until the first IPC round-trip. */
  update: UpdateState | null
}

/** Subscribe to app info + updater state; unsubscribes automatically on unmount. */
export function useUpdateStatus(): UseUpdateStatusReturn {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.app.getInfo().then((data) => mounted && setInfo(data))
    window.api.updates.getState().then((state) => mounted && setUpdate(state))
    const unsubscribe = window.api.updates.onState((state) => mounted && setUpdate(state))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return { info, update }
}
