import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSubscriptionLock } from '../lib/useSubscriptionLock'
import { getLockState, subscribeLock, WRITE_BLOCKED_EVENT } from '../lib/subscriptionLock'
import { getEntitlements, subscribeEntitlements, getLimitWarnings } from '../lib/planEntitlements'

// =====================================================================
// GOODIE-MEDHUB — bottom bar for subscription state
//
// Mounted once in App.jsx. It does three jobs:
//   1. Starts the lock/plan hook for the signed-in hospital user
//      (the platform owner has no hospital, so nothing happens for them).
//   2. While the hospital is locked (expired/suspended) it shows a red
//      "Read-only mode" bar. If someone tries to save and is blocked,
//      the bar turns solid red and says the change was NOT saved.
//   3. When NOT locked, the hospital ADMIN (only) sees an amber bar once
//      staff or patients reach 90% of the plan limit, with a dismiss (x).
//
// It renders NOTHING when there is nothing to say.
// =====================================================================

const barBase = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 9999,
  padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))',
  fontSize: 13,
  lineHeight: 1.4,
  boxShadow: '0 -4px 16px rgba(0,0,0,0.35)',
  transition: 'background 0.2s',
}

const KIND_LABEL = { patients: 'patients', staff: 'staff accounts' }

export default function SubscriptionLockNotice() {
  const auth = useAuth()
  const profile = auth?.profile
  const hospital = auth?.hospital
  const hospitalId = profile?.role === 'owner' ? null : hospital?.id

  useSubscriptionLock(hospitalId)
  const lock = useSyncExternalStore(subscribeLock, getLockState, getLockState)
  const ent = useSyncExternalStore(subscribeEntitlements, getEntitlements, getEntitlements)

  const [flash, setFlash] = useState(false)
  const [dismissedKey, setDismissedKey] = useState(null)

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

  const isAdmin = profile?.role === 'admin'

  // ---- Locked: red read-only bar (unchanged behaviour) ----
  if (lock.locked) {
    const suspended = lock.status === 'suspended'
    const title = suspended ? 'Read-only mode — subscription suspended' : 'Read-only mode — subscription expired'
    const action = isAdmin
      ? (suspended ? 'Contact GOODIE-MEDHUB support.' : 'Open Subscription in the menu to renew.')
      : 'Please ask your hospital admin.'
    return (
      <div
        role="status"
        style={{
          ...barBase,
          background: flash ? 'var(--danger, #e1685e)' : 'var(--surface, #1b1f24)',
          color: flash ? '#fff' : 'var(--text, #f2f2f2)',
          borderTop: '2px solid var(--danger, #e1685e)',
        }}
      >
        <strong>{title}.</strong>{' '}
        {flash ? 'That change was NOT saved. ' : 'You can still view records, chart medication and record vitals. '}
        {action}
      </div>
    )
  }

  // ---- Not locked: admin-only plan-limit warning ----
  if (!isAdmin) return null
  const warnings = getLimitWarnings(ent)
  if (warnings.length === 0) return null

  const key = warnings.map((w) => `${w.kind}:${w.level}:${w.limit}`).join('|')
  if (dismissedKey === key) return null

  const text = warnings
    .map((w) => `${w.used} of ${w.limit} ${KIND_LABEL[w.kind]} used${w.level === 'reached' ? ' (limit reached)' : ''}`)
    .join(' · ')
  const reached = warnings.some((w) => w.level === 'reached')

  return (
    <div
      role="status"
      style={{
        ...barBase,
        background: 'var(--surface, #1b1f24)',
        color: 'var(--text, #f2f2f2)',
        borderTop: `2px solid ${reached ? 'var(--danger, #e1685e)' : 'var(--gold, #c9a961)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ flex: 1 }}>
        <strong>Plan limit {reached ? 'reached' : 'almost reached'}.</strong> {text}. Open Subscription in the menu to upgrade.
      </div>
      <button
        onClick={() => setDismissedKey(key)}
        aria-label="Dismiss"
        style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}
      >
        ×
      </button>
    </div>
  )
}
