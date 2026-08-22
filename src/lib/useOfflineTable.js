import {
  useState,
  useEffect,
  useCallback,
} from 'react'

import { supabase } from './supabaseClient'

const DB_NAME = 'HospitalOfflineDB'
const DB_VERSION = 3

const STORE_NAME = 'offline_records'

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
  const { table_name, _synced, _deleted, _syncError, _syncErrorMessage, ...payload } = record
  return payload
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
// (This was missing — local storage only ever got written to when
// you added/edited something on THIS device. If local storage was
// ever cleared, or you opened the app somewhere else, the list would
// show empty even though the real data was safe in Supabase.)
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
        _deleted: false,
        _syncError: false,
        _syncErrorMessage: null,
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
          !record._deleted
      )

      setRecords(filtered)

      const pending = all.filter((record) => record._synced === false)
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
    }

    const db = await openDB()
    await putLocalRecord(db, newRecord)
    await loadLocalRecords()

    if (navigator.onLine && supabase?.from) {
      try {
        const payload = cleanSupabasePayload(newRecord)
        const { data: remoteData, error } = await supabase
          .from(tableName)
          .insert([payload])
          .select()
          .single()

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
          }
          await putLocalRecord(db, syncedRecord)
        }
      } catch (error) {
        console.error('Supabase insert failed:', error)
        const failedRecord = {
          ...newRecord,
          _synced: false,
          _syncError: true,
          _syncErrorMessage: error?.message || 'Database insert failed',
        }
        await putLocalRecord(db, failedRecord)
        await loadLocalRecords()
        throw new Error(error?.message || 'Database rejected insertion.')
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
      _deleted: false,
      _syncError: false,
      _syncErrorMessage: null,
    }

    await putLocalRecord(db, updatedRecord)
    await loadLocalRecords()

    if (navigator.onLine && supabase?.from) {
      try {
        const payload = cleanSupabasePayload(updatedRecord)
        const { id: payloadId, ...updatePayload } = payload

        const { data: remoteData, error } = await supabase
          .from(tableName)
          .update(updatePayload)
          .eq('id', payloadId)
          .select()
          .single()

        // FIX: PGRST116 means 0 rows returned. This happens if the item is local-only.
        // We ignore this error so the user can keep working, but we keep _synced = false so it syncs later.
        if (error && error.code !== 'PGRST116') {
          throw error
        }

        const syncedRecord = {
          ...(remoteData || updatedRecord),
          table_name: tableName,
          hospital_id: hospitalId,
          _synced: remoteData ? true : false, 
          _deleted: false,
          _syncError: false,
          _syncErrorMessage: null,
        }

        await putLocalRecord(db, syncedRecord)
      } catch (error) {
        console.error('Supabase update failed:', error)
        const failedRecord = {
          ...updatedRecord,
          _synced: false,
          _syncError: true,
          _syncErrorMessage: error?.message || 'Database update failed',
        }
        await putLocalRecord(db, failedRecord)
        await loadLocalRecords()
        throw new Error(error?.message || 'Database rejected update.')
      }
    }

    await loadLocalRecords()
    return updatedRecord
  }

  const deleteRecord = async (id) => {
    const db = await openDB()
    const existing = await getLocalRecord(db, id)

    if (!existing) return

    const deletedRecord = {
      ...existing,
      _deleted: true,
      _synced: false,
      _syncError: false,
      _syncErrorMessage: null,
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
        const failedRecord = {
          ...deletedRecord,
          _syncError: true,
          _syncErrorMessage: error?.message || 'Database delete failed',
        }
        await putLocalRecord(db, failedRecord)
        await loadLocalRecords()
        throw new Error(error?.message || 'Database rejected delete.')
      }
    }

    await loadLocalRecords()
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
  }
}

// ============================================================
// GET ALL SYNC ERRORS
// ============================================================

export async function getAllSyncErrors() {
  try {
    const db = await openDB()
    const all = await getAllLocalRecords(db)
    return all.filter((record) => record._syncError === true)
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
// ============================================================

export async function flushTableQueue(tableName = null) {
  if (!navigator.onLine || !supabase?.from) return

  try {
    const db = await openDB()
    const all = await getAllLocalRecords(db)

    const pending = all.filter(
      (record) =>
        record._synced === false &&
        (!tableName || record.table_name === tableName)
    )

    for (const record of pending) {
      try {
        if (record._deleted) {
          const { error } = await supabase
            .from(record.table_name)
            .delete()
            .eq('id', record.id)

          if (error) throw error
          await deleteLocalRecord(db, record.id)
          continue
        }

        const payload = cleanSupabasePayload(record)

        const { data: remoteData, error } = await supabase
          .from(record.table_name)
          .upsert(payload, { onConflict: 'id' })
          .select()
          .single()

        if (error) throw error

        const syncedRecord = {
          ...(remoteData || record),
          table_name: record.table_name,
          hospital_id: record.hospital_id,
          _synced: true,
          _deleted: false,
          _syncError: false,
          _syncErrorMessage: null,
        }

        await putLocalRecord(db, syncedRecord)
      } catch (error) {
        console.error(`Failed to sync ${record.id}:`, error)
        const failedRecord = {
          ...record,
          _synced: false,
          _syncError: true,
          _syncErrorMessage: error?.message || 'Synchronization failed',
        }
        await putLocalRecord(db, failedRecord)
      }
    }
  } catch (error) {
    console.error('Error flushing offline queue:', error)
  }
}

// ============================================================
// SKIP STUCK SYNC ITEM
// ============================================================

export async function skipStuckSyncItem(id) {
  try {
    const db = await openDB()
    const record = await getLocalRecord(db, id)

    if (!record) return false

    await putLocalRecord(db, {
      ...record,
      _synced: true,
      _syncError: false,
      _syncErrorMessage: null,
    })

    return true
  } catch (error) {
    console.error('Could not skip sync item:', error)
    return false
  }
}