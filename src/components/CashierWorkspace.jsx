import { useState, useMemo, useEffect } from 'react'
import { useRealtimeAlert } from '../lib/useRealtimeAlert'
import { useOfflineTable } from '../lib/useOfflineTable'
import InvoiceViewer from './InvoiceViewer'
import CatalogPicker from './CatalogPicker'
import AppIcon from './icons'
import { writeAudit } from '../lib/audit'
import { useBillingCatalog, formatMoney, nextDocumentNumber } from '../lib/billingService'

const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

export default function CashierWorkspace({ patientId, patientName, hospital, profile, onClose }) {
  const { records: charges, addRecord: addCharge, updateRecord: updateCharge } = useOfflineTable('billable_charges', hospital?.id)
  const { addRecord: addInvoice } = useOfflineTable('invoices', hospital?.id)
  const { addRecord: addInvoiceItem } = useOfflineTable('invoice_items', hospital?.id)
const { records: patients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addInsuranceClaim } = useOfflineTable('insurance_claims', hospital?.id)
  const { records: wallets, addRecord: addWallet, updateRecord: updateWallet, syncFromServer: syncWallets } = useOfflineTable('patient_wallets', hospital?.id)
  const { addRecord: addWalletTxn, syncFromServer: syncWalletTxns } = useOfflineTable('patient_wallet_transactions', hospital?.id)

  useRealtimeAlert('patient_wallets', hospital?.id, () => { syncWallets() }, { event: 'UPDATE' })
  useRealtimeAlert('patient_wallets', hospital?.id, () => { syncWallets() })

  const { catalog, priceLists, priceListItems, contracts, paymentMethods } = useBillingCatalog()
  const [showCatalogPicker, setShowCatalogPicker] = useState(false)

  const [selectedIds, setSelectedIds] = useState([])
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = use