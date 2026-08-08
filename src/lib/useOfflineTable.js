import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
// Generic offline-first data hook.
//
// Features:
// - Instant local UI updates
// - Offline support
// - Background Supabase sync
// - Supabase Realtime updates
// - Hospital-isolated records
//
// Usage:
// const { records, addRecord, updateRecord, deleteRecord } =
//   useOfflineTable('patients', hospitalId)
function storageKey(table, hospitalId) {
  return `gmedhub_${table}_${hospitalId}`
}
function queueKey(table, hospitalId) {
  return `gmedhub_${table}_${hospitalId}_queue`
}
function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable/full — ignore
  }
}
export function useOfflineTable(table, hospitalId) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [pendingCount, setPendingCount] = useState(0)
  const syncingRef = useRef(false)
  const channelRef = useRef(null)
  const sKey = hospitalId
    ? storageKey(table, hospitalId)
    : null
  const qKey = hospitalId
    ? queueKey(table, hospitalId)
    : null
  /*
   * ==============================
   * PENDING QUEUE
   * ==============================
   */
  const refreshPendingCount = useCallback(() => {
    if (!qKey) {
      setPendingCount(0)
      return
    }
    const queue = readLocal(qKey, [])
    setPendingCount(queue.length)
  }, [qKey])
  /*
   * ==============================
   * FLUSH OFFLINE QUEUE
   * ==============================
   */
  const flushQueue = useCallback(async () => {
    if (
      !qKey ||
      !sKey ||
      syncingRef.current ||
      !navigator.onLine
    ) {
      return
    }
    syncingRef.current = true
    try {
      let queue = readLocal(qKey, [])
      while (queue.length > 0) {
        const op = queue[0]
        let ok = false
        /*
         * INSERT
         */
        if (op.type === 'insert') {
          const { error } = await supabase
            .from(table)
            .insert(op.payload)
          ok = !error
        }
        /*
         * DELETE
         */
        else if (op.type === 'delete') {
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', op.id)
          ok = !error
        }
        /*
         * UPDATE
         */
        else if (op.type === 'update') {
          const { error } = await supabase
            .from(table)
            .update(op.payload)
            .eq('id', op.id)
          ok = !error
        }
        /*
         * Stop if Supabase rejected the operation.
         * It will retry later.
         */
        if (!ok) {
          break
        }
        queue = queue.slice(1)
        writeLocal(qKey, queue)
      }
    } finally {
      syncingRef.current = false
      refreshPendingCount()
    }
  }, [
    table,
    qKey,
    sKey,
    refreshPendingCount,
  ])
  /*
   * ==============================
   * REFRESH FROM SUPABASE
   * ==============================
   */
  const refresh = useCallback(async () => {
    if (!hospitalId || !sKey) {
      setLoading(false)
      return
    }
    setLoading(true)
    /*
     * Show cached records immediately.
     */
    const local = readLocal(sKey, [])
    setRecords(local)
    /*
     * Get fresh records from Supabase.
     */
    if (navigator.onLine) {
      const {
        data,
        error,
      } = await supabase
        .from(table)
        .select('*')
        .eq('hospital_id', hospitalId)
        .order('created_at', {
          ascending: false,
        })
      if (!error && data) {
        const queue = readLocal(qKey, [])
        /*
         * Keep local records that have not reached Supabase yet.
         */
        const pendingInserts = queue
          .filter(op => op.type === 'insert')
          .map(op => op.payload)
        /*
         * Keep locally pending updates.
         *
         * This prevents a fresh server pull from
         * accidentally wiping an offline change.
         */
        const pendingUpdates = queue.filter(
          op => op.type === 'update'
        )
        const serverIds = new Set(
          data.map(r => r.id)
        )
        let merged = [
          ...pendingInserts.filter(
            p => !serverIds.has(p.id)
          ),
          ...data,
        ]
        /*
         * Reapply pending updates on top of
         * the fresh server records.
         */
        if (pendingUpdates.length > 0) {
          merged = merged.map(record => {
            const updates = pendingUpdates.filter(
              op => op.id === record.id
            )
            if (updates.length === 0) {
              return record
            }
            return updates.reduce(
              (current, op) => ({
                ...current,
                ...op.payload,
              }),
              record
            )
          })
        }
        writeLocal(sKey, merged)
        setRecords(merged)
      }
    }
    setLoading(false)
    refreshPendingCount()
  }, [
    table,
    hospitalId,
    sKey,
    qKey,
    refreshPendingCount,
  ])
  /*
   * ==============================
   * REALTIME CONNECTION
   * ==============================
   */
  useEffect(() => {
    if (!hospitalId) return
    /*
     * Create a unique channel for this table/hospital.
     */
    const channel = supabase
      .channel(
        `gmedhub_${table}_${hospitalId}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `hospital_id=eq.${hospitalId}`,
        },
        (payload) => {
          /*
           * Another device/user changed this table.
           *
           * Update our local state immediately.
           */
          setRecords(current => {
            let next = [...current]
            /*
             * INSERT
             */
            if (payload.eventType === 'INSERT') {
              const incoming = payload.new
              const exists = next.some(
                r => r.id === incoming.id
              )
              if (!exists) {
                next = [
                  incoming,
                  ...next,
                ]
              }
            }
            /*
             * UPDATE
             */
            else if (payload.eventType === 'UPDATE') {
              const incoming = payload.new
              const exists = next.some(
                r => r.id === incoming.id
              )
              if (exists) {
                next = next.map(r =>
                  r.id === incoming.id
                    ? {
                        ...r,
                        ...incoming,
                      }
                    : r
                )
              } else {
                next = [
                  incoming,
                  ...next,
                ]
              }
            }
            /*
             * DELETE
             */
            else if (payload.eventType === 'DELETE') {
              const deletedId =
                payload.old?.id
              next = next.filter(
                r => r.id !== deletedId
              )
            }
            writeLocal(sKey, next)
            return next
          })
          /*
           * Update pending count after
           * receiving a remote change.
           */
          refreshPendingCount()
        }
      )
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(
          channelRef.current
        )
        channelRef.current = null
      }
    }
  }, [
    table,
    hospitalId,
    sKey,
    refreshPendingCount,
  ])
  /*
   * ==============================
   * INITIAL LOAD + ONLINE/OFFLINE
   * ==============================
   */
  useEffect(() => {
    refresh()
    flushQueue()
    function handleOnline() {
      setIsOnline(true)
      flushQueue().then(() => {
        refresh()
      })
    }
    function handleOffline() {
      setIsOnline(false)
    }
    window.addEventListener(
      'online',
      handleOnline
    )
    window.addEventListener(
      'offline',
      handleOffline
    )
    return () => {
      window.removeEventListener(
        'online',
        handleOnline
      )
      window.removeEventListener(
        'offline',
        handleOffline
      )
    }
  }, [hospitalId]) // eslint-disable-line react-hooks/exhaustive-deps
  /*
   * ==============================
   * ADD RECORD
   * ==============================
   */
  const addRecord = useCallback(
    async fields => {
      if (!hospitalId || !sKey || !qKey) {
        return
      }
      const newRecord = {
        id: crypto.randomUUID(),
        hospital_id: hospitalId,
        created_at: new Date().toISOString(),
        ...fields,
      }
      /*
       * Save locally first.
       */
      const local = readLocal(
        sKey,
        []
      )
      const updated = [
        newRecord,
        ...local,
      ]
      writeLocal(
        sKey,
        updated
      )
      setRecords(updated)
      /*
       * Add to sync queue.
       */
      const queue = readLocal(
        qKey,
        []
      )
      queue.push({
        type: 'insert',
        id: newRecord.id,
        payload: newRecord,
      })
      writeLocal(
        qKey,
        queue
      )
      refreshPendingCount()
      /*
       * Sync immediately if online.
       */
      if (navigator.onLine) {
        flushQueue()
      }
      return newRecord
    },
    [
      hospitalId,
      sKey,
      qKey,
      flushQueue,
      refreshPendingCount,
    ]
  )
  /*
   * ==============================
   * DELETE RECORD
   * ==============================
   */
  const deleteRecord = useCallback(
    async id => {
      if (!sKey || !qKey) return
      const local = readLocal(
        sKey,
        []
      )
      const updated = local.filter(
        r => r.id !== id
      )
      writeLocal(
        sKey,
        updated
      )
      setRecords(updated)
      let queue = readLocal(
        qKey,
        []
      )
      const hadPendingInsert =
        queue.some(
          op =>
            op.type === 'insert' &&
            op.id === id
        )
      if (hadPendingInsert) {
        /*
         * It never reached Supabase.
         * No delete request needed.
         */
        queue = queue.filter(
          op => op.id !== id
        )
      } else {
        queue.push({
          type: 'delete',
          id,
        })
      }
      writeLocal(
        qKey,
        queue
      )
      refreshPendingCount()
      if (navigator.onLine) {
        flushQueue()
      }
    },
    [
      sKey,
      qKey,
      flushQueue,
      refreshPendingCount,
    ]
  )
  /*
   * ==============================
   * UPDATE RECORD
   * ==============================
   */
  const updateRecord = useCallback(
    async (id, fields) => {
      if (!sKey || !qKey) return
      /*
       * Update local state immediately.
       */
      const local = readLocal(
        sKey,
        []
      )
      const updated = local.map(
        r =>
          r.id === id
            ? {
                ...r,
                ...fields,
              }
            : r
      )
      writeLocal(
        sKey,
        updated
      )
      setRecords(updated)
      /*
       * Add update to sync queue.
       */
      const queue = readLocal(
        qKey,
        []
      )
      queue.push({
        type: 'update',
        id,
        payload: fields,
      })
      writeLocal(
        qKey,
        queue
      )
      refreshPendingCount()
      /*
       * Sync immediately if online.
       */
      if (navigator.onLine) {
        flushQueue()
      }
    },
    [
      sKey,
      qKey,
      flushQueue,
      refreshPendingCount,
    ]
  )
  return {
    records,
    loading,
    isOnline,
    pendingCount,
    addRecord,
    deleteRecord,
    updateRecord,
    refresh,
  }
}