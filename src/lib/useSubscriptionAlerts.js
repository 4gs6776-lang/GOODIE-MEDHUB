import { useCallback, useEffect, useState } from 'react'
import {
  getMySubscription,
  getMyUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  formatPlainDate,
} from './subscriptions'
import { useRealtimeAlert } from './useRealtimeAlert'

// =====================================================================
// GOODIE-MEDHUB — Subscription alerts for the hospital dashboard
//
// Gives the Dashboard two things:
//   1. the hospital's current subscription (for the top banner), and
//   2. its unread subscription notifications (for the bell).
//
// Both refresh INSTANTLY when the owner changes something (payment
// approved, plan changed, suspended...) thanks to realtime — no page
// refresh needed. The status shown always comes from the database;
// this hook never works out or extends a status on its own.
//
// If the app is offline, the last values loaded are kept and shown
// (nothing is invented) and they refresh when the connection returns.
//
// `enabled` is false for non-admin staff: subscription and billing
// alerts are only shown to a hospital's admin, who can act on them.
// =====================================================================

export function useSubscriptionAlerts(hospitalId, enabled) {
  const [subscription, setSubscription] = useState(null)
  const [notifications, setNotifications] = useState([])

  const reload = useCallback(async () => {
    if (!enabled || !hospitalId) return
    try {
      const [sub, unread] = await Promise.all([
        getMySubscription(hospitalId),
        getMyUnreadNotifications(hospitalId),
      ])
      setSubscription(sub)
      setNotifications(unread)
    } catch (err) {
      // Offline or a temporary error: keep showing the last known values.
      console.warn('Subscription alerts could not refresh:', err?.message || err)
    }
  }, [hospitalId, enabled])

  useEffect(() => { reload() }, [reload])

  // Live updates. Passing table = null switches a listener off.
  useRealtimeAlert(enabled ? 'notifications' : null, hospitalId, reload)
  useRealtimeAlert(enabled ? 'subscriptions' : null, hospitalId, reload, { event: 'UPDATE' })

  const markRead = useCallback(async (id) => {
    setNotifications(list => list.filter(n => n.id !== id)) // instant, then confirm
    try {
      await markNotificationRead(id)
    } catch (err) {
      console.warn('Could not mark notification read:', err?.message || err)
      reload()
    }
  }, [reload])

  const markAllRead = useCallback(async () => {
    setNotifications([])
    try {
      await markAllNotificationsRead(hospitalId)
    } catch (err) {
      console.warn('Could not mark notifications read:', err?.message || err)
      reload()
    }
  }, [hospitalId, reload])

  return { subscription, notifications, markRead, markAllRead, reload }
}

// ---------------------------------------------------------------------
// Banner text. Returns null when there is nothing worth interrupting
// the admin for (e.g. an active subscription with plenty of time left).
// `todayKey` is today's date IN THE HOSPITAL'S TIMEZONE ('YYYY-MM-DD'),
// so "days left" matches the same clock the daily status check uses.
// This only DESCRIBES the status stored in the database — it never
// decides it.
// ---------------------------------------------------------------------
function daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

function inDays(n) {
  if (n <= 0) return 'today'
  return `in ${n} day${n === 1 ? '' : 's'}`
}

export function getSubscriptionBanner(sub, todayKey) {
  if (!sub || !todayKey) return null

  switch (sub.status) {
    case 'trialing': {
      if (!sub.trial_end) return null
      const days = daysBetween(todayKey, sub.trial_end)
      if (days > 7) return null
      return {
        tone: 'warning',
        title: 'Free trial ending soon',
        text: `Your free trial ends ${inDays(days)} (${formatPlainDate(sub.trial_end)}). Choose a plan to avoid interruption.`,
      }
    }
    case 'active': {
      if (!sub.current_period_end) return null
      const days = daysBetween(todayKey, sub.current_period_end)
      if (days > 7) return null
      return {
        tone: 'warning',
        title: 'Subscription ending soon',
        text: `Your subscription ends ${inDays(days)} (${formatPlainDate(sub.current_period_end)}). Renew to stay covered.`,
      }
    }
    case 'past_due':
      return { tone: 'warning', title: 'Payment due', text: 'Your subscription payment is due. Please renew.' }
    case 'grace_period':
      return {
        tone: 'warning',
        title: 'Subscription expired — grace period',
        text: `Renew by ${formatPlainDate(sub.grace_period_end)} to avoid restrictions.`,
      }
    case 'expired':
      return { tone: 'critical', title: 'Subscription expired', text: 'Your subscription has expired. Please renew.' }
    case 'suspended':
      return { tone: 'critical', title: 'Subscription suspended', text: 'Your subscription is suspended. Contact GOODIE-MEDHUB support.' }
    case 'cancelled':
      return { tone: 'critical', title: 'Subscription cancelled', text: 'Choose a plan to reactivate your subscription.' }
    default:
      return null
  }
}
