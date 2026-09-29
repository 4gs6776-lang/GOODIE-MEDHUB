import { useCallback, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { getMySubscription } from './subscriptions'
import { useRealtimeAlert } from './useRealtimeAlert'
import { setLockFromStatus, clearLock } from './subscriptionLock'
import { setEntitlements, setUsage, clearEntitlements, getLimit, getEntitlements } from './planEntitlements'

// =====================================================================
// GOODIE-MEDHUB — keeps the write lock AND the plan entitlements in sync
// with the database.
//
// Runs for EVERY hospital role (doctor, nurse, cashier...), not just the
// admin, because both the lock and the plan rules apply to everyone.
//
// It only READS the stored subscription — it never works out or changes
// a status (the daily database job and the owner decide that).
//
// Freshness: on load, instantly when the subscription row changes
// (realtime), when the device comes back online, when the tab is
// re-opened, and every 5 minutes as a safety net.
//
// Offline: the last known subscription is remembered on the device. If
// nothing is known and the database can't be reached, the app stays
// UNLOCKED and UNLIMITED (fail-open) — never a mistaken lock-out.
// =====================================================================

const cacheKey = (hospitalId) => `gmedhub-sub-cache:${hospitalId}`
const oldCacheKey = (hospitalId) => `gmedhub-sub-status:${hospitalId}` // from the first lock release

function applyKnown({ status, planSlug, limits }) {
  setLockFromStatus(status)
  setEntitlements({ planSlug, status, limits })
}

async function countRows(build) {
  const { count, error } = await build
  if (error) throw error
  return count
}

export function useSubscriptionLock(hospitalId) {
  const reload = useCallback(async () => {
    if (!hospitalId) return
    try {
      const sub = await getMySubscription(hospitalId)
      const known = {
        status: sub?.status || null,
        planSlug: sub?.plan?.slug || null,
        limits: sub?.plan?.limits || null,
      }
      applyKnown(known)
      try {
        if (sub) localStorage.setItem(cacheKey(hospitalId), JSON.stringify(known))
        else localStorage.removeItem(cacheKey(hospitalId))
        localStorage.removeItem(oldCacheKey(hospitalId))
      } catch {}
    } catch (err) {
      // Offline / temporary error: keep whatever we already know.
      console.warn('Subscription status could not refresh:', err?.message || err)
      return
    }

    // Usage numbers (only worth fetching if the plan has a limit).
    // A failure here just means "unknown", which never blocks anything.
    try {
      const needPatients = getLimit('patients') !== null
      const needStaff = getLimit('staff') !== null
      if (!needPatients && !needStaff) return
      const [patients, staff] = await Promise.all([
        needPatients
          ? countRows(supabase.from('patients').select('id', { count: 'exact', head: true }).eq('hospital_id', hospitalId).is('deleted_at', null))
          : Promise.resolve(null),
        needStaff
          ? countRows(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('hospital_id', hospitalId).or('active.is.null,active.eq.true'))
          : Promise.resolve(null),
      ])
      setUsage({ patients, staff })
    } catch (err) {
      console.warn('Plan usage could not refresh:', err?.message || err)
    }
  }, [hospitalId])

  useEffect(() => {
    if (!hospitalId) {
      clearLock()
      clearEntitlements()
      return undefined
    }

    // 1) Start from the last known subscription (works offline).
    try {
      const cached = localStorage.getItem(cacheKey(hospitalId))
      if (cached) {
        applyKnown(JSON.parse(cached))
      } else {
        const old = localStorage.getItem(oldCacheKey(hospitalId))
        if (old) applyKnown({ status: old, planSlug: null, limits: null })
      }
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
      clearEntitlements()
    }
  }, [hospitalId, reload])

  // Instant update when the subscription row changes on the server
  // (plan changed, renewed, suspended...).
  useRealtimeAlert('subscriptions', hospitalId, reload, { event: 'UPDATE' })
}
