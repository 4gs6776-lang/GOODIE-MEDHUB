import { useMemo } from 'react'
import Autocomplete from './Autocomplete'
import { calculateAge } from '../../lib/datetime'

// =====================================================================
// PatientAutocomplete — THE shared patient selector (global rule).
//
// Wraps the generic Autocomplete with patient-specific option shaping:
//   label    full name
//   sublabel MRN/patient ID · phone   (distinguishes similar names)
//   right    age · sex
// Search matches against name, ID and phone (the sublabel is part of
// the haystack), so "Ada", "0042" and "0803" all find their patient.
//
// Props:
//   patients  array of patient rows (any superset of the fields below)
//   value     selected option object | null   (from this component)
//   onChange  (option | null) => void  — option.patient is the raw row
//   loading / error / onRetry passed through to Autocomplete
// =====================================================================

export default function PatientAutocomplete({
  patients = [],
  value,
  onChange,
  loading = false,
  error = '',
  onRetry,
  placeholder = 'Search patient by name, ID or phone…',
  emptyText = 'No matching patient — check the spelling or register them first',
  ariaLabel = 'Patient',
}) {
  const options = useMemo(() => patients
    // Section 7: alphabetical A-Z is the system-wide default for patient lists.
    // Secondary sort by patient_id (stable for identical names). Applied here
    // so every patient selector across the app (Reception, Doctor Workbench,
    // Billing → Create Invoice, Appointments, etc.) shows the same order.
    .slice()
    .sort((a, b) => {
      const nameA = (a.full_name || '').trim().toLowerCase()
      const nameB = (b.full_name || '').trim().toLowerCase()
      if (nameA < nameB) return -1
      if (nameA > nameB) return 1
      return (a.id || '').localeCompare(b.id || '')
    })
    .map(p => {
    const mrn = p.patient_id || p.hospital_number || ''
    const phone = p.phone || ''
    const sublabel = [mrn && `MRN ${mrn}`, phone].filter(Boolean).join(' · ')
    const age = p.age ?? (p.date_of_birth ? calculateAge(p.date_of_birth) : null)
    const rightBits = [age != null ? `${age}y` : null, p.gender].filter(Boolean)
    return {
      id: p.id,
      label: p.full_name || 'Unnamed patient',
      sublabel,
      right: rightBits.join(' · '),
      patient: p,
    }
  }), [patients])

  return (
    <Autocomplete
      options={options}
      value={value}
      onChange={onChange}
      loading={loading}
      error={error}
      onRetry={onRetry}
      placeholder={placeholder}
      emptyText={emptyText}
      ariaLabel={ariaLabel}
    />
  )
}
