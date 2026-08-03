import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

const STATUS_CYCLE = { scheduled: 'completed', completed: 'cancelled', cancelled: 'scheduled' }
const STATUS_LABEL = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLOR = { scheduled: 'var(--violet)', completed: 'var(--teal)', cancelled: 'var(--danger)' }
const STATUS_BG = { scheduled: 'rgba(139,124,246,0.14)', completed: 'var(--teal-soft)', cancelled: 'var(--danger-soft)' }

export default function Appointments(){
  const { profile, hospital } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)

  const [patientName, setPatientName] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [when, setWhen] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function loadAppointments(){
    setLoading(true)
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .order('appointment_time', { ascending: true })
    if (!error) setAppointments(data || [])
    setLoading(false)
  }

  useEffect(() => { loadAppointments() }, [])

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
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
    setSaving(true)
    try {
      const { error } = await supabase.from('appointments').insert({
        hospital_id: hospital.id,
        patient_name: patientName,
        doctor_name: doctorName || null,
        appointment_time: new Date(when).toISOString(),
        notes: notes || null,
        created_by: profile.id,
      })
      if (error) throw error
      setShowModal(false)
      setPatientName(''); setDoctorName(''); setWhen(''); setNotes('')
      showToast('Appointment scheduled')
      loadAppointments()
    } catch (err) {
      setFormError(err.message || 'Could not save appointment')
    } finally {
      setSaving(false)
    }
  }

  async function cycleStatus(appt){
    const newStatus = STATUS_CYCLE[appt.status]
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', appt.id)
    if (!error) {
      showToast(`Marked ${STATUS_LABEL[newStatus]}`)
      loadAppointments()
    }
  }

  async function handleDelete(appt){
    if (!confirm(`Delete this appointment for ${appt.patient_name}?`)) return
    const { error } = await supabase.from('appointments').delete().eq('id', appt.id)
    if (!error) {
      showToast('Appointment deleted')
      loadAppointments()
    }
  }

  const today = new Date().toDateString()
  const todayCount = appointments.filter(a => new Date(a.appointment_time).toDateString() === today).length
  const upcomingCount = appointments.filter(a => new Date(a.appointment_time) > new Date() && a.status === 'scheduled').length

  function formatWhen(iso){
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Appointments</div>
            <div className="dash-panel-sub">Tap a status badge to cycle it</div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Appointment</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : appointments.length === 0 ? (
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
              {appointments.map(appt => (
                <tr key={appt.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatWhen(appt.appointment_time)}</td>
                  <td style={{ padding: 12, fontWeight: 700 }}>{appt.patient_name}</td>
                  <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{appt.doctor_name || '—'}</td>
                  <td style={{ padding: 12 }}>
                    <span
                      onClick={() => cycleStatus(appt)}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        background: STATUS_BG[appt.status], color: STATUS_COLOR[appt.status],
                      }}
                      title="Tap to change"
                    >
                      {STATUS_LABEL[appt.status]}
                    </span>
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
                <label>Doctor (optional)</label>
                <input value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="e.g. Dr. Adaeze" />
              </div>
              <div className="field">
                <label>Date &amp; Time</label>
                <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
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
