import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import ImportExcelModal from '../../components/inventory/ImportExcelModal'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

const CATEGORIES = [
  'Consumables',
  'Equipment',
  'PPE',
  'Drug',
  'Office Supplies',
  'Cleaning & Hygiene',
  'Other'
]

export default function Inventory() {
  const { profile, hospital } = useAuth()

  const {
    records: items,
    loading,
    isOnline,
    pendingCount,
    addRecord,
    deleteRecord,
    updateRecord,
    refreshTable
  } = useOfflineTable(
    'inventory_items',
    hospital?.id
  )

  const [showModal, setShowModal] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // New item form
  const [name, setName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('units')
  const [supplier, setSupplier] = useState('')
  const [reorderLevel, setReorderLevel] = useState('10')

  const [costPrice, setCostPrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')

  const [genericName, setGenericName] = useState('')
  const [strength, setStrength] = useState('')
  const [dosageForm, setDosageForm] = useState('')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  /*
  ============================================================
  TOAST
  ============================================================
  */

  function showToast(message) {
    setToast(message)

    setTimeout(() => {
      setToast(null)
    }, 3000)
  }

  /*
  ============================================================
  RESET NEW ITEM FORM
  ============================================================
  */

  function resetForm() {
    setName('')
    setCategory(CATEGORIES[0])
    setQuantity('')
    setUnit('units')
    setSupplier('')
    setReorderLevel('10')

    setCostPrice('')
    setSellingPrice('')
    setBatchNumber('')
    setExpiryDate('')

    setGenericName('')
    setStrength('')
    setDosageForm('')

    setFormError('')
  }

  /*
  ============================================================
  EXCEL IMPORT SAVE
  ============================================================
  */

  async function handleImportSave(
    itemPayload,
    matchedItemId
  ) {
    try {
      /*
      --------------------------------------------------------
      EXISTING ITEM
      --------------------------------------------------------
      If the item already exists, increase its quantity.
      --------------------------------------------------------
      */

      if (matchedItemId) {
        const existingItem = items.find(
          item => item.id === matchedItemId
        )

        const currentQuantity =
          parseInt(
            existingItem?.quantity,
            10
          ) || 0

        const importedQuantity =
          parseInt(
            itemPayload.quantity,
            10
          ) || 0

        const updated = await updateRecord(
          matchedItemId,
          {
            quantity:
              currentQuantity +
              importedQuantity,

            /*
              Update other supplied information
              when importing an existing item.
            */

            category:
              itemPayload.category ||
              existingItem?.category ||
              'Other',

            unit:
              itemPayload.unit ||
              existingItem?.unit ||
              'units',

            supplier:
              itemPayload.supplier ||
              existingItem?.supplier ||
              '',

            reorder_level:
              parseInt(
                itemPayload.reorderLevel,
                10
              ) ||
              parseInt(
                existingItem?.reorder_level,
                10
              ) ||
              10,

            cost_price:
              itemPayload.costPrice !== ''
                ? parseFloat(
                    itemPayload.costPrice
                  ) || 0
                : existingItem?.cost_price || 0,

            selling_price:
              itemPayload.sellingPrice !== ''
                ? parseFloat(
                    itemPayload.sellingPrice
                  ) || 0
                : existingItem?.selling_price || 0,

            batch_number:
              itemPayload.batchNumber ||
              existingItem?.batch_number ||
              '',

            expiry_date:
              itemPayload.expiryDate ||
              existingItem?.expiry_date ||
              null,

            generic_name:
              itemPayload.genericName ||
              existingItem?.generic_name ||
              '',

            strength:
              itemPayload.strength ||
              existingItem?.strength ||
              '',

            dosage_form:
              itemPayload.dosageForm ||
              existingItem?.dosage_form ||
              '',

            updated_at:
              new Date().toISOString()
          }
        )

        return updated
      }

      /*
      --------------------------------------------------------
      NEW ITEM
      --------------------------------------------------------
      */

      const created = await addRecord({
        name:
          itemPayload.name ||
          itemPayload.drugName ||
          'Unnamed Item',

        category:
          itemPayload.category ||
          'Other',

        quantity:
          parseInt(
            itemPayload.quantity,
            10
          ) || 0,

        unit:
          itemPayload.unit ||
          'units',

        supplier:
          itemPayload.supplier ||
          itemPayload.brandName ||
          '',

        reorder_level:
          parseInt(
            itemPayload.reorderLevel,
            10
          ) || 10,

        cost_price:
          parseFloat(
            itemPayload.costPrice
          ) || 0,

        selling_price:
          parseFloat(
            itemPayload.sellingPrice
          ) || 0,

        batch_number:
          itemPayload.batchNumber ||
          '',

        expiry_date:
          itemPayload.expiryDate ||
          null,

        generic_name:
          itemPayload.genericName ||
          '',

        strength:
          itemPayload.strength ||
          '',

        dosage_form:
          itemPayload.dosageForm ||
          '',

        hospital_id:
          hospital?.id,

        created_by:
          profile?.id || null
      })

      return created
    } catch (error) {
      console.error(
        'Import save failed:',
        error
      )

      throw error
    }
  }

  /*
  ============================================================
  CLOSE IMPORT MODAL
  ============================================================
  */

  async function handleCloseImportModal() {
    setIsImportModalOpen(false)

    if (refreshTable) {
      await refreshTable()
    }
  }

  /*
  ============================================================
  ADD NEW INVENTORY ITEM
  ============================================================
  */

  async function handleAdd(event) {
    event.preventDefault()

    setFormError('')

    if (!name.trim()) {
      setFormError(
        'Item name is required.'
      )
      return
    }

    if (quantity === '') {
      setFormError(
        'Quantity is required.'
      )
      return
    }

    const parsedQuantity =
      parseInt(quantity, 10)

    if (
      Number.isNaN(parsedQuantity) ||
      parsedQuantity < 0
    ) {
      setFormError(
        'Quantity must be a valid number.'
      )
      return
    }

    if (!hospital || !profile) {
      setFormError(
        'Still loading your account — try again in a moment.'
      )
      return
    }

    setSaving(true)

    try {
      await addRecord({
        name: name.trim(),

        category,

        quantity: parsedQuantity,

        unit:
          unit.trim() ||
          'units',

        supplier:
          supplier.trim(),

        reorder_level:
          parseInt(
            reorderLevel,
            10
          ) || 10,

        cost_price:
          parseFloat(
            costPrice
          ) || 0,

        selling_price:
          parseFloat(
            sellingPrice
          ) || 0,

        batch_number:
          batchNumber.trim(),

        expiry_date:
          expiryDate || null,

        generic_name:
          genericName.trim(),

        strength:
          strength.trim(),

        dosage_form:
          dosageForm.trim(),

        hospital_id:
          hospital.id,

        created_by:
          profile.id
      })

      setShowModal(false)

      resetForm()

      showToast(
        isOnline
          ? 'Item added successfully'
          : 'Item added — will sync when back online'
      )
    } catch (error) {
      console.error(
        'Add inventory item failed:',
        error
      )

      setFormError(
        error.message ||
        'Could not save item'
      )
    } finally {
      setSaving(false)
    }
  }

  /*
  ============================================================
  UPDATE STOCK
  ============================================================
  */

  async function handleRestock(item) {
    const input = prompt(
      `Current stock: ${item.quantity} ${item.unit}\n\nEnter new quantity:`,
      item.quantity
    )

    if (input === null) {
      return
    }

    const newQuantity =
      parseInt(input, 10)

    if (
      Number.isNaN(newQuantity) ||
      newQuantity < 0
    ) {
      showToast(
        'Please enter a valid quantity.'
      )
      return
    }

    try {
      await updateRecord(
        item.id,
        {
          quantity: newQuantity,

          updated_at:
            new Date().toISOString()
        }
      )

      showToast(
        isOnline
          ? 'Stock updated'
          : 'Stock updated — will sync when back online'
      )
    } catch (error) {
      console.error(
        'Stock update failed:',
        error
      )

      showToast(
        error.message ||
        'Could not update stock'
      )
    }
  }

  /*
  ============================================================
  DELETE ITEM
  ============================================================
  */

  async function handleDelete(item) {
    const confirmed =
      window.confirm(
        `Remove ${item.name} from inventory?`
      )

    if (!confirmed) {
      return
    }

    try {
      await deleteRecord(item.id)

      showToast(
        'Item removed'
      )
    } catch (error) {
      console.error(
        'Delete failed:',
        error
      )

      showToast(
        error.message ||
        'Could not remove item'
      )
    }
  }

  /*
  ============================================================
  SEARCH
  ============================================================
  */

  const inventorySearch =
    searchTerm
      .trim()
      .toLowerCase()

  const sorted =
    [...items]
      .filter(item => {
        if (!inventorySearch) {
          return true
        }

        return [
          item.name,
          item.category,
          item.supplier,
          item.item_code,
          item.id,
          item.generic_name,
          item.strength,
          item.dosage_form,
          item.batch_number
        ].some(value =>
          String(
            value || ''
          )
            .toLowerCase()
            .includes(
              inventorySearch
            )
        )
      })
      .sort(
        (a, b) =>
          (a.name || '').localeCompare(
            b.name || ''
          )
      )

  /*
  ============================================================
  STATISTICS
  ============================================================
  */

  const lowStockItems =
    items.filter(
      item =>
        Number(item.quantity || 0) <=
        Number(item.reorder_level || 0)
    )

  const totalItems =
    items.length

  /*
  ============================================================
  UI
  ============================================================
  */

  return (
    <>
      {/* =====================================================
          DASHBOARD STATS
      ===================================================== */}

      <div
  className="dash-stats"
  style={{
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 16,
    marginBottom: 20,
  }}
>
  {/* TOTAL ITEMS */}
  <div
    className="dash-stat-card"
    style={{
      minHeight: 120,
      padding: 18,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}
  >
    <div
      className="dash-stat-icon"
      style={{
        width: 58,
        height: 58,
        minWidth: 58,
        borderRadius: 14,
        background: 'var(--teal-soft)',
        color: 'var(--teal)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={{ width: 30, height: 30 }}
      >
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </div>

    <div>
      <div
        className="dash-stat-label"
        style={{
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        Total Items Tracked
      </div>

      <div
        className="dash-stat-value"
        style={{
          fontSize: 28,
          lineHeight: 1.1,
          marginBottom: 4,
        }}
      >
        {totalItems}
      </div>

      <div
        className="dash-stat-delta"
        style={{
          fontSize: 11,
        }}
      >
        across all categories
      </div>
    </div>
  </div>

  {/* LOW STOCK */}
  <div
    className="dash-stat-card"
    style={{
      minHeight: 120,
      padding: 18,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}
  >
    <div
      className="dash-stat-icon"
      style={{
        width: 58,
        height: 58,
        minWidth: 58,
        borderRadius: 14,
        background: 'rgba(225,104,94,0.14)',
        color: 'var(--danger)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        style={{ width: 30, height: 30 }}
      >
        <path d="M12 9v4M12 17h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    </div>

    <div>
      <div
        className="dash-stat-label"
        style={{
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        Low Stock Alerts
      </div>

      <div
        className="dash-stat-value"
        style={{
          fontSize: 28,
          lineHeight: 1.1,
          marginBottom: 4,
          color:
            lowStockItems.length > 0
              ? 'var(--danger)'
              : undefined,
        }}
      >
        {lowStockItems.length}
      </div>

      <div
        className="dash-stat-delta"
        style={{
          fontSize: 11,
          color: 'var(--gold)',
        }}
      >
        at or below reorder level
      </div>
    </div>
  </div>
</div>
      {/* =====================================================
          INVENTORY PANEL
      ===================================================== */}

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">
              Inventory & Supplies
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
                  background:
                    isOnline
                      ? 'var(--teal)'
                      : 'var(--danger)',
                  display:
                    'inline-block'
                }}
              />

              {isOnline
                ? 'Online'
                : 'Offline'}

              {pendingCount > 0
                ? ` · ${pendingCount} syncing`
                : ''}
            </div>
          </div>

          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search item, category, supplier or batch"
            style={{
              minWidth: 260,
              maxWidth: 420
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: 8
            }}
          >
            <button
              className="btn btn-primary"
              style={{
                width: 'auto'
              }}
              onClick={() =>
                setIsImportModalOpen(true)
              }
            >
              📊 Import Excel
            </button>

            <button
              className="btn btn-primary"
              style={{
                width: 'auto'
              }}
              onClick={() => {
                resetForm()
                setShowModal(true)
              }}
            >
              + New Item
            </button>
          </div>
        </div>

        {/* ===================================================
            LOADING
        =================================================== */}

        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--muted)'
            }}
          >
            Loading…
          </div>
        ) : sorted.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--muted)'
            }}
          >
            {inventorySearch
              ? 'No matching inventory items found.'
              : 'No inventory items yet. Add your first one above.'}
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
                borderCollapse:
                  'collapse'
              }}
            >
              <thead>
                <tr>
                  {[
                    'Item',
                    'Category',
                    'Stock',
                    'Supplier',
                    'Batch',
                    'Expiry',
                    ''
                  ].map(header => (
                    <th
                      key={header}
                      style={{
                        textAlign:
                          'left',
                        fontSize: 11,
                        color:
                          'var(--muted)',
                        padding:
                          '0 12px 12px',
                        textTransform:
                          'uppercase',
                        letterSpacing:
                          1
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sorted.map(item => {
                  const quantity =
                    Number(
                      item.quantity || 0
                    )

                  const reorderLevel =
                    Number(
                      item.reorder_level ||
                        0
                    )

                  const low =
                    quantity <=
                    reorderLevel

                  const expiry =
                    item.expiry_date

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderTop:
                          '1px solid var(--line-soft)'
                      }}
                    >
                      {/* ITEM */}
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

                        {(item.generic_name ||
                          item.strength ||
                          item.dosage_form) && (
                          <div
                            style={{
                              color:
                                'var(--muted)',
                              fontSize: 11,
                              marginTop: 3
                            }}
                          >
                            {[
                              item.generic_name,
                              item.strength,
                              item.dosage_form
                            ]
                              .filter(Boolean)
                              .join(
                                ' · '
                              )}
                          </div>
                        )}
                      </td>

                      {/* CATEGORY */}
                      <td
                        style={{
                          padding: 12,
                          color:
                            'var(--muted)',
                          fontSize: 12.5
                        }}
                      >
                        {item.category}
                      </td>

                      {/* STOCK */}
                      <td
                        style={{
                          padding: 12
                        }}
                      >
                        <span
                          onClick={() =>
                            handleRestock(
                              item
                            )
                          }
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding:
                              '4px 10px',
                            borderRadius:
                              20,
                            cursor:
                              'pointer',
                            background:
                              low
                                ? 'rgba(225,104,94,0.14)'
                                : 'var(--teal-soft)',
                            color:
                              low
                                ? 'var(--danger)'
                                : 'var(--teal)'
                          }}
                          title="Click to update stock"
                        >
                          {quantity}{' '}
                          {item.unit}
                        </span>
                      </td>

                      {/* SUPPLIER */}
                      <td
                        style={{
                          padding: 12,
                          color:
                            'var(--muted)',
                          fontSize: 12.5
                        }}
                      >
                        {item.supplier ||
                          '—'}
                      </td>

                      {/* BATCH */}
                      <td
                        style={{
                          padding: 12,
                          color:
                            'var(--muted)',
                          fontSize: 12
                        }}
                      >
                        {item.batch_number ||
                          '—'}
                      </td>

                      {/* EXPIRY */}
                      <td
                        style={{
                          padding: 12,
                          color:
                            'var(--muted)',
                          fontSize: 12
                        }}
                      >
                        {expiry || '—'}
                      </td>

                      {/* DELETE */}
                      <td
                        style={{
                          padding: 12
                        }}
                      >
                        <button
                          onClick={() =>
                            handleDelete(
                              item
                            )
                          }
                          style={{
                            background:
                              'transparent',
                            border:
                              '1px solid var(--line)',
                            color:
                              'var(--muted)',
                            borderRadius:
                              8,
                            width: 32,
                            height: 32,
                            cursor:
                              'pointer'
                          }}
                          title="Delete"
                        >
                          ✕
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

      {/* =====================================================
          NEW ITEM MODAL
      ===================================================== */}

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background:
              'rgba(0,3,26,0.72)',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            zIndex: 50,
            padding: 20
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 500,
              maxHeight:
                '90vh',
              overflowY:
                'auto'
            }}
          >
            <div
              style={{
                fontFamily:
                  'var(--font-display)',
                fontSize: 19,
                marginBottom: 18
              }}
            >
              New Inventory Item
            </div>

            {formError && (
              <div className="error-box">
                {formError}
              </div>
            )}

            <form
              onSubmit={handleAdd}
            >
              {/* NAME */}
              <div className="field">
                <label>
                  Item Name *
                </label>

                <input
                  value={name}
                  onChange={e =>
                    setName(
                      e.target.value
                    )
                  }
                  placeholder="e.g. Ceftriaxone"
                />
              </div>

              {/* CATEGORY */}
              <div className="field">
                <label>
                  Category *
                </label>

                <select
                  value={category}
                  onChange={e =>
                    setCategory(
                      e.target.value
                    )
                  }
                >
                  {CATEGORIES.map(
                    value => (
                      <option
                        key={value}
                        value={value}
                      >
                        {value}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* GENERIC NAME */}
              <div className="field">
                <label>
                  Generic Name
                </label>

                <input
                  value={genericName}
                  onChange={e =>
                    setGenericName(
                      e.target.value
                    )
                  }
                  placeholder="e.g. Ceftriaxone"
                />
              </div>

              {/* STRENGTH */}
              <div className="field">
                <label>
                  Strength
                </label>

                <input
                  value={strength}
                  onChange={e =>
                    setStrength(
                      e.target.value
                    )
                  }
                  placeholder="e.g. 1g"
                />
              </div>

              {/* DOSAGE FORM */}
              <div className="field">
                <label>
                  Dosage Form
                </label>

                <input
                  value={dosageForm}
                  onChange={e =>
                    setDosageForm(
                      e.target.value
                    )
                  }
                  placeholder="e.g. Injection, Tablet"
                />
              </div>

              {/* QUANTITY */}
              <div className="field">
                <label>
                  Quantity *
                </label>

                <input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={e =>
                    setQuantity(
                      e.target.value
                    )
                  }
                  placeholder="0"
                />
              </div>

              {/* UNIT */}
              <div className="field">
                <label>
                  Unit
                </label>

                <input
                  value={unit}
                  onChange={e =>
                    setUnit(
                      e.target.value
                    )
                  }
                  placeholder="e.g. units, boxes, vials"
                />
              </div>

              {/* SUPPLIER */}
              <div className="field">
                <label>
                  Supplier
                </label>

                <input
                  value={supplier}
                  onChange={e =>
                    setSupplier(
                      e.target.value
                    )
                  }
                  placeholder="e.g. MedSupply Nigeria"
                />
              </div>

              {/* REORDER */}
              <div className="field">
                <label>
                  Reorder Level
                </label>

                <input
                  type="number"
                  min="0"
                  value={reorderLevel}
                  onChange={e =>
                    setReorderLevel(
                      e.target.value
                    )
                  }
                  placeholder="10"
                />
              </div>

              {/* COST */}
              <div className="field">
                <label>
                  Cost Price
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={e =>
                    setCostPrice(
                      e.target.value
                    )
                  }
                  placeholder="0"
                />
              </div>

              {/* SELLING */}
              <div className="field">
                <label>
                  Selling Price
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellingPrice}
                  onChange={e =>
                    setSellingPrice(
                      e.target.value
                    )
                  }
                  placeholder="0"
                />
              </div>

              {/* BATCH */}
              <div className="field">
                <label>
                  Batch Number
                </label>

                <input
                  value={batchNumber}
                  onChange={e =>
                    setBatchNumber(
                      e.target.value
                    )
                  }
                  placeholder="e.g. BATCH-001"
                />
              </div>

              {/* EXPIRY */}
              <div className="field">
                <label>
                  Expiry Date
                </label>

                <input
                  type="date"
                  value={expiryDate}
                  onChange={e =>
                    setExpiryDate(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* BUTTONS */}
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
                  onClick={() => {
                    setShowModal(false)
                    resetForm()
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving…'
                    : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          EXCEL IMPORT
      ===================================================== */}

      <ImportExcelModal
        isOpen={
          isImportModalOpen
        }
        onClose={
          handleCloseImportModal
        }
        existingInventory={
          items || []
        }
        onImportSuccess={
          handleImportSave
        }
        hospitalId={
          hospital?.id
        }
      />

      {/* =====================================================
          TOAST
      ===================================================== */}

      {toast && (
        <div
          style={{
            position:
              'fixed',
            bottom: 24,
            left: '50%',
            transform:
              'translateX(-50%)',
            background:
              'var(--bg-elevated)',
            border:
              '1px solid var(--teal)',
            color:
              'var(--teal)',
            padding:
              '12px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 60,
            maxWidth:
              '85vw',
            textAlign:
              'center'
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}
