import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

const DB_NAME = 'HospitalOfflineDB'
const DB_VERSION = 2

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = event => {
      const db = event.target.result

      if (!db.objectStoreNames.contains('offline_records')) {
        const store = db.createObjectStore('offline_records', {
          keyPath: 'id',
        })

        store.createIndex('table_name', 'table_name', {
          unique: false,
        })

        store.createIndex('hospital_id', 'hospital_id', {
          unique: false,
        })

        store.createIndex('_synced', '_synced', {
          unique: false,
        })
      }
    }

    request.onsuccess = () => {
      const db = request.result

      db.onversionchange = () => {
        db.close()
      }

      resolve(db)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function getAllLocalRecords() {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readonly')
    const store = tx.objectStore('offline_records')
    const request = store.getAll()

    request.onsuccess = () => {
      resolve(request.result || [])
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function saveLocalRecord(record) {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readwrite')
    const store = tx.objectStore('offline_records')

    store.put(record)

    tx.oncomplete = () => {
      resolve(record)
    }

    tx.onerror = () => {
      reject(tx.error)
    }
  })
}

async function deleteLocalRecord(id) {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readwrite')
    const store = tx.objectStore('offline_records')

    store.delete(id)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getLocalRecord(id) {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readonly')
    const store = tx.objectStore('offline_records')
    const request = store.get(id)

    request.onsuccess = () => {
      resolve(request.result || null)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

function cleanPayload(record) {
  const {
    _synced,
    _deleted,
    _syncError,
    _syncErrorMessage,
    table_name,
    ...payload
  } = record

  return payload
}

export function useOfflineTable(tableName, hospitalId) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [pendingCount, setPendingCount] = useState(0)

  const loadLocalRecords = useCallback(async () => {
    if (!hospitalId) {
      setRecords([])
      setLoading(false)
      return
    }

    try {
      const all = await getAllLocalRecords()

      const filtered = all.filter(record =>
        record.table_name === tableName &&
        record.hospital_id === hospitalId &&
        !record._deleted
      )

      setRecords(filtered)

      const pending = all.filter(
        record =>
          record.hospital_id === hospitalId &&
          record._synced === false
      )

      setPendingCount(pending.length)
    } catch (error) {
      console.error(
        'Error loading offline records:',
        error
      )
    } finally {
      setLoading(false)
    }
  }, [tableName, hospitalId])

  useEffect(() => {
    loadLocalRecords()

    const handleOnline = async () => {
      setIsOnline(true)

      try {
        await flushTableQueue(tableName)
        await loadLocalRecords()
      } catch (error) {
        console.error('Automatic sync failed:', error)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadLocalRecords, tableName])

  const addRecord = async data => {
    if (!hospitalId) {
      throw new Error('Hospital information is missing.')
    }

    /*
     * IMPORTANT:
     * Make a clean copy of the data before saving.
     */
    const id = data.id || generateId()

    const now = new Date().toISOString()

    const newRecord = {
      ...data,
      id,
      table_name: tableName,
      hospital_id: hospitalId,
      _synced: false,
      _deleted: false,
      _syncError: false,
      created_at: data.created_at || now,
      updated_at: now,
    }

    /*
     * PATIENT SAFETY CHECK
     *
     * The patients table requires full_name.
     */
    if (tableName === 'patients') {
      const fullName = String(
        data.full_name || ''
      ).trim()

      if (!fullName) {
        throw new Error(
          'Patient full name is missing. Please enter surname and other names.'
        )
      }

      newRecord.full_name = fullName
    }

    /*
     * Save locally FIRST.
     *
     * This means the application still works offline.
     */
    await saveLocalRecord(newRecord)

    /*
     * Try Supabase immediately when online.
     */
    if (navigator.onLine && supabase?.from) {
      try {
        const payload = cleanPayload(newRecord)

        /*
         * Do not send empty foreign keys.
         */
        if (!payload.hospital_id) {
          delete payload.hospital_id
        }

        if (!payload.created_by) {
          delete payload.created_by
        }

        /*
         * Final patients check before Supabase.
         */
        if (tableName === 'patients') {
          if (
            !payload.full_name ||
            String(payload.full_name).trim() === ''
          ) {
            throw new Error(
              'Cannot save patient because full_name is empty.'
            )
          }

          payload.full_name =
            String(payload.full_name).trim()
        }

        console.log(
          'Sending to Supabase:',
          tableName,
          payload
        )

        const {
          data: remoteData,
          error,
        } = await supabase
          .from(tableName)
          .insert(payload)
          .select()
          .single()

        if (error) {
          console.error(
            'Supabase INSERT ERROR:',
            error
          )

          throw new Error(
            error.message ||
            error.details ||
            'Supabase rejected the record.'
          )
        }

        if (remoteData) {
          /*
           * Replace local record with the real
           * Supabase record.
           */
          const syncedRecord = {
            ...remoteData,
            table_name: tableName,
            hospital_id: hospitalId,
            _synced: true,
            _deleted: false,
            _syncError: false,
          }

          await saveLocalRecord(syncedRecord)
        }
      } catch (error) {
        console.warn(
          'Online save failed. Record remains offline:',
          error
        )

        /*
         * Keep the record locally and mark
         * the sync error.
         */
        const failedRecord = {
          ...newRecord,
          _synced: false,
          _syncError: true,
          _syncErrorMessage:
            error.message || 'Sync failed',
        }

        await saveLocalRecord(failedRecord)

        await loadLocalRecords()

        throw error
      }
    }

    await loadLocalRecords()

    return newRecord
  }

  const updateRecord = async (id, updates) => {
    const existing = await getLocalRecord(id)

    if (!existing) {
      throw new Error(
        `Record ${id} was not found locally.`
      )
    }

    const updatedRecord = {
      ...existing,
      ...updates,
      id,
      table_name: tableName,
      hospital_id: hospitalId,
      _synced: false,
      _deleted: false,
      _syncError: false,
      updated_at: new Date().toISOString(),
    }

    if (tableName === 'patients') {
      if (
        !updatedRecord.full_name ||
        String(updatedRecord.full_name).trim() === ''
      ) {
        throw new Error(
          'Patient full name cannot be empty.'
        )
      }

      updatedRecord.full_name =
        String(updatedRecord.full_name).trim()
    }

    await saveLocalRecord(updatedRecord)

    if (navigator.onLine && supabase?.from) {
      try {
        const payload = cleanPayload(updatedRecord)

        if (!payload.hospital_id) {
          delete payload.hospital_id
        }

        if (!payload.created_by) {
          delete payload.created_by
        }

        const { error } = await supabase
          .from(tableName)
          .update(payload)
          .eq('id', id)

        if (error) {
          throw new Error(
            error.message ||
            error.details ||
            'Supabase update failed.'
          )
        }

        await saveLocalRecord({
          ...updatedRecord,
          _synced: true,
          _syncError: false,
          _syncErrorMessage: null,
        })
      } catch (error) {
        console.warn(
          'Online update failed:',
          error
        )

        await saveLocalRecord({
          ...updatedRecord,
          _synced: false,
          _syncError: true,
          _syncErrorMessage:
            error.message || 'Update sync failed',
        })

        await loadLocalRecords()

        throw error
      }
    }

    await loadLocalRecords()

    return updatedRecord
  }

  const deleteRecord = async id => {
    const existing = await getLocalRecord(id)

    if (!existing) {
      return
    }

    const deletedRecord = {
      ...existing,
      _deleted: true,
      _synced: false,
      _syncError: false,
      updated_at: new Date().toISOString(),
    }

    await saveLocalRecord(deletedRecord)

    if (navigator.onLine && supabase?.from) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', id)

        if (error) {
          throw new Error(
            error.message ||
            'Supabase delete failed.'
          )
        }

        await deleteLocalRecord(id)
      } catch (error) {
        console.warn(
          'Online delete failed. Keeping offline delete:',
          error
        )
      }
    }

    await loadLocalRecords()
  }

  return {
    records,
    loading,
    isOnline,
    pendingCount,
    addRecord,
    updateRecord,
    deleteRecord,
    refreshTable: loadLocalRecords,
  }
}

/*
 * ============================================
 * GET ALL SYNC ERRORS
 * ============================================
 */

export async function getAllSyncErrors() {
  try {
    const all = await getAllLocalRecords()

    return all.filter(
      record =>
        record._syncError === true
    )
  } catch (error) {
    console.error(
      'Could not get sync errors:',
      error
    )

    return []
  }
}

/*
 * ============================================
 * SUBSCRIBE TO SYNC ERRORS
 * ============================================
 */

export function subscribeSyncErrors(callback) {
  const handler = async () => {
    if (typeof callback !== 'function') {
      return
    }

    const errors = await getAllSyncErrors()

    callback(errors)
  }

  window.addEventListener(
    'online',
    handler
  )

  window.addEventListener(
    'offline',
    handler
  )

  return () => {
    window.removeEventListener(
      'online',
      handler
    )

    window.removeEventListener(
      'offline',
      handler
    )
  }
}

/*
 * ============================================
 * FLUSH OFFLINE QUEUE
 * ============================================
 */

export async function flushTableQueue(
  tableName = null
) {
  if (
    !navigator.onLine ||
    !supabase?.from
  ) {
    return
  }

  try {
    const all = await getAllLocalRecords()

    const pending = all.filter(record => {
      const correctTable =
        tableName
          ? record.table_name === tableName
          : true

      return (
        correctTable &&
        record._synced === false
      )
    })

    for (const record of pending) {
      try {
        /*
         * DELETED RECORD
         */
        if (record._deleted) {
          const { error } = await supabase
            .from(record.table_name)
            .delete()
            .eq('id', record.id)

          if (error) {
            throw new Error(error.message)
          }

          await deleteLocalRecord(record.id)

          continue
        }

        /*
         * NORMAL RECORD
         */
        const payload = cleanPayload(record)

        if (!payload.hospital_id) {
          delete payload.hospital_id
        }

        if (!payload.created_by) {
          delete payload.created_by
        }

        /*
         * Patients must always have full_name.
         */
        if (record.table_name === 'patients') {
          if (
            !payload.full_name ||
            String(payload.full_name).trim() === ''
          ) {
            throw new Error(
              'Patient record has no full_name.'
            )
          }

          payload.full_name =
            String(payload.full_name).trim()
        }

        const {
          data: remoteData,
          error,
        } = await supabase
          .from(record.table_name)
          .upsert(payload)
          .select()
          .single()

        if (error) {
          throw new Error(
            error.message ||
            error.details ||
            'Supabase sync failed.'
          )
        }

        await saveLocalRecord({
          ...(remoteData || payload),
          table_name: record.table_name,
          hospital_id: record.hospital_id,
          _synced: true,
          _deleted: false,
          _syncError: false,
          _syncErrorMessage: null,
        })
      } catch (error) {
        console.error(
          `Failed syncing ${record.table_name} record ${record.id}:`,
          error
        )

        await saveLocalRecord({
          ...record,
          _synced: false,
          _syncError: true,
          _syncErrorMessage:
            error.message ||
            'Sync failed',
        })
      }
    }
  } catch (error) {
    console.error(
      'Error flushing offline queue:',
      error
    )
  }
}

/*
 * ============================================
 * SKIP STUCK SYNC ITEM
 * ============================================
 */

export async function skipStuckSyncItem(id) {
  try {
    const record = await getLocalRecord(id)

    if (!record) {
      return false
    }

    await saveLocalRecord({
      ...record,
      _synced: true,
      _syncError: false,
      _syncErrorMessage: null,
    })

    return true
  } catch (error) {
    console.error(
      'Could not skip sync item:',
      error
    )

    return false
  }
}
