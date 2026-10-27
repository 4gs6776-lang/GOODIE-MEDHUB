import { useState, useMemo, useCallback } from 'react'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { supabase } from '../../lib/supabaseClient'
import AppIcon from '../icons'
import { writeAudit } from '../../lib/audit'
import { formatDateTime, getTimezone } from '../../lib/datetime'

// =====================================================================
// GOODIE-MEDHUB — WalkInSaleModal (POS interface)
//
// Features:
//   - Customer name (free text, required)
//   - Medicine search (filters inventory where category='Drug' and requires_prescription=false)
//   - Cart with add/remove/quantity controls
//   - Auto-calculates subtotal + total
//   - Payment method selector
//   - "Complete Sale" → generates pharmacy_sales row + deducts stock + receipt
//   - Duplicate prevention: sale_number unique per hospital; button disabled during processing
//   - Receipt generation (opens print window)
// =====================================================================

const PAYMENT_METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'Other']

const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function WalkInSaleModal({ hospital, profile, onClose, onSaleComplete }) {
  const timezone = getTimezone(hospital)
  const { records: inventoryItems } = useOfflineTable('inventory_items', hospital?.id)
  const { addRecord: addSale } = useOfflineTable('pharmacy_sales', hospital?.id)
  const { updateRecord: updateInventory } = useOfflineTable('inventory_items', hospital?.id)

  const [customerName, setCustomerName] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [discount, setDiscount] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [completedSale, setCompletedSale] = useState(null)

  // Filter inventory: only Drugs, not requiring prescription, in stock
  const availableDrugs = useMemo(() => {
    return inventoryItems.filter(item => {
      if (String(item.category || '').trim().toLowerCase() !== 'drug') return false
      if (item.requires_prescription === true) return false
      if (Number(item.quantity || 0) <= 0) return false
      if (item.deleted_at) return false
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return [item.name, item.generic_name, item.strength, item.batch_number]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [inventoryItems, searchTerm])

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
  }, [cart])

  const discountAmount = Number(discount) || 0
  const total = Math.max(0, subtotal - discountAmount)
  const paidAmount = Number(amountPaid) || 0
  const balance = Math.max(0, total - paidAmount)

  const addToCart = useCallback((drug) => {
    setError('')
    setCart(prev => {
      const existing = prev.find(item => item.itemId === drug.id)
      if (existing) {
        if (existing.quantity >= Number(drug.quantity)) {
          setError(`Only ${drug.quantity} ${drug.unit || 'units'} of ${drug.name} available.`)
          return prev
        }
        return prev.map(item =>
          item.itemId === drug.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, {
        itemId: drug.id,
        name: drug.name,
        genericName: drug.generic_name || '',
        strength: drug.strength || '',
        quantity: 1,
        maxQty: Number(drug.quantity) || 0,
        unitPrice: Number(drug.selling_price || 0),
        unit: drug.unit || 'units',
        batchNumber: drug.batch_number || '',
        expiryDate: drug.expiry_date || '',
      }]
    })
  }, [])

  const updateCartQty = (itemId, newQty) => {
    setError('')
    setCart(prev => prev.map(item => {
      if (item.itemId !== itemId) return item
      const q = parseInt(newQty, 10) || 0
      if (q > item.maxQty) {
        setError(`Only ${item.maxQty} ${item.unit} available.`)
        return item
      }
      if (q <= 0) return null // will be filtered out
      return { ...item, quantity: q }
    }).filter(Boolean))
  }

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(item => item.itemId !== itemId))
  }

  // Generate unique sale number
  const generateSaleNumber = useCallback(async () => {
    const { data: counter } = await supabase
      .from('pharmacy_sale_counters')
      .select('next_value')
      .eq('hospital_id', hospital.id)
      .maybeSingle()

    let nextVal = 1
    if (counter?.next_value) {
      nextVal = counter.next_value
      // Increment the counter
      await supabase
        .from('pharmacy_sale_counters')
        .update({ next_value: nextVal + 1 })
        .eq('hospital_id', hospital.id)
    } else {
      // Create counter row
      await supabase
        .from('pharmacy_sale_counters')
        .insert({ hospital_id: hospital.id, next_value: 2 })
    }

    return `PS-${String(nextVal).padStart(4, '0')}`
  }, [hospital?.id])

  const handleCompleteSale = async (e) => {
    e.preventDefault()
    setError('')

    if (!customerName.trim()) { setError('Customer name is required.'); return }
    if (cart.length === 0) { setError('Add at least one medicine to the cart.'); return }
    if (paidAmount < total) { setError(`Insufficient payment. Total is ${formatMoney(total)}, paid ${formatMoney(paidAmount)}.`); return }

    setProcessing(true)
    try {
      const saleNumber = await generateSaleNumber()

      // Build items JSON
      const itemsJson = cart.map(item => ({
        item_id: item.itemId,
        name: item.name,
        generic_name: item.genericName || null,
        strength: item.strength || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        batch_number: item.batchNumber || null,
        expiry_date: item.expiryDate || null,
        total: item.unitPrice * item.quantity,
      }))

      // 1. Create the pharmacy_sales row
      const saleRecord = await addSale({
        hospital_id: hospital.id,
        sale_number: saleNumber,
        sale_type: 'walk_in',
        customer_name: customerName.trim(),
        patient_id: null,
        prescription_id: null,
        items: itemsJson,
        subtotal,
        discount: discountAmount,
        total,
        payment_method: paymentMethod,
        amount_paid: paidAmount,
        balance,
        status: 'completed',
        dispensed_by: profile?.id || null,
        dispensed_by_name: profile?.full_name || null,
      })

      // 2. Deduct stock for each item (single authoritative deduction point)
      for (const item of cart) {
        const invItem = inventoryItems.find(inv => inv.id === item.itemId)
        if (invItem) {
          const newQty = Number(invItem.quantity) - item.quantity
          await updateInventory(item.itemId, {
            quantity: Math.max(0, newQty),
            updated_at: new Date().toISOString(),
          })
        }
      }

      // 3. Audit trail
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'pharmacy.walk_in_sale',
        entityType: 'pharmacy_sale', entityId: saleRecord?.id || null,
        summary: `Walk-in sale ${saleNumber} — ${customerName.trim()} — ${formatMoney(total)} (${payment_method})`,
        metadata: {
          sale_number: saleNumber, customer_name: customerName.trim(),
          items_count: cart.length, subtotal, discount: discountAmount,
          total, payment_method: paymentMethod, amount_paid: paidAmount,
        },
      })

      setCompletedSale({
        saleNumber,
        customerName: customerName.trim(),
        items: itemsJson,
        subtotal, discount: discountAmount, total,
        paymentMethod, amountPaid: paidAmount, balance,
        saleId: saleRecord?.id,
        createdAt: new Date().toISOString(),
      })

      onSaleComplete?.(saleRecord)
    } catch (err) {
      setError(err.message || 'Could not complete the sale.')
    } finally {
      setProcessing(false)
    }
  }

  const handlePrintReceipt = () => {
    if (!completedSale) return

    const itemsRows = completedSale.items.map(it =>
      `<tr><td>${escapeHtml(it.name)}${it.strength ? ' ' + escapeHtml(it.strength) : ''}</td><td>${it.quantity}</td><td>${formatMoney(it.unit_price)}</td><td>${formatMoney(it.total)}</td></tr>`
    ).join('')

    const html = `
      <html><head><title>Receipt ${completedSale.saleNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; max-width: 600px; margin: auto; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
        .h-name { font-size: 24px; font-weight: bold; text-transform: uppercase; }
        .h-meta { font-size: 14px; color: #555; margin-top: 5px; }
        .pharm-title { background: #0B1F33; color: #00D6C9; padding: 10px; border-radius: 8px; text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 20px; }
        .grid { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; }
        .box { background: #f8f9fa; padding: 15px; border-radius: 8px; width: 48%; }
        .box h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #888; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f8f9fa; font-weight: bold; }
        .totals { margin-left: auto; width: 300px; font-size: 14px; }
        .totals div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .totals .grand { font-weight: bold; font-size: 18px; border-bottom: 2px solid #000; }
        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #888; }
      </style></head><body>
        <div class="header">
          <div class="h-name">${escapeHtml(hospital?.name || 'Hospital')}</div>
          ${hospital?.phone ? `<div class="h-meta">Tel: ${escapeHtml(hospital.phone)}</div>` : ''}
        </div>
        <div class="pharm-title">PHARMACY RECEIPT</div>
        <div class="grid">
          <div class="box">
            <h3>Customer</h3>
            <div><strong>Name:</strong> ${escapeHtml(completedSale.customerName)}</div>
          </div>
          <div class="box">
            <h3>Sale Details</h3>
            <div><strong>Receipt #:</strong> ${completedSale.saleNumber}</div>
            <div><strong>Date:</strong> ${formatDateTime(completedSale.createdAt, timezone)}</div>
            <div><strong>Payment:</strong> ${escapeHtml(completedSale.paymentMethod)}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Medicine</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span> <span>${formatMoney(completedSale.subtotal)}</span></div>
          ${completedSale.discount > 0 ? `<div><span>Discount</span> <span>-${formatMoney(completedSale.discount)}</span></div>` : ''}
          <div><span>Amount Paid</span> <span>${formatMoney(completedSale.amountPaid)}</span></div>
          <div class="grand"><span>Total</span> <span>${formatMoney(completedSale.total)}</span></div>
          ${completedSale.balance > 0 ? `<div><span>Balance Due</span> <span>${formatMoney(completedSale.balance)}</span></div>` : ''}
        </div>
        <div class="footer">Thank you for your purchase. This is a computer-generated receipt.</div>
      </body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  const handleClose = () => {
    if (processing) return
    if (completedSale) {
      setCompletedSale(null)
      setCustomerName('')
      setCart([])
      setAmountPaid('')
      setDiscount('')
      setPaymentMethod('Cash')
    }
    onClose?.()
  }

  // ---- Completed sale view ----
  if (completedSale) {
    return (
      <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
        <div className="card dash-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <div className="dash-modal-title" style={{ color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppIcon name="check" size={20} /> Sale Completed
          </div>
          <div className="dash-modal-body">
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--font-mono, monospace)' }}>{completedSale.saleNumber}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{completedSale.customerName}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)', marginTop: 16 }}>{formatMoney(completedSale.total)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{completedSale.items.length} item(s) · {completedSale.paymentMethod}</div>
            </div>
          </div>
          <div className="dash-modal-actions">
            <button className="btn btn-ghost" onClick={handleClose}>Close</button>
            <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={handlePrintReceipt}>
              <AppIcon name="print" size={15} /> Print Receipt
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title">Walk-in Sale</div>
            <div style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 700, marginTop: 2 }}>Pharmacy POS</div>
          </div>
          <button className="dash-icon-btn" onClick={handleClose} aria-label="Close"><AppIcon name="close" size={18} /></button>
        </div>

        <div className="dash-modal-body">
          {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

          {/* Customer name */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Customer Name *</label>
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Enter customer name"
              autoFocus
            />
          </div>

          {/* Medicine search */}
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Search Medicines</label>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Type medicine name to search..."
            />
          </div>

          {/* Search results */}
          {searchTerm.trim() && availableDrugs.length > 0 && (
            <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--line-soft)', borderRadius: 8 }}>
              {availableDrugs.slice(0, 8).map(drug => (
                <div
                  key={drug.id}
                  onClick={() => { addToCart(drug); setSearchTerm('') }}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,199,199,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ivory)' }}>{drug.name}</span>
                    {drug.strength && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{drug.strength}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{drug.quantity} {drug.unit || 'units'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(drug.selling_price)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cart */}
          {cart.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Cart ({cart.length})</div>
              {cart.map(item => (
                <div key={item.itemId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ivory)' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatMoney(item.unitPrice)} each · {item.batchNumber ? `Batch ${item.batchNumber}` : 'No batch'}</div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={item.maxQty}
                    value={item.quantity}
                    onChange={e => updateCartQty(item.itemId, e.target.value)}
                    style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)', fontSize: 13, textAlign: 'center' }}
                  />
                  <div style={{ minWidth: 80, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {formatMoney(item.unitPrice * item.quantity)}
                  </div>
                  <button onClick={() => removeFromCart(item.itemId)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }} aria-label="Remove">
                    <AppIcon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--line)', marginBottom: 16 }}>
              Search and add medicines to the cart.
            </div>
          )}

          {/* Totals + Payment */}
          {cart.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Discount (₦)</span>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  placeholder="0.00"
                  style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)', fontSize: 13, textAlign: 'right' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
                <span style={{ color: 'var(--ivory)' }}>Total</span>
                <span style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(total)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Payment Method</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Amount Paid (₦)</label>
                  <input
                    type="number"
                    min="0"
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    placeholder={total.toFixed(2)}
                    style={{ fontSize: 16, fontWeight: 700 }}
                  />
                </div>
              </div>
              {paidAmount > 0 && balance > 0 && (
                <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 10 }}>
                  Balance due: {formatMoney(balance)}
                </div>
              )}
              {paidAmount >= total && paidAmount > 0 && (
                <div style={{ fontSize: 12, color: 'var(--mint)', marginBottom: 10 }}>
                  Change: {formatMoney(paidAmount - total)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={processing}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCompleteSale}
            disabled={processing || cart.length === 0 || !customerName.trim() || paidAmount < total}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            {processing ? (
              <><AppIcon name="loading" size={15} spin /> Processing…</>
            ) : (
              <>Complete Sale — {formatMoney(total)}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
