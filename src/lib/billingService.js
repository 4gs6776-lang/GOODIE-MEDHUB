// src/lib/billingService.js
export const billingService = {
  // Master data
  catalog: {
    list: () => useOfflineTable('service_catalog'),
    create: (data) => writeAudit(..., addRecord('service_catalog', data)),
    update, archive,
  },
  priceLists: { list, create, applyToInvoice },
  contracts: { list, create, getForPatient },

  // Invoice lifecycle
  invoices: {
    createDraft,      // status='draft'
    finalize,         // calls RPC finalize_invoice
    cancel,           // status='cancelled'
    writeOff,         // requires approval if > threshold
    createCreditNote, // calls RPC post_credit_note
  },

  // Payments
  payments: {
    record,           // single invoice
    allocate,         // multi-invoice — calls RPC allocate_payment
    reverse,          // with approval workflow
    refund,           // with approval workflow
  },

  // HMO
  claims: {
    file,             // with clinical summary
    updateStatus,     // calls RPC update_claim_status
    batchSubmit,      // many claims at once
    allocatePayment,  // HMO payment → many claims
    handleShortfall,
  },

  // Reports
  reports: {
    dailyCollection: (date) => ...,
    aging: (asOfDate) => ...,
    revenueByDepartment: (from, to) => ...,
    claimsStatus: () => ...,
    patientStatement: (patientId, from, to) => ...,
    expenseVsRevenue: (from, to) => ...,
  },

  // Approvals
  approvals: {
    request: (type, entityId, amount, reason) => ...,
    approve, reject, listPending,
  },
}
