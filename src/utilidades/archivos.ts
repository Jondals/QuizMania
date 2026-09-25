/**
 * archivos.ts
 * Guarda archivos (las canciones que sube el jugador) en IndexedDB, para
 * que sigan ahí en la próxima visita. Todo se queda en este navegador.
 * Si IndexedDB no está disponible (modo incógnito estricto…), las
 * operaciones fallan sin romper el juego.
 */

const NOMBRE_BASE = "quizmania";
const ALMACEN = "canciones";

let conexion: Promise<IDBDatabase> | null = null;

/** Abre (o crea) la base de datos. */
function abrir(): Promise<IDBDatabase> {
    conexion ??= new Promise((resolver, rechazar) => {
        const peticion = indexedDB.open(NOMBRE_BASE, 1);
        peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => rechazar(peticion.error);
    });
    conexion.catch(() => {
        conexion = null;
    });
    return conexion;
}

/**
 * Ejecuta una operación en el almacén y devuelve su resultado.
 * @param modo Solo lectura o lectura y escritura.
 * @param operacion Lo que se hace con el almacén.
 */
async function operar<T>(modo: IDBTransactionMode, operacion: (almacen: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const base = await abrir();
    return new Promise((resolver, rechazar) => {
        const peticion = operacion(base.transaction(ALMACEN, modo).objectStore(ALMACEN));
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => rechazar(peticion.error);
    });
}

/**
 * Guarda un archivo.
 * @param clave Identificador.
 * @param archivo Contenido.
 */
export async function guardarArchivo(clave: string, archivo: Blob): Promise<void> {
    await operar("readwrite", (almacen) => almacen.put(archivo, clave));
}

/**
 * Lee un archivo guardado.
 * @param clave Identificador.
 * @returns El archivo o undefined si no existe.
 */
export function leerArchivo(clave: string): Promise<Blob | undefined> {
    return operar<Blob | undefined>("readonly", (almacen) => almacen.get(clave) as IDBRequest<Blob | undefined>);
}

/**
 * Borra un archivo guardado.
 * @param clave Identificador.
 */
export async function borrarArchivo(clave: string): Promise<void> {
    await operar("readwrite", (almacen) => almacen.delete(clave));
}
