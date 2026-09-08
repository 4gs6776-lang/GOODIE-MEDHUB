import AppIcon from '../icons'

// =====================================================================
// GOODIE-MEDHUB — ConnectionState (Stage 1, requirement #14)
//
// ONE chip that tells the truth about connectivity + sync. It wraps the
// status every useOfflineTable caller already has (isOnline, pendingCount)
// plus the stuck-item count from getAllSyncErrors(), and maps it to the
// approved state vocabulary:
//
//   Online    → "Synced"    (online, nothing pending, no failures)
//   Syncing   → "Syncing…"  (online, queue draining)
//   Pending   → "Pending sync" (offline, unsent local changes — data is
//                              safe locally, NOT on the server)
//   Offline   → "Offline"   (offline, nothing unsaved)
//   Failed    → "Sync failed (n)" (server refused items — needs attention)
//
// It never claims something is synchronized when it is not: any pending
// or failed item forces the state away from "Synced".
//
// Optional onRetry() makes the chip clickable when items are stuck.
// =====================================================================

function deriveState({ isOnline, pendingCount, failedCount, connecting }) {
  if (connecting) return { key: 'connecting', label: 'Connecting…', cls: 'is-syncing' }
  if (!isOnline) {
    return pendingCount > 0
      ? { key: 'pending', label: `Pending sync (${pendingCount})`, cls: 'is-pending' }
      : { key: 'offline', label: 'Offline', cls: 'is-offline' }
  }
  if (failedCount > 0) {
    return { key: 'failed', label: `Sync failed (${failedCount})`, cls: 'is-failed' }
  }
  if (pendingCount > 0) {
    return { key: 'syncing', label: 'Syncing…', cls: 'is-syncing' }
  }
  return { key: 'synced', label: 'Synced', cls: 'is-synced' }
}

const STATE_ICONS = {
  connecting: 'connecting',
  syncing: 'refresh',
  pending: 'upload',
  offline: 'wifiOff',
  failed: 'alert',
  synced: 'check',
}

const STATE_TITLES = {
  connecting: 'Reaching the server…',
  syncing: 'Saving local changes to the server…',
  pending: "You're offline. Unsent changes are safe on this device and will upload when reconnected — they are NOT on the server yet.",
  offline: "You're offline. The app keeps working from local data.",
  failed: 'Some changes were refused by the server and need attention. Click to review.',
  synced: 'Everything on this screen matches the server.',
}

export default function ConnectionState({
  isOnline,
  pendingCount = 0,
  failedCount = 0,
  connecting = false,
  onRetry,
  style,
}) {
  const state = deriveState({ isOnline, pendingCount, failedCount, connecting })
  const clickable = typeof onRetry === 'function' && (state.key === 'failed' || state.key === 'pending')

  return (
    <span
      className={`conn-state ${state.cls}${clickable ? ' clickable' : ''}`}
      title={STATE_TITLES[state.key]}
      role="status"
      aria-live="polite"
      onClick={clickable ? onRetry : undefined}
      style={style}
    >
      <span className="conn-dot" aria-hidden="true" />
      <AppIcon
        name={STATE_ICONS[state.key]}
        size={13}
        spin={state.key === 'syncing' || state.key === 'connecting'}
      />
      {/* .conn-label lets the phone topbar compress the harmless
          "Synced" text to dot+icon only (see components.css). */}
      <span className="conn-label">{state.label}</span>
    </span>
  )
}
