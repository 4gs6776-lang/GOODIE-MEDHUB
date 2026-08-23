import {
  useState,
  useEffect,
  useCallback,
} from 'react'

import { supabase } from './supabaseClient'

const DB_NAME = 'HospitalOfflineDB'
const DB_VERSION = 3

const STORE_NAME = 'offline_records'

// Tables that must NEVER be hard-deleted (clinical history is referenced
// by child rows: vitals, lab orders, prescriptions, invoices...).
// A delete on these becomes an update that stamps deleted_at.
const SOFT_DELETE_TABLES = new Set(['patients'])

// ============================================================
// OPEN INDEXED DB
// ============================================================

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported by this browser.'))
      return
    }

    let settled = false

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new Error(
          'Could not open the local database — another open tab of this app may be blocking it. Close other tabs/windows running this app and try again.'
        )
      )
    }, 8000)

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('table_name', 'table_name', { unique: false })
        store.createIndex('hospital_id', 'hospital_id', { unique: false })
        store.createIndex('synced', '_synced', { unique: false })
      }
    }

    request.onsuccess = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }

    request.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      reject(request.error)
    }

    request.onblocked = () => {
      console.warn('IndexedDB upgrade blocked. Close other tabs using the app.')
    }
  })
}

// ============================================================
// UUID GENERATOR
// ============================================================

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ============================================================
// CURRENT TIMESTAMP
// ============================================================

function nowISO() {
  return new Date().toISOString()
}

// ============================================================
// CLEAN SUPABASE PAYLOAD
// ============================================================

function cleanSupabasePayload(record) {
  const {
    table_name,
    _synced,
    _deleted,
    _syncError,
    _syncErrorMessage,
    _syncErrorKind,
    _discarded,
    ...payload
  } = record
  return payload
}

// ============================================================
// SCHEMA-GAP TOLERANCE
//
// Some tables in the hosted database are missing columns the app
// stamps on every write (e.g. `updated_at`). PostgREST answers with
// PGRST204 ("Could not find the 'x' column of 'y' in the schema
// cache") and the whole record is rejected, jamming the sync queue.
//
// Instead of failing, we remember which columns a table does not
// have and retry the write without them. The memory is per session,
// so once you run the schema migration everything is sent again.
// ============================================================

const unknownColumnsByTable = new Map()

function getUnknownColumns(tableName) {
  let set = unknownColumnsByTable.get(tableName)
  if (!set) {
    set = new Set()
    unknownColumnsByTable.set(tableName, set)
  }
  return set
}

function stripUnknownColumns(tableName, payload) {
  const unknown = getUnknownColumns(tableName)
  if (unknown.size === 0) return payload
  const next = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!unknown.has(key)) next[key] = value
  }
  return next
}

// "Could not find the 'updated_at' column of 'lab_tests' in the schema cache"
function missingColumnFromError(error) {
  if (!error) return null
  if (error.code && error.code !== 'PGRST204') return null
  const message = error.message || ''
  const match = message.match(/Could not find the '([^']+)' column/i)
  return match ? match[1] : null
}

function isForeignKeyViolation(error) {
  return error?.code === '23503' || /violates foreign key constraint/i.test(error?.message || '')
}

// Permanent failures must not be retried on every reconnect — they need
// either a schema change or a decision from the user.
function classifyError(error) {
  if (missingColumnFromError(error)) return 'schema'
  if (isForeignKeyViolation(error)) return 'reference'
  if (error?.code === '23505' || /duplicate key value/i.test(error?.message || '')) return 'conflict'
  if (error?.code === '42501' || /row-level security/i.test(error?.message || '')) return 'permission'
  return 'transient'
}

function friendlyErrorMessage(error, tableName) {
  const missing = missingColumnFromError(error)
  if (missing) {
    return `The "${tableName}" table in the database has no "${missing}" column, so this change could not be saved online. Run the schema update, then retry.`
  }
  if (isForeignKeyViolation(error)) {
    return `This record is still linked to other records (e.g. vitals, orders or invoices), so it cannot be removed outright. Archive it instead.`
  }
  return error?.message || 'Synchronization failed'
}

// Runs a Supabase write and, if it fails only because a column does not
// exist, drops that column and tries again (repeatedly, if needed).
async function writeWithSchemaRetry(tableName, run, basePayload = {}) {
  let attempt = 0
  while (attempt < 8) {
    attempt += 1
    const { data, error } = await run(stripUnknownColumns(tableName, basePayload))
    if (!error) return { data, error: null }
    const missing = missingColumnFromError(error)
    if (!missing) return { data, error }
    getUnknownColumns(tableName).add(missing)
    console.warn(`Table "${tableName}" has no "${missing}" column — retrying without it.`)
  }
  return { data: null, error: new Error(`Could not sync to "${tableName}" after removing unknown columns.`) }
}

// ============================================================
// WRITE LOCAL RECORD
// ============================================================

async function putLocalRecord(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(record)
    tx.oncomplete = () => resolve(record)
    tx.onerror = () => reject(tx.error)
  })
}

// ============================================================
// GET LOCAL RECORD
// ============================================================

async function getLocalRecord(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

// ============================================================
// GET ALL LOCAL RECORDS
// ============================================================

async function getAllLocalRecords(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// ============================================================
// DELETE LOCAL RECORD
// ============================================================

async function deleteLocalRecord(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ============================================================
// PULL RECORDS DOWN FROM SUPABASE
// ============================================================

async function pullFromSupabase(db, tableName, hospitalId) {
  if (!navigator.onLine || !supabase?.from || !hospitalId) return

  try {
    const { data: remoteRows, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('hospital_id', hospitalId)

    if (error || !remoteRows) return

    const localRows = await getAllLocalRecords(db)
    const localById = new Map(localRows.map((r) => [r.id, r]))

    for (const remote of remoteRows) {
      const local = localById.get(remote.id)

      // Don't overwrite a record that has local changes waiting to sync
      // (e.g. an edit or delete made offline that hasn't gone up yet).
      if (local && local._synced === false) continue

      await putLocalRecord(db, {
        ...remote,
        table_name: tableName,
        hospital_id: hospitalId,
        _synced: true,
        // Soft-deleted rows stay in the local store but are hidden from lists.
        _deleted: Boolean(remote.deleted_at),
        _syncError: false,
        _syncErrorMessage: null,
        _syncErrorKind: null,
      })
    }
  } catch (err) {
    console.error(`Error pulling ${tableName} from Supabase:`, err)
  }
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useOfflineTable(tableName, hospitalId) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : false)
  const [pendingCount, setPendingCount] = useState(0)
  const [loadError, setLoadError] = useState(null)

  const loadLocalRecords = useCallback(async () => {
    if (!hospitalId) {
      setRecords([])
      setLoading(false)
      return
    }

    try {
      const db = await openDB()
      const all = await getAllLocalRecords(db)

      const filtered = all.filter(
        (record) =>
          record.table_name === tableName &&
          record.hospital_id === hospitalId &&
          !record._deleted &&
          !record.deleted_at
      )

      setRecords(filtered)

      const pending = all.filter(
        (record) => record._synced === false && record._discarded !== true
      )
      setPendingCount(pending.length)
      setLoadError(null)
      setLoading(false)
    } catch (error) {
      console.error('Error reading offline records:', error)
      setLoadError(error?.message || 'Could not read local data')
      setLoading(false)
    }
  }, [tableName, hospitalId])

  useEffect(() => {
    async function initialLoad() {
      if (hospitalId) {
        try {
          const db = await openDB()
          await pullFromSupabase(db, tableName, hospitalId)
        } catch (err) {
          console.error('Error opening DB for initial pull:', err)
        }
      }
      await loadLocalRecords()
    }

    initialLoad()

    const handleOnline = async () => {
      setIsOnline(true)
      await flushTableQueue(tableName)
      if (hospitalId) {
        try {
          const db = await openDB()
          await pullFromSupabase(db, tableName, hospitalId)
        } catch (err) {
          console.error('Error opening DB for reconnect pull:', err)
        }
      }
      await loadLocalRecords()
    }

    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadLocalRecords, tableName, hospitalId])

  const addRecord = async (data) => {
    if (!hospitalId) throw new Error('Hospital ID is required.')

    const timestamp = nowISO()
    const id = data.id || generateUUID()

    const newRecord = {
      ...data,
      id,
      table_name: tableName,
      hospital_id: hospitalId,
      created_at: data.created_at || timestamp,
      updated_at: timestamp,
      _synced: false,
      _deleted: false,
      _syncError: false,
      _syncErrorMessage: null,
      _syncErrorKind: null,
    }

    const db = await openDB()
    await putLocalRecord(db, newRecord)
    await loadLocalRecords()

    if (navigator.onLine && supabase?.from) {
      const basePayload = cleanSupabasePayload(newRecord)
      try {
        const { data: remoteData, error } = await writeWithSchemaRetry(
          tableName,
          (payload) => supabase.from(tableName).insert([payload]).select().single(),
          basePayload
        )

        if (error) throw error

        if (remoteData) {
          const syncedRecord = {
            ...remoteData,
            table_name: tableName,
            hospital_id: hospitalId,
            _synced: true,
            _deleted: false,
            _syncError: false,
            _syncErrorMessage: null,
            _syncErrorKind: null,
          }
          await putLocalRecord(db, syncedRecord)
        }
      } catch (error) {
        console.error('Supabase insert failed:', error)
        await putLocalRecord(db, {
          ...newRecord,
          _synced: false,
          _syncError: true,
          _syncErrorKind: classifyError(error),
          _syncErrorMessage: friendlyErrorMessage(error, tableName),
        })
        await loadLocalRecords()
        throw new Error(friendlyErrorMessage(error, tableName))
      }
    }

    await loadLocalRecords()
    return newRecord
  }

  const updateRecord = async (id, updates) => {
    const db = await openDB()
    const existing = await getLocalRecord(db, id)

    if (!existing) {
      throw new Error('Record was not found locally.')
    }

    const updatedRecord = {
      ...existing,
      ...updates,
      id,
      table_name: tableName,
      hospital_id: existing.hospital_id || hospitalId,
      updated_at: nowISO(),
      _synced: false,
      _deleted: Boolean(updates?.deleted_at ?? existing.deleted_at),
      _syncError: false,
      _syncErrorMessage: null,
      _syncErrorKind: null,
      _discarded: false,
    }

    await putLocalRecord(db, updatedRecord)
    await loadLocalRecords()

    if (navigator.onLine && supabase?.from) {
      const { id: payloadId, ...updatePayload } = cleanSupabasePayload(updatedRecord)
      try {
        const { data: remoteData, error } = await writeWithSchemaRetry(
          tableName,
          (payload) => supabase.from(tableName).update(payload).eq('id', payloadId).select().single(),
          updatePayload
        )

        // PGRST116 means 0 rows returned: the item is local-only.
        // Keep _synced = false so the queue picks it up later.
        if (error && error.code !== 'PGRST116') {
          throw error
        }

        await putLocalRecord(db, {
          ...(remoteData || updatedRecord),
          table_name: tableName,
          hospital_id: hospitalId,
          _synced: Boolean(remoteData),
          _deleted: Boolean((remoteData || updatedRecord).deleted_at),
          _syncError: false,
          _syncErrorMessage: null,
          _syncErrorKind: null,
        })
      } catch (error) {
        console.error('Supabase update failed:', error)
        await putLocalRecord(db, {
          ...updatedRecord,
          _synced: false,
          _syncError: true,
          _syncErrorKind: classifyError(error),
          _syncErrorMessage: friendlyErrorMessage(error, tableName),
        })
        await loadLocalRecords()
        throw new Error(friendlyErrorMessage(error, tableName))
      }
    }

    await loadLocalRecords()
    return updatedRecord
  }

  // Deleting a patient used to issue a hard DELETE, which the database
  // refuses while vitals / orders / invoices still reference the row.
  // For those tables we archive instead: deleted_at is stamped, history
  // is preserved, and the record disappears from every list.
  const deleteRecord = async (id) => {
    if (SOFT_DELETE_TABLES.has(tableName)) {
      return updateRecord(id, { deleted_at: nowISO() })
    }

    const db = await openDB()
    const existing = await getLocalRecord(db, id)

    if (!existing) return

    const deletedRecord = {
      ...existing,
      _deleted: true,
      _synced: false,
      _syncError: false,
      _syncErrorMessage: null,
      _syncErrorKind: null,
      _discarded: false,
      updated_at: nowISO(),
    }

    await putLocalRecord(db, deletedRecord)
    await loadLocalRecords()

    if (navigator.onLine && supabase?.from) {
      try {
        const { error } = await supabase.from(tableName).delete().eq('id', id)
        if (error) throw error
        await deleteLocalRecord(db, id)
      } catch (error) {
        console.error('Supabase delete failed:', error)
        await putLocalRecord(db, {
          ...deletedRecord,
          _syncError: true,
          _syncErrorKind: classifyError(error),
          _syncErrorMessage: friendlyErrorMessage(error, tableName),
        })
        await loadLocalRecords()
        throw new Error(friendlyErrorMessage(error, tableName))
      }
    }

    await loadLocalRecords()
  }

  const syncFromServer = async () => {
    if (!hospitalId) return
    try {
      const db = await openDB()
      await pullFromSupabase(db, tableName, hospitalId)
      await loadLocalRecords()
    } catch (err) {
      console.error(`Error manually syncing ${tableName} from server:`, err)
    }
  }

  return {
    records,
    loading,
    loadError,
    isOnline,
    pendingCount,
    addRecord,
    updateRecord,
    deleteRecord,
    refreshTable: loadLocalRecords,
    syncFromServer,
  }
}

// ============================================================
// GET ALL SYNC ERRORS
// ============================================================

export async function getAllSyncErrors() {
  try {
    const db = await openDB()
    const all = await getAllLocalRecords(db)
    return all.filter((record) => record._syncError === true && record._discarded !== true)
  } catch (error) {
    console.error('Could not get sync errors:', error)
    return []
  }
}

// ============================================================
// SUBSCRIBE TO SYNC ERRORS
// ============================================================

export function subscribeSyncErrors(callback) {
  const handler = async () => {
    if (typeof callback !== 'function') return
    const errors = await getAllSyncErrors()
    callback(errors)
  }

  handler() // Run immediately

  window.addEventListener('online', handler)
  window.addEventListener('offline', handler)

  return () => {
    window.removeEventListener('online', handler)
    window.removeEventListener('offline', handler)
  }
}

// ============================================================
// FLUSH OFFLINE QUEUE
//
// `force` retries items that previously failed with a permanent
// error (missing column, foreign-key conflict). Automatic flushes on
// reconnect skip those so the queue stops hammering the database
// with writes that cannot succeed until the schema is fixed.
// ============================================================

export async function flushTableQueue(tableName = null, { force = false } = {}) {
  if (!navigator.onLine || !supabase?.from) return

  try {
    const db = await openDB()
    const all = await getAllLocalRecords(db)

    const pending = all.filter(
      (record) =>
        record._synced === false &&
        record._discarded !== true &&
        (!tableName || record.table_name === tableName) &&
        (force || record._syncErrorKind !== 'schema') &&
        (force || record._syncErrorKind !== 'reference')
    )

    for (const record of pending) {
      try {
        const isSoftDeleteTable = SOFT_DELETE_TABLES.has(record.table_name)

        if (record._deleted && !isSoftDeleteTable && !record.deleted_at) {
          const { error } = await supabase
            .from(record.table_name)
            .delete()
            .eq('id', record.id)

          if (error) throw error
          await deleteLocalRecord(db, record.id)
          continue
        }

        // Soft-deleted rows sync as a normal upsert carrying deleted_at.
        const payload = cleanSupabasePayload(
          record._deleted && isSoftDeleteTable && !record.deleted_at
            ? { ...record, deleted_at: nowISO() }
            : record
        )

        const { data: remoteData, error } = await writeWithSchemaRetry(
          record.table_name,
          (body) => supabase.from(record.table_name).upsert(body, { onConflict: 'id' }).select().single(),
          payload
        )

        if (error) throw error

        await putLocalRecord(db, {
          ...(remoteData || record),
          table_name: record.table_name,
          hospital_id: record.hospital_id,
          _synced: true,
          _deleted: Boolean((remoteData || record).deleted_at),
          _syncError: false,
          _syncErrorMessage: null,
          _syncErrorKind: null,
        })
      } catch (error) {
        const kind = classifyError(error)
        console.error(`Failed to sync ${record.id} (${kind}):`, error)
        await putLocalRecord(db, {
          ...record,
          _synced: false,
          _syncError: true,
          _syncErrorKind: kind,
          _syncErrorMessage: friendlyErrorMessage(error, record.table_name),
        })
      }
    }
  } catch (error) {
    console.error('Error flushing offline queue:', error)
  }
}

// Explicit "Retry" button: ignores the permanent-error hold.
export async function retryTableQueue(tableName = null) {
  unknownColumnsByTable.clear()
  return flushTableQueue(tableName, { force: true })
}

// ============================================================
// SKIP (DISCARD) A STUCK SYNC ITEM
//
// This used to mark the item as synced, which cleared the warning
// while silently throwing the change away. It is now recorded as
// discarded so the data loss is explicit and auditable.
// ============================================================

export async function skipStuckSyncItem(id) {
  try {
    const db = await openDB()
    const record = await getLocalRecord(db, id)

    if (!record) return false

    await putLocalRecord(db, {
      ...record,
      _synced: true,
      _discarded: true,
      _discardedAt: nowISO(),
      _syncError: false,
      _syncErrorMessage: null,
      _syncErrorKind: null,
    })
    return true
  } catch (error) {
    console.error('Could not skip sync item:', error)
    return false
  }
}
