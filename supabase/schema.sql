-- =====================================================================
-- QuizMania · Base de datos de Supabase
--
-- Cómo usarlo: Supabase → SQL Editor → pega este archivo entero → Run.
-- Se puede volver a ejecutar sin perder datos (crea solo lo que falta y
-- reemplaza funciones y políticas).
--
-- Contenido:
--   · perfiles    Usuario, avatar y puntos acumulados de cada jugador.
--   · records     Mejor puntuación de cada jugador en cada modo.
--   · partidas    Historial de partidas jugadas.
--   · amistades   Amigos (siempre en los dos sentidos).
--   · Funciones   registrar_partida, ranking, amigos, avatar…
--   · Storage     Bucket público "avatares" (cada uno solo toca su carpeta).
--
-- El login es solo usuario y contraseña: el juego convierte el usuario en
-- un correo interno "<usuario>@quizmania.app" que nunca recibe nada.
-- Las cuentas se confirman solas (trigger confirmar_usuario), pero conviene
-- desactivar también Authentication → Sign In / Providers → Email →
-- "Confirm email": así Supabase no intenta enviar correos (su servidor de
-- correo gratuito solo deja enviar unos pocos por hora).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.perfiles (
    id              uuid primary key references auth.users (id) on delete cascade,
    usuario         text not null unique check (usuario ~ '^[a-z0-9_]{3,20}$'),
    -- null = sin foto; si no, versión de la foto (para no ver una vieja en caché).
    avatar_version  integer,
    puntos_totales  bigint  not null default 0,
    partidas        integer not null default 0,
    aciertos        integer not null default 0,
    preguntas       integer not null default 0,
    creado          timestamptz not null default now()
);

-- Nombre visible (el usuario sirve para entrar y para que te añadan de amigo;
-- el nombre es el que se enseña y se puede cambiar). null = se enseña el usuario.
alter table public.perfiles add column if not exists nombre text
    check (nombre is null or char_length(nombre) between 1 and 24);

create index if not exists perfiles_puntos_totales on public.perfiles (puntos_totales desc);

create table if not exists public.records (
    usuario_id   uuid not null references public.perfiles (id) on delete cascade,
    modo         text not null,
    mejor        integer not null default 0,
    partidas     integer not null default 0,
    actualizado  timestamptz not null default now(),
    primary key (usuario_id, modo)
);

create index if not exists records_modo_mejor on public.records (modo, mejor desc);

create table if not exists public.partidas (
    id          bigint generated always as identity primary key,
    usuario_id  uuid not null references public.perfiles (id) on delete cascade,
    modo        text not null,
    tema        text not null,
    puntos      integer not null,
    aciertos    integer not null,
    total       integer not null,
    creada      timestamptz not null default now()
);

create index if not exists partidas_usuario_fecha on public.partidas (usuario_id, creada desc);

create table if not exists public.amistades (
    usuario_id  uuid not null references public.perfiles (id) on delete cascade,
    amigo_id    uuid not null references public.perfiles (id) on delete cascade,
    creada      timestamptz not null default now(),
    primary key (usuario_id, amigo_id),
    check (usuario_id <> amigo_id)
);


-- ---------------------------------------------------------------------
-- Seguridad (RLS): se puede LEER lo público; todo lo que se ESCRIBE pasa
-- por las funciones de abajo, que validan los datos.
-- ---------------------------------------------------------------------

alter table public.perfiles  enable row level security;
alter table public.records   enable row level security;
alter table public.partidas  enable row level security;
alter table public.amistades enable row level security;

drop policy if exists "perfiles visibles para todos" on public.perfiles;
create policy "perfiles visibles para todos" on public.perfiles
    for select using (true);

drop policy if exists "records visibles para todos" on public.records;
create policy "records visibles para todos" on public.records
    for select using (true);

drop policy if exists "cada uno ve sus partidas" on public.partidas;
create policy "cada uno ve sus partidas" on public.partidas
    for select to authenticated using (usuario_id = auth.uid());

drop policy if exists "cada uno ve sus amistades" on public.amistades;
create policy "cada uno ve sus amistades" on public.amistades
    for select to authenticated using (usuario_id = auth.uid());

revoke insert, update, delete on public.perfiles, public.records, public.partidas, public.amistades from anon, authenticated;


-- ---------------------------------------------------------------------
-- Alta de jugador: al registrarse se crea su perfil con el usuario que
-- manda el juego en los metadatos.
-- ---------------------------------------------------------------------

create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.perfiles (id, usuario)
    values (new.id, lower(new.raw_user_meta_data ->> 'usuario'));
    return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
    after insert on auth.users
    for each row execute function public.crear_perfil();


-- Confirma las cuentas del juego al crearlas: el correo interno no existe,
-- así que nadie podría pulsar el enlace de confirmación.
create or replace function public.confirmar_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.email like '%@quizmania.app' then
        new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
    end if;
    return new;
end;
$$;

-- Algunos proyectos no dejan tocar auth.users desde el SQL Editor: si falla,
-- se avisa y el resto del script sigue (en ese caso es imprescindible
-- desactivar "Confirm email").
do $$
begin
    execute 'drop trigger if exists al_registrar_confirmar on auth.users';
    execute 'create trigger al_registrar_confirmar before insert on auth.users '
         || 'for each row execute function public.confirmar_usuario()';
exception when others then
    raise warning 'QuizMania: no se pudo crear el trigger de confirmación (%). Desactiva "Confirm email".', sqlerrm;
end;
$$;

-- Cuentas creadas antes de este trigger que se quedaron sin confirmar.
do $$
begin
    update auth.users
        set email_confirmed_at = now()
        where email like '%@quizmania.app' and email_confirmed_at is null;
exception when others then
    raise warning 'QuizMania: no se pudieron confirmar las cuentas antiguas (%).', sqlerrm;
end;
$$;


-- Indica si un nombre de usuario está libre (para avisar antes de registrarse).
create or replace function public.usuario_disponible(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (select 1 from public.perfiles where usuario = lower(trim(p_usuario)));
$$;

-- ---------------------------------------------------------------------
-- Partidas y puntos
-- ---------------------------------------------------------------------

-- Guarda una partida terminada: suma los puntos al total del jugador y
-- actualiza su récord del modo. Rechaza puntuaciones imposibles.
-- Máximo por acierto: (100 base + 100 racha + 50 rapidez) × 2 (modo Experto) = 500.
create or replace function public.registrar_partida(
    p_modo text,
    p_tema text,
    p_puntos integer,
    p_aciertos integer,
    p_total integer
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid       uuid := auth.uid();
    v_anterior  integer;
    v_total     bigint;
begin
    if v_uid is null then
        raise exception 'no-autenticado';
    end if;
    if p_modo not in ('clasico', 'relampago', 'contrarreloj', 'supervivencia', 'muerte-subita',
                      'experto', 'ruleta', 'maraton', 'racha', 'todo-o-nada') then
        raise exception 'modo-no-valido';
    end if;
    if p_total < 0 or p_total > 1000
       or p_aciertos < 0 or p_aciertos > p_total
       or p_puntos < 0 or p_puntos > p_aciertos * 500
       or length(coalesce(p_tema, '')) > 40 then
        raise exception 'partida-no-valida';
    end if;
    -- Evita que se envíen partidas en bucle.
    if exists (
        select 1 from public.partidas
        where usuario_id = v_uid and creada > now() - interval '3 seconds'
    ) then
        raise exception 'demasiado-rapido';
    end if;

    select mejor into v_anterior from public.records where usuario_id = v_uid and modo = p_modo;

    insert into public.partidas (usuario_id, modo, tema, puntos, aciertos, total)
    values (v_uid, p_modo, coalesce(p_tema, ''), p_puntos, p_aciertos, p_total);

    insert into public.records as r (usuario_id, modo, mejor, partidas)
    values (v_uid, p_modo, p_puntos, 1)
    on conflict (usuario_id, modo) do update
        set mejor       = greatest(r.mejor, excluded.mejor),
            partidas    = r.partidas + 1,
            actualizado = now();

    update public.perfiles
        set puntos_totales = puntos_totales + p_puntos,
            partidas       = partidas + 1,
            aciertos       = aciertos + p_aciertos,
            preguntas      = preguntas + p_total
        where id = v_uid
        returning puntos_totales into v_total;

    return json_build_object(
        'anterior',       coalesce(v_anterior, 0),
        'mejor',          greatest(coalesce(v_anterior, 0), p_puntos),
        'nuevo_record',   p_puntos > coalesce(v_anterior, 0),
        'puntos_totales', v_total
    );
end;
$$;


-- Clasificación de un modo ('total' = puntos acumulados).
--   p_ambito 'global': los mejores de todos (más tu fila si no estás entre ellos).
--   p_ambito 'amigos': tú y tus amigos (también los que aún no han jugado).
drop function if exists public.ranking(text, text, integer);
create function public.ranking(
    p_modo text,
    p_ambito text default 'global',
    p_limite integer default 50
)
returns table (
    posicion        bigint,
    id              uuid,
    usuario         text,
    nombre          text,
    avatar_version  integer,
    puntos          bigint,
    soy_yo          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    with base as (
        select p.id, p.usuario, coalesce(p.nombre, p.usuario) as nombre, p.avatar_version,
               case when p_modo = 'total'
                    then nullif(p.puntos_totales, 0)
                    else r.mejor::bigint
               end as puntos
        from public.perfiles p
        left join public.records r on r.usuario_id = p.id and r.modo = p_modo
        where p_ambito = 'global'
           or p.id = auth.uid()
           or p.id in (select a.amigo_id from public.amistades a where a.usuario_id = auth.uid())
    ),
    filtrado as (
        select * from base
        where p_ambito <> 'global' or puntos is not null
    ),
    ordenado as (
        select f.*, rank() over (order by f.puntos desc nulls last) as pos
        from filtrado f
    )
    select case when o.puntos is null then null else o.pos end,
           o.id, o.usuario, o.nombre, o.avatar_version, o.puntos,
           o.id = auth.uid()
    from ordenado o
    where o.pos <= least(greatest(p_limite, 1), 100) or o.id = auth.uid()
    order by o.puntos desc nulls last, o.usuario;
$$;


-- ---------------------------------------------------------------------
-- Amigos (sin grupos: la amistad es entre dos jugadores y es mutua)
-- ---------------------------------------------------------------------

create or replace function public.anadir_amigo(p_usuario text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid    uuid := auth.uid();
    v_amigo  public.perfiles;
begin
    if v_uid is null then
        raise exception 'no-autenticado';
    end if;
    select * into v_amigo from public.perfiles where usuario = lower(trim(p_usuario));
    if v_amigo.id is null then
        raise exception 'usuario-no-existe';
    end if;
    if v_amigo.id = v_uid then
        raise exception 'eres-tu';
    end if;
    if (select count(*) from public.amistades where usuario_id = v_uid) >= 200 then
        raise exception 'demasiados-amigos';
    end if;

    insert into public.amistades (usuario_id, amigo_id)
    values (v_uid, v_amigo.id), (v_amigo.id, v_uid)
    on conflict do nothing;

    return json_build_object(
        'id', v_amigo.id,
        'usuario', v_amigo.usuario,
        'nombre', coalesce(v_amigo.nombre, v_amigo.usuario),
        'avatar_version', v_amigo.avatar_version,
        'puntos_totales', v_amigo.puntos_totales
    );
end;
$$;

create or replace function public.quitar_amigo(p_amigo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    delete from public.amistades
    where (usuario_id = auth.uid() and amigo_id = p_amigo)
       or (usuario_id = p_amigo and amigo_id = auth.uid());
end;
$$;

drop function if exists public.mis_amigos();
create function public.mis_amigos()
returns table (id uuid, usuario text, nombre text, avatar_version integer, puntos_totales bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select p.id, p.usuario, coalesce(p.nombre, p.usuario), p.avatar_version, p.puntos_totales
    from public.amistades a
    join public.perfiles p on p.id = a.amigo_id
    where a.usuario_id = auth.uid()
    order by p.usuario;
$$;


-- ---------------------------------------------------------------------
-- Nombre visible y foto de perfil
-- ---------------------------------------------------------------------

-- Cambia el nombre que ven los demás (vacío = volver a enseñar el usuario).
create or replace function public.cambiar_nombre(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nombre text := nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '[[:cntrl:]<>]', '', 'g')), '');
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    if v_nombre is not null and char_length(v_nombre) > 24 then
        raise exception 'nombre-no-valido';
    end if;
    update public.perfiles set nombre = v_nombre where id = auth.uid();
    return v_nombre;
end;
$$;

-- Se llama después de subir la foto a storage: sube la versión para
-- que todos vean la nueva.
create or replace function public.avatar_actualizado()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_version integer;
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    update public.perfiles
        set avatar_version = coalesce(avatar_version, 0) + 1
        where id = auth.uid()
        returning avatar_version into v_version;
    return v_version;
end;
$$;

create or replace function public.quitar_avatar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    update public.perfiles set avatar_version = null where id = auth.uid();
end;
$$;


-- Permisos de las funciones.
revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.confirmar_usuario() from public, anon, authenticated;
revoke execute on function public.cambiar_nombre(text) from public, anon;
revoke execute on function public.registrar_partida(text, text, integer, integer, integer) from public, anon;
revoke execute on function public.anadir_amigo(text) from public, anon;
revoke execute on function public.quitar_amigo(uuid) from public, anon;
revoke execute on function public.mis_amigos() from public, anon;
revoke execute on function public.avatar_actualizado() from public, anon;
revoke execute on function public.quitar_avatar() from public, anon;

grant execute on function public.usuario_disponible(text) to anon, authenticated;
grant execute on function public.ranking(text, text, integer) to anon, authenticated;
grant execute on function public.registrar_partida(text, text, integer, integer, integer) to authenticated;
grant execute on function public.anadir_amigo(text) to authenticated;
grant execute on function public.quitar_amigo(uuid) to authenticated;
grant execute on function public.mis_amigos() to authenticated;
grant execute on function public.avatar_actualizado() to authenticated;
grant execute on function public.quitar_avatar() to authenticated;
grant execute on function public.cambiar_nombre(text) to authenticated;


-- ---------------------------------------------------------------------
-- Storage: fotos de perfil en "avatares/<id del usuario>/avatar.webp"
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 1048576, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares: ver mi carpeta" on storage.objects;
create policy "avatares: ver mi carpeta" on storage.objects
    for select to authenticated
    using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares: subir a mi carpeta" on storage.objects;
create policy "avatares: subir a mi carpeta" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares: cambiar en mi carpeta" on storage.objects;
create policy "avatares: cambiar en mi carpeta" on storage.objects
    for update to authenticated
    using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares: borrar de mi carpeta" on storage.objects;
create policy "avatares: borrar de mi carpeta" on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
