import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'
import PatientAutocomplete from '../../components/common/PatientAutocomplete'
import Autocomplete from '../../components/common/Autocomplete'
import AppIcon from '../../components/icons'
import ConnectionState from '../../components/common/ConnectionState'
import Timestamp from '../../components/common/Timestamp'
import useMediaQuery from '../../lib/useMediaQuery'
import { writeAudit } from '../../lib/audit'
import {
  getTimezone,
  formatDate,
  formatTime,
  formatWeekdayDate,
  dayKeyInZone,
  todayKeyInZone,
} from '../../lib/datetime'
import { usePagination } from '../../lib/usePagination'
import Pagination from '../../components/common/Pagination'

// Tapping a status badge now only moves between sensible states:
//   scheduled -> completed, completed -> scheduled (correction),
//   cancelled -> scheduled (reinstate).
// CANCELLING is a separate, deliberate action (Cancel button) that asks
// for an optional reason, so a stray tap can never cancel a visit.
const STATUS_CYCLE = { scheduled: 'completed', completed: 'scheduled', cancelled: 'scheduled' }
const STATUS_LABEL = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLOR = { scheduled: 'var(--violet)', completed: 'var(--teal)', cancelled: 'var(--danger)' }
const STATUS_BG = { scheduled: 'rgba(139,124,246,0.14)', completed: 'var(--teal-soft)', cancelled: 'var(--danger-soft)' }
const DURATIONS = [15, 30, 45, 60, 90]

// ---------------------------------------------------------------------
// Keeping the user's place (preserve-user-work rule)
//
// Dashboard removes this screen when you switch to another module, which
// used to wipe your search, view, day and any half-typed appointment.
// These two variables live OUTSIDE the component, so they survive
// leaving and coming back. They are kept in MEMORY ONLY (never written
// to localStorage/sessionStorage) because the half-typed form can hold a
// patient's name. A browser reload or sign-out clears them, and they are
// tagged with the hospital + user so another account never sees them.
// ---------------------------------------------------------------------
let screenState = null // { owner, searchTerm, viewMode, dayFilter, pageSize }
let formDraft = null   // { owner, open, patientOpt, doctorOpt, when, duration, notes }

function ownerKey(hospital, profile) {
  return `${hospital?.id || ''}:${profile?.id || ''}`
}

export default function Appointments({ initialSearch = '' }){
  const { profile, hospital } = useAuth()
  // Central timezone handling (Stage 1 req. #11)
  const hospitalTz = getTimezone(hospital)
  const { records: appointments, loading, isOnline, pendingCount, addRecord, updateRecord } = useOfflineTable('appointments', hospital?.id)
  // Registered patients and staff, from the same offline store the rest of
  // the app uses, so the pickers also work with no internet.
  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)
  const { records: staff, loading: loadingStaff } = useOfflineTable('profiles', hospital?.id)
  const owner = ownerKey(hospital, profile)
  const savedScreen = screenState && screenState.owner === owner ? screenState : null
  const savedDraft = formDraft && formDraft.owner === owner ? formDraft : null
  // Stage 2 QA (pair 1): phones re-flow the list into record cards instead
  // of squeezing a 5-column table (or force-scrolling it) into 320-430px.
  const isPhone = useMediaQuery('(max-width: 767px)')
  const [showModal, setShowModal] = useState(Boolean(savedDraft?.open))
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState(initialSearch || savedScreen?.searchTerm || '')
  useEffect(() => { if (initialSearch) setSearchTerm(initialSearch) }, [initialSearch])
  const [viewMode, setViewMode] = useState(savedScreen?.viewMode || 'all') // 'all' | 'day'
  const [dayFilter, setDayFilter] = useState(() => savedScreen?.dayFilter || todayKeyInZone(getTimezone(hospital)))

  // The picked patient/doctor are the option objects the pickers hand back.
  const [patientOpt, setPatientOpt] = useState(savedDraft?.patientOpt || null)
  const [doctorOpt, setDoctorOpt] = useState(savedDraft?.doctorOpt || null)
  const [when, setWhen] = useState(savedDraft?.when || '')
  const [duration, setDuration] = useState(savedDraft?.duration || '30')
  const [notes, setNotes] = useState(savedDraft?.notes || '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Cancel dialog (replaces the old permanent Delete).
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const doctorName = doctorOpt?.label || ''
  const formDirty = Boolean(patientOpt || doctorOpt || when || notes.trim() || duration !== '30')

  // Doctors for the picker: active staff whose role is doctor.
  const doctorOptions = useMemo(() => staff
    .filter(m => m.role === 'doctor' && m.active !== false)
    .map(m => ({ id: m.id, label: m.full_name || 'Unnamed doctor', sublabel: 'Doctor' })), [staff])

  // Remember the unfinished form while this screen is away (memory only).
  useEffect(() => {
    formDraft = (showModal || formDirty)
      ? { owner, open: showModal, patientOpt, doctorOpt, when, duration, notes }
      : null
  }, [owner, showModal, formDirty, patientOpt, doctorOpt, when, duration, notes])

  // Warn before a browser refresh/close would throw away typed work.
  useEffect(() => {
    if (!(showModal && formDirty)) return undefined
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [showModal, formDirty])

  function resetForm(){
    setPatientOpt(null); setDoctorOpt(null); setWhen(''); setDuration('30'); setNotes('')
    setFormError('')
  }

  function closeModal(){
    if (formDirty && !confirm('Discard this unfinished appointment?')) return
    resetForm()
    setShowModal(false)
  }

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function findConflict(doctor, startISO, durationMins){
    if (!doctor) return null
    const start = new Date(startISO)
    const end = new Date(start.getTime() + durationMins * 60000)
    return appointments.find(a => {
      if (a.status !== 'scheduled') return false
      if (!a.doctor_name || a.doctor_name.trim().toLowerCase() !== doctor.trim().toLowerCase()) return false
      const aStart = new Date(a.appointment_time)
      const aEnd = new Date(aStart.getTime() + (a.duration_minutes || 30) * 60000)
      return start < aEnd && aStart < end
    })
  }

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')
    if (!patientOpt?.patient) {
      setFormError('Choose a registered patient from the list.')
      return
    }
    if (!when) {
      setFormError('Date and time are required.')
      return
    }
    if (!hospital || !profile) {
      setFormError('Still loading your account — try again in a moment.')
      return
    }

    const patientRow = patientOpt.patient
    const durationMins = parseInt(duration, 10)
    const startISO = new Date(when).toISOString()
    const conflict = findConflict(doctorName, startISO, durationMins)
    if (conflict) {
      const conflictTime = formatTime(conflict.appointment_time, hospitalTz)
      const who = /^dr\.?\s/i.test(doctorName) ? doctorName : `Dr. ${doctorName}`
      setFormError(`${who} is already booked with ${conflict.patient_name} at ${conflictTime}. Choose another time.`)
      return
    }

    setSaving(true)
    try {
      const created = await addRecord({
        patient_name: patientRow.full_name,
        doctor_name: doctorName || null,
        appointment_time: startISO,
        duration_minutes: durationMins,
        status: 'scheduled',
        notes: notes || null,
        created_by: profile.id,
      })
      writeAudit({
        hospitalId: hospital?.id,
        actor: profile,
        action: 'appointment.create',
        entityType: 'appointment',
        entityId: created?.id || null,
        patientId: patientRow.id,
        summary: `Appointment booked for ${patientRow.full_name} on ${formatWhen(startISO)}${doctorName ? ` with ${doctorName}` : ''}`,
        metadata: { duration_minutes: durationMins },
      })
      resetForm()
      setShowModal(false)
      showToast(isOnline ? 'Appointment scheduled' : 'Appointment scheduled — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save appointment')
    } finally {
      setSaving(false)
    }
  }

  async function cycleStatus(appt){
    const newStatus = STATUS_CYCLE[appt.status]
    if (!newStatus) return
    try {
      await updateRecord(appt.id, { status: newStatus })
    } catch (err) {
      showToast(err.message || 'Could not change status')
      return
    }
    // Status changes are auditable clinical events.
    writeAudit({
      hospitalId: hospital?.id,
      actor: profile,
      action: 'appointment.status',
      entityType: 'appointment',
      entityId: appt.id,
      summary: `Appointment for ${appt.patient_name} marked ${STATUS_LABEL[newStatus]}`,
      metadata: { from: appt.status, to: newStatus },
    })
    showToast(isOnline ? `Marked ${STATUS_LABEL[newStatus]}` : `Marked ${STATUS_LABEL[newStatus]} — will sync when back online`)
  }

  // Appointments are never permanently deleted any more: cancelling keeps
  // the record (status "cancelled") and writes an audit event with the
  // reason, so there is always a history of what happened.
  function requestCancel(appt){
    setCancelReason('')
    setCancelTarget(appt)
  }

  async function confirmCancel(){
    const appt = cancelTarget
    if (!appt) return
    setCancelling(true)
    try {
      await updateRecord(appt.id, { status: 'cancelled' })
      writeAudit({
        hospitalId: hospital?.id,
        actor: profile,
        action: 'appointment.cancel',
        entityType: 'appointment',
        entityId: appt.id,
        summary: `Cancelled appointment for ${appt.patient_name} scheduled ${formatWhen(appt.appointment_time)}`,
        metadata: { from: appt.status, reason: cancelReason.trim() || null },
      })
      setCancelTarget(null)
      showToast(isOnline ? 'Appointment cancelled' : 'Appointment cancelled — will sync when back online')
    } catch (err) {
      showToast(err.message || 'Could not cancel appointment')
    } finally {
      setCancelling(false)
    }
  }

  const sorted = [...appointments].sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))
  const dayList = sorted.filter(a => dayKeyInZone(a.appointment_time, hospitalTz) === dayFilter)
  const visible = viewMode === 'day' ? dayList : sorted

  const appointmentSearch = searchTerm.trim().toLowerCase()
  const searchedSorted = appointmentSearch ? sorted.filter(a => [a.patient_name, a.patient_id, a.doctor_name, a.appointment_id, a.status].some(v => String(v || '').toLowerCase().includes(appointmentSearch))) : sorted
  const searchedDayList = appointmentSearch ? dayList.filter(a => [a.patient_name, a.patient_id, a.doctor_name, a.appointment_id, a.status].some(v => String(v || '').toLowerCase().includes(appointmentSearch))) : dayList
  const searchedVisible = viewMode === 'day' ? searchedDayList : searchedSorted

  // Global Pagination Rule — "All Appointments" is a flat chronological
  // list that can grow into the hundreds over time, so it gets paginated.
  // "Day View" (below) is deliberately left unpaginated: it only ever
  // shows one calendar day's appointments grouped by doctor, which is
  // naturally small — same reasoning as Beds Awaiting Cleaning in
  // Admissions.jsx. Both the desktop table and the phone card list for
  // "All Appointments" read from this same paged slice.
  const {
    pageItems: pagedAllAppointments, currentPage: allPage, setCurrentPage: setAllPage,
    pageSize: allPageSize, setPageSize: setAllPageSize,
    totalPages: allTotalPages, totalItems: allTotalItems,
    startIndex: allStart, endIndex: allEnd,
  } = usePagination(searchedSorted, { pageSize: savedScreen?.pageSize || 10, resetKey: appointmentSearch })

  // Remember search / view / day / page size while this screen is away.
  useEffect(() => {
    screenState = { owner, searchTerm, viewMode, dayFilter, pageSize: allPageSize }
  }, [owner, searchTerm, viewMode, dayFilter, allPageSize])

  const todayKey = todayKeyInZone(hospitalTz)
  const todayCount = sorted.filter(a => dayKeyInZone(a.appointment_time, hospitalTz) === todayKey).length
  const upcomingCount = sorted.filter(a => new Date(a.appointment_time) > new Date() && a.status === 'scheduled').length

  function formatWhen(iso){
    return `${formatDate(iso, hospitalTz)} · ${formatTime(iso, hospitalTz)}`
  }

  const byDoctor = {}
  if (viewMode === 'day') {
    searchedDayList.forEach(a => {
      const key = a.doctor_name || 'Unassigned'
      if (!byDoctor[key]) byDoctor[key] = []
      byDoctor[key].push(a)
    })
  }

  const searching = appointmentSearch.length > 0

  function EmptyNote({ children }){
    return (
      <div className="dash-empty-state">
        <AppIcon name={searching ? 'search' : 'calendar'} size={22} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.7 }} />
        {children}
      </div>
    )
  }

  /* One appointment record, two layouts. Desktop keeps the familiar table
     row; phones get a stacked card so nothing is squeezed into a 320px
     column (see render below). */
  function ApptCard({ appt, showDoctorInMeta, showDoctor = true }){
    const metaParts = [
      ...(showDoctorInMeta ? [formatDate(appt.appointment_time, hospitalTz)] : []),
      // Day view groups cards under the doctor's name — repeating the same
      // doctor inside every card meta wastes the narrow line, so the
      // caller can omit it (pair-1 QA).
      ...(showDoctor ? [appt.doctor_name || 'No doctor assigned'] : []),
      `${appt.duration_minutes || 30} min`,
    ]
    return (
      <div className="appt-card">
        <div className="appt-card-top">
          <span className="appt-card-time">{formatTime(appt.appointment_time, hospitalTz)}</span>
          <div className="appt-card-id-block">
            <div className="appt-card-name">{appt.patient_name}</div>
            <div className="appt-card-meta">{metaParts.join(' · ')}</div>
          </div>
        </div>
        {appt.notes && <div className="appt-card-notes">{appt.notes}</div>}
        <div className="appt-card-foot">
          <button
            type="button"
            className="appt-status-btn"
            onClick={() => cycleStatus(appt)}
            style={{ background: STATUS_BG[appt.status], color: STATUS_COLOR[appt.status] }}
            title="Tap to change status"
            aria-label={`Status ${STATUS_LABEL[appt.status]}. Tap to change it.`}
          >{STATUS_LABEL[appt.status]}</button>
          <span className="appt-card-id">{appt.appointment_id || appt.patient_id || ''}</span>
          {appt.status === 'scheduled' && (
            <button
              onClick={() => requestCancel(appt)}
              className="icon-btn-delete"
              title="Cancel appointment"
              aria-label={`Cancel appointment for ${appt.patient_name}`}
            ><AppIcon name="close" size={14} /></button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="dash-stats appointments-summary" style={{ marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
            <AppIcon name="calendar" size={20} />
          </div>
          <div>
            <div className="dash-stat-label">Today</div>
            <div className="dash-stat-value">{todayCount}</div>
            <div className="dash-stat-delta">appointment(s) today</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <AppIcon name="clock" size={20} />
          </div>
          <div>
            <div className="dash-stat-label">Upcoming</div>
            <div className="dash-stat-value">{upcomingCount}</div>
            <div className="dash-stat-delta">still scheduled</div>
          </div>
        </div>
      </div>

      <div className="appt-toolbar">
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search patient, doctor or appointment ID" style={{ minWidth: 220, maxWidth: 420 }} />
        <div className="appt-toggle-group" role="group" aria-label="Appointment view mode">
          <button
            onClick={() => setViewMode('all')}
            className={`btn appt-toggle${viewMode === 'all' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'all'}
          >All Appointments</button>
          <button
            onClick={() => setViewMode('day')}
            className={`btn appt-toggle${viewMode === 'day' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'day'}
          >Day View</button>
          {viewMode === 'day' && (
            <input
              type="date"
              className="dash-filter appt-date-filter"
              value={dayFilter}
              onChange={e => setDayFilter(e.target.value)}
              aria-label="Filter appointments by day"
            />
          )}
        </div>
      </div>

      {viewMode === 'day' ? (
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div style={{ minWidth: 0 }}>
              <div className="dash-panel-title">{formatWeekdayDate(dayFilter, hospitalTz)}</div>
              <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <ConnectionState isOnline={isOnline} pendingCount={pendingCount} />
                <span>Grouped by doctor</span>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
              <AppIcon name="plus" size={15} /> New Appointment
            </button>
          </div>

          {loading ? (
            <EmptyNote>Loading…</EmptyNote>
          ) : Object.keys(byDoctor).length === 0 ? (
            <EmptyNote>
              {searching ? 'No appointments match your search on this day.' : 'No appointments on this day.'}
            </EmptyNote>
          ) : (
            Object.entries(byDoctor).map(([doctor, list]) => (
              <div key={doctor} style={{ marginBottom: 18 }}>
                <div className="appt-doctor-head">
                  <span>{doctor}</span>
                  <span className="appt-doctor-count">{list.length}</span>
                </div>
                <div className="appt-list">
                  {list.sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)).map(appt => (
                    isPhone
                      ? <ApptCard key={appt.id} appt={appt} showDoctorInMeta={false} showDoctor={false} />
                      : (
                        <div key={appt.id} className="appt-day-row">
                          <span className="appt-day-time">{formatTime(appt.appointment_time, hospitalTz)}</span>
                          <span className="appt-day-name">{appt.patient_name}</span>
                          <button
                            type="button"
                            className="appt-status-btn"
                            onClick={() => cycleStatus(appt)}
                            style={{ background: STATUS_BG[appt.status], color: STATUS_COLOR[appt.status] }}
                            title="Tap to change status"
                            aria-label={`Status ${STATUS_LABEL[appt.status]}. Tap to change it.`}
                          >{STATUS_LABEL[appt.status]}</button>
                          {appt.status === 'scheduled' && (
                            <button
                              onClick={() => requestCancel(appt)}
                              className="icon-btn-delete"
                              title="Cancel appointment"
                              aria-label={`Cancel appointment for ${appt.patient_name}`}
                            ><AppIcon name="close" size={14} /></button>
                          )}
                        </div>
                      )
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div style={{ minWidth: 0 }}>
              <div className="dash-panel-title">Appointments</div>
              <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <ConnectionState isOnline={isOnline} pendingCount={pendingCount} />
                <span>Tap a status badge to change it</span>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
              <AppIcon name="plus" size={15} /> New Appointment
            </button>
          </div>

          {loading ? (
            <EmptyNote>Loading…</EmptyNote>
          ) : visible.length === 0 ? (
            <EmptyNote>No appointments yet. Add your first one above.</EmptyNote>
          ) : searchedVisible.length === 0 ? (
            <EmptyNote>No appointments match your search.</EmptyNote>
          ) : (
            <>
              {isPhone ? (
                <div className="appt-list">
                  {pagedAllAppointments.map(appt => <ApptCard key={appt.id} appt={appt} showDoctorInMeta />)}
                </div>
              ) : (
                <div className="dash-table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['When', 'Patient', 'Doctor', 'Status', ''].map(h => (
                          <th key={h || 'actions'} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedAllAppointments.map(appt => (
                        <tr key={appt.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                            <Timestamp iso={appt.appointment_time} timezone={hospitalTz} mode="datetime" />
                          </td>
                          <td style={{ padding: 12, fontWeight: 700 }}>{appt.patient_name}</td>
                          <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{appt.doctor_name || '—'}</td>
                          <td style={{ padding: 12 }}>
                            <button
                              type="button"
                              className="appt-status-btn"
                              onClick={() => cycleStatus(appt)}
                              style={{ background: STATUS_BG[appt.status], color: STATUS_COLOR[appt.status] }}
                              title="Tap to change status"
                              aria-label={`Status ${STATUS_LABEL[appt.status]}. Tap to change it.`}
                            >{STATUS_LABEL[appt.status]}</button>
                          </td>
                          <td style={{ padding: 12 }}>
                            {appt.status === 'scheduled' && (
                              <button
                                onClick={() => requestCancel(appt)}
                                className="icon-btn-delete"
                                title="Cancel appointment"
                                aria-label={`Cancel appointment for ${appt.patient_name}`}
                              ><AppIcon name="close" size={14} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Pagination
                currentPage={allPage}
                totalPages={allTotalPages}
                totalItems={allTotalItems}
                startIndex={allStart}
                endIndex={allEnd}
                pageSize={allPageSize}
                onPageChange={setAllPage}
                onPageSizeChange={setAllPageSize}
                itemLabel="appointments"
              />
            </>
          )}
        </div>
      )}

      {showModal && (
        /* Shared modal chrome: on phones this automatically becomes a
           bottom sheet with a scrollable body and pinned action row. */
        <div className="dash-modal-backdrop">
          <div className="card dash-modal">
            <div className="dash-modal-title">New Appointment</div>
            <form onSubmit={handleAdd} className="dash-modal-form">
              <div className="dash-modal-body">
                {formError && <div className="error-box">{formError}</div>}
                <div className="field">
                  <label htmlFor="appt-patient">Patient</label>
                  <PatientAutocomplete
                    patients={patients}
                    value={patientOpt}
                    onChange={setPatientOpt}
                    loading={loadingPatients && patients.length === 0}
                    ariaLabel="Patient"
                  />
                </div>
                <div className="field">
                  <label htmlFor="appt-doctor">Doctor (optional)</label>
                  <Autocomplete
                    options={doctorOptions}
                    value={doctorOpt}
                    onChange={setDoctorOpt}
                    loading={loadingStaff && staff.length === 0}
                    placeholder="Search doctor by name…"
                    emptyText="No matching doctor — doctors are added under Staff"
                    ariaLabel="Doctor"
                  />
                  <div className="field-hint">Choosing a doctor lets us check for double-booking.</div>
                </div>
                <div className="field">
                  <label htmlFor="appt-when">Date &amp; Time</label>
                  <input id="appt-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="appt-duration">Duration</label>
                  <select id="appt-duration" value={duration} onChange={e => setDuration(e.target.value)}>
                    {DURATIONS.map(d => <option key={d} value={d}>{d} minutes</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appt-notes">Notes (optional)</label>
                  <input id="appt-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Follow-up visit" />
                </div>
              </div>
              <div className="dash-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>Close</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Appointment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="dash-modal-backdrop">
          <div className="card dash-modal" role="dialog" aria-modal="true" aria-labelledby="appt-cancel-title">
            <div className="dash-modal-title" id="appt-cancel-title">Cancel this appointment?</div>
            <div className="dash-modal-form">
              <div className="dash-modal-body">
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  <strong>{cancelTarget.patient_name}</strong>
                  <div style={{ color: 'var(--muted)' }}>
                    {formatWhen(cancelTarget.appointment_time)}{cancelTarget.doctor_name ? ` · ${cancelTarget.doctor_name}` : ''}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="appt-cancel-reason">Reason (optional)</label>
                  <input
                    id="appt-cancel-reason"
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="e.g. Patient asked to reschedule"
                  />
                  <div className="field-hint">The appointment is kept in the list as Cancelled and the reason is saved in the audit trail.</div>
                </div>
              </div>
              <div className="dash-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setCancelTarget(null)} disabled={cancelling}>Keep appointment</button>
                <button type="button" className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={confirmCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel appointment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="dash-toast dash-toast-success">{toast}</div>
      )}
    </>
  )
}
