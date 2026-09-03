import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

const HOUR = 60 * 60 * 1000

export default function Notifications(){
  const { hospital } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const { records: appointments, loading: loadingAppts } = useOfflineTable('appointments', hospital?.id)
  const { records: inventory, loading: loadingInventory } = useOfflineTable('inventory_items', hospital?.id)
  const { records: labTests, loading: loadingLab } = useOfflineTable('lab_tests', hospital?.id)
  const { records: scans, loading: loadingRadiology } = useOfflineTable('radiology_scans', hospital?.id)
  const { records: claims, loading: loadingInsurance } = useOfflineTable('insurance_claims', hospital?.id)
  const { records: handovers, loading: loadingHandovers } = useOfflineTable('shift_handovers', hospital?.id, { realtime: true })

  const loading = loadingAppts || loadingInventory || loadingLab || loadingRadiology || loadingInsurance || loadingHandovers

  const now = new Date()

  // Appointments starting within the next 2 hours, still scheduled.
  const soonAppointments = appointments
    .filter(a => a.status === 'scheduled')
    .filter(a => {
      const start = new Date(a.appointment_time)
      const diff = start - now
      return diff > -15 * 60 * 1000 && diff <= 2 * HOUR
    })
    .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))

  // Appointments later today, still scheduled.
  const todayAppointments = appointments
    .filter(a => a.status === 'scheduled')
    .filter(a => {
      const start = new Date(a.appointment_time)
      const diff = start - now
      return diff > 2 * HOUR && start.toDateString() === now.toDateString()
    })
    .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))

  const lowStockItems = inventory.filter(i => i.quantity <= i.reorder_level)

  const pendingLab = labTests.filter(t => t.status !== 'completed').length
  const pendingRadiology = scans.filter(s => s.status !== 'completed').length
  const pendingClaims = claims.filter(c => c.status === 'submitted').length
  const unacknowledgedHandovers = handovers.filter(h => h.status === 'submitted')

  const notificationSearch = searchTerm.trim().toLowerCase()
  const visibleSoon = notificationSearch ? soonAppointments.filter(a => [a.patient_name, a.doctor_name, a.status].some(v => String(v || '').toLowerCase().includes(notificationSearch))) : soonAppointments
  const visibleToday = notificationSearch ? todayAppointments.filter(a => [a.patient_name, a.doctor_name, a.status].some(v => String(v || '').toLowerCase().includes(notificationSearch))) : todayAppointments
  const visibleLowStock = notificationSearch ? lowStockItems.filter(i => [i.name, i.category, i.supplier].some(v => String(v || '').toLowerCase().includes(notificationSearch))) : lowStockItems

  const totalAlerts = soonAppointments.length + lowStockItems.length + unacknowledgedHandovers.length

  function formatTime(iso){
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  function minutesUntil(iso){
    const diff = Math.round((new Date(iso) - now) / 60000)
    if (diff < 0) return 'starting now'
    if (diff === 0) return 'now'
    if (diff < 60) return `in ${diff} min`
    return `in ${Math.round(diff / 60)}h`
  }

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Active Alerts</div>
            <div className="dash-stat-value" style={{ color: totalAlerts > 0 ? 'var(--danger)' : undefined }}>{totalAlerts}</div>
            <div className="dash-stat-delta">need attention now</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Upcoming Today</div>
            <div className="dash-stat-value">{soonAppointments.length + todayAppointments.length}</div>
            <div className="dash-stat-delta">appointments left today</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Low Stock Items</div>
            <div className="dash-stat-value">{lowStockItems.length}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>need reorder</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Pending Results</div>
            <div className="dash-stat-value">{pendingLab + pendingRadiology}</div>
            <div className="dash-stat-delta">lab + radiology</div>
          </div>
        </div>
      </div>

      <div className="dash-row dash-row-2">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search reminders, patients or alerts" style={{ minWidth: 260, maxWidth: 420 }} />
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Appointment Reminders</div>
              <div className="dash-panel-sub">Starting soon or later today</div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : soonAppointments.length === 0 && todayAppointments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No more appointments today.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleSoon.map(a => (
                <div key={a.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10, background: 'rgba(225,104,94,0.10)', border: '1px solid rgba(225,104,94,0.25)',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.patient_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.doctor_name ? `Dr. ${a.doctor_name} · ` : ''}{formatTime(a.appointment_time)}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>{minutesUntil(a.appointment_time)}</span>
                </div>
              ))}
              {visibleToday.map(a => (
                <div key={a.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.patient_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.doctor_name ? `Dr. ${a.doctor_name} · ` : ''}{formatTime(a.appointment_time)}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{minutesUntil(a.appointment_time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Low Stock Alerts</div>
              <div className="dash-panel-sub">At or below reorder level</div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : lowStockItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>All stock levels are healthy.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleLowStock.map(item => (
                <div key={item.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10, background: 'rgba(201,169,97,0.10)', border: '1px solid rgba(201,169,97,0.25)',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.category}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>{item.quantity} {item.unit} left</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 18, fontSize: 12, color: 'var(--muted)' }}>
            <span>{pendingClaims} claim(s) awaiting review</span>
          </div>
        </div>

        {unacknowledgedHandovers.length > 0 && (
          <div className="dash-panel" style={{ gridColumn: '1 / -1' }}>
            <div className="dash-panel-head">
              <div>
                <div className="dash-panel-title">Unacknowledged Handovers</div>
                <div className="dash-panel-sub">Open Shift Handover → Dashboard to review and acknowledge</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unacknowledgedHandovers.slice(0, 6).map(h => (
                <div key={h.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10, background: 'var(--danger-soft)', border: '1px solid rgba(240,79,95,0.25)',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.ward} — {h.shift_type === 'N' ? 'Night' : 'Morning'} Shift</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{h.handover_date} · prepared by {h.prepared_by_name || 'Staff'}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Awaiting</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
