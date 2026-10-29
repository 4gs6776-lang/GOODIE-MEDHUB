import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useHospital } from '../../context/HospitalContext'
import { supabase } from '../../lib/supabaseClient'
import { writeAudit } from '../../lib/audit'

// =====================================================================
// GOODIE-MEDHUB — Facilities management (front-end for migration 007's
// `facilities` table). Lets a hospital admin view, add, edit, and
// deactivate the branches/facilities under their hospital.
//
// Reuses HospitalContext's facility list (already loaded there) so this
// page and the rest of the app always agree on what facilities exist.
// =====================================================================

const EMPTY_FORM = { name: '', code: '', address: '', phone: '', timezone: '', is_main: false, active: true }

export default function Facilities(){
  const { hospital, profile } = useAuth()
  const { facilities, loadingFacilities, facilitiesUnavailable } = useHospital()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setField(key, value){
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function openCreate(){
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(facility){
    setForm({
      name: facility.name || '',
      code: facility.code || '',
      address: facility.address || '',
      phone: facility.phone || '',
      timezone: facility.timezone || '',
      is_main: !!facility.is_main,
      active: facility.active !== false,
    })
    setEditingId(facility.id)
    setError('')
    setShowForm(true)
  }

  function closeForm(){
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function handleSave(e){
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Facility name is required.')
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      hospital_id: hospital.id,
      name: form.name.trim(),
      code: form.code.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      timezone: form.timezone.trim() || null,
      is_main: form.is_main,
      active: form.active,
    }

    if (editingId) {
      const { error: updateError } = await supabase
        .from('facilities')
        .update(payload)
        .eq('id', editingId)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }

      await writeAudit({
        hospitalId: hospital.id,
        actor: profile,
        action: 'facility.update',
        entityType: 'facility',
        entityId: editingId,
        summary: `Updated facility "${payload.name}"`,
        metadata: payload,
      })
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('facilities')
        .insert(payload)
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }

      await writeAudit({
        hospitalId: hospital.id,
        actor: profile,
        action: 'facility.create',
        entityType: 'facility',
        entityId: inserted?.id || null,
        summary: `Created facility "${payload.name}"`,
        metadata: payload,
      })
    }

    setSaving(false)
    closeForm()
    // HospitalContext re-fetches on hospital.id change only, so nudge a reload.
    window.location.reload()
  }

  async function handleToggleActive(facility){
    const nextActive = !facility.active
    const { error: updateError } = await supabase
      .from('facilities')
      .update({ active: nextActive })
      .eq('id', facility.id)

    if (updateError) {
      alert(updateError.message)
      return
    }

    await writeAudit({
      hospitalId: hospital.id,
      actor: profile,
      action: nextActive ? 'facility.activate' : 'facility.deactivate',
      entityType: 'facility',
      entityId: facility.id,
      summary: `${nextActive ? 'Activated' : 'Deactivated'} facility "${facility.name}"`,
    })

    window.location.reload()
  }

  return (
    <>
      <div className="dash-stats neu-scope">
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m-1 4h1m4-4h1m-1 4h1M9 21v-4h6v4" />
            </svg>
          </div>
          <div>
            <div className="dash-stat-label">Facilities</div>
            <div className="dash-stat-value" style={{ fontSize: 17 }}>{facilities.length}</div>
            <div className="dash-stat-delta">{facilities.filter(f => f.active).length} active</div>
          </div>
        </div>
      </div>

      <div className="dash-panel" style={{ marginTop: 20 }}>
        <div className="dash-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Facilities</h3>
          <button
            onClick={openCreate}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer' }}
          >
            + Add Facility
          </button>
        </div>

        {facilitiesUnavailable && (
          <div style={{ padding: 16, color: 'var(--gold)' }}>
            Facilities table isn't reachable right now — check that migration 007 has been applied.
          </div>
        )}

        {loadingFacilities ? (
          <div style={{ padding: 20, opacity: 0.7 }}>Loading facilities…</div>
        ) : facilities.length === 0 ? (
          <div style={{ padding: 20, opacity: 0.7 }}>No facilities yet. Add your first one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Code</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Address</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Phone</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Main</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}></th>
                </tr>
              </thead>
              <tbody>
                {facilities.map(f => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{f.name}</td>
                    <td style={{ padding: '8px 10px' }}>{f.code || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{f.address || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{f.phone || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{f.is_main ? 'Yes' : ''}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ color: f.active ? 'var(--teal)' : 'var(--muted)' }}>
                        {f.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(f)} style={{ marginRight: 8, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button onClick={() => handleToggleActive(f)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>
                        {f.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div
          onClick={closeForm}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleSave}
            style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, maxWidth: 480, width: '90%', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit Facility' : 'Add Facility'}</h3>

            {error && <div style={{ color: 'var(--danger, #d33)', marginBottom: 10 }}>{error}</div>}

            <label style={{ display: 'block', marginBottom: 10 }}>
              Name
              <input value={form.name} onChange={e => setField('name', e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Code
              <input value={form.code} onChange={e => setField('code', e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Address
              <input value={form.address} onChange={e => setField('address', e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Phone
              <input value={form.phone} onChange={e => setField('phone', e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Timezone
              <input value={form.timezone} onChange={e => setField('timezone', e.target.value)} placeholder="e.g. Africa/Lagos" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input type="checkbox" checked={form.is_main} onChange={e => setField('is_main', e.target.checked)} />
              Main facility
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input type="checkbox" checked={form.active} onChange={e => setField('active', e.target.checked)} />
              Active
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeForm} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
