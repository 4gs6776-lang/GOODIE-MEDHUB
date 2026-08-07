import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

const STATUS_CYCLE = { scheduled: 'completed', completed: 'cancelled', cancelled: 'scheduled' }
const STATUS_LABEL = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLOR = { scheduled: 'var(--violet)', completed: 'var(--teal)', cancelled: 'var(--danger)' }
const STATUS_BG = { scheduled: 'rgba(139,124,246,0.14)', completed: 'var(--teal-soft)', cancelled: 'var(--danger-soft)' }
const DURATIONS = [15, 30, 45, 60, 90]

function todayStr(){
  return new Date().toISOString().slice(0, 10)
}

export default function Appointments(){
  const { profile, hospital } = useAuth()
  const { records: appointments, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('appointments', hospital?.id)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [viewMode, setViewMode] = useState('all') // 'all' | 'day'
  const [dayFilter, setDayFilter] = useState(todayStr())

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
      const conflictTime = new Date(conflict.appointment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
    showToast(isOnline ? `Marked ${STATUS_LABEL[newStatus]}` : `Marked ${STATUS_LABEL[newStatus]} — will sync when back online`)
  }

  async function handleDelete(appt){
    if (!confirm(`Delete this appointment for ${appt.patient_name}?`)) return
    await deleteRecord(appt.id)
    showToast('Appointment deleted')
  }

  const sorted = [...appointments].sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))
  const dayList = sorted.filter(a => new Date(a.appointment_time).toISOString().slice(0, 10) === dayFilter)
  const visible = viewMode === 'day' ? dayList : sorted

  const today = new Date().toDateString()
  const todayCount = sorted.filter(a => new Date(a.appointment_time).toDateString() === today).length
  const upcomingCount = sorted.filter(a => new Date(a.appointment_time) > new Date() && a.status === 'scheduled').length

  function formatWhen(iso){
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  function formatTime(iso){
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const byDoctor = {}
  if (viewMode === 'day') {
    dayList.forEach(a => {
      const key = a.doctor_name || 'Unassigned'
      if (!byDoctor[key]) byDoctor[key] = []
      byDoctor[key].push(a)
    })
  }

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Today</div>
            <div className="dash-stat-value">{todayCount}</div>
            <div className="dash-stat-delta">appointment(s) today</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Upcoming</div>
            <div className="dash-stat-value">{upcomingCount}</div>
            <div className="dash-stat-delta">still scheduled</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setViewMode('all')}
          className="btn" style={{ width: 'auto', background: viewMode === 'all' ? 'var(--teal)' : 'transparent', color: viewMode === 'all' ? '#00251F' : 'var(--muted)', border: viewMode === 'all' ? 'none' : '1px solid var(--line)' }}
        >All Appointments</button>
        <button
          onClick={() => setViewMode('day')}
          className="btn" style={{ width: 'auto', background: viewMode === 'day' ? 'var(--teal)' : 'transparent', color: viewMode === 'day' ? '#00251F' : 'var(--muted)', border: viewMode === 'day' ? 'none' : '1px solid var(--line)' }}
        >Day View</button>
        {viewMode === 'day' && (
          <input type="date" value={dayFilter} onChange={e => setDayFilter(e.target.value)}
            style={{ background: 'var(--bg-elevated)', color: 'var(--ivory)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }} />
        )}
      </div>

      {viewMode === 'day' ? (
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">{new Date(dayFilter).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
                {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''} · grouped by doctor
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Appointment</button>
          </div>

          {Object.keys(byDoctor).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No appointments on this day.</div>
          ) : (
            Object.entries(byDoctor).map(([doctor, list]) => (
              <div key={doctor} style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--ivory)' }}>{doctor}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)).map(appt => (
                    <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', width: 70, flexShrink: 0 }}>
                        {formatTime(appt.appointment_time)}
                      </div>
                      <div style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{appt.patient_name}</div>
                      <span
                        onClick={() => cycleStatus(appt)}
                        style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, cursor: 'pointer', background: STATUS_BG[appt.status], color: STATUS_COLOR[appt.status] }}
                      >{STATUS_LABEL[appt.status]}</span>
                      <button
                        onClick={() => handleDelete(appt)}
                        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', flexShrink: 0 }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Appointments</div>
              <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
                {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''} · Tap a status badge to cycle it
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Appointment</button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No appointments yet. Add your first one above.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['When', 'Patient', 'Doctor', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(appt => (
                  <tr key={appt.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatWhen(appt.appointment_time)}</td>
                    <td style={{ padding: 12, fontWeight: 700 }}>{appt.patient_name}</td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{appt.doctor_name || '—'}</td>
                    <td style={{ padding: 12 }}>
                      <span
                        onClick={() => cycleStatus(appt)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: STATUS_BG[appt.status], color: STATUS_COLOR[appt.status] }}
                      >{STATUS_LABEL[appt.status]}</span>
                    </td>
                    <td style={{ padding: 12 }}>
                      <button
                        onClick={() => handleDelete(appt)}
                        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                        title="Delete"
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Appointment</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Patient Name</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Doctor</label>
                <input value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="e.g. Dr. Adaeze" />
                <div className="field-hint">Adding a doctor here lets us check for double-booking.</div>
              </div>
              <div className="field">
                <label>Date &amp; Time</label>
                <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
              </div>
              <div className="field">
                <label>Duration</label>
                <select value={duration} onChange={e => setDuration(e.target.value)}>
                  {DURATIONS.map(d => <option key={d} value={d}>{d} minutes</option>)}
                </select>
              </div>
              <div className="field">
                <label>Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Follow-up visit" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Appointment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
