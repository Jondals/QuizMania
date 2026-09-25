/**
 * /api/amigos
 * GET:    lista de amigos del jugador.
 * POST:   { codigo } añade a un amigo por su código (la amistad es mutua).
 * DELETE: ?id=… quita a un amigo (de las dos listas).
 */

import { MAXIMO_AMIGOS, normalizarCodigo } from "./_lib/compartido.js";
import {
    autenticar,
    claveAmigos,
    claveCodigo,
    ErrorHttp,
    leerCuerpo,
    leerPerfiles,
    redis,
    responder,
} from "./_lib/servidor.js";

export function GET(peticion: Request): Promise<Response> {
    return responder(async () => {
        const id = await autenticar(peticion);
        const [ids] = (await redis([["SMEMBERS", claveAmigos(id)]])) as string[][];
        const perfiles = await leerPerfiles(ids);
        const amigos = [...perfiles.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
        return { amigos };
    });
}

export function POST(peticion: Request): Promise<Response> {
    return responder(async () => {
        const id = await autenticar(peticion);
        const codigo = normalizarCodigo((await leerCuerpo(peticion)).codigo);
        if (!codigo) {
            throw new ErrorHttp(400, "codigo-no-valido");
        }
        const [idAmigo, cantidadAmigos] = (await redis([
            ["GET", claveCodigo(codigo)],
            ["SCARD", claveAmigos(id)],
        ])) as [string | null, number];

        if (!idAmigo) {
            throw new ErrorHttp(404, "codigo-no-existe");
        }
        if (idAmigo === id) {
            throw new ErrorHttp(400, "eres-tu");
        }
        if (cantidadAmigos >= MAXIMO_AMIGOS) {
            throw new ErrorHttp(400, "demasiados-amigos");
        }

        await redis([
            ["SADD", claveAmigos(id), idAmigo],
            ["SADD", claveAmigos(idAmigo), id],
        ]);
        const amigo = (await leerPerfiles([idAmigo])).get(idAmigo);
        if (!amigo) {
            throw new ErrorHttp(404, "codigo-no-existe");
        }
        return { amigo };
    });
}

export function DELETE(peticion: Request): Promise<Response> {
    return responder(async () => {
        const id = await autenticar(peticion);
        const idAmigo = new URL(peticion.url).searchParams.get("id") ?? "";
        if (!/^[0-9a-f]{32}$/.test(idAmigo)) {
            throw new ErrorHttp(400, "id-no-valido");
        }
        await redis([
            ["SREM", claveAmigos(id), idAmigo],
            ["SREM", claveAmigos(idAmigo), id],
        ]);
        return { ok: true };
    });
}
