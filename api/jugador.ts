/**
 * /api/jugador
 * POST: registra al jugador la primera vez (le asigna un código de amigo)
 *       o actualiza su nombre y avatar. Devuelve su perfil público.
 *
 * El navegador genera su propio id y secreto al azar y los manda en las
 * cabeceras x-quizmania-id y x-quizmania-secreto; no hay contraseñas.
 */

import {
    ALFABETO_CODIGO,
    esAvatarValido,
    esColorValido,
    limpiarNombre,
    LONGITUD_CODIGO,
} from "./_lib/compartido.js";
import {
    claveCodigo,
    claveJugador,
    ErrorHttp,
    leerCredenciales,
    leerCuerpo,
    redis,
    responder,
} from "./_lib/servidor.js";

/** Intentos para encontrar un código libre. */
const INTENTOS_CODIGO = 8;

/** Genera un código de amigo al azar. */
function generarCodigo(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(LONGITUD_CODIGO));
    return [...bytes].map((byte) => ALFABETO_CODIGO[byte % ALFABETO_CODIGO.length]).join("");
}

/**
 * Reserva un código libre para el jugador.
 * @param id Id del jugador.
 */
async function reservarCodigo(id: string): Promise<string> {
    for (let intento = 0; intento < INTENTOS_CODIGO; intento++) {
        const codigo = generarCodigo();
        const [resultado] = await redis([["SET", claveCodigo(codigo), id, "NX"]]);
        if (resultado === "OK") {
            return codigo;
        }
    }
    throw new Error("No se encontró un código de amigo libre");
}

export function POST(peticion: Request): Promise<Response> {
    return responder(async () => {
        const { id, resumenSecreto } = await leerCredenciales(peticion);
        const cuerpo = await leerCuerpo(peticion);
        const nombre = limpiarNombre(cuerpo.nombre);
        if (!nombre || !esAvatarValido(cuerpo.avatar) || !esColorValido(cuerpo.color)) {
            throw new ErrorHttp(400, "perfil-no-valido");
        }

        const [secretoGuardado, codigoGuardado] = (await redis([
            ["HMGET", claveJugador(id), "secreto", "codigo"],
        ]))[0] as (string | null)[];

        if (secretoGuardado !== null && secretoGuardado !== resumenSecreto) {
            throw new ErrorHttp(403, "secreto-incorrecto");
        }

        const codigo = codigoGuardado ?? (await reservarCodigo(id));
        await redis([
            [
                "HSET", claveJugador(id),
                "secreto", resumenSecreto,
                "codigo", codigo,
                "nombre", nombre,
                "avatar", cuerpo.avatar,
                "color", cuerpo.color,
            ],
        ]);
        return { id, codigo, nombre, avatar: cuerpo.avatar, color: cuerpo.color };
    });
}
