# QuizMania

Juego de trivia con tragaperras: **elige un modo, tira de la palanca**, los rodillos se paran en un tema y respondes preguntas de ese tema. Crea una cuenta con **usuario y contraseña** para sumar puntos, subir tu foto, añadir amigos y competir en el ranking.

## Características

- **10 modos de juego**, cada uno con su récord y su ranking:
  - 🎯 **Clásico**: 10 preguntas sin prisa.
  - ⚡ **Relámpago**: 10 preguntas, 10 s cada una. Cuanto antes respondas, más puntos.
  - ⏱️ **Contrarreloj**: 60 s en total; cada fallo resta 3 s.
  - ❤️ **Supervivencia**: preguntas infinitas hasta perder 3 vidas.
  - 💀 **Muerte súbita**: 1 vida y 15 s por pregunta.
  - 🧠 **Experto**: 10 preguntas difíciles, puntos ×2.
  - 🌀 **Ruleta**: 15 preguntas de temas mezclados.
  - 🏃 **Maratón**: 30 preguntas, 20 s cada una y 5 vidas.
  - 🔥 **Racha**: sin tiempo, pero el primer fallo termina.
  - 🎰 **Todo o nada**: 10 preguntas con puntos ×2, pero un fallo y pierdes todos los puntos.
- **Puntos**: 100 por acierto, +20 por cada acierto seguido (hasta +100), hasta +50 por rapidez en los modos con tiempo por pregunta, y ×2 en Experto.
- **Cuentas (Supabase)**: solo usuario y contraseña, sin correo. Con sesión, cada partida suma sus puntos a tu total y actualiza tu récord del modo.
- **Borrar cuenta** desde el perfil: se borran para siempre el usuario, la foto, los puntos, los récords y los amigos.
- **Perfil**: usuario para entrar (no se cambia) y **nombre visible** que se puede cambiar cuando quieras; en el ranking salen los dos.
- **Foto de perfil**: se sube cualquier imagen; el juego la recorta en cuadrado y la reduce a 256 px antes de subirla.
- **Ranking**: puntos totales o récord de cada modo, **global** (los 50 mejores, visible sin cuenta) o **entre amigos**.
- **Amigos**: se añaden por nombre de usuario y la amistad es mutua. El enlace `…/?amigo=usuario` añade a ese amigo al abrirlo.
- **Sonidos propios** sintetizados en el navegador (sin archivos de audio): botones, acierto, fallo, victoria, derrota, giro de los rodillos y aviso de tiempo.
- **Reproductor de música** (Ajustes o el botón ♪ de la cabecera): anterior / pausa / siguiente, volumen de música y de sonidos, y una playlist que se reordena arrastrando. Se pueden **subir canciones** (se guardan en el navegador), pegar un **vídeo o una lista de YouTube** (solo se oye el audio; el reproductor oficial va oculto) o un enlace de **Spotify** (su widget oficial; sin sesión en Spotify solo suenan 30 s por canción).
- **Pantalla de bienvenida** con los rodillos parándose en 7-7-7 (se salta con cualquier tecla o clic).
- **Preguntas online que no se repiten** ([Open Trivia DB](https://opentdb.com) y [The Trivia API](https://the-trivia-api.com)), traducidas automáticamente al español o al inglés.
- **Sin conexión**: si las APIs fallan se usan las más de 700 preguntas guardadas en `public/preguntas/`.

## Temas (30)

🎲 Al azar · 🧠 Cultura general · 🏛️ Historia · 🔬 Ciencia · 🔧 Mecánica · 🌍 Geografía · 💻 Programación · 🍕 Comida · ⚽ Deportes · 🎬 Cine · 🎵 Música · 📺 Series y TV · 🎮 Videojuegos · 📚 Literatura · 🎨 Arte · 🐾 Animales · ⚡ Mitología · ➗ Matemáticas · 🍥 Anime y manga · 🦸 Cómics · ♟️ Juegos de mesa · 🎭 Teatro y musicales · ⭐ Famosos · 📱 Tecnología · 🐭 Dibujos animados · 🌐 Sociedad y cultura · 🪐 Astronomía · 🇪🇸 España · 🫀 Cuerpo humano · 💡 Inventos

(Astronomía, España, Cuerpo humano e Inventos solo tienen preguntas locales.)

**Cómo se juega**: elige el modo en la pantalla de la máquina (flechas ◀ ▶, las teclas de debajo o ← → del teclado) y tira de la palanca arrastrándola hacia abajo, pulsándola o con la barra espaciadora.

## Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega el contenido entero de [`supabase/schema.sql`](supabase/schema.sql) → **Run**. Crea las tablas, las funciones, la seguridad (RLS) y el bucket `avatares` para las fotos. Se puede volver a ejecutar sin perder datos (hazlo cada vez que cambie el archivo).
3. **Authentication → Sign In / Providers → Email** → desactiva **Confirm email** y guarda. El login usa un correo interno `<usuario>@quizmania.app` que nunca recibe nada; el SQL ya confirma las cuentas solo, pero con la opción activada Supabase intenta enviar un correo en cada registro y su servidor gratuito solo permite unos pocos por hora.
4. Copia la **URL** y la clave **publishable** (Connect → Framework, o Project Settings → API Keys).

### En local

Crea `.env.local` en la raíz con las dos líneas tal como las da Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

(También valen `SUPABASE_URL` y `SUPABASE_ANON_KEY`, en `.env` o `.env.local`.) Después, `npm run dev`. Si al compilar no sale el aviso «faltan SUPABASE_URL…», está conectado.

### En Vercel

**Settings → Environment Variables** → añade las mismas dos variables (para Production, Preview y Development) y vuelve a desplegar: las claves se meten en el juego al compilar, así que sin redesplegar no se aplican.

Sin estas variables el juego compila y funciona igual, pero sin cuentas, amigos ni ranking (los récords se guardan en el navegador).

### Qué hay en la base de datos

| Tabla | Contenido |
|---|---|
| `perfiles` | Usuario (para entrar), nombre visible, versión de la foto, puntos totales, partidas, aciertos y preguntas respondidas |
| `records` | Mejor puntuación de cada jugador en cada modo |
| `partidas` | Historial de partidas |
| `amistades` | Amigos (una fila en cada sentido) |

Todo se puede leer (para el ranking), pero nada se escribe directamente desde el navegador: las partidas, amigos y fotos pasan por funciones (`registrar_partida`, `anadir_amigo`, `quitar_amigo`, `avatar_actualizado`…) que validan los datos. `registrar_partida` rechaza puntuaciones imposibles (más de 500 puntos por acierto) y más de una partida cada 3 segundos. Aun así, las puntuaciones las calcula el navegador, así que alguien con conocimientos podría enviar una falsa pero creíble.

## Desarrollo

Requiere Node.js 18 o superior.

```bash
npm install
npm run dev      # compila y abre un servidor en http://localhost:8080
npm run build    # comprueba tipos y genera dist/ (lo que se publica)
npm test         # tests
```

## Estructura

```
public/                Archivos estáticos (HTML, CSS, iconos, preguntas de respaldo)
  preguntas/*.json     Preguntas locales: ["¿Enunciado?", "Correcta", "Incorrecta", "Incorrecta", "Incorrecta"]
supabase/schema.sql    Base de datos: tablas, seguridad, funciones y storage
src/
  main.ts              Arranque y flujo entre pantallas
  config/              Temas (30), modos (10) y reglas de las cuentas
  cuenta/              Cliente de Supabase, sesión (entrar, registro, foto, puntos) y su interfaz
  online/social.ts     Pantalla de ranking y amigos
  juego/               Estado, partida (tiempo, vidas, puntos), puntuación, selector de modo y pantallas
  tragaperras/         Rodillos y palanca
  preguntas/           Suministro continuo de preguntas, APIs, respaldo local y traducción
  perfil/records.ts    Récords (del servidor con sesión; del navegador como invitado)
  audio/efectos.ts     Sonidos sintetizados
  ajustes/             Idioma y volumen
  i18n/textos.ts       Textos en español e inglés
  utilidades/          Azar, almacenamiento, red, DOM, portapapeles y bloqueo del clic derecho
scripts/build.mjs      Compilación con esbuild (JS con hash, CSS incrustado, claves de Supabase)
tests/                 Tests
vercel.json            Configuración de despliegue en Vercel
```

## Despliegue en Vercel

`vercel.json` ya lo configura: Vercel ejecuta `npm ci` y `npm run build` y publica `dist/`. El preset de framework debe ser «Other». Recuerda añadir las dos variables de Supabase.
