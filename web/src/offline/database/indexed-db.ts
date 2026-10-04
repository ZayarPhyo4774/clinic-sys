const DB_NAME = "clinicsys";
const DB_VERSION = 1;

export const STORE = {
  device: "device",
  cache: "cache",
  outbox: "outbox",
} as const;

let opening: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function databaseAvailable() {
  return typeof indexedDB !== "undefined";
}

export function openDatabase() {
  if (!databaseAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE.device)) {
          db.createObjectStore(STORE.device, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE.cache)) {
          db.createObjectStore(STORE.cache, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE.outbox)) {
          const outbox = db.createObjectStore(STORE.outbox, { keyPath: "operationId" });
          outbox.createIndex("fingerprint", "fingerprint", { unique: false });
          outbox.createIndex("status", "status", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error ?? new Error("IndexedDB could not be opened."));
      };
    });
  }
  return opening;
}

export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    Promise.resolve(run(store))
      .then((result) => {
        if (result && typeof result === "object" && "onsuccess" in result) {
          requestToPromise(result as IDBRequest<T>).then(resolve, reject);
          return;
        }
        resolve(result as T);
      })
      .catch(reject);
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}
