/**
 * files.ts
 * Stores files (the songs the player uploads) in IndexedDB so they are still
 * there on the next visit. Everything stays in this browser. When IndexedDB
 * is not available (strict private mode…) operations fail without breaking
 * the game.
 *
 * The database and store names are the ones used since the first version
 * ("quizmania" / "canciones"): renaming them would lose the songs players
 * already uploaded.
 */

const DATABASE_NAME = "quizmania";
const STORE_NAME = "canciones";

let connection: Promise<IDBDatabase> | null = null;

/** Opens (or creates) the database. */
function open(): Promise<IDBDatabase> {
    connection ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    connection.catch(() => {
        connection = null;
    });
    return connection;
}

/**
 * Runs one operation on the store and waits until its transaction is committed.
 * @param mode Read-only or read-write.
 * @param operation What to do with the store.
 */
async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await open();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        // Resolve only when the data is really written (not just requested).
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error ?? request.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
    });
}

/**
 * Saves a file. It is stored as a plain Blob copy (some browsers can't keep
 * the File object of an <input> once the page is reloaded).
 * @param key Identifier.
 * @param file Contents.
 */
export async function saveFile(key: string, file: Blob): Promise<void> {
    const copy = new Blob([await file.arrayBuffer()], { type: file.type || "audio/mpeg" });
    await run("readwrite", (store) => store.put(copy, key));
}

/**
 * Reads a saved file.
 * @param key Identifier.
 * @returns The file, or undefined if it doesn't exist.
 */
export function readFile(key: string): Promise<Blob | undefined> {
    return run<Blob | undefined>("readonly", (store) => store.get(key) as IDBRequest<Blob | undefined>);
}

/**
 * Lists the keys of every saved file.
 */
export async function listFileKeys(): Promise<string[]> {
    const keys = await run("readonly", (store) => store.getAllKeys());
    return keys.map(String);
}

/**
 * Deletes a saved file.
 * @param key Identifier.
 */
export async function deleteFile(key: string): Promise<void> {
    await run("readwrite", (store) => store.delete(key));
}

/**
 * Asks the browser not to evict our storage when the disk is low (songs
 * can be large). Browsers may say no; that's fine.
 */
export async function requestPersistentStorage(): Promise<void> {
    try {
        if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch {
        // Not supported.
    }
}
