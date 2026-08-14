import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const DB_NAME = 'HospitalOfflineDB';
const DB_VERSION = 3;

/*
  ============================================================
  IndexedDB
  ============================================================
*/

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('offline_records')) {
        const store = db.createObjectStore('offline_records', {
          keyPath: 'id',
        });

        store.createIndex('table_name', 'table_name', {
          unique: false,
        });

        store.createIndex('hospital_id', 'hospital_id', {
          unique: false,
        });

        store.createIndex('_synced', '_synced', {
          unique: false,
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/*
  ============================================================
  Utility
  ============================================================
*/

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x'
        ? r
        : (r & 0x3) | 0x8;

      return v.toString(16);
    }
  );
}

/*
  ============================================================
  Load local records
  ============================================================
*/

async function getLocalRecords(tableName, hospitalId) {
  if (!hospitalId) return [];

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      'offline_records',
      'readonly'
    );

    const store = tx.objectStore(
      'offline_records'
    );

    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];

      const filtered = all.filter(
        (record) =>
          record.table_name === tableName &&
          record.hospital_id === hospitalId &&
          !record._deleted
      );

      resolve(filtered);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/*
  ============================================================
  Save local record
  ============================================================
*/

async function saveLocalRecord(record) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      'offline_records',
      'readwrite'
    );

    const store = tx.objectStore(
      'offline_records'
    );

    store.put(record);

    tx.oncomplete = () => {
      resolve(record);
    };

    tx.onerror = () => {
      reject(tx.error);
    };
  });
}

/*
  ============================================================
  Delete local record
  ============================================================
*/

async function deleteLocalRecord(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      'offline_records',
      'readwrite'
    );

    const store = tx.objectStore(
      'offline_records'
    );

    store.delete(id);

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(tx.error);
    };
  });
}

/*
  ============================================================
  useOfflineTable
  ============================================================
*/

export function useOfflineTable(
  tableName,
  hospitalId
) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined'
      ? navigator.onLine
      : true
  );

  const [pendingCount, setPendingCount] = useState(0);

  /*
    ----------------------------------------------------------
    Load local records
    ----------------------------------------------------------
  */

  const loadLocalRecords = useCallback(async () => {
    if (!hospitalId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    try {
      const db = await openDB();

      const tx = db.transaction(
        'offline_records',
        'readonly'
      );

      const store = tx.objectStore(
        'offline_records'
      );

      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result || [];

        const filtered = all.filter(
          (record) =>
            record.table_name === tableName &&
            record.hospital_id === hospitalId &&
            !record._deleted
        );

        const pending = all.filter(
          (record) =>
            record.table_name === tableName &&
            record.hospital_id === hospitalId &&
            record._synced === false
        );

        setRecords(filtered);
        setPendingCount(pending.length);
        setLoading(false);
      };

      request.onerror = () => {
        console.error(
          'Failed to load IndexedDB records:',
          request.error
        );

        setLoading(false);
      };
    } catch (error) {
      console.error(
        'Error reading offline storage:',
        error
      );

      setLoading(false);
    }
  }, [tableName, hospitalId]);

  /*
    ----------------------------------------------------------
    Online / Offline listener
    ----------------------------------------------------------
  */

  useEffect(() => {
    loadLocalRecords();

    const handleOnline = async () => {
      setIsOnline(true);

      try {
        await flushTableQueue(tableName);
        await loadLocalRecords();
      } catch (error) {
        console.error(
          'Automatic sync failed:',
          error
        );
      }
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
  }, [
    loadLocalRecords,
    tableName,
  ]);

  /*
    ==========================================================
    ADD RECORD
    ==========================================================
  */

  const addRecord = async (data) => {
    /*
      IMPORTANT:
      Database ID is UUID.
      Never generate IDs such as "local_123".
    */

    const id =
      data.id && !String(data.id).startsWith('local_')
        ? data.id
        : generateUUID();

    const now = new Date().toISOString();

    const newRecord = {
      ...data,

      id,

      table_name: tableName,

      hospital_id:
        data.hospital_id || hospitalId,

      created_at:
        data.created_at || now,

      updated_at: now,

      _synced: false,

      _deleted: false,
    };

    /*
      Save locally first.
      This makes the application offline-first.
    */

    await saveLocalRecord(newRecord);

    /*
      --------------------------------------------------------
      Try Supabase when online
      --------------------------------------------------------
    */

    if (
      navigator.onLine &&
      supabase &&
      supabase.from
    ) {
      try {
        /*
          Remove local-only properties.
        */

        const {
          table_name,
          _synced,
          _deleted,
          _syncError,
          ...payload
        } = newRecord;

        /*
          Do not send undefined foreign keys.
        */

        if (!payload.hospital_id) {
          delete payload.hospital_id;
        }

        if (!payload.created_by) {
          delete payload.created_by;
        }

        const {
          data: remoteData,
          error,
        } = await supabase
          .from(tableName)
          .insert(payload)
          .select()
          .single();

        if (error) {
          console.error(
            '❌ Supabase insert failed:',
            error
          );

          /*
            Keep local record but mark sync error.
          */

          await saveLocalRecord({
            ...newRecord,
            _synced: false,
            _syncError: error.message,
          });

          throw new Error(
            error.message ||
            error.details ||
            'Database rejected insertion'
          );
        }

        /*
          Replace local record with remote record.
        */

        if (remoteData) {
          await saveLocalRecord({
            ...remoteData,

            table_name: tableName,

            hospital_id:
              remoteData.hospital_id ||
              hospitalId,

            _synced: true,

            _deleted: false,

            _syncError: null,
          });
        }

      } catch (error) {
        console.warn(
          'Network write failed. Record remains locally:',
          error
        );

        /*
          We throw so the ImportExcelModal can
          correctly count the failure.
        */

        throw error;
      }
    }

    await loadLocalRecords();

    return newRecord;
  };

  /*
    ==========================================================
    UPDATE RECORD
    ==========================================================
  */

  const updateRecord = async (
    id,
    updates
  ) => {
    const db = await openDB();

    let updatedRecord = null;

    /*
      Get existing local record
    */

    await new Promise((resolve, reject) => {
      const tx = db.transaction(
        'offline_records',
        'readwrite'
      );

      const store =
        tx.objectStore(
          'offline_records'
        );

      const request =
        store.get(id);

      request.onsuccess = () => {
        const existing =
          request.result || {
            id,
            table_name: tableName,
            hospital_id: hospitalId,
          };

        updatedRecord = {
          ...existing,

          ...updates,

          table_name: tableName,

          hospital_id:
            existing.hospital_id ||
            hospitalId,

          updated_at:
            new Date().toISOString(),

          _synced: false,

          _deleted: false,
        };

        store.put(updatedRecord);
      };

      request.onerror = () => {
        reject(request.error);
      };

      tx.oncomplete = () => {
        resolve();
      };

      tx.onerror = () => {
        reject(tx.error);
      };
    });

    /*
      --------------------------------------------------------
      Send update to Supabase
      --------------------------------------------------------
    */

    if (
      navigator.onLine &&
      supabase &&
      supabase.from
    ) {
      try {
        const {
          table_name,
          _synced,
          _deleted,
          _syncError,
          ...payload
        } = updatedRecord;

        const {
          error,
        } = await supabase
          .from(tableName)
          .update(payload)
          .eq('id', id);

        if (error) {
          console.error(
            '❌ Supabase update failed:',
            error
          );

          await saveLocalRecord({
            ...updatedRecord,
            _synced: false,
            _syncError: error.message,
          });

          throw new Error(
            error.message ||
            'Database rejected update'
          );
        }

        /*
          Mark locally synced.
        */

        await saveLocalRecord({
          ...updatedRecord,
          _synced: true,
          _syncError: null,
        });

      } catch (error) {
        console.warn(
          'Network update failed:',
          error
        );

        throw error;
      }
    }

    await loadLocalRecords();

    return updatedRecord;
  };

  /*
    ==========================================================
    DELETE RECORD
    ==========================================================
  */

  const deleteRecord = async (id) => {
    const db = await openDB();

    let existing = null;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(
        'offline_records',
        'readwrite'
      );

      const store =
        tx.objectStore(
          'offline_records'
        );

      const request =
        store.get(id);

      request.onsuccess = () => {
        existing = request.result;

        if (existing) {
          store.put({
            ...existing,

            _deleted: true,

            _synced: false,

            updated_at:
              new Date().toISOString(),
          });
        }
      };

      request.onerror = () => {
        reject(request.error);
      };

      tx.oncomplete = () => {
        resolve();
      };

      tx.onerror = () => {
        reject(tx.error);
      };
    });

    /*
      --------------------------------------------------------
      Delete remotely when online
      --------------------------------------------------------
    */

    if (
      navigator.onLine &&
      supabase &&
      supabase.from
    ) {
      try {
        const {
          error,
        } = await supabase
          .from(tableName)
          .delete()
          .eq('id', id);

        if (error) {
          throw new Error(error.message);
        }

        await deleteLocalRecord(id);

      } catch (error) {
        console.warn(
          'Remote delete failed. Keeping delete queued:',
          error
        );
      }
    }

    await loadLocalRecords();
  };

  /*
    ==========================================================
    RETURN
    ==========================================================
  */

  return {
    records,

    loading,

    isOnline,

    pendingCount,

    addRecord,

    updateRecord,

    deleteRecord,

    refreshTable:
      loadLocalRecords,
  };
}

/*
  ============================================================
  SYNC ERRORS
  ============================================================
*/

export async function getAllSyncErrors() {
  try {
    const db = await openDB();

    return new Promise((resolve) => {
      const tx = db.transaction(
        'offline_records',
        'readonly'
      );

      const store =
        tx.objectStore(
          'offline_records'
        );

      const request =
        store.getAll();

      request.onsuccess = () => {
        const all =
          request.result || [];

        resolve(
          all.filter(
            (record) =>
              record._syncError
          )
        );
      };

      request.onerror = () => {
        resolve([]);
      };
    });

  } catch (error) {
    console.error(
      'Could not read sync errors:',
      error
    );

    return [];
  }
}

/*
  ============================================================
  SYNC ERROR SUBSCRIPTION
  ============================================================
*/

export function subscribeSyncErrors(
  callback
) {
  const handler = async () => {
    if (
      typeof callback ===
      'function'
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

/*
  ============================================================
  FLUSH OFFLINE QUEUE
  ============================================================
*/

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
    const db = await openDB();

    const all = await new Promise(
      (resolve, reject) => {
        const tx =
          db.transaction(
            'offline_records',
            'readonly'
          );

        const store =
          tx.objectStore(
            'offline_records'
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            resolve(
              request.result || []
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
            );
          };
      }
    );

    const pending =
      all.filter(
        (record) =>
          record._synced === false &&
          (
            !tableName ||
            record.table_name ===
              tableName
          )
      );

    for (const record of pending) {
      try {
        /*
          ----------------------------------------------------
          DELETE
          ----------------------------------------------------
        */

        if (record._deleted) {
          const {
            error,
          } = await supabase
            .from(record.table_name)
            .delete()
            .eq(
              'id',
              record.id
            );

          if (error) {
            throw error;
          }

          await deleteLocalRecord(
            record.id
          );

          continue;
        }

        /*
          ----------------------------------------------------
          UPSERT
          ----------------------------------------------------
        */

        const {
          table_name,
          _synced,
          _deleted,
          _syncError,
          ...payload
        } = record;

        const {
          error,
        } = await supabase
          .from(table_name)
          .upsert(payload);

        if (error) {
          throw error;
        }

        await saveLocalRecord({
          ...record,

          _synced: true,

          _syncError: null,
        });

      } catch (error) {
        console.warn(
          'Failed to sync record:',
          record.id,
          error
        );

        await saveLocalRecord({
          ...record,

          _synced: false,

          _syncError:
            error.message ||
            'Sync failed',
        });
      }
    }

  } catch (error) {
    console.error(
      'Error flushing offline queue:',
      error
    );
  }
}
