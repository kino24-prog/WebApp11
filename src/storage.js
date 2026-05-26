const databaseName = 'handwrite-math-notebook';
const databaseVersion = 1;
const storeName = 'notes';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported.'));
      return;
    }

    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(mode, callback) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = callback(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      }),
  );
}

export async function getAllNotes() {
  const notes = await runTransaction('readonly', (store) => store.getAll());
  return notes.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

export function saveNote(note) {
  return runTransaction('readwrite', (store) => store.put(note));
}

export function deleteNote(id) {
  return runTransaction('readwrite', (store) => store.delete(id));
}
