import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import { writeAudit } from '../lib/audit'
import AppIcon from './icons'

// =====================================================================
// PaymentMethodManager — CRUD UI for hospital_payment_methods.
// Shown in Settings → Payment Methods. Admin/owner/billing only.
//
// Lets the admin configure which payment methods appear in dropdowns
// (cash, POS, transfer, cheque, etc.) and whether each needs a
// reference number / reconciles to the cash drawer.
// =====================================================================

export default function PaymentMethodManager() {
  const { profile, hospital } = useAuth()
  const { records: methods, addRecord, updateRecord, deleteRecord } = useOfflineTable('hospital_payment_methods', hospital?.id)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    code: '', label: '', requires_reference: false, reconciles_to_cash_drawer: false,
    is_active: true, sort_order: '0',
  })

  function resetForm() {
    setForm({ code: '', label: '', requires_reference: false, reconciles_to_cash_drawer: false, is_active: true, sort_order: '0' })
    setEditingId(null); setError('')
  }

  function openModal(m = null) {
    if (m) {
      setEditingId(m.id)
      setForm({
        code: m.code || '',
        label: m.label || '',
        requires_reference: !!m.requires_reference,
        reconciles_to_cash_drawer: !!m.reconciles_to_cash_drawer,
        is_active: m.is_active !== false,
        sort_order: String(m.sort_order ?? '0'),
      })
    } else { resetForm() }
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!form.code.trim()) { setError('Code is required.'); return }
    if (!form.label.trim()) { setError('Label is required.'); return }
    const dupe = (methods || []).find(m => m.code === form.code.trim().toLowerCase() && m.id !== editingId)
    if (dupe) { setError(`Code "${form.code.trim().toLowerCase()}" is already in use.`); return }

    setSaving(true)
    try {
      const payload = {
        hospital_id: hospital.id,
        code: form.code.trim().toLowerCase(),
        label: form.label.trim(),
        requires_reference: !!form.requires_reference,
        reconciles_to_cash_drawer: !!form.reconciles_to_cash_drawer,
        is_active: form.is_active !== false,
        sort_order: parseInt(form.sort_order, 10) || 0,
      }
      if (editingId) {
        await updateRecord(editingId, payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'hospital_payment_method.updated',
          entityType: 'hospital_payment_methods', entityId: editingId,
          summary: `Updated payment method "${payload.label}" (${payload.code})`,
          metadata: payload,
        })
      } else {
        const saved = await addRecord(payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'hospital_payment_method.created',
          entityType: 'hospital_payment_methods', entityId: saved?.id || null,
          summary: `Created payment method "${payload.label}" (${payload.code})`,
          metadata: payload,
        })
      }
      setShowModal(false); resetForm()
    } catch (err) {
      setError(err.message || 'Could not save the payment method.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(m) {
    if (!confirm(`Delete payment method "${m.label}"?`)) return
    await deleteRecord(m.id)
    writeAudit({
      hospitalId: hospital.id, actor: profile,
      action: 'hospital_payment_method.deleted',
      entityType: 'hospital_payment_methods', entityId: m.id,
      summary: `Deleted payment method "${m.label}" (${m.code})`,
      metadata: { code: m.code },
    })
  }

  const sorted = useMemo(() => {
    return [...(methods || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.label || '').localeCompare(b.label || ''))
  }, [methods])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openModal(null)}>
          <AppIcon name="plus" size={14} /> Add Method
        </button>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-full-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>Requires Reference</th>
              <th>Cash Drawer</th>
              <th>Sort</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>No payment methods configured.</td></tr>
            ) : sorted.map(m => (
              <tr key={m.id} style={{ opacity: m.is_active === false ? 0.5 : 1 }}>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: 12 }}>{m.code}</td>
                <td style={{ fontWeight: 600 }}>{m.label}</td>
                <td style={{ fontSize: 11.5, color: m.requires_reference ? 'var(--gold)' : 'var(--muted)' }}>{m.requires_reference ? 'Yes' : 'No'}</td>
                <td style={{ fontSize: 11.5, color: m.reconciles_to_cash_drawer ? 'var(--teal)' : 'var(--muted)' }}>{m.reconciles_to_cash_drawer ? 'Yes' : 'No'}</td>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'var(--muted)' }}>{m.sort_order}</td>
                <td>
                  {m.is_active === false ? (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(154,170,183,0.14)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Inactive</span>
                  ) : (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,199,199,0.14)', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Active</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={() => openModal(m)}>Edit</button>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(m)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}>
          <div className="card dash-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
              <div className="dash-modal-title" style={{ paddingBottom: 0 }}>{editingId ? 'Edit Payment Method' : 'Add Payment Method'}</div>
              <button className="dash-icon-btn" onClick={() => { setShowModal(false); resetForm() }} aria-label="Close"><AppIcon name="close" size={18} /></button>
            </div>
            <div className="dash-modal-body">
              <form id="payment-method-form" onSubmit={handleSave}>
                {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
                <div className="field">
                  <label>Code *</label>
                  <input value={form.code} onChange={e => setField('code', e.target.value.toLowerCase())} placeholder="e.g. cash, pos, transfer" autoFocus required style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} disabled={!!editingId} />
                </div>
                <div className="field">
                  <label>Label *</label>
                  <input value={form.label} onChange={e => setField('label', e.target.value)} placeholder="e.g. Cash, POS Terminal" required />
                </div>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.requires_reference} onChange={e => setField('requires_reference', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
                    Requires Reference Number (POS / transfer / cheque)
                  </label>
                </div>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.reconciles_to_cash_drawer} onChange={e => setField('reconciles_to_cash_drawer', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                    Reconciles to Cash Drawer (counts in daily cash count)
                  </label>
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Sort Order</label>
                    <input type="number" min="0" value={form.sort_order} onChange={e => setField('sort_order', e.target.value)} />
                  </div>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                      Active
                    </label>
                  </div>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm() }} disabled={saving}>Cancel</button>
              <button type="submit" form="payment-method-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Method')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }
}
