import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'
import TrashIcon from '../../components/icons/TrashIcon'
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

const STATUS_CYCLE = { scheduled: 'completed', completed: 'cancelled', cancelled: 'scheduled' }
const STATUS_LABEL = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLOR = { scheduled: 'var(--violet)', completed: 'var(--teal)', cancelled: 'var(--danger)' }
const STATUS_BG = { scheduled: 'rgba(139,124,246,0.14)', completed: 'var(--teal-soft)', cancelled: 'var(--danger-soft)' }
const DURATIONS = [15, 30, 45, 60, 90]

export default function Appointments({ initialSearch = '' }){
  const { profile, hospital } = useAuth()
  // Central timezone handling (Stage 1 req. #11)
  const hospitalTz = getTimezone(hospital)
  const { records: appointments, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('appointments', hospital?.id)
  // Stage 2 QA (pair 1): phones re-flow the list into record cards instead
  // of squeezing a 5-column table (or force-scrolling it) into 320-430px.
  const isPhone = useMediaQuery('(max-width: 767px)')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState(initialSearch)
  useEffect(() => { if (initialSearch) setSearchTerm(initialSearch) }, [initialSearch])
  const [viewMode, setViewMode] = useState('all') // 'all' | 'day'
  const [dayFilter, setDayFilter] = useState(() => todayKeyInZone(getTimezone(hospital)))

  const [patientName, setPatientName] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [when, setWhen] = useState('')
  const [duration, setDuration] = useState('30')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

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
    if (!patientName || !when) {
      setFormError('Patient name and date/time are required.')
      return
    }
    if (!hospital || !profile) {
      setFormError('Still loading your account — try again in a moment.')
      return
    }

    const durationMins = parseInt(duration, 10)
    const startISO = new Date(when).toISOString()
    const conflict = findConflict(doctorName, startISO, durationMins)
    if (conflict) {
      const conflictTime = formatTime(conflict.appointment_time, hospitalTz)
      setFormError(`Dr. ${doctorName} is already booked with ${conflict.patient_name} at ${conflictTime}. Choose another time.`)
      return
    }

    setSaving(true)
    try {
      await addRecord({
        patient_name: patientName,
        doctor_name: doctorName || null,
        appointment_time: startISO,
        duration_minutes: durationMins,
        status: 'scheduled',
        notes: notes || null,
        created_by: profile.id,
      })
      setShowModal(false)
      setPatientName(''); setDoctorName(''); setWhen(''); setDuration('30'); setNotes('')
      showToast(isOnline ? 'Appointment scheduled' : 'Appointment scheduled — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save appointment')
    } finally {
      setSaving(false)
    }
  }

  async function cycleStatus(appt){
    const newStatus = STATUS_CYCLE[appt.status]
    await updateRecord(appt.id, { status: newStatus })
    // Status changes are auditable clinical events (same policy as deletion).
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

  async function handleDelete(appt){
    if (!confirm(`Delete this appointment for ${appt.patient_name}?`)) return
    await deleteRecord(appt.id)
    // Cancellations/deletions are auditable events (Stage 1 req. #16).
    writeAudit({
      hospitalId: hospital?.id,
      actor: profile,
      action: 'appointment.delete',
      entityType: 'appointment',
      entityId: appt.id,
      summary: `Deleted appointment for ${appt.patient_name} scheduled ${formatWhen(appt.appointment_time)}`,
    })
    showToast('Appointment deleted')
  }

  const sorted = [...appointments].sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))
  const dayList = sorted.filter(a => dayKeyInZone(a.appointment_time, hospitalTz) === dayFilter)
  const visible = viewMode === 'day' ? dayList : sorted

  const appointmentSearch = searchTerm.trim().toLowerCase()
  const searchedSorted = appointmentSearch ? sorted.filter(a => [a.patient_name, a.patient_id, a.doctor_name, a.appointment_id, a.status].some(v => String(v || '').toLowerCase().includes(appointmentSearch))) : sorted
  const searchedDayList = appointmentSearch ? dayList.filter(a => [a.patient_name, a.patient_id, a.doctor_name, a.appointment_id, a.status].some(v => String(v || '').toLowerCase().includes(appointmentSearch))) : dayList
  const searchedVisible = viewMode === 'day' ? searchedDayList : searchedSorted

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
          <button
            onClick={() => handleDelete(appt)}
            className="icon-btn-delete"
            title="Delete"
            aria-label={`Delete appointment for ${appt.patient_name}`}
          ><TrashIcon size={14}/></button>
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
                          <button
                            onClick={() => handleDelete(appt)}
                            className="icon-btn-delete"
                            title="Delete"
                            aria-label={`Delete appointment for ${appt.patient_name}`}
                          ><TrashIcon size={14}/></button>
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
                <span>Tap a status badge to cycle it</span>
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
          ) : isPhone ? (
            <div className="appt-list">
              {searchedVisible.map(appt => <ApptCard key={appt.id} appt={appt} showDoctorInMeta />)}
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
                  {searchedVisible.map(appt => (
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
                        <button
                          onClick={() => handleDelete(appt)}
                          className="icon-btn-delete"
                          title="Delete"
                          aria-label={`Delete appointment for ${appt.patient_name}`}
                        ><TrashIcon size={14}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                  <label htmlFor="appt-patient">Patient Name</label>
                  <input id="appt-patient" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
                </div>
                <div className="field">
                  <label htmlFor="appt-doctor">Doctor</label>
                  <input id="appt-doctor" value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="e.g. Dr. Adaeze" />
                  <div className="field-hint">Adding a doctor here lets us check for double-booking.</div>
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
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Appointment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="dash-toast dash-toast-success">{toast}</div>
      )}
    </>
  )
}