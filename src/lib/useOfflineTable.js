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

export function useOfflineTable(table, hospitalId){
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const syncingRef = useRef(false)

  const sKey = hospitalId ? storageKey(table, hospitalId) : null
  const qKey = hospitalId ? queueKey(table, hospitalId) : null

  const refreshPendingCount = useCallback(() => {
    if (!qKey) return
    const queue = readLocal(qKey, [])
    setPendingCount(queue.length)
  }, [qKey])

  // Push local queue of changes up to Supabase, one at a time, in order.
  const flushQueue = useCallback(async () => {
    if (!qKey || !sKey || syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    try {
      let queue = readLocal(qKey, [])
      while (queue.length > 0) {
        const op = queue[0]
        let ok = false
        if (op.type === 'insert') {
          const { error } = await supabase.from(table).insert(op.payload)
          ok = !error
        } else if (op.type === 'delete') {
          const { error } = await supabase.from(table).delete().eq('id', op.id)
          ok = !error
        } else if (op.type === 'update') {
          const { error } = await supabase.from(table).update(op.payload).eq('id', op.id)
          ok = !error
        }
        if (!ok) break // stop here, retry later — keeps order intact
        queue = queue.slice(1)
        writeLocal(qKey, queue)
      }
    } finally {
      syncingRef.current = false
      refreshPendingCount()
    }
  }, [table, qKey, sKey, refreshPendingCount])

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
        const stillPendingInserts = queue.filter(op => op.type === 'insert').map(op => op.payload)
        const serverIds = new Set(data.map(r => r.id))
        const merged = [...stillPendingInserts.filter(p => !serverIds.has(p.id)), ...data]
        writeLocal(sKey, merged)
        setRecords(merged)
      }
    }
    setLoading(false)
    refreshPendingCount()
  }, [table, hospitalId, sKey, qKey, refreshPendingCount])

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

  return { records, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord, refresh }
}