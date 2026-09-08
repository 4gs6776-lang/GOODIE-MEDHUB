// =====================================================================
// GOODIE-MEDHUB — Centralized date/time utility (Stage 1)
//
// Every module MUST format dates/times through this file instead of
// scattering toLocaleString()/toLocaleDateString() calls (there were 57
// of them across 18 files, none timezone-aware).
//
// Why this matters:
//  - Clinical records must always be traceable to an exact date AND
//    time, never only a relative label like "5 minutes ago".
//  - The hospital's timezone is configurable (hospitals.timezone,
//    added by migration 007). One change here updates every screen.
//
// All helpers take an ISO timestamp (or anything Date can parse) and an
// IANA timezone string. Passing `undefined` as the timezone falls back
// to Africa/Lagos — the value the app already assumed before Stage 1,
// so existing screens keep displaying the same wall-clock time.
// =====================================================================

export const DEFAULT_TIMEZONE = 'Africa/Lagos'

// Returns the timezone configured for a hospital (hospitals.timezone).
export function getTimezone(hospital) {
  return hospital?.timezone || DEFAULT_TIMEZONE
}

function toDate(iso) {
  if (!iso) return null
  const date = iso instanceof Date ? iso : new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

// ---------------------------------------------------------------------
// Formatters (created lazily and cached per timezone — Intl construction
// is expensive and some lists render hundreds of timestamps).
// ---------------------------------------------------------------------
const formatterCache = new Map()

function getFormatter(timezone, options) {
  const key = timezone + '|' + JSON.stringify(options)
  let fmt = formatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, ...options })
    formatterCache.set(key, fmt)
  }
  return fmt
}

// "06 Sep 2026" — for date-only fields (DOB, booking dates, EDD…).
export function formatDate(iso, timezone = DEFAULT_TIMEZONE) {
  const date = toDate(iso)
  if (!date) return '—'
  return getFormatter(timezone, {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date)
}

// "06 Sep 2026" for a pure calendar string "2026-09-06" — date columns
// like date_of_birth, anc_lmp, anc_edd, handover_date. Deliberately NO
// timezone math: a date-only value has no instant attached, so pushing
// it through a timezone conversion could shift it a day in either
// direction. Falls back to formatDate() for any other shape.
export function formatDateOnly(dateStr) {
  if (!dateStr) return '—'
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`
  }
  return formatDate(dateStr)
}

// "2:32 PM" — time only.
export function formatTime(iso, timezone = DEFAULT_TIMEZONE) {
  const date = toDate(iso)
  if (!date) return '—'
  return getFormatter(timezone, {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date)
}

// "06 Sep 2026, 2:32 PM" — the standard for clinical/event timestamps.
export function formatDateTime(iso, timezone = DEFAULT_TIMEZONE) {
  const date = toDate(iso)
  if (!date) return '—'
  return getFormatter(timezone, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date)
}

// "06 Sep 2026, 2:32:07 PM" — for audit-grade records where seconds
// matter (payments, cancellations, medication administration…).
export function formatDateTimeSec(iso, timezone = DEFAULT_TIMEZONE) {
  const date = toDate(iso)
  if (!date) return '—'
  return getFormatter(timezone, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(date)
}

// "Sep 2026" — month headers/groupings (rosters, reports).
export function formatMonthYear(iso, timezone = DEFAULT_TIMEZONE) {
  const date = toDate(iso)
  if (!date) return '—'
  return getFormatter(timezone, {
    month: 'short', year: 'numeric',
  }).format(date)
}

// "Monday, 06 September 2026" — the dashboard clock / date banners.
export function formatWeekdayDate(iso, timezone = DEFAULT_TIMEZONE) {
  const date = toDate(iso)
  if (!date) return '—'
  return getFormatter(timezone, {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(date)
}

// ---------------------------------------------------------------------
// Relative time — SUPPLEMENTARY ONLY.
// Never use this as the only label for a clinical event: pair it with
// the exact timestamp (see <Timestamp relative /> or title attributes).
// ---------------------------------------------------------------------
export function relativeTime(iso) {
  const date = toDate(iso)
  if (!date) return ''

  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 0) return 'just now'
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return formatDate(date)
}

// Compact queue-style relative time ("12m", "3h 05m") used on queue
// cards where a full "x hours y minutes ago" would not fit. Again:
// supplementary — the exact time is shown alongside it.
export function relativeShort(iso) {
  const date = toDate(iso)
  if (!date) return ''

  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

// ---------------------------------------------------------------------
// Date-only helpers that keep working regardless of timezone
// ---------------------------------------------------------------------

// Local-calendar day key "2026-09-06" in the hospital's timezone —
// use for "is this record from today?" comparisons instead of
// toDateString() (which silently uses the viewer's device timezone).
export function dayKeyInZone(iso, timezone = DEFAULT_TIMEZONE) {
  const date = toDate(iso)
  if (!date) return null
  return getFormatter(timezone, {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
    .format(date)
    .split('/')
    .reverse()
    .join('-')
}

export function todayKeyInZone(timezone = DEFAULT_TIMEZONE) {
  return dayKeyInZone(new Date(), timezone)
}

// Age in whole years from a date-of-birth (no timezone dependence).
export function calculateAge(dobIso) {
  const dob = toDate(dobIso)
  if (!dob) return ''
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1
  }
  return String(age)
}
