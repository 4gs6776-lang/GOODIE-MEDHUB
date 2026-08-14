import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

export default function Pharmacy() {
  const { profile, hospital } = useAuth()

  /*
   * IMPORTANT:
   * Pharmacy now uses inventory_items instead of pharmacy_items.
   *
   * This means:
   * Excel Import
   *      ↓
   * inventory_items
   *      ↓
   * Pharmacy
   */
  const {
    records: inventoryItems,
    loading,
    isOnline,
    pendingCount,
    updateRecord,
    refreshTable
  } = useOfflineTable('inventory_items', hospital?.id)

  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showDetails, setShowDetails] = useState(null)
  const [showDispenseModal, setShowDispenseModal] = useState(false)
  const [dispensingItem, setDispensingItem] = useState(null)
  const [dispenseQuantity, setDispenseQuantity] = useState('')
  const [dispensing, setDispensing] = useState(false)
  const [dispenseError, setDispenseError] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  /*
   * Only items whose category is Drug
   * will appear in Pharmacy.
   */
  const drugs = inventoryItems.filter(
    item =>
      String(item.category || '')
        .trim()
        .toLowerCase() === 'drug'
  )

  /*
   * Search drugs.
   */
  const pharmacySearch = searchTerm.trim().toLowerCase()

  const visibleItems = pharmacySearch
    ? drugs.filter(item =>
        [
          item.name,
          item.generic_name,
          item.strength,
          item.dosage_form,
          item.batch_number,
          item.supplier,
          item.id
        ].some(value =>
          String(value || '')
            .toLowerCase()
            .includes(pharmacySearch)
        )
      )
    : drugs

  /*
   * Low stock.
   */
  const lowStockCount = drugs.filter(item => {
    const quantity = Number(item.quantity || 0)
    const reorderLevel = Number(item.reorder_level || 0)

    return quantity <= reorderLevel
  }).length

  /*
   * Expired drugs.
   */
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiredCount = drugs.filter(item => {
    if (!item.expiry_date) return false

    const expiry = new Date(item.expiry_date)
    expiry.setHours(0, 0, 0, 0)

    return expiry < today
  }).length

  /*
   * Drugs expiring within the next 30 days.
   */
  const expiringSoonCount = drugs.filter(item => {
    if (!item.expiry_date) return false

    const expiry = new Date(item.expiry_date)
    expiry.setHours(0, 0, 0, 0)

    const difference =
      expiry.getTime() - today.getTime()

    const days =
      difference / (1000 * 60 * 60 * 24)

    return days >= 0 && days <= 30
  }).length

  /*
   * Format money.
   */
  function formatMoney(value) {
    return (
      '₦' +
      Number(value || 0).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    )
  }

  /*
   * Format expiry date.
   */
  function formatDate(value) {
    if (!value) return '—'

    const date = new Date(value)

    if (isNaN(date.getTime())) {
      return value
    }

    return date.toLocaleDateString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  /*
   * Check whether drug has expired.
   */
  function isExpired(item) {
    if (!item.expiry_date) return false

    const expiry = new Date(item.expiry_date)
    expiry.setHours(0, 0, 0, 0)

    return expiry < today
  }

  /*
   * Check whether drug expires soon.
   */
  function isExpiringSoon(item) {
    if (!item.expiry_date) return false

    const expiry = new Date(item.expiry_date)
    expiry.setHours(0, 0, 0, 0)

    const difference =
      expiry.getTime() - today.getTime()

    const days =
      difference / (1000 * 60 * 60 * 24)

    return days >= 0 && days <= 30
  }

  /*
   * Restock/update stock.
   */
  async function handleRestock(item) {
    const input = prompt(
      `Current stock: ${item.quantity} ${item.unit}\n\nEnter new quantity:`,
      item.quantity
    )

    if (input === null) return

    const newQuantity = parseInt(input, 10)

    if (isNaN(newQuantity) || newQuantity < 0) {
      showToast('Please enter a valid quantity')
      return
    }

    try {
      await updateRecord(item.id, {
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      })

      showToast(
        isOnline
          ? 'Stock updated'
          : 'Stock updated — will sync when back online'
      )
    } catch (err) {
      showToast(err.message || 'Could not update stock')
    }
  }

  /*
   * Open dispense modal.
   */
  function openDispense(item) {
    setDispensingItem(item)
    setDispenseQuantity('')
    setDispenseError('')
    setShowDispenseModal(true)
  }

  /*
   * Close dispense modal.
   */
  function closeDispense() {
    if (dispensing) return

    setShowDispenseModal(false)
    setDispensingItem(null)
    setDispenseQuantity('')
    setDispenseError('')
  }

  /*
   * Dispense medication.
   *
   * This directly reduces quantity in inventory_items.
   */
  async function handleDispense(e) {
    e.preventDefault()

    if (!dispensingItem) return

    setDispenseError('')

    const quantityToDispense =
      parseInt(dispenseQuantity, 10)

    if (
      isNaN(quantityToDispense) ||
      quantityToDispense <= 0
    ) {
      setDispenseError(
        'Enter a valid quantity greater than zero.'
      )
      return
    }

    const currentQuantity =
      parseInt(dispensingItem.quantity, 10) || 0

    if (quantityToDispense > currentQuantity) {
      setDispenseError(
        `Insufficient stock. Only ${currentQuantity} ${dispensingItem.unit || 'units'} available.`
      )
      return
    }

    if (isExpired(dispensingItem)) {
      setDispenseError(
        'This drug has expired and cannot be dispensed.'
      )
      return
    }

    setDispensing(true)

    try {
      const newQuantity =
        currentQuantity - quantityToDispense

      await updateRecord(dispensingItem.id, {
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      })

      showToast(
        isOnline
          ? `${quantityToDispense} ${dispensingItem.unit || 'units'} of ${dispensingItem.name} dispensed`
          : `${quantityToDispense} ${dispensingItem.unit || 'units'} dispensed — will sync when back online`
      )

      closeDispense()

      if (refreshTable) {
        await refreshTable()
      }
    } catch (err) {
      setDispenseError(
        err.message || 'Could not dispense medication.'
      )
    } finally {
      setDispensing(false)
    }
  }

  return (
    <>
      {/* =========================
          STATISTICS
      ========================== */}
      <div
        className="dash-stats"
        style={{
          gridTemplateColumns:
            'repeat(4, 1fr)',
          marginBottom: 20
        }}
      >

        {/* Total Drugs */}
        <div className="dash-stat-card">
          <div
            className="dash-stat-icon"
            style={{
              background: 'var(--teal-soft)',
              color: 'var(--teal)'
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M9 3h6l1 4H8l1-4Z" />
              <path d="M6 7h12l-1 14H7L6 7Z" />
            </svg>
          </div>

          <div>
            <div className="dash-stat-label">
              Total Drugs
            </div>

            <div className="dash-stat-value">
              {drugs.length}
            </div>

            <div className="dash-stat-delta">
              from inventory
            </div>
          </div>
        </div>

        {/* Low Stock */}
        <div className="dash-stat-card">
          <div
            className="dash-stat-icon"
            style={{
              background: 'var(--danger-soft)',
              color: 'var(--danger)'
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>

          <div>
            <div className="dash-stat-label">
              Low Stock
            </div>

            <div
              className="dash-stat-value"
              style={{
                color:
                  lowStockCount > 0
                    ? 'var(--danger)'
                    : undefined
              }}
            >
              {lowStockCount}
            </div>

            <div
              className="dash-stat-delta"
              style={{
                color:
                  lowStockCount > 0
                    ? 'var(--danger)'
                    : 'var(--teal)'
              }}
            >
              {lowStockCount > 0
                ? 'needs reorder'
                : 'all stocked'}
            </div>
          </div>
        </div>

        {/* Expired */}
        <div className="dash-stat-card">
          <div
            className="dash-stat-icon"
            style={{
              background:
                'rgba(225,104,94,0.14)',
              color: 'var(--danger)'
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
              />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>

          <div>
            <div className="dash-stat-label">
              Expired
            </div>

            <div
              className="dash-stat-value"
              style={{
                color:
                  expiredCount > 0
                    ? 'var(--danger)'
                    : undefined
              }}
            >
              {expiredCount}
            </div>

            <div className="dash-stat-delta">
              expired drugs
            </div>
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="dash-stat-card">
          <div
            className="dash-stat-icon"
            style={{
              background:
                'rgba(212,175,55,0.14)',
              color: 'var(--gold)'
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
              />
              <path d="M12 7v5" />
              <path d="M12 16h.01" />
            </svg>
          </div>

          <div>
            <div className="dash-stat-label">
              Expiring Soon
            </div>

            <div className="dash-stat-value">
              {expiringSoonCount}
            </div>

            <div
              className="dash-stat-delta"
              style={{
                color: 'var(--gold)'
              }}
            >
              within 30 days
            </div>
          </div>
        </div>
      </div>

      {/* =========================
          PHARMACY TABLE
      ========================== */}
      <div className="dash-panel">

        <div className="dash-panel-head">

          <div>
            <div className="dash-panel-title">
              Pharmacy
            </div>

            <div
              className="dash-panel-sub"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: isOnline
                    ? 'var(--teal)'
                    : 'var(--danger)',
                  display: 'inline-block'
                }}
              />

              {isOnline
                ? 'Online'
                : 'Offline'}

              {pendingCount > 0
                ? ` · ${pendingCount} syncing`
                : ''}

              {' · Drugs linked to Inventory'}
            </div>
          </div>

          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search drug, generic name, batch..."
            style={{
              minWidth: 260,
              maxWidth: 420
            }}
          />

        </div>

        {/* Loading */}
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--muted)'
            }}
          >
            Loading pharmacy...
          </div>

        ) : visibleItems.length === 0 ? (

          <div
            style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--muted)'
            }}
          >
            {drugs.length === 0
              ? 'No drugs found in Inventory. Import or add drugs from the Inventory section.'
              : 'No drugs match your search.'}
          </div>

        ) : (

          <div
            style={{
              overflowX: 'auto'
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 950
              }}
            >

              <thead>
                <tr>

                  {[
                    'Drug',
                    'Strength / Form',
                    'Batch',
                    'Expiry',
                    'Stock',
                    'Selling Price',
                    'Status',
                    ''
                  ].map(header => (
                    <th
                      key={header}
                      style={{
                        textAlign: 'left',
                        fontSize: 11,
                        color: 'var(--muted)',
                        padding:
                          '0 12px 12px',
                        textTransform:
                          'uppercase',
                        letterSpacing: 1,
                        whiteSpace:
                          'nowrap'
                      }}
                    >
                      {header}
                    </th>
                  ))}

                </tr>
              </thead>

              <tbody>

                {visibleItems.map(item => {

                  const quantity =
                    Number(item.quantity || 0)

                  const reorderLevel =
                    Number(
                      item.reorder_level || 0
                    )

                  const isLow =
                    quantity <= reorderLevel

                  const expired =
                    isExpired(item)

                  const expiringSoon =
                    isExpiringSoon(item)

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderTop:
                          '1px solid var(--line-soft)'
                      }}
                    >

                      {/* Drug */}
                      <td
                        style={{
                          padding: 12
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700
                          }}
                        >
                          {item.name}
                        </div>

                        {item.generic_name &&
                          item.generic_name !==
                            item.name && (
                            <div
                              style={{
                                fontSize: 11,
                                color:
                                  'var(--muted)',
                                marginTop: 3
                              }}
                            >
                              Generic:{' '}
                              {
                                item.generic_name
                              }
                            </div>
                          )}
                      </td>

                      {/* Strength/Form */}
                      <td
                        style={{
                          padding: 12,
                          color:
                            'var(--muted)',
                          fontSize: 12
                        }}
                      >
                        <div>
                          {item.strength ||
                            '—'}
                        </div>

                        <div
                          style={{
                            marginTop: 3
                          }}
                        >
                          {item.dosage_form ||
                            '—'}
                        </div>
                      </td>

                      {/* Batch */}
                      <td
                        style={{
                          padding: 12,
                          fontFamily:
                            'var(--font-mono)',
                          fontSize: 11.5,
                          color:
                            'var(--muted)'
                        }}
                      >
                        {item.batch_number ||
                          '—'}
                      </td>

                      {/* Expiry */}
                      <td
                        style={{
                          padding: 12,
                          fontSize: 12
                        }}
                      >
                        <span
                          style={{
                            color: expired
                              ? 'var(--danger)'
                              : expiringSoon
                              ? 'var(--gold)'
                              : 'var(--muted)',
                            fontWeight:
                              expired ||
                              expiringSoon
                                ? 700
                                : 400
                          }}
                        >
                          {formatDate(
                            item.expiry_date
                          )}
                        </span>
                      </td>

                      {/* Stock */}
                      <td
                        style={{
                          padding: 12
                        }}
                      >
                        <span
                          onClick={() =>
                            handleRestock(item)
                          }
                          style={{
                            fontFamily:
                              'var(--font-mono)',
                            fontSize: 12,
                            cursor: 'pointer',
                            padding:
                              '4px 10px',
                            borderRadius: 20,
                            fontWeight: 700,
                            background: isLow
                              ? 'var(--danger-soft)'
                              : 'var(--teal-soft)',
                            color: isLow
                              ? 'var(--danger)'
                              : 'var(--teal)'
                          }}
                          title="Click to update stock"
                        >
                          {quantity}{' '}
                          {item.unit ||
                            'units'}
                        </span>
                      </td>

                      {/* Price */}
                      <td
                        style={{
                          padding: 12,
                          fontFamily:
                            'var(--font-mono)',
                          fontSize: 12.5,
                          color:
                            'var(--muted)'
                        }}
                      >
                        {formatMoney(
                          item.selling_price
                        )}
                      </td>

                      {/* Status */}
                      <td
                        style={{
                          padding: 12
                        }}
                      >

                        {expired ? (

                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color:
                                'var(--danger)'
                            }}
                          >
                            EXPIRED
                          </span>

                        ) : isLow ? (

                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color:
                                'var(--danger)'
                            }}
                          >
                            LOW STOCK
                          </span>

                        ) : expiringSoon ? (

                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color:
                                'var(--gold)'
                            }}
                          >
                            EXPIRING SOON
                          </span>

                        ) : (

                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color:
                                'var(--teal)'
                            }}
                          >
                            AVAILABLE
                          </span>

                        )}

                      </td>

                      {/* Actions */}
                      <td
                        style={{
                          padding: 12,
                          display: 'flex',
                          gap: 6
                        }}
                      >

                        <button
                          className="btn btn-primary"
                          style={{
                            width: 'auto',
                            padding:
                              '7px 12px',
                            fontSize: 11,
                            opacity:
                              expired ||
                              quantity <= 0
                                ? 0.5
                                : 1
                          }}
                          disabled={
                            expired ||
                            quantity <= 0
                          }
                          onClick={() =>
                            openDispense(item)
                          }
                        >
                          Dispense
                        </button>

                        <button
                          onClick={() =>
                            setShowDetails(item)
                          }
                          style={{
                            background:
                              'transparent',
                            border:
                              '1px solid var(--line)',
                            color:
                              'var(--muted)',
                            borderRadius: 8,
                            padding:
                              '6px 9px',
                            cursor: 'pointer',
                            fontSize: 11
                          }}
                        >
                          View
                        </button>

                      </td>

                    </tr>
                  )
                })}

              </tbody>

            </table>
          </div>
        )}
      </div>

      {/* =========================
          DETAILS MODAL
      ========================== */}
      {showDetails && (

        <div
          style={{
            position: 'fixed',
            inset: 0,
            background:
              'rgba(0,3,26,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 20
          }}
        >

          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 500,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >

            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                marginBottom: 20
              }}
            >

              <div
                style={{
                  fontFamily:
                    'var(--font-display)',
                  fontSize: 19
                }}
              >
                Drug Details
              </div>

              <button
                onClick={() =>
                  setShowDetails(null)
                }
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 18
                }}
              >
                ✕
              </button>

            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap: 12
              }}
            >

              {[
                ['Drug Name', showDetails.name],
                [
                  'Generic Name',
                  showDetails.generic_name
                ],
                [
                  'Strength',
                  showDetails.strength
                ],
                [
                  'Dosage Form',
                  showDetails.dosage_form
                ],
                [
                  'Category',
                  showDetails.category
                ],
                [
                  'Unit',
                  showDetails.unit
                ],
                [
                  'Quantity',
                  `${showDetails.quantity || 0} ${
                    showDetails.unit || ''
                  }`
                ],
                [
                  'Reorder Level',
                  showDetails.reorder_level
                ],
                [
                  'Supplier',
                  showDetails.supplier
                ],
                [
                  'Batch Number',
                  showDetails.batch_number
                ],
                [
                  'Expiry Date',
                  formatDate(
                    showDetails.expiry_date
                  )
                ],
                [
                  'Cost Price',
                  formatMoney(
                    showDetails.cost_price
                  )
                ],
                [
                  'Selling Price',
                  formatMoney(
                    showDetails.selling_price
                  )
                ]
              ].map(([label, value]) => (

                <div
                  key={label}
                  style={{
                    border:
                      '1px solid var(--line-soft)',
                    borderRadius: 8,
                    padding: 10
                  }}
                >

                  <div
                    style={{
                      fontSize: 10,
                      color:
                        'var(--muted)',
                      textTransform:
                        'uppercase',
                      letterSpacing: 0.7,
                      marginBottom: 4
                    }}
                  >
                    {label}
                  </div>

                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight:
                        label ===
                        'Drug Name'
                          ? 700
                          : 400
                    }}
                  >
                    {value || '—'}
                  </div>

                </div>

              ))}

            </div>

            <button
              className="btn btn-ghost"
              style={{
                marginTop: 20
              }}
              onClick={() =>
                setShowDetails(null)
              }
            >
              Close
            </button>

          </div>

        </div>
      )}

      {/* =========================
          DISPENSE MODAL
      ========================== */}
      {showDispenseModal &&
        dispensingItem && (

          <div
            style={{
              position: 'fixed',
              inset: 0,
              background:
                'rgba(0,3,26,0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: 20
            }}
          >

            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 420
              }}
            >

              <div
                style={{
                  fontFamily:
                    'var(--font-display)',
                  fontSize: 19,
                  marginBottom: 8
                }}
              >
                Dispense Medication
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: 'var(--muted)',
                  marginBottom: 18
                }}
              >
                {dispensingItem.name}

                {dispensingItem.strength
                  ? ` · ${dispensingItem.strength}`
                  : ''}

                {dispensingItem.dosage_form
                  ? ` · ${dispensingItem.dosage_form}`
                  : ''}
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background:
                    'var(--teal-soft)',
                  marginBottom: 16
                }}
              >

                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)'
                  }}
                >
                  Available Stock
                </div>

                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: 'var(--teal)',
                    marginTop: 3
                  }}
                >
                  {dispensingItem.quantity}{' '}
                  {dispensingItem.unit ||
                    'units'}
                </div>

              </div>

              {dispenseError && (

                <div
                  className="error-box"
                  style={{
                    marginBottom: 12
                  }}
                >
                  {dispenseError}
                </div>

              )}

              <form
                onSubmit={handleDispense}
              >

                <div className="field">

                  <label>
                    Quantity to Dispense
                  </label>

                  <input
                    type="number"
                    min="1"
                    max={
                      dispensingItem.quantity
                    }
                    value={
                      dispenseQuantity
                    }
                    onChange={e =>
                      setDispenseQuantity(
                        e.target.value
                      )
                    }
                    placeholder={`Maximum ${dispensingItem.quantity}`}
                    autoFocus
                  />

                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 22
                  }}
                >

                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={closeDispense}
                    disabled={dispensing}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={dispensing}
                  >
                    {dispensing
                      ? 'Dispensing…'
                      : 'Confirm Dispense'}
                  </button>

                </div>

              </form>

            </div>

          </div>
        )}

      {/* =========================
          TOAST
      ========================== */}
      {toast && (

        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform:
              'translateX(-50%)',
            background:
              'var(--bg-elevated)',
            border:
              '1px solid var(--teal)',
            color: 'var(--teal)',
            padding: '12px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 60,
            maxWidth: '85vw',
            textAlign: 'center'
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}
