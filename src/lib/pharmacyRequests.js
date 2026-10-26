// Counting rules for pharmacy requests (kept in one place so the request pop-up
// and the pharmacist's screen can never disagree).
//
// A doctor types the prescribed quantity as free text ("21 tabs", "1 bottle").
// We read the FIRST whole number in it. If there is no usable number
// ("as needed", "2.5 ml"), the quantity is treated as "not counted" (null) and
// requests are still allowed, just not subtracted.

export function parseRxQuantity(text) {
  const match = String(text ?? '').match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isInteger(n) && n > 0 ? n : null
}

// How many units a request counts for: cancelled = 0, dispensed = what was
// really given (if the pharmacist changed it), otherwise what was asked for.
export function effectiveQty(request) {
  if (!request || request.status === 'cancelled') return 0
  const asked = Number(request.quantity) || 0
  if (request.status === 'dispensed') {
    const given = Number(request.dispensed_quantity)
    return Number.isFinite(given) && given > 0 ? given : asked
  }
  return asked
}

// { total, requested, remaining } for one prescription. total/remaining are
// null when the prescribed quantity cannot be counted.
export function rxSummary(prescription, requests) {
  const total = parseRxQuantity(prescription?.quantity)
  const requested = (requests || [])
    .filter((r) => r.prescription_id === prescription?.id)
    .reduce((sum, r) => sum + effectiveQty(r), 0)
  return { total, requested, remaining: total == null ? null : total - requested }
}
