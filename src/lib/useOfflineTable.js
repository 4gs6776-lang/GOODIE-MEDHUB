import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const DB_NAME = 'HospitalOfflineDB';
const DB_VERSION = 3;

// ============================================================
// IndexedDB
// ============================================================

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('offline_records')) {
        const store = db.createObjectStore('offline_records', {
          keyPath: 'id'
        });

        store.createIndex('table_name', 'table_name', {
          unique: false
        });

        store.createIndex('hospital_id', 'hospital_id', {
          unique: false
        });

        store.createIndex('sync_status', '_synced', {
          unique: false
        });
      } else {
        const transaction = e.target.transaction;
        const store = transaction.objectStore('offline_records');

        if (!store.indexNames.contains('sync_status')) {
          store.createIndex('sync_status', '_synced', {
            unique: false
          });
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
      };

      resolve(db);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

// ============================================================
// Helpers
// ============================================================

function createLocalId() {
  return `local_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;
}

function isLocalId(id) {
  return typeof id === 'string' && id.startsWith('local_');
}

function removeLocalOnlyFields(record) {
  const {
    _synced,
    _deleted,
    _syncError,
    _syncErrorMessage,
    table_name,
    ...payload
  } = record;

  return payload;
}

function cleanPayload(payload) {
  const cleaned = { ...payload };

  // Never send local-only IndexedDB fields
  delete cleaned._synced;
  delete cleaned._deleted;
  delete cleaned._syncError;
  delete cleaned._syncErrorMessage;
  delete cleaned.table_name;

  // Do not send empty foreign keys
  if (!cleaned.hospital_id) {
    delete cleaned.hospital_id;
  }

  if (!cleaned.created_by) {
    delete cleaned.created_by;
  }

  // Remove local IDs so Supabase can generate UUIDs
  if (isLocalId(cleaned.id)) {
    delete cleaned.id;
  }

  return cleaned;
}

async function getAllOfflineRecords() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readonly');
    const store = tx.objectStore('offline_records');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function putOfflineRecord(record) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readwrite');
    const store = tx.objectStore('offline_records');

    store.put(record);

    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteOfflineRecord(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readwrite');
    const store = tx.objectStore('offline_records');

    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOfflineRecord(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_records', 'readonly');
    const store = tx.objectStore('offline_records');
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// Main Hook
// ============================================================

export function useOfflineTable(tableName, hospitalId) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);

  // ==========================================================
  // Load local records
  // ==========================================================

  const loadLocalRecords = useCallback(async () => {
    if (!hospitalId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    try {
      const all = await getAllOfflineRecords();

      const filtered = all.filter(
        (record) =>
          record.table_name === tableName &&
          record.hospital_id === hospitalId &&
          !record._deleted
      );

      setRecords(filtered);

      const pending = all.filter(
        (record) =>
          record._synced === false &&
          !record._deleted
      );

      setPendingCount(pending.length);

      setLoading(false);
    } catch (err) {
      console.error(
        'Error reading offline storage:',
        err
      );

      setLoading(false);
    }
  }, [tableName, hospitalId]);

  // ==========================================================
  // Initial load + online/offline listeners
  // ==========================================================

  useEffect(() => {
    loadLocalRecords();

    const handleOnline = async () => {
      setIsOnline(true);

      // Try to synchronize pending records
      await flushTableQueue(tableName);

      await loadLocalRecords();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener(
      'online',
      handleOnline
    );

    window.addEventListener(
      'offline',
      handleOffline
    );

    return () => {
      window.removeEventListener(
        'online',
        handleOnline
      );

      window.removeEventListener(
        'offline',
        handleOffline
      );
    };
  }, [loadLocalRecords, tableName]);

  // ==========================================================
  // ADD RECORD
  // ==========================================================

  const addRecord = async (data) => {
    const localId =
      data.id && !isLocalId(data.id)
        ? data.id
        : createLocalId();

    const now = new Date().toISOString();

    const newRecord = {
      ...data,

      id: localId,

      table_name: tableName,

      hospital_id:
        data.hospital_id || hospitalId,

      _synced: false,

      _deleted: false,

      _syncError: false,

      created_at:
        data.created_at || now,

      updated_at: now
    };

    // --------------------------------------------------------
    // Always save locally first
    // --------------------------------------------------------

    await putOfflineRecord(newRecord);

    // --------------------------------------------------------
    // If online, immediately write to Supabase
    // --------------------------------------------------------

    if (
      navigator.onLine &&
      supabase?.from
    ) {
      try {
        const payload = cleanPayload(newRecord);

        // IMPORTANT:
        // Local IDs are never sent to Supabase.
        // Supabase generates the real UUID.
        delete payload.id;

        const {
          data: remoteData,
          error
        } = await supabase
          .from(tableName)
          .insert([payload])
          .select()
          .single();

        if (error) {
          console.error(
            '❌ Supabase insert failed:',
            error
          );

          await putOfflineRecord({
            ...newRecord,
            _synced: false,
            _syncError: true,
            _syncErrorMessage:
              error.message ||
              'Database rejected insertion'
          });

          throw new Error(
            error.message ||
            error.details ||
            'Database rejected insertion'
          );
        }

        // ----------------------------------------------------
        // Replace local record with Supabase record
        // ----------------------------------------------------

        await deleteOfflineRecord(localId);

        const syncedRecord = {
          ...remoteData,

          table_name: tableName,

          hospital_id:
            hospitalId ||
            remoteData.hospital_id,

          _synced: true,

          _deleted: false,

          _syncError: false
        };

        await putOfflineRecord(syncedRecord);

        await loadLocalRecords();

        return syncedRecord;
      } catch (err) {
        console.warn(
          'Network/database write failed. Record remains offline:',
          err
        );

        await loadLocalRecords();

        throw err;
      }
    }

    // --------------------------------------------------------
    // Offline: record remains pending
    // --------------------------------------------------------

    await loadLocalRecords();

    return newRecord;
  };

  // ==========================================================
  // UPDATE RECORD
  // ==========================================================

  const updateRecord = async (
    id,
    updates
  ) => {
    const existing =
      await getOfflineRecord(id);

    const updatedRecord = {
      ...(existing || {}),

      id,

      ...updates,

      table_name:
        tableName,

      hospital_id:
        existing?.hospital_id ||
        hospitalId,

      _synced: false,

      _deleted: false,

      _syncError: false,

      updated_at:
        new Date().toISOString()
    };

    // --------------------------------------------------------
    // Save locally first
    // --------------------------------------------------------

    await putOfflineRecord(
      updatedRecord
    );

    // --------------------------------------------------------
    // Online update
    // --------------------------------------------------------

    if (
      navigator.onLine &&
      supabase?.from
    ) {
      try {
        const payload =
          cleanPayload(
            updatedRecord
          );

        // Never send local-only IDs
        // in an UPDATE.
        const {
          data: remoteData,
          error
        } = await supabase
          .from(tableName)
          .update(payload)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error(
            '❌ Supabase update failed:',
            error
          );

          await putOfflineRecord({
            ...updatedRecord,

            _synced: false,

            _syncError: true,

            _syncErrorMessage:
              error.message
          });

          throw new Error(
            error.message ||
            'Database update failed'
          );
        }

        const syncedRecord = {
          ...remoteData,

          table_name:
            tableName,

          hospital_id:
            hospitalId ||
            remoteData.hospital_id,

          _synced: true,

          _deleted: false,

          _syncError: false
        };

        await putOfflineRecord(
          syncedRecord
        );

        await loadLocalRecords();

        return syncedRecord;
      } catch (err) {
        console.warn(
          'Network update failed. Saved locally:',
          err
        );

        await loadLocalRecords();

        throw err;
      }
    }

    await loadLocalRecords();

    return updatedRecord;
  };

  // ==========================================================
  // DELETE RECORD
  // ==========================================================

  const deleteRecord = async (id) => {
    const existing =
      await getOfflineRecord(id);

    if (!existing) {
      return;
    }

    // --------------------------------------------------------
    // If this is only a local record, simply remove it
    // --------------------------------------------------------

    if (isLocalId(id)) {
      await deleteOfflineRecord(id);

      await loadLocalRecords();

      return;
    }

    // --------------------------------------------------------
    // Mark as deleted locally first
    // --------------------------------------------------------

    const deletedRecord = {
      ...existing,

      _deleted: true,

      _synced: false,

      _syncError: false,

      updated_at:
        new Date().toISOString()
    };

    await putOfflineRecord(
      deletedRecord
    );

    // --------------------------------------------------------
    // Online delete
    // --------------------------------------------------------

    if (
      navigator.onLine &&
      supabase?.from
    ) {
      try {
        const { error } =
          await supabase
            .from(tableName)
            .delete()
            .eq('id', id);

        if (error) {
          throw new Error(
            error.message ||
            'Database delete failed'
          );
        }

        await deleteOfflineRecord(id);

        await loadLocalRecords();

        return;
      } catch (err) {
        console.warn(
          'Network delete failed. Keeping deletion pending:',
          err
        );

        await putOfflineRecord({
          ...deletedRecord,

          _syncError: true,

          _syncErrorMessage:
            err.message
        });
      }
    }

    await loadLocalRecords();
  };

  // ==========================================================
  // Return hook
  // ==========================================================

  return {
    records,

    loading,

    isOnline,

    pendingCount,

    addRecord,

    updateRecord,

    deleteRecord,

    refreshTable:
      loadLocalRecords
  };
}

// ============================================================
// SYNC ERRORS
// ============================================================

export async function getAllSyncErrors() {
  try {
    const all =
      await getAllOfflineRecords();

    return all.filter(
      (record) =>
        record._syncError === true
    );
  } catch (err) {
    console.error(
      'Could not get sync errors:',
      err
    );

    return [];
  }
}

// ============================================================
// SUBSCRIBE TO SYNC ERRORS
// ============================================================

export function subscribeSyncErrors(
  callback
) {
  const handler = async () => {
    if (
      typeof callback === 'function'
    ) {
      const errors =
        await getAllSyncErrors();

      callback(errors);
    }
  };

  window.addEventListener(
    'online',
    handler
  );

  window.addEventListener(
    'offline',
    handler
  );

  return () => {
    window.removeEventListener(
      'online',
      handler
    );

    window.removeEventListener(
      'offline',
      handler
    );
  };
}

// ============================================================
// FLUSH OFFLINE QUEUE
// ============================================================

export async function flushTableQueue(
  tableName
) {
  if (
    !navigator.onLine ||
    !supabase?.from
  ) {
    return;
  }

  try {
    const all =
      await getAllOfflineRecords();

    const pending =
      all.filter(
        (record) =>
          (!tableName ||
            record.table_name ===
              tableName) &&
          record._synced === false
      );

    for (const record of pending) {
      try {
        // ====================================================
        // DELETE QUEUE
        // ====================================================

        if (record._deleted) {
          // Local-only record never reached Supabase
          if (isLocalId(record.id)) {
            await deleteOfflineRecord(
              record.id
            );

            continue;
          }

          const {
            error
          } = await supabase
            .from(record.table_name)
            .delete()
            .eq('id', record.id);

          if (error) {
            throw new Error(
              error.message ||
              'Delete synchronization failed'
            );
          }

          await deleteOfflineRecord(
            record.id
          );

          continue;
        }

        // ====================================================
        // INSERT QUEUE
        // ====================================================

        if (isLocalId(record.id)) {
          const payload =
            cleanPayload(record);

          // Let Supabase create UUID
          delete payload.id;

          const {
            data: remoteData,
            error
          } = await supabase
            .from(record.table_name)
            .insert([payload])
            .select()
            .single();

          if (error) {
            throw new Error(
              error.message ||
              'Insert synchronization failed'
            );
          }

          await deleteOfflineRecord(
            record.id
          );

          await putOfflineRecord({
            ...remoteData,

            table_name:
              record.table_name,

            hospital_id:
              record.hospital_id ||
              remoteData.hospital_id,

            _synced: true,

            _deleted: false,

            _syncError: false
          });

          continue;
        }

        // ====================================================
        // UPDATE QUEUE
        // ====================================================

        const payload =
          cleanPayload(record);

        const {
          data: remoteData,
          error
        } = await supabase
          .from(record.table_name)
          .upsert(payload)
          .select()
          .single();

        if (error) {
          throw new Error(
            error.message ||
            'Synchronization failed'
          );
        }

        await putOfflineRecord({
          ...remoteData,

          table_name:
            record.table_name,

          hospital_id:
            record.hospital_id ||
            remoteData.hospital_id,

          _synced: true,

          _deleted: false,

          _syncError: false
        });
      } catch (err) {
        console.warn(
          `Failed to sync record ${record.id}:`,
          err
        );

        await putOfflineRecord({
          ...record,

          _syncError: true,

          _syncErrorMessage:
            err.message ||
            'Synchronization failed'
        });
      }
    }
  } catch (err) {
    console.error(
      'Error flushing offline queue:',
      err
    );
  }
}

// ============================================================
// SKIP STUCK SYNC ITEM
// ============================================================

export async function skipStuckSyncItem(
  id
) {
  try {
    const record =
      await getOfflineRecord(id);

    if (!record) {
      return false;
    }

    await putOfflineRecord({
      ...record,

      _syncError: false,

      _syncErrorMessage: null
    });

    return true;
  } catch (err) {
    console.error(
      'Could not skip sync item:',
      err
    );

    return false;
  }
}