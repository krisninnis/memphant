/**
 * Offline sync queue backed by IndexedDB.
 *
 * When a push fails (offline / transient error), the project is saved here.
 * On next successful online sync, all queued items are drained.
 *
 * DB: memphant-sync / store: pending-pushes
 */

import type { ProjectMemory } from '../types/memphant-types';

const DB_NAME    = 'memphant-sync';
const DB_VERSION = 1;
const STORE      = 'pending-pushes';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Add or replace a project in the pending queue. */
export async function enqueue(project: ProjectMemory): Promise<void> {
  try {
    const db   = await openDB();
    const tx   = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(project);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror    = () => rej(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[SyncQueue] enqueue failed:', err);
  }
}

/** Return all queued projects. */
export async function getAll(): Promise<ProjectMemory[]> {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);

    const result = await new Promise<ProjectMemory[]>((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result as ProjectMemory[]);
      req.onerror   = () => rej(req.error);
    });

    db.close();
    return result;
  } catch {
    return [];
  }
}

/** Remove a project from the queue by its id. */
export async function dequeue(projectId: string): Promise<void> {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.delete(projectId);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror    = () => rej(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[SyncQueue] dequeue failed:', err);
  }
}

/** How many projects are waiting to be synced. */
export async function pendingCount(): Promise<number> {
  try {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);

    const count = await new Promise<number>((res, rej) => {
      const req = store.count();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });

    db.close();
    return count;
  } catch {
    return 0;
  }
}
