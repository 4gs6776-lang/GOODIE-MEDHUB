import { useCallback, useEffect } from 'react'
import { getMySubscription } from './subscriptions'
import { useRealtimeAlert } from './useRealtimeAlert'
import { setLockFromStatus, clearLock } from './subscriptionLock'

// =====================================================================
// GOODIE-MEDHUB — keeps the write lock in sync with the database
//
// Runs for EVERY hospital role (doctor, nurse, cashier...), not just the
// admin, because the lock must apply to everyone.
//
// It only READS the stored status — it never works one out or changes
// it (the daily database job and the owner decide the status).
//
// Freshness:
//   - on load
//   - instantly when the owner/daily job updates the subscription
//     (realtime)
//   - when the device comes back online, when the tab is re-opened,
//     and every 5 minutes as a safety net
//
// Offline: the last known status is remembered on the device so an
// expired hospital cannot dodge the lock just by reloading offline.
// If the status has never been loaded and cannot be reached, the app
// stays UNLOCKED (fail-open) — it must never lock people out by mistake.
// =====================================================================

const cacheKey = (hospitalId) => `gmedhub-sub-status:${hospitalId}`

export function useSubscriptionLock(hospitalId) {
  const reload = useCallback(async () => {
    if (!hospitalId) return
    try {
      const sub = await getMySubscription(hospitalId)
      const status = sub?.status || null
      setLockFromStatus(status)
      try {
        if (status) localStorage.setItem(cacheKey(hospitalId), status)
        else localStorage.removeItem(cacheKey(hospitalId))
      } catch {}
    } catch (err) {
      // Offline / temporary error: keep whatever we already know.
      console.warn('Subscription lock status could not refresh:', err?.message || err)
    }
  }, [hospitalId])

  useEffect(() => {
    if (!hospitalId) {
      clearLock()
      return undefined
    }

    // 1) Start from the last known status (works offline).
    try {
      const cached = localStorage.getItem(cacheKey(hospitalId))
      if (cached) setLockFromStatus(cached)
    } catch {}

    // 2) Then confirm with the database.
    reload()

    const timer = setInterval(reload, 5 * 60 * 1000)
    const onOnline = () => reload()
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearLock()
    }
  }, [hospitalId, reload])

  // Instant update when the subscription row changes on the server.
  useRealtimeAlert('subscriptions', hospitalId, reload, { event: 'UPDATE' })
}
