import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSubscriptionLock } from '../lib/useSubscriptionLock'
import { getLockState, subscribeLock, WRITE_BLOCKED_EVENT } from '../lib/subscriptionLock'

// =====================================================================
// GOODIE-MEDHUB — "Read-only mode" bar
//
// Mounted once in App.jsx. It does two jobs:
//   1. Starts the lock hook for the signed-in hospital user
//      (the platform owner has no hospital, so nothing happens for them).
//   2. While the hospital is locked, shows a bar at the bottom of the
//      screen so staff understand WHY saving is refused. When someone
//      tries to save and is blocked, the bar briefly highlights.
//
// It renders NOTHING when the hospital is not locked.
// =====================================================================

export default function SubscriptionLockNotice() {
  const auth = useAuth()
  const profile = auth?.profile
  const hospital = auth?.hospital
  const hospitalId = profile?.role === 'owner' ? null : hospital?.id

  useSubscriptionLock(hospitalId)
  const lock = useSyncExternalStore(subscribeLock, getLockState, getLockState)

  const [flash, setFlash] = useState(false)
  useEffect(() => {
    let timer
    const onBlocked = () => {
      setFlash(true)
      clearTimeout(timer)
      timer = setTimeout(() => setFlash(false), 6000)
    }
    window.addEventListener(WRITE_BLOCKED_EVENT, onBlocked)
    return () => {
      clearTimeout(timer)
      window.removeEventListener(WRITE_BLOCKED_EVENT, onBlocked)
    }
  }, [])

  if (!lock.locked) return null

  const suspended = lock.status === 'suspended'
  const isAdmin = profile?.role === 'admin'

  const title = suspended ? 'Read-only mode — subscription suspended' : 'Read-only mode — subscription expired'
  const action = isAdmin
    ? (suspended ? 'Contact GOODIE-MEDHUB support.' : 'Open Subscription in the menu to renew.')
    : 'Please ask your hospital admin.'

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))',
        background: flash ? 'var(--danger, #e1685e)' : 'var(--surface, #1b1f24)',
        color: flash ? '#fff' : 'var(--text, #f2f2f2)',
        borderTop: '2px solid var(--danger, #e1685e)',
        fontSize: 13,
        lineHeight: 1.4,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.35)',
        transition: 'background 0.2s',
      }}
    >
      <strong>{title}.</strong>{' '}
      {flash ? 'That change was NOT saved. ' : 'You can still view records, chart medication and record vitals. '}
      {action}
    </div>
  )
}
