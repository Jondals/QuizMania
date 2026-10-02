-- =====================================================================
-- QuizMania · Supabase database
--
-- How to use it: Supabase → SQL Editor → paste this whole file → Run.
-- It can be run again without losing data (it only creates what's missing
-- and replaces functions and policies).
--
-- Contents:
--   · perfiles    Username, avatar and total points of each player.
--   · records     Best score of each player in each mode.
--   · partidas    History of played games.
--   · amistades   Friends (always stored both ways).
--   · retos       Versus challenges between friends (point-based leagues).
--   · Functions   registrar_partida, ranking, friends, versus, avatar…
--   · Storage     Public "avatares" bucket (each player only touches their folder).
--
-- Login is username and password only: the game turns the username into
-- an internal e-mail "<username>@quizmania.app" that never receives anything.
-- Accounts are confirmed automatically (trigger confirmar_usuario), but it's
-- best to also turn off Authentication → Sign In / Providers → Email →
-- "Confirm email": that way Supabase doesn't try to send e-mails (its free
-- mail server only allows a few per hour).
--
-- Table, column and function names stay in Spanish on purpose: this is the
-- schema already deployed, and renaming it would break existing data.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.perfiles (
    id              uuid primary key references auth.users (id) on delete cascade,
    usuario         text not null unique check (usuario ~ '^[a-z0-9_]{3,20}$'),
    -- null = no photo; otherwise the photo version (so an old cached one isn't shown).
    avatar_version  integer,
    puntos_totales  bigint  not null default 0,
    partidas        integer not null default 0,
    aciertos        integer not null default 0,
    preguntas       integer not null default 0,
    creado          timestamptz not null default now()
);

-- Display name (the username is for logging in and for friends to add you;
-- the name is what others see and can be changed). null = show the username.
alter table public.perfiles add column if not exists nombre text
    check (nombre is null or char_length(nombre) between 1 and 24);

-- Friend code: 6 letters and digits without the confusing ones (no I, O, 0 or 1).
-- Handed out automatically when the profile is created (trigger poner_codigo_amigo).
alter table public.perfiles add column if not exists codigo text unique
    check (codigo is null or codigo ~ '^[A-HJ-NP-Z2-9]{6}$');

-- Versus: league points (they never expire) and challenge record.
alter table public.perfiles add column if not exists puntos_liga integer not null default 0;
alter table public.perfiles add column if not exists victorias   integer not null default 0;
alter table public.perfiles add column if not exists empates     integer not null default 0;
alter table public.perfiles add column if not exists derrotas    integer not null default 0;

create index if not exists perfiles_puntos_totales on public.perfiles (puntos_totales desc);
create index if not exists perfiles_puntos_liga on public.perfiles (puntos_liga desc);

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

create table if not exists public.retos (
    id                bigint generated always as identity primary key,
    retador           uuid not null references public.perfiles (id) on delete cascade,
    rival             uuid not null references public.perfiles (id) on delete cascade,
    tema              text not null default '',
    -- Questions the challenger played, packed: [{e, r: [...], c, i}]
    preguntas         jsonb not null,
    puntos_retador    integer not null,
    aciertos_retador  integer not null,
    puntos_rival      integer,
    aciertos_rival    integer,
    estado            text not null default 'pendiente' check (estado in ('pendiente', 'terminado', 'rechazado')),
    -- League points each player won (or lost) when it finished.
    cambio_retador    integer,
    cambio_rival      integer,
    creado            timestamptz not null default now(),
    terminado         timestamptz,
    check (retador <> rival)
);

create index if not exists retos_rival on public.retos (rival, estado);
create index if not exists retos_retador on public.retos (retador, estado);


-- ---------------------------------------------------------------------
-- Security (RLS): public data can be READ; everything that is WRITTEN goes
-- through the functions below, which validate the data.
-- ---------------------------------------------------------------------

alter table public.perfiles  enable row level security;
alter table public.records   enable row level security;
alter table public.partidas  enable row level security;
alter table public.amistades enable row level security;
-- Challenges have no policies: they are only read and written by functions
-- (so nobody sees the questions of a challenge that isn't theirs).
alter table public.retos     enable row level security;

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
revoke all on public.retos from anon, authenticated;


-- ---------------------------------------------------------------------
-- New player: on sign-up their profile is created with the username the
-- game sends in the metadata.
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


-- Confirms the game's accounts when they're created: the internal e-mail
-- doesn't exist, so nobody could click the confirmation link.
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

-- Some projects don't allow touching auth.users from the SQL Editor: if it
-- fails, a notice is shown and the rest of the script carries on (then
-- turning off "Confirm email" is a must).
do $$
begin
    execute 'drop trigger if exists al_registrar_confirmar on auth.users';
    execute 'create trigger al_registrar_confirmar before insert on auth.users '
         || 'for each row execute function public.confirmar_usuario()';
exception when others then
    raise warning 'QuizMania: could not create the confirmation trigger (%). Turn off "Confirm email".', sqlerrm;
end;
$$;

-- Accounts created before this trigger that were left unconfirmed.
do $$
begin
    update auth.users
        set email_confirmed_at = now()
        where email like '%@quizmania.app' and email_confirmed_at is null;
exception when others then
    raise warning 'QuizMania: could not confirm the old accounts (%).', sqlerrm;
end;
$$;


-- Generates a friend code nobody has that also doesn't look like the
-- player's username or name: the code is a credential of its own; if it
-- matched the name it would add nothing and be easy to guess.
-- p_usuario and p_nombre belong to the player who will receive the code.
drop function if exists public.generar_codigo_amigo(text, text);
create function public.generar_codigo_amigo(p_usuario text default null, p_nombre text default null)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_codigo   text;
    v_propio   text;
begin
    -- Compared ignoring case, spaces and symbols.
    v_propio := upper(regexp_replace(coalesce(p_usuario, '') || coalesce(p_nombre, ''), '[^a-z0-9]', '', 'gi'));
    loop
        v_codigo := '';
        for i in 1..6 loop
            v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
        end loop;
        -- Neither another player's code, nor this player's username or name.
        exit when not exists (select 1 from public.perfiles where codigo = v_codigo)
              and position(v_codigo in v_propio) = 0;
    end loop;
    return v_codigo;
end;
$$;

create or replace function public.poner_codigo_amigo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.codigo := coalesce(new.codigo, public.generar_codigo_amigo(new.usuario, new.nombre));
    return new;
end;
$$;

drop trigger if exists al_crear_perfil_codigo on public.perfiles;
create trigger al_crear_perfil_codigo
    before insert on public.perfiles
    for each row execute function public.poner_codigo_amigo();

-- Players that existed without a code, and those whose code was their own
-- username or name (repaired however many times the file is run).
update public.perfiles set codigo = public.generar_codigo_amigo(usuario, nombre)
    where codigo is null
       or upper(regexp_replace(codigo, '[^a-z0-9]', '', 'gi'))
        = upper(regexp_replace(usuario, '[^a-z0-9]', '', 'gi'))
       or upper(regexp_replace(codigo, '[^a-z0-9]', '', 'gi'))
        = upper(regexp_replace(coalesce(nombre, ''), '[^a-z0-9]', '', 'gi'));

-- Returns the calling player's friend code, creating it if the profile was
-- created before the column existed. That way the game never has to make
-- up a code or reuse the username.
drop function if exists public.asegurar_codigo_amigo();
create function public.asegurar_codigo_amigo()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_usuario text;
    v_nombre  text;
    v_codigo  text;
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    select p.usuario, p.nombre, p.codigo into v_usuario, v_nombre, v_codigo
    from public.perfiles p where p.id = auth.uid();
    if v_codigo is null
       or v_codigo = upper(regexp_replace(coalesce(v_usuario, ''), '[^a-z0-9]', '', 'gi'))
       or v_codigo = upper(regexp_replace(coalesce(v_nombre, ''), '[^a-z0-9]', '', 'gi')) then
        v_codigo := public.generar_codigo_amigo(v_usuario, v_nombre);
        update public.perfiles set codigo = v_codigo where id = auth.uid();
    end if;
    return v_codigo;
end;
$$;


-- Whether a username is free (to warn before signing up).
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
-- Games and points
-- ---------------------------------------------------------------------

-- Saves a finished game: adds the points to the player's total and
-- updates their record for the mode. Rejects impossible scores.
-- Most a hit can be worth: (100 base + 100 streak + 50 speed) × 2 (Double or nothing / Climb) × 5 (slot machine multiplier) = 2500.
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
    if p_modo not in ('clasico', 'contrarreloj', 'supervivencia', 'bomba', 'doble-o-nada', 'relampago', 'muerte-subita', 'cincuenta', 'maraton', 'escalada') then
        raise exception 'modo-no-valido';
    end if;
    if p_total < 0 or p_total > 1000
       or p_aciertos < 0 or p_aciertos > p_total
       or p_puntos < 0 or p_puntos > p_aciertos * 2500
       or length(coalesce(p_tema, '')) > 40 then
        raise exception 'partida-no-valida';
    end if;
    -- Stops games from being sent in a loop.
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


-- Leaderboard of a mode ('total' = accumulated points).
--   p_ambito 'global': the best of everyone (plus your row if you're not among them).
--   p_ambito 'amigos': you and your friends (also those who haven't played yet).
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
    partidas        integer,
    aciertos        integer,
    preguntas       integer,
    soy_yo          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    with base as (
        select p.id, p.usuario, coalesce(p.nombre, p.usuario) as nombre, p.avatar_version,
               p.partidas, p.aciertos, p.preguntas,
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
           o.partidas, o.aciertos, o.preguntas,
           o.id = auth.uid()
    from ordenado o
    where o.pos <= least(greatest(p_limite, 1), 100) or o.id = auth.uid()
    order by o.puntos desc nulls last, o.usuario;
$$;


-- ---------------------------------------------------------------------
-- Friends (no groups: a friendship is between two players and is mutual)
-- ---------------------------------------------------------------------

-- Adds a friend by their friend code or their username.
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
    -- First as a code (spaces, dashes and # are ignored), then as a username.
    select * into v_amigo from public.perfiles
        where codigo = upper(regexp_replace(coalesce(p_usuario, ''), '[[:space:]#@-]', '', 'g'));
    if v_amigo.id is null then
        select * into v_amigo from public.perfiles
            where usuario = lower(regexp_replace(coalesce(p_usuario, ''), '[[:space:]@]', '', 'g'));
    end if;
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
        'puntos_totales', v_amigo.puntos_totales,
        'puntos_liga', v_amigo.puntos_liga
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
returns table (id uuid, usuario text, nombre text, avatar_version integer, puntos_totales bigint, puntos_liga integer)
language sql
stable
security definer
set search_path = ''
as $$
    select p.id, p.usuario, coalesce(p.nombre, p.usuario), p.avatar_version, p.puntos_totales, p.puntos_liga
    from public.amistades a
    join public.perfiles p on p.id = a.amigo_id
    where a.usuario_id = auth.uid()
    order by p.usuario;
$$;


-- ---------------------------------------------------------------------
-- Versus: challenges between friends and leagues
--
-- The challenger plays 10 questions first; their questions and points are
-- saved, and their friend plays exactly the same ones. Whoever scores more
-- wins. Each player has league points (they never expire, there are no
-- seasons): win +30, draw +10, loss -15 (never below 0). The league
-- (Bronze, Silver, Gold…) comes from those points alone.
-- ---------------------------------------------------------------------

-- Creates a challenge after playing it. Returns its id.
create or replace function public.crear_reto(
    p_rival     uuid,
    p_tema      text,
    p_preguntas jsonb,
    p_puntos    integer,
    p_aciertos  integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid    uuid := auth.uid();
    v_total  integer;
    v_id     bigint;
begin
    if v_uid is null then
        raise exception 'no-autenticado';
    end if;
    if p_rival = v_uid then
        raise exception 'eres-tu';
    end if;
    if not exists (select 1 from public.amistades where usuario_id = v_uid and amigo_id = p_rival) then
        raise exception 'no-es-amigo';
    end if;
    if jsonb_typeof(p_preguntas) is distinct from 'array' then
        raise exception 'reto-no-valido';
    end if;
    v_total := jsonb_array_length(p_preguntas);
    if v_total < 1 or v_total > 15 or octet_length(p_preguntas::text) > 40000 then
        raise exception 'reto-no-valido';
    end if;
    if p_aciertos < 0 or p_aciertos > v_total or p_puntos < 0 or p_puntos > p_aciertos * 2500 then
        raise exception 'partida-no-valida';
    end if;
    if (select count(*) from public.retos
        where retador = v_uid and rival = p_rival and estado = 'pendiente') >= 3 then
        raise exception 'demasiados-retos';
    end if;
    if exists (select 1 from public.retos where retador = v_uid and creado > now() - interval '5 seconds') then
        raise exception 'demasiado-rapido';
    end if;

    insert into public.retos (retador, rival, tema, preguntas, puntos_retador, aciertos_retador)
    values (v_uid, p_rival, left(coalesce(p_tema, ''), 40), p_preguntas, p_puntos, p_aciertos)
    returning id into v_id;
    return v_id;
end;
$$;

-- The player's challenges: pending ones and the latest finished ones. Until
-- you play a challenge you were sent, you can't see the challenger's points.
drop function if exists public.mis_retos();
create function public.mis_retos()
returns table (
    id            bigint,
    soy_retador   boolean,
    rival_id      uuid,
    rival_usuario text,
    rival_nombre  text,
    rival_avatar  integer,
    rival_liga    integer,
    tema          text,
    estado        text,
    total         integer,
    mis_puntos    integer,
    sus_puntos    integer,
    mis_aciertos  integer,
    sus_aciertos  integer,
    mi_cambio     integer,
    creado        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select r.id,
           r.retador = auth.uid(),
           p.id, p.usuario, coalesce(p.nombre, p.usuario), p.avatar_version, p.puntos_liga,
           r.tema, r.estado, jsonb_array_length(r.preguntas),
           case when r.retador = auth.uid() then r.puntos_retador else r.puntos_rival end,
           case when r.retador = auth.uid() then r.puntos_rival
                when r.estado = 'terminado' then r.puntos_retador end,
           case when r.retador = auth.uid() then r.aciertos_retador else r.aciertos_rival end,
           case when r.retador = auth.uid() then r.aciertos_rival
                when r.estado = 'terminado' then r.aciertos_retador end,
           case when r.retador = auth.uid() then r.cambio_retador else r.cambio_rival end,
           r.creado
    from public.retos r
    join public.perfiles p on p.id = case when r.retador = auth.uid() then r.rival else r.retador end
    where r.retador = auth.uid() or r.rival = auth.uid()
    order by (r.estado = 'pendiente' and r.rival = auth.uid()) desc,
             (r.estado = 'pendiente') desc,
             coalesce(r.terminado, r.creado) desc
    limit 40;
$$;

-- Questions of a challenge you were sent (only while it's pending).
create or replace function public.preguntas_reto(p_reto bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_preguntas jsonb;
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    select preguntas into v_preguntas from public.retos
        where id = p_reto and rival = auth.uid() and estado = 'pendiente';
    if v_preguntas is null then
        raise exception 'reto-no-existe';
    end if;
    return v_preguntas;
end;
$$;

-- Saves the rival's points, decides who wins and hands out league points.
create or replace function public.responder_reto(p_reto bigint, p_puntos integer, p_aciertos integer)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid        uuid := auth.uid();
    v_reto       public.retos;
    v_resultado  text;
    v_cambio     integer;
    v_cambio_ret integer;
    v_rival      public.perfiles;
    v_retador    public.perfiles;
    v_nuevo      integer;
    v_nuevo_ret  integer;
    v_real       integer;
    v_real_ret   integer;
begin
    if v_uid is null then
        raise exception 'no-autenticado';
    end if;
    select * into v_reto from public.retos where id = p_reto for update;
    if v_reto.id is null or v_reto.rival <> v_uid then
        raise exception 'reto-no-existe';
    end if;
    if v_reto.estado <> 'pendiente' then
        raise exception 'reto-terminado';
    end if;
    if p_aciertos < 0 or p_aciertos > jsonb_array_length(v_reto.preguntas)
       or p_puntos < 0 or p_puntos > p_aciertos * 2500 then
        raise exception 'partida-no-valida';
    end if;

    if p_puntos > v_reto.puntos_retador then
        v_resultado := 'victoria'; v_cambio := 30;  v_cambio_ret := -15;
    elsif p_puntos = v_reto.puntos_retador then
        v_resultado := 'empate';   v_cambio := 10;  v_cambio_ret := 10;
    else
        v_resultado := 'derrota';  v_cambio := -15; v_cambio_ret := 30;
    end if;

    select * into v_rival from public.perfiles where id = v_uid for update;
    select * into v_retador from public.perfiles where id = v_reto.retador for update;
    v_nuevo := greatest(0, v_rival.puntos_liga + v_cambio);
    v_nuevo_ret := greatest(0, v_retador.puntos_liga + v_cambio_ret);
    -- What really changes (never below 0).
    v_real := v_nuevo - v_rival.puntos_liga;
    v_real_ret := v_nuevo_ret - v_retador.puntos_liga;

    update public.perfiles
        set puntos_liga = v_nuevo,
            victorias   = victorias + (v_resultado = 'victoria')::int,
            empates     = empates   + (v_resultado = 'empate')::int,
            derrotas    = derrotas  + (v_resultado = 'derrota')::int
        where id = v_uid
        returning * into v_rival;
    update public.perfiles
        set puntos_liga = v_nuevo_ret,
            victorias   = victorias + (v_resultado = 'derrota')::int,
            empates     = empates   + (v_resultado = 'empate')::int,
            derrotas    = derrotas  + (v_resultado = 'victoria')::int
        where id = v_reto.retador;

    update public.retos
        set puntos_rival   = p_puntos,
            aciertos_rival = p_aciertos,
            estado         = 'terminado',
            cambio_rival   = v_real,
            cambio_retador = v_real_ret,
            terminado      = now()
        where id = p_reto;

    return json_build_object(
        'resultado',      v_resultado,
        'mis_puntos',     p_puntos,
        'sus_puntos',     v_reto.puntos_retador,
        'sus_aciertos',   v_reto.aciertos_retador,
        'cambio',         v_real,
        'puntos_liga',    v_rival.puntos_liga,
        'victorias',      v_rival.victorias,
        'empates',        v_rival.empates,
        'derrotas',       v_rival.derrotas
    );
end;
$$;

-- Declines a challenge you were sent, or withdraws one you sent.
create or replace function public.rechazar_reto(p_reto bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    update public.retos
        set estado = 'rechazado', terminado = now()
        where id = p_reto and estado = 'pendiente'
          and (rival = auth.uid() or retador = auth.uid());
end;
$$;

-- League leaderboard (league points), global or among friends.
drop function if exists public.ranking_liga(text, integer);
create function public.ranking_liga(p_ambito text default 'global', p_limite integer default 50)
returns table (
    posicion        bigint,
    id              uuid,
    usuario         text,
    nombre          text,
    avatar_version  integer,
    puntos          bigint,
    victorias       integer,
    empates         integer,
    derrotas        integer,
    soy_yo          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    with base as (
        select p.id, p.usuario, coalesce(p.nombre, p.usuario) as nombre, p.avatar_version,
               p.puntos_liga, p.victorias, p.empates, p.derrotas,
               p.victorias + p.empates + p.derrotas as jugados
        from public.perfiles p
        where p_ambito = 'global'
           or p.id = auth.uid()
           or p.id in (select a.amigo_id from public.amistades a where a.usuario_id = auth.uid())
    ),
    filtrado as (
        select * from base where p_ambito <> 'global' or jugados > 0
    ),
    ordenado as (
        select f.*, rank() over (order by f.puntos_liga desc, f.victorias desc) as pos
        from filtrado f
    )
    select case when o.jugados = 0 then null else o.pos end,
           o.id, o.usuario, o.nombre, o.avatar_version, o.puntos_liga::bigint,
           o.victorias, o.empates, o.derrotas,
           o.id = auth.uid()
    from ordenado o
    where o.pos <= least(greatest(p_limite, 1), 100) or o.id = auth.uid()
    order by o.jugados = 0, o.puntos_liga desc, o.victorias desc, o.usuario;
$$;


-- ---------------------------------------------------------------------
-- Display name and profile photo
-- ---------------------------------------------------------------------

-- Changes the name others see (empty = show the username again).
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

-- Called after uploading the photo to storage: bumps the version so
-- everyone sees the new one.
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


-- ---------------------------------------------------------------------
-- Deleting the account
-- ---------------------------------------------------------------------

-- Deletes the calling player's account: their auth user and, in cascade,
-- their profile, records, games and friendships. (The photo is deleted
-- beforehand by the game with the Storage API, the only allowed way to
-- delete files.)
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'no-autenticado';
    end if;
    delete from auth.users where id = auth.uid();
end;
$$;


-- Function permissions.
revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.confirmar_usuario() from public, anon, authenticated;
revoke execute on function public.generar_codigo_amigo(text, text) from public, anon, authenticated;
revoke execute on function public.poner_codigo_amigo() from public, anon, authenticated;
revoke execute on function public.cambiar_nombre(text) from public, anon;
revoke execute on function public.borrar_mi_cuenta() from public, anon;
revoke execute on function public.registrar_partida(text, text, integer, integer, integer) from public, anon;
revoke execute on function public.anadir_amigo(text) from public, anon;
revoke execute on function public.quitar_amigo(uuid) from public, anon;
revoke execute on function public.mis_amigos() from public, anon;
revoke execute on function public.avatar_actualizado() from public, anon;
revoke execute on function public.asegurar_codigo_amigo() from public, anon;
revoke execute on function public.crear_reto(uuid, text, jsonb, integer, integer) from public, anon;
revoke execute on function public.mis_retos() from public, anon;
revoke execute on function public.preguntas_reto(bigint) from public, anon;
revoke execute on function public.responder_reto(bigint, integer, integer) from public, anon;
revoke execute on function public.rechazar_reto(bigint) from public, anon;
revoke execute on function public.quitar_avatar() from public, anon;

grant execute on function public.usuario_disponible(text) to anon, authenticated;
grant execute on function public.ranking(text, text, integer) to anon, authenticated;
grant execute on function public.registrar_partida(text, text, integer, integer, integer) to authenticated;
grant execute on function public.anadir_amigo(text) to authenticated;
grant execute on function public.quitar_amigo(uuid) to authenticated;
grant execute on function public.mis_amigos() to authenticated;
grant execute on function public.asegurar_codigo_amigo() to authenticated;
grant execute on function public.avatar_actualizado() to authenticated;
grant execute on function public.quitar_avatar() to authenticated;
grant execute on function public.cambiar_nombre(text) to authenticated;
grant execute on function public.borrar_mi_cuenta() to authenticated;
grant execute on function public.ranking_liga(text, integer) to anon, authenticated;
grant execute on function public.crear_reto(uuid, text, jsonb, integer, integer) to authenticated;
grant execute on function public.mis_retos() to authenticated;
grant execute on function public.preguntas_reto(bigint) to authenticated;
grant execute on function public.responder_reto(bigint, integer, integer) to authenticated;
grant execute on function public.rechazar_reto(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- Storage: profile photos at "avatares/<user id>/avatar.webp"
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


-- ---------------------------------------------------------------------
-- Tells Supabase's API (PostgREST) to reload the schema, so the new
-- functions can be used right away.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
