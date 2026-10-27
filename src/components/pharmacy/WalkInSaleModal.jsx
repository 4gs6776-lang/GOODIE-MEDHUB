import { useState, useMemo, useEffect } from 'react'
import { useOfflineTable } from '../../lib/useOfflineTable'
import AppIcon from '../icons'
import { writeAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabaseClient'
import PatientAutocomplete from '../common/PatientAutocomplete'

// =====================================================================
// <WalkInSaleModal> — Pharmacy POS for over-the-counter sales to
// walk-in customers (no prescription required).
//
// Props:
//   hospital       hospital context
//   profile         user profile
//   onClose         () => void
//   onSaleComplete  () => void  (called after a sale is recorded)
//
// Flow:
//   1. Cashier enters customer name (required) + optional phone
//   2. Pick drugs from inventory + set quantity each
//   3. Apply discount + tax
//   4. Pick payment method + reference
//   5. Confirm → reduces inventory stock + creates pharmacy_sales row
//      + audit event
// =====================================================================

const PAYMENT_METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'Other']

export default function WalkInSaleModal({ hospital, profile, onClose, onSaleComplete }) {
  const { records: inventoryItems, updateRecord: updateInventoryItem } = useOfflineTable('inventory_items', hospital?.id)
  const { addRecord: addSale } = useOfflineTable('pharmacy_sales', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [linkedPatient, setLinkedPatient] = useState(null)  // optional patient link
  const [cart, setCart] = useState([])  // [{ itemId, name, quantity, unitPrice, total, stockAvailable }]
  const [drugSearch, setDrugSearch] = useState('')
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDrugPicker, setShowDrugPicker] = useState(false)

  // Filter inventory to drugs only + search match
  const drugs = useMemo(() => {
    return (inventoryItems || [])
      .filter(item => String(item.category || '').trim().toLowerCase() === 'drug')
      .filter(item => Number(item.quantity || 0) > 0)
      .filter(item => {
        if (!drugSearch.trim()) return true
        const q = drugSearch.trim().toLowerCase()
        return (
          String(item.name || '').toLowerCase().includes(q) ||
          String(item.generic_name || '').toLowerCase().includes(q) ||
          String(item.batch_number || '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [inventoryItems, drugSearch])

  const subtotal = cart.reduce((s, it) => s + Number(it.total || 0), 0)
  const discountAmt = Number(discount) || 0
  const taxAmt = Number(tax) || 0
  const total = Math.max(0, subtotal - discountAmt + taxAmt)

  function addToCart(item) {
    setCart(prev => {
      const existing = prev.find(c => c.itemId === item.id)
      if (existing) {
        // Already in cart — increment quantity (capped at stock)
        const newQty = Math.min(existing.quantity + 1, Number(item.quantity || 0))
        return prev.map(c =>
          c.itemId === item.id
            ? { ...c, quantity: newQty, total: newQty * c.unitPrice }
            : c
        )
      }
      const unitPrice = Number(item.selling_price || 0)
      return [...prev, {
        itemId: item.id,
        name: item.name,
        quantity: 1,
        unitPrice,
        total: unitPrice,
        stockAvailable: Number(item.quantity || 0),
      }]
    })
    setShowDrugPicker(false)
    setDrugSearch('')
  }

  function updateCartItemQty(itemId, qty) {
    setCart(prev => prev.map(c => {
      if (c.itemId !== itemId) return c
      const newQty = Math.max(1, Math.min(parseInt(qty, 10) || 1, c.stockAvailable))
      return { ...c, quantity: newQty, total: newQty * c.unitPrice }
    }))
  }

  function updateCartItemPrice(itemId, price) {
    setCart(prev => prev.map(c => {
      if (c.itemId !== itemId) return c
      const newPrice = Math.max(0, parseFloat(price) || 0)
      return { ...c, unitPrice: newPrice, total: c.quantity * newPrice }
    }))
  }

  function removeFromCart(itemId) {
    setCart(prev => prev.filter(c => c.itemId !== itemId))
  }

  async function handleConfirm(e) {
    e.preventDefault()
    setError('')
    if (!customerName.trim()) { setError('Customer name is required'); return }
    if (cart.length === 0) { setError('Add at least one item to the cart'); return }
    if (total <= 0) { setError('Total must be greater than 0'); return }

    setSaving(true)
    try {
      // Generate sequential sale number via the Phase 1 RPC
      let saleNumber = `SALE-${Date.now().toString().slice(-8)}`
      try {
        const { data, error: rpcError } = await supabase.rpc('next_document_number', {
          p_hospital_id: hospital.id,
          p_doc_type: 'sale',
          p_fiscal_year: new Date().getFullYear(),
        })
        if (!rpcError && data) saleNumber = data
      } catch (e) {
        // Fall back to timestamp-based number — non-fatal
        console.warn('next_document_number RPC failed, using timestamp fallback:', e.message)
      }

      // 1. Create the pharmacy_sales record
      const sale = await addSale({
        hospital_id: hospital.id,
        sale_number: saleNumber,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        items: cart.map(c => ({
          name: c.name,
          quantity: c.quantity,
          unit_price: c.unitPrice,
          total: c.total,
        })),
        subtotal,
        discount: discountAmt,
        tax: taxAmt,
        total,
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || null,
        sale_type: 'walk_in',
        patient_id: linkedPatient?.id || null,
        status: 'completed',
        dispensed_by: profile?.id || null,
        dispensed_by_name: profile?.full_name || null,
      })

      // 2. Reduce inventory stock for each cart item
      for (const c of cart) {
        const invItem = inventoryItems.find(i => i.id === c.itemId)
        if (!invItem) continue
        const newQty = Math.max(0, Number(invItem.quantity || 0) - c.quantity)
        await updateInventoryItem(c.itemId, {
          quantity: newQty,
          updated_at: new Date().toISOString(),
        })
      }

      // 3. Audit trail
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'pharmacy.walk_in_sale',
        entityType: 'pharmacy_sale', entityId: sale?.id || null,
        summary: `Walk-in sale ${saleNumber} to ${customerName.trim()} — ${cart.length} item(s), total ₦${total.toFixed(2)} (${paymentMethod})`,
        metadata: {
          sale_id: sale?.id, sale_number: saleNumber,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          items_count: cart.length,
          subtotal, discount: discountAmt, tax: taxAmt, total,
          payment_method: paymentMethod,
          reference_number: referenceNumber.trim() || null,
          patient_id: linkedPatient?.id || null,
        },
      })

      onSaleComplete?.()
    } catch (err) {
      setError(err.message || 'Could not complete the sale')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 720, maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Walk-in Sale</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              Sell drugs over the counter to a walk-in customer — no prescription required.
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} disabled={saving} aria-label="Close"><AppIcon name="close" size={18} /></button>
        </div>

        <div className="dash-modal-body" style={{ overflowY: 'auto' }}>
          <form id="walk-in-sale-form" onSubmit={handleConfirm}>
            {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

            {/* Customer info */}
            <div className="dash-field-grid">
              <div className="field">
                <label>Customer Name *</label>
                <input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Walk-in customer name"
                  autoFocus
                  required
                />
              </div>
              <div className="field">
                <label>Phone (optional)</label>
                <input
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="0803..."
                />
              </div>
            </div>

            {/* Optional patient link */}
            <div className="field">
              <label>Link to Patient (optional — if customer is a registered patient)</label>
              <PatientAutocomplete
                patients={patients}
                value={linkedPatient ? { id: linkedPatient.id, label: linkedPatient.full_name, patient: linkedPatient } : null}
                onChange={(opt) => {
                  setLinkedPatient(opt?.patient || null)
                  if (opt?.patient && !customerName.trim()) {
                    setCustomerName(opt.patient.full_name)
                  }
                  if (opt?.patient?.phone && !customerPhone.trim()) {
                    setCustomerPhone(opt.patient.phone)
                  }
                }}
                placeholder="Search registered patient…"
                emptyText="Leave blank for walk-in only"
                ariaLabel="Patient"
              />
            </div>

            {/* Cart */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Cart ({cart.length} item{cart.length === 1 ? '' : 's'})
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setShowDrugPicker(!showDrugPicker)}
                >
                  <AppIcon name="plus" size={12} /> Add Drug
                </button>
              </div>

              {/* Drug picker (collapsible) */}
              {showDrugPicker && (
                <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                  <input
                    type="text"
                    placeholder="Search drug name, generic name, batch…"
                    value={drugSearch}
                    onChange={e => setDrugSearch(e.target.value)}
                    autoFocus
                    style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)', marginBottom: 8 }}
                  />
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {drugs.length === 0 ? (
                      <div style={{ padding: 12, textAlign: 'center', color: 'var(--muted)', fontSize: 11.5 }}>
                        {drugSearch ? 'No drugs match your search.' : 'No drugs in inventory.'}
                      </div>
                    ) : drugs.slice(0, 30).map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToCart(item)}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', color: 'inherit' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              Stock: {item.quantity} {item.unit || 'units'} · ₦{Number(item.selling_price || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <AppIcon name="plus" size={12} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cart items */}
              {cart.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                  Cart is empty. Click "Add Drug" to start.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: 'var(--bg-card)' }}>
                      <tr>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Drug</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Unit Price</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '6px 8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map(c => (
                        <tr key={c.itemId}>
                          <td style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)' }}>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Stock: {c.stockAvailable}</div>
                          </td>
                          <td style={{ padding: '4px 8px', borderTop: '1px solid var(--line-soft)' }}>
                            <input
                              type="number"
                              min="1"
                              max={c.stockAvailable}
                              value={c.quantity}
                              onChange={e => updateCartItemQty(c.itemId, e.target.value)}
                              style={{ width: 60, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }}
                            />
                          </td>
                          <td style={{ padding: '4px 8px', borderTop: '1px solid var(--line-soft)' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={c.unitPrice}
                              onChange={e => updateCartItemPrice(c.itemId, e.target.value)}
                              style={{ width: 90, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
                            ₦{c.total.toFixed(2)}
                          </td>
                          <td style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)' }}>
                            <button type="button" onClick={() => removeFromCart(c.itemId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}>
                              <AppIcon name="trash" size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals + payment */}
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div className="dash-field-grid" style={{ margin: 0 }}>
                  <div className="field">
                    <label>Discount (₦)</label>
                    <input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" style={{ fontFamily: 'var(--font-mono, monospace)' }} />
                  </div>
                  <div className="field">
                    <label>Tax (₦)</label>
                    <input type="number" min="0" step="0.01" value={tax} onChange={e => setTax(e.target.value)} placeholder="0.00" style={{ fontFamily: 'var(--font-mono, monospace)' }} />
                  </div>
                </div>
              </div>
              <div>
                <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>₦{subtotal.toFixed(2)}</span>
                  </div>
                  {discountAmt > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--danger)' }}>
                      <span>Discount</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>- ₦{discountAmt.toFixed(2)}</span>
                    </div>
                  )}
                  {taxAmt > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--gold)' }}>
                      <span>Tax</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>+ ₦{taxAmt.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--line)' }}>
                    <span>Total</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--teal)' }}>₦{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-field-grid" style={{ marginTop: 16 }}>
              <div className="field">
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Reference (optional)</label>
                <input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} placeholder="POS ref, transfer ref…" />
              </div>
            </div>
          </form>
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="walk-in-sale-form" className="btn btn-primary" disabled={saving || cart.length === 0 || !customerName.trim()}>
            {saving ? 'Recording…' : `Record Sale · ₦${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
