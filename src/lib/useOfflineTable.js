import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// Generic offline-first data hook.
// Reads/writes local data instantly (works with zero internet),
// and syncs to Supabase in the background whenever a connection is available.
//
// Usage: const { records, loading, isOnline, pendingCount, addRecord, deleteRecord } = useOfflineTable('patients', hospitalId)

function storageKey(table, hospitalId){ return `gmedhub_${table}_${hospitalId}` }
function queueKey(table, hospitalId){ return `gmedhub_${table}_${hospitalId}_queue` }

function readLocal(key, fallback){
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function writeLocal(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or unavailable — ignore */ }
}

// --- Shared sync-error status, readable/writable without a mounted hook ---
// Keyed by table name. Lets a global "sync stuck" badge work even for
// tables whose hook isn't currently mounted anywhere on screen.
const SYNC_STATUS_KEY = 'gmedhub_sync_status'
const SYNC_STATUS_EVENT = 'gmedhub-sync-status-changed'

function readSyncStatus(){
  try { return JSON.parse(localStorage.getItem(SYNC_STATUS_KEY)) || {} } catch { return {} }
}
function writeSyncStatus(status){
  try { localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status)) } catch { /* ignore */ }
  window.dispatchEvent(new Event(SYNC_STATUS_EVENT))
}
function setTableSyncError(table, message, queueLength){
  const status = readSyncStatus()
  status[table] = { table, message, queueLength, at: new Date().toISOString() }
  writeSyncStatus(status)
}
function clearTableSyncError(table){
  const status = readSyncStatus()
  if (status[table]) {
    delete status[table]
    writeSyncStatus(status)
  }
}
// Exported so the topbar (or any component) can show a global badge without
// needing that table's useOfflineTable hook mounted.
export function getAllSyncErrors(){
  return readSyncStatus()
}
export function subscribeSyncErrors(callback){
  function handler(){ callback(readSyncStatus()) }
  window.addEventListener(SYNC_STATUS_EVENT, handler)
  return () => window.removeEventListener(SYNC_STATUS_EVENT, handler)
}

// Attempt one sync operation against Supabase and report success/error.
async function performOp(table, op){
  if (op.type === 'insert') {
    const { error } = await supabase.from(table).insert(op.payload)
    return { ok: !error, error }
  }
  if (op.type === 'delete') {
    const { error } = await supabase.from(table).delete().eq('id', op.id)
    return { ok: !error, error }
  }
  if (op.type === 'update') {
    const { error } = await supabase.from(table).update(op.payload).eq('id', op.id)
    return { ok: !error, error }
  }
  return { ok: true, error: null }
}

// Standalone (non-hook) queue flush for a given table/hospital. Used both by
// the hook internally and by the global sync-status badge, which may need to
// retry/skip a table that isn't currently mounted as a hook anywhere.
export async function flushTableQueue(table, hospitalId){
  if (!table || !hospitalId || !navigator.onLine) return
  const qKey = queueKey(table, hospitalId)
  let queue = readLocal(qKey, [])
  clearTableSyncError(table)
  while (queue.length > 0) {
    const op = queue[0]
    const { ok, error } = await performOp(table, op)
    if (!ok) {
      setTableSyncError(table, error?.message || 'Unknown sync error', queue.length)
      break
    }
    queue = queue.slice(1)
    writeLocal(qKey, queue)
  }
}

// Discards just the item currently stuck at the front of a table's queue —
// the local record itself is untouched, only that one sync attempt is
// abandoned so everything behind it can proceed.
export async function skipStuckSyncItem(table, hospitalId){
  const qKey = queueKey(table, hospitalId)
  const queue = readLocal(qKey, [])
  if (queue.length === 0) return null
  const skipped = queue[0]
  writeLocal(qKey, queue.slice(1))
  clearTableSyncError(table)
  await flushTableQueue(table, hospitalId)
  return skipped
}

export function useOfflineTable(table, hospitalId){
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastError, setLastError] = useState(() => readSyncStatus()[table] || null)
  const syncingRef = useRef(false)

  const sKey = hospitalId ? storageKey(table, hospitalId) : null
  const qKey = hospitalId ? queueKey(table, hospitalId) : null

  useEffect(() => {
    return subscribeSyncErrors(status => setLastError(status[table] || null))
  }, [table])

  const refreshPendingCount = useCallback(() => {
    if (!qKey) return
    const queue = readLocal(qKey, [])
    setPendingCount(queue.length)
  }, [qKey])

  // Push local queue of changes up to Supabase, one at a time, in order.
  const flushQueue = useCallback(async () => {
    if (!qKey || !sKey || syncingRef.current || !navigator.onLine || !hospitalId) return
    syncingRef.current = true
    try {
      await flushTableQueue(table, hospitalId)
    } finally {
      syncingRef.current = false
      refreshPendingCount()
    }
  }, [table, hospitalId, qKey, sKey, refreshPendingCount])

  // Pull fresh data from Supabase and merge with any not-yet-synced local records.
  const refresh = useCallback(async () => {
    if (!hospitalId || !sKey) return
    setLoading(true)
    const local = readLocal(sKey, [])
    setRecords(local) // show cached data immediately, even before network responds

    if (navigator.onLine) {
      const { data, error } = await supabase.from(table).select('*').eq('hospital_id', hospitalId).order('created_at', { ascending: false })
      if (!error && data) {
        const queue = readLocal(qKey, [])

        // Re-apply any local changes that haven't been confirmed on the
        // server yet, so a fresh fetch can never silently overwrite an
        // optimistic edit or deletion that's still mid-sync.
        const pendingDeletes = new Set(queue.filter(op => op.type === 'delete').map(op => op.id))
        const pendingUpdatesById = {}
        for (const op of queue) {
          if (op.type === 'update') {
            pendingUpdatesById[op.id] = { ...(pendingUpdatesById[op.id] || {}), ...op.payload }
          }
        }
        const pendingInserts = queue.filter(op => op.type === 'insert').map(op => op.payload)
        const serverIds = new Set(data.map(r => r.id))

        const withPendingEdits = data
          .filter(r => !pendingDeletes.has(r.id))
          .map(r => pendingUpdatesById[r.id] ? { ...r, ...pendingUpdatesById[r.id] } : r)

        const merged = [
          ...pendingInserts.filter(p => !serverIds.has(p.id) && !pendingDeletes.has(p.id)),
          ...withPendingEdits,
        ]
        writeLocal(sKey, merged)
        setRecords(merged)
      }
    }
    setLoading(false)
    refreshPendingCount()
  }, [table, hospitalId, sKey, qKey, refreshPendingCount])

  // Manually re-attempt the queue (same as flushQueue, but also refreshes
  // records afterward so a fix takes effect on screen immediately).
  const retrySync = useCallback(async () => {
    await flushQueue()
    await refresh()
  }, [flushQueue, refresh])

  // Permanently discard just the one item stuck at the front of the queue,
  // then retry everything behind it.
  const skipStuckItem = useCallback(async () => {
    if (!hospitalId) return null
    const skipped = await skipStuckSyncItem(table, hospitalId)
    refreshPendingCount()
    await refresh()
    return skipped
  }, [table, hospitalId, refresh, refreshPendingCount])

  useEffect(() => {
    refresh()
    flushQueue()

    function handleOnline(){ setIsOnline(true); flushQueue().then(refresh) }
    function handleOffline(){ setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [hospitalId]) // eslint-disable-line react-hooks/exhaustive-deps

  const addRecord = useCallback(async (fields) => {
    if (!hospitalId || !sKey || !qKey) return
    const newRecord = { id: crypto.randomUUID(), hospital_id: hospitalId, created_at: new Date().toISOString(), ...fields }

    const local = readLocal(sKey, [])
    const updated = [newRecord, ...local]
    writeLocal(sKey, updated)
    setRecords(updated)

    const queue = readLocal(qKey, [])
    queue.push({ type: 'insert', id: newRecord.id, payload: newRecord })
    writeLocal(qKey, queue)
    refreshPendingCount()

    if (navigator.onLine) flushQueue()
    return newRecord
  }, [hospitalId, sKey, qKey, flushQueue, refreshPendingCount])

  const deleteRecord = useCallback(async (id) => {
    if (!sKey || !qKey) return
    const local = readLocal(sKey, [])
    writeLocal(sKey, local.filter(r => r.id !== id))
    setRecords(prev => prev.filter(r => r.id !== id))

    let queue = readLocal(qKey, [])
    const hadPendingInsert = queue.some(op => op.type === 'insert' && op.id === id)
    if (hadPendingInsert) {
      // Never made it to the server yet — just drop it, nothing to sync.
      queue = queue.filter(op => op.id !== id)
    } else {
      queue.push({ type: 'delete', id })
    }
    writeLocal(qKey, queue)
    refreshPendingCount()

    if (navigator.onLine) flushQueue()
  }, [sKey, qKey, flushQueue, refreshPendingCount])

  const updateRecord = useCallback(async (id, fields) => {
    if (!sKey || !qKey) return
    const local = readLocal(sKey, [])
    const updated = local.map(r => r.id === id ? { ...r, ...fields } : r)
    writeLocal(sKey, updated)
    setRecords(updated)

    const queue = readLocal(qKey, [])
    queue.push({ type: 'update', id, payload: fields })
    writeLocal(qKey, queue)
    refreshPendingCount()

    if (navigator.onLine) flushQueue()
  }, [sKey, qKey, flushQueue, refreshPendingCount])

  return { records, loading, isOnline, pendingCount, lastError, addRecord, deleteRecord, updateRecord, refresh, retrySync, skipStuckItem }
}
