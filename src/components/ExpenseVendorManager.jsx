import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import { writeAudit } from '../lib/audit'
import AppIcon from './icons'
import { VENDOR_TYPES } from '../lib/billingService'

// =====================================================================
// ExpenseVendorManager — CRUD UI for expense_vendors.
// Shown in Settings → Expense Vendors. Admin/owner/billing only.
// =====================================================================

export default function ExpenseVendorManager() {
  const { profile, hospital } = useAuth()
  const { records: vendors, addRecord, updateRecord, deleteRecord } = useOfflineTable('expense_vendors', hospital?.id)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [form, setForm] = useState({
    name: '', vendor_type: 'supplier', contact_name: '', phone: '', email: '',
    address: '', bank_name: '', account_name: '', account_number: '', sort_code: '',
    tax_id: '', is_active: true, notes: '',
  })

  function resetForm() {
    setForm({
      name: '', vendor_type: 'supplier', contact_name: '', phone: '', email: '',
      address: '', bank_name: '', account_name: '', account_number: '', sort_code: '',
      tax_id: '', is_active: true, notes: '',
    })
    setEditingId(null); setError('')
  }

  function openModal(v = null) {
    if (v) {
      setEditingId(v.id)
      setForm({
        name: v.name || '',
        vendor_type: v.vendor_type || 'supplier',
        contact_name: v.contact_name || '',
        phone: v.phone || '',
        email: v.email || '',
        address: v.address || '',
        bank_name: v.bank_name || '',
        account_name: v.account_name || '',
        account_number: v.account_number || '',
        sort_code: v.sort_code || '',
        tax_id: v.tax_id || '',
        is_active: v.is_active !== false,
        notes: v.notes || '',
      })
    } else { resetForm() }
    setShowModal(true)
  }

  const filtered = useMemo(() => {
    let arr = [...(vendors || [])]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      arr = arr.filter(v =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.contact_name || '').toLowerCase().includes(q) ||
        (v.phone || '').toLowerCase().includes(q) ||
        (v.email || '').toLowerCase().includes(q)
      )
    }
    return arr.sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1) || (a.name || '').localeCompare(b.name || ''))
  }, [vendors, search])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Vendor name is required.'); return }
    const dupe = (vendors || []).find(v => v.name === form.name.trim() && v.id !== editingId)
    if (dupe) { setError(`Vendor "${form.name.trim()}" already exists.`); return }

    setSaving(true)
    try {
      const payload = {
        hospital_id: hospital.id,
        name: form.name.trim(),
        vendor_type: form.vendor_type,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        bank_name: form.bank_name.trim() || null,
        account_name: form.account_name.trim() || null,
        account_number: form.account_number.trim() || null,
        sort_code: form.sort_code.trim() || null,
        tax_id: form.tax_id.trim() || null,
        is_active: form.is_active !== false,
        notes: form.notes.trim() || null,
      }
      if (editingId) {
        await updateRecord(editingId, payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'expense_vendor.updated',
          entityType: 'expense_vendors', entityId: editingId,
          summary: `Updated vendor "${payload.name}"`,
          metadata: payload,
        })
      } else {
        const saved = await addRecord(payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'expense_vendor.created',
          entityType: 'expense_vendors', entityId: saved?.id || null,
          summary: `Created vendor "${payload.name}"`,
          metadata: payload,
        })
      }
      setShowModal(false); resetForm()
    } catch (err) {
      setError(err.message || 'Could not save the vendor.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(v) {
    if (!confirm(`Delete vendor "${v.name}"?`)) return
    await deleteRecord(v.id)
    writeAudit({
      hospitalId: hospital.id, actor: profile,
      action: 'expense_vendor.deleted',
      entityType: 'expense_vendors', entityId: v.id,
      summary: `Deleted vendor "${v.name}"`,
      metadata: { name: v.name },
    })
  }

  const vendorTypeLabel = (t) => VENDOR_TYPES.find(x => x.value === t)?.label || t

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search name, contact, phone, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '8px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}
        />
        <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openModal(null)}>
          <AppIcon name="plus" size={14} /> Add Vendor
        </button>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-full-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Bank</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                {vendors?.length === 0 ? 'No vendors yet. Add suppliers, utility companies, contractors, etc. to track expenses against them.' : 'No vendors match these filters.'}
              </td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} style={{ opacity: v.is_active === false ? 0.5 : 1 }}>
                <td style={{ fontWeight: 600 }}>
                  {v.name}
                  {v.tax_id && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>Tax ID: {v.tax_id}</div>}
                </td>
                <td>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(118,87,232,0.14)', color: 'var(--violet)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{vendorTypeLabel(v.vendor_type)}</span>
                </td>
                <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{v.contact_name || '—'}</td>
                <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{v.phone || '—'}</td>
                <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{v.bank_name || '—'}</td>
                <td>
                  {v.is_active === false ? (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(154,170,183,0.14)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Inactive</span>
                  ) : (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,199,199,0.14)', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Active</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={() => openModal(v)}>Edit</button>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(v)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}>
          <div className="card dash-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
              <div className="dash-modal-title" style={{ paddingBottom: 0 }}>{editingId ? 'Edit Vendor' : 'Add Vendor'}</div>
              <button className="dash-icon-btn" onClick={() => { setShowModal(false); resetForm() }} aria-label="Close"><AppIcon name="close" size={18} /></button>
            </div>
            <div className="dash-modal-body">
              <form id="vendor-form" onSubmit={handleSave}>
                {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Name *</label>
                    <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. PHCN Electricity, Meds Suppliers Ltd" autoFocus required />
                  </div>
                  <div className="field">
                    <label>Type</label>
                    <select value={form.vendor_type} onChange={e => setField('vendor_type', e.target.value)}>
                      {VENDOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Contact Name</label>
                    <input value={form.contact_name} onChange={e => setField('contact_name', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Phone</label>
                    <input value={form.phone} onChange={e => setField('phone', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>Email</label>
                  <input value={form.email} onChange={e => setField('email', e.target.value)} />
                </div>
                <div className="field">
                  <label>Address</label>
                  <input value={form.address} onChange={e => setField('address', e.target.value)} />
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 8px' }}>Bank Details (optional)</div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Bank Name</label>
                    <input value={form.bank_name} onChange={e => setField('bank_name', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Account Name</label>
                    <input value={form.account_name} onChange={e => setField('account_name', e.target.value)} />
                  </div>
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Account Number</label>
                    <input value={form.account_number} onChange={e => setField('account_number', e.target.value)} style={{ fontFamily: 'var(--font-mono, monospace)' }} />
                  </div>
                  <div className="field">
                    <label>Sort Code</label>
                    <input value={form.sort_code} onChange={e => setField('sort_code', e.target.value)} style={{ fontFamily: 'var(--font-mono, monospace)' }} />
                  </div>
                </div>
                <div className="field">
                  <label>Tax ID / Registration No.</label>
                  <input value={form.tax_id} onChange={e => setField('tax_id', e.target.value)} placeholder="e.g. CAC, TIN" />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', resize: 'vertical' }} />
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm() }} disabled={saving}>Cancel</button>
              <button type="submit" form="vendor-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Vendor')}</button>
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
