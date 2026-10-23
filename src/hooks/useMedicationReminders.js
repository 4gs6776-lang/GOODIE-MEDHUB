import { useState, useEffect, useMemo } from 'react'
import { useOfflineTable } from '../lib/useOfflineTable'

// =====================================================================
// GOODIE-MEDHUB — useMedicationReminders hook
//
// Computes when each active prescription's next dose is due, based on
// the prescription's frequency + the last administered_at time.
//
// Returns:
//   { dueIn2Min: [...], dueNow: [...] }
//
// - dueIn2Min: prescriptions whose next dose is within 2 minutes
// - dueNow: prescriptions whose next dose time has passed (overdue)
//
// Polls every 30 seconds.
// =====================================================================

const POLL_INTERVAL_MS = 30000
const TWO_MINUTES_MS = 2 * 60 * 1000

// Parse a frequency string into an interval in milliseconds.
// Returns null if the frequency can't be parsed.
function parseFrequencyToInterval(frequency) {
  if (!frequency) return null
  const f = String(frequency).toLowerCase().trim()

  // "Every X hours"
  const everyHours = f.match(/every\s+(\d+(?:\.\d+)?)\s*hours?/)
  if (everyHours) {
    const hours = parseFloat(everyHours[1])
    return hours * 60 * 60 * 1000
  }

  // "Once daily (OD)" → 24 hours
  if (/once daily|od\b/.test(f)) return 24 * 60 * 60 * 1000

  // "Twice daily (BD)" → 12 hours
  if (/twice daily|bd\b/.test(f)) return 12 * 60 * 60 * 1000

  // "Three times daily (TDS)" → 8 hours
  if (/three times daily|tds\b/.test(f)) return 8 * 60 * 60 * 1000

  // "Four times daily (QDS)" → 6 hours
  if (/four times daily|qds\b/.test(f)) return 6 * 60 * 60 * 1000

  // "Every 4 hours", "Every 6 hours" etc. already handled above,
  // but also check "Every X hrs"
  const everyHrs = f.match(/every\s+(\d+)\s*hrs?/)
  if (everyHrs) return parseInt(everyHrs[1]) * 60 * 60 * 1000

  // "STAT" → due immediately (1 second interval, so it always fires)
  if (/^stat\b/.test(f)) return 1000

  // "At bedtime (Nocte)" → due at 10 PM (not interval-based, but we
  // approximate: if no dose has been given today, due at 22:00 local)
  if (/nocte|bedtime/.test(f)) return 24 * 60 * 60 * 1000

  // "When required (PRN)" → no scheduled reminder
  if (/when required|prn/.test(f)) return null

  // "Weekly" → 7 days
  if (/weekly/.test(f)) return 7 * 24 * 60 * 60 * 1000

  // "Before meals" / "After meals" → assume TDS (3x daily)
  if (/before meals|after meals/.test(f)) return 8 * 60 * 60 * 1000

  return null
}

export function useMedicationReminders(hospitalId) {
  const { records: prescriptions } = useOfflineTable('prescriptions', hospitalId)
  const { records: medAdmins } = useOfflineTable('medication_administrations', hospitalId)
  const [now, setNow] = useState(Date.now())

  // Poll every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const { dueIn2Min, dueNow } = useMemo(() => {
    const active = prescriptions.filter(p => p.status === 'active')
    const soon = []
    const overdue = []

    for (const rx of active) {
      const interval = parseFrequencyToInterval(rx.frequency)
      if (!interval || interval <= 0) continue

      // Find the last administration for this prescription
      const adminRecords = medAdmins
        .filter(a => a.prescription_id === rx.id)
        .sort((a, b) => new Date(b.administered_at || b.created_at) - new Date(a.administered_at || a.created_at))
      const lastAdmin = adminRecords[0]

      // Compute next dose time
      let nextDoseTime
      if (lastAdmin?.administered_at) {
        nextDoseTime = new Date(lastAdmin.administered_at).getTime() + interval
      } else if (rx.prescribed_at) {
        // No doses given yet — next dose is the prescribed_at time + interval
        nextDoseTime = new Date(rx.prescribed_at).getTime() + interval
      } else {
        continue
      }

      const msUntilDose = nextDoseTime - now

      if (msUntilDose <= 0 && msUntilDose > -interval) {
        // Overdue (within one interval — older than that means it was
        // likely already given but not recorded, so we stop nagging)
        overdue.push({
          ...rx,
          nextDoseTime: new Date(nextDoseTime).toISOString(),
          msUntilDose,
        })
      } else if (msUntilDose <= TWO_MINUTES_MS && msUntilDose > 0) {
        // Due within 2 minutes
        soon.push({
          ...rx,
          nextDoseTime: new Date(nextDoseTime).toISOString(),
          msUntilDose,
        })
      }
    }

    return { dueIn2Min: soon, dueNow: overdue }
  }, [prescriptions, medAdmins, now])

  return { dueIn2Min, dueNow }
}
