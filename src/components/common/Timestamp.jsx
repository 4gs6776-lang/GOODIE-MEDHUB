import {
  formatDate,
  formatTime,
  formatDateTime,
  formatDateTimeSec,
  formatMonthYear,
  formatWeekdayDate,
  relativeTime,
  getTimezone,
  DEFAULT_TIMEZONE,
} from '../../lib/datetime'

// =====================================================================
// Timestamp — the ONE component for displaying record dates/times.
//
// <Timestamp iso={row.created_at} hospital={hospital} />
//   → "06 Sep 2026, 2:32 PM" with the exact value (incl. seconds and
//     timezone) available via tooltip, so a human can always recover
//     the precise moment, not just a rounded label.
//
// mode:
//   "datetime" (default) — date + time
//   "date"               — date only (DOB, booking dates)
//   "time"               — time only
//   "seconds"            — date + time + seconds (payments, audit)
//   "month"              — "Sep 2026" group headers
//   "weekday"            — "Monday, 06 September 2026" banners
//
// relative: prepend a supplementary "5m ago" style label. The exact
// timestamp is ALWAYS still shown, so relative labels are never the
// only source of truth (Stage 1 requirement #11).
// =====================================================================

const FORMATTERS = {
  datetime: formatDateTime,
  date: formatDate,
  time: formatTime,
  seconds: formatDateTimeSec,
  month: formatMonthYear,
  weekday: formatWeekdayDate,
}

export default function Timestamp({
  iso,
  hospital,
  timezone,
  mode = 'datetime',
  relative = false,
  fallback = '—',
  style,
  className,
}) {
  if (!iso) {
    return <span style={style} className={className}>{fallback}</span>
  }

  const tz = timezone || getTimezone(hospital) || DEFAULT_TIMEZONE
  const formatter = FORMATTERS[mode] || formatDateTime
  const exact = formatDateTimeSec(iso, tz)
  const display = formatter(iso, tz)

  return (
    <span style={style} className={className} title={`${exact} (${tz})`}>
      {relative ? `${relativeTime(iso)} · ${display}` : display}
    </span>
  )
}
