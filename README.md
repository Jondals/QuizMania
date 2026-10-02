# QuizMania

Slot-machine trivia game: **pull the lever** and the three reels decide the **topic**, the **game mode** and a **×1 to ×5 multiplier** for that game. Create an account with just a **username and password** to earn points, upload a photo, add friends, **challenge them to a Versus** and climb the leagues.

The interface is available in **Spanish and English**.

## Features

- **Three-reel slot machine**: 1️⃣ topic, 2️⃣ game mode, 3️⃣ ×1-×5 multiplier (the higher, the rarer). Every symbol is a casino chip in its colour: topics and modes with their icon, multipliers with the figure, and the name printed on the reel underneath. The topic and mode reels have **▲ ▼ arrows** on the window to pick a symbol yourself, and a lit **HOLD** button underneath (with a padlock that snaps shut) so that reel stays still on the next spin, like the "hold" on a real machine. The multiplier is always left to luck. Lacquered cabinet with chrome mouldings, an animated neon **QUIZMANIA** sign (a wave runs through the letters, one flickers, a reflection sweeps across, they hop while spinning and jump on a prize) inside a ring of chasing bulbs, reels behind a chrome frame with glass and their own ring of lights in the mode colour (the winning chips glow on a prize), an LED screen and a coin tray that jumps on a prize. The **lever** is the way to play: drag it down, tap it or press Space. **It dances to the music**: while a song plays, the lights and glow follow the beat (really, by analysing the bass of uploaded songs; with YouTube or Spotify at a steady pulse, because their audio can't be read from the page).
- **10 game modes**, each with its own record and leaderboard:
  - 🎯 **Classic**: 10 questions, no clock, no rush.
  - ⏱️ **Time attack**: 60 s; every hit adds 3 s and every miss costs 5 s.
  - ❤️ **Survival**: endless questions, 3 lives and 20 s per question.
  - 💣 **Bomb**: one life; the fuse starts at 15 s and every hit burns 1 s off it (4 s minimum).
  - 🎰 **Double or nothing**: double points, endless. Cash out whenever you like: one miss and you lose it all.
  - ⚡ **Blitz**: 10 questions with only 6 s each.
  - ☠️ **Sudden death**: endless and without a clock, but the first miss ends the game.
  - 🌓 **50/50**: only two answers per question (the right one and a random wrong one), 8 s to pick.
  - 🏃 **Marathon**: 25 questions and 3 lives to reach the finish line.
  - 📈 **Climb**: 12 questions; every hit in a row is worth 25 % more than the last (up to ×2). A miss sends you back down.
- **⚔️ Versus**: challenge a friend from your profile. You play 10 mixed-topic questions (15 s each) and your friend plays **exactly the same ones**; whoever scores more wins. Pending challenges show a badge in the header.
- **Leagues**: each challenge gives league points (LP): **+30** for a win, **+10** for a draw and **−15** for a loss (never below 0). There are no seasons and nothing expires: your league depends only on your points — 🥉 Bronze (0) · 🥈 Silver (150) · 🥇 Gold (400) · 💠 Platinum (800) · 💎 Diamond (1300) · 👑 Legend (2000).
- **Points**: 100 per hit, +20 for every hit in a row (up to +100), up to +50 for speed in modes with a per-question clock, ×2 in Double or nothing, up to ×2 for a streak in Climb and, on top, the **slot machine multiplier** (×1 to ×5). Most a hit can be worth: 2,500 points (the database checks it too).
- **Accounts (Supabase)**: username and password only, no e-mail. With a session, every game adds its points to your total and updates your record for that mode.
- **Delete account** from Edit profile: the user, photo, points, records, friends and challenges are deleted forever.
- **Profile**: a username to log in (it can't be changed) and a **display name** you can change whenever you like; the leaderboard shows both.
- **Friend code**: 6 characters (no I, O, 0 or 1) that the database assigns when the account is created. It's unique, never equal to your username or name, and existing players get theirs when `schema.sql` is run (or when they log in). The game never makes up a code: if the database doesn't have them yet, it shows `······` with a notice to run the SQL, and meanwhile friends can add you by username.
- **Profile photo**: any image can be uploaded; the game crops it square and shrinks it to 256 px before uploading.
- **Leaderboard** with three tabs: 🏆 **Points** (accumulated), ⚔️ **Versus league** (league points) and 🎯 **Records** (the best result in each mode). **Global** (top 50, visible without an account) or **among friends**. Your position on top, then the podium and the list.
- **My profile** (from the account menu): your league and what's missing for the next one, your numbers, your **friends** (your code to copy or share, add by code or username, ⚔️ Challenge and remove) and your **challenges** (your turn, waiting for your rival and latest results, with a rematch button). Friendship is mutual. The link `…/?amigo=CODE` opens your profile and adds that friend.
- **Language toggle**: a single button in the header with the current flag; each press flips it (like a card) to the other language.
- **Footer**: logo, name and version on the left, an animated "Developed by Jondals" in the middle (pulsing code icon, letters that wave and cycle colours, sliding gradient underline) and the copyright on the right (stacked on phones).
- **Animated background**: neon lights, a synthwave floor, symbols floating up, question marks falling and twinkling stars.
- **Own sound effects** synthesised in the browser (no audio files): buttons, right, wrong, win, loss, spinning reels and the time warning.
- **Settings drop-down** (⚙️ in the header, closes on ✕, Escape or a click outside) with the **music player**: previous / pause / next, music and effects volume, and a playlist you reorder by dragging. You can **upload songs or mp4/webm videos** (only their audio plays; they are stored in IndexedDB, so they're still there when you come back, even if the original file is gone from your disk) or paste a **YouTube video or playlist** (audio only) or a **Spotify** link (its official widget; without a Spotify session only 30 s per song play).
- **Reduce animations** switch in Settings (on top of the system's reduced-motion preference).
- **Welcome screen** (~1.8 s) with the reels spinning and stopping one after another on 7-7-7 and a jackpot flash (skip it with any key or click).
- **Endless questions that don't repeat**, always from the APIs first: every topic has one or two online sources of its own ([The Trivia API](https://the-trivia-api.com) by category or tag, and/or [Open Trivia DB](https://opentdb.com) by category), so a normal game never touches the local JSON — that's only plan C when both fail or there's no connection. Every question on screen has a small label saying where it came from (API or "saved questions") and whether it was translated.
- **Really clean texts**: wherever a question comes from, it's normalised before being shown — NO SHOUTING CAPITALS, No Odd Title Case, always starting with a capital letter and ending in `?` (with its opening `¿` in Spanish) or `.`. Same with the answers.
- **Offline**: if both APIs fail, that batch of questions comes from the 700+ saved in `public/questions/`; as soon as the connection is back, the next batch tries the APIs again.

## Topics (30)

🎲 Random · 🧠 General knowledge · 🏛️ History · 🔬 Science · 🔧 Mechanics · 🌍 Geography · 💻 Programming · 🍕 Food · ⚽ Sports · 🎬 Film · 🎵 Music · 📺 TV shows · 🎮 Video games · 📚 Books · 🎨 Art · 🐾 Animals · ⚡ Mythology · ➗ Maths · 🍥 Anime & manga · 🦸 Comics · ♟️ Board games · 🎭 Theatre & musicals · ⭐ Celebrities · 📱 Gadgets & tech · 🐭 Cartoons · 🌐 Society & culture · 🪐 Astronomy · 🇪🇸 Spain · 🫀 Human body · 💡 Inventions

All 30 topics have online questions; each one's local file is only the offline backup.

**How to play**: pick the topic and/or mode you want with the ▲ ▼ arrows on each reel and press **HOLD** (or leave it to luck), then pull the lever by dragging it down, tapping it or with the space bar. On a keyboard, ↑ / ↓ move the topic reel and ← / → the mode reel.

## Setting up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste the whole content of [`supabase/schema.sql`](supabase/schema.sql) → **Run**. It creates the tables, the functions, the security (RLS) and the `avatares` bucket for the photos. It can be run again without losing data (do it every time the file changes): running it again also **repairs friend codes** that match a player's username or name.
3. **Authentication → Sign In / Providers → Email** → turn off **Confirm email** and save. Login uses an internal e-mail `<username>@quizmania.app` that never receives anything; the SQL already confirms accounts by itself, but with that option on Supabase tries to send an e-mail on every sign-up and its free server only allows a few per hour.
4. Copy the **URL** and the **publishable** key (Connect → Framework, or Project Settings → API Keys).

> **If you already had a database from a previous version of QuizMania**, run the whole `supabase/schema.sql` again. Version 2.1 adds the five new modes (`relampago`, `muerte-subita`, `cincuenta`, `maraton`, `escalada`) to the list `registrar_partida` accepts: **until you run it, games in those modes can't be saved online.** Older upgrades it also applies (without touching existing data): friend codes, league points and Versus challenges, and the 2,500-point cap per hit needed by the ×5 multiplier.

### Locally

Create `.env.local` in the root with the two lines exactly as Supabase gives them:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

(`SUPABASE_URL` and `SUPABASE_ANON_KEY` work too, in `.env` or `.env.local`.) Then `pnpm dev`. If the build doesn't print the warning "SUPABASE_URL or SUPABASE_ANON_KEY is missing", it's connected.

### On Vercel

**Settings → Environment Variables** → add the same two variables (for Production, Preview and Development) and redeploy: the keys are baked into the game at build time, so they don't apply without a redeploy.

Without these variables the game builds and works the same, but without accounts, friends or leaderboards (records are kept in the browser).

### What's in the database

| Table | Content |
|---|---|
| `perfiles` | Username (to log in), display name, photo version, total points, games, hits, answered questions, friend code and, for Versus, league points, wins, draws and losses |
| `records` | Best score of each player in each mode |
| `partidas` | Game history |
| `amistades` | Friends (one row each way) |
| `retos` | Versus challenges: questions, each player's points, status and league points won or lost |

Everything can be read (for the leaderboards) except challenges, but nothing is written straight from the browser: games, friends, challenges and photos go through functions (`registrar_partida`, `anadir_amigo`, `crear_reto`, `responder_reto`, `avatar_actualizado`…) that validate the data. Challenges are only read through functions, so nobody sees the questions of a challenge that isn't theirs, nor the challenger's points before playing. `registrar_partida` rejects impossible scores (more than 2,500 points per hit, the most with the ×5 multiplier) and more than one game every 3 seconds. Even so, scores are computed by the browser, so someone with know-how could send a fake but believable one.

The database's tables, columns and functions stay in Spanish on purpose: it's the schema you already have deployed on Supabase, and renaming it now would break existing data. Everything else — the game code (`src/`), the scripts, the tests and the SQL comments — is in English, and every file starts with a comment saying what it does.

## Development

Requires Node.js 18 or later and [pnpm](https://pnpm.io) (`npm install -g pnpm` or `corepack enable`).

```bash
pnpm install
pnpm dev         # builds and starts a server at http://localhost:8080
pnpm build       # type-checks and generates dist/ (what gets published)
pnpm test        # unit tests
pnpm check       # EVERYTHING: types + tests + database + build + browser (see below)
```

### `pnpm check`: one full check

`scripts/check.mjs` is a single command (also launched by double-clicking **check.bat** on Windows or `./check.sh` on Mac/Linux) that goes over the whole project before a release:

1. Type-checks the whole project (`tsc --noEmit`).
2. Runs the unit tests.
3. Runs the whole `supabase/schema.sql` against an in-memory Postgres ([PGlite](https://pglite.dev)) with Supabase's `auth`/`storage` schemas stubbed out, and tests end to end accounts, friend codes, all 10 modes, friends and **the whole Versus**: challenging, the rival not seeing your score until they play, answering, league points (including that they never go below 0), declining a challenge and both leaderboards. **This never touches the real Supabase**: it's a brand-new in-memory database just for this check, so it never creates real accounts.
4. Builds for production and checks the compressed HTML stays small.
5. Serves `dist/` locally and drives it with Playwright: pulls the lever, answers a question, opens the Settings drop-down, checks the footer… with **Supabase fully mocked** (every API request is intercepted), so no real account is created here either. If no Playwright Chromium is installed, this step is skipped with a warning instead of failing.

### Lighthouse

The production build scores **100 / 100 / 100 / 100** (Performance, Accessibility, Best Practices, SEO) on both the mobile and desktop presets. What keeps it there:

- The CSS for the first screen is inlined in the HTML; the rest (`deferred.css`) loads without blocking the first paint.
- The Supabase library (~230 KB) is split into its own chunk and only downloaded when something needs the server (a saved session, the leaderboard, logging in). A guest never downloads it.
- The first screen doesn't animate in (the welcome screen covers it), and the account menu is anchored in the critical CSS so it can't widen the page for a moment on phones (that used to cause a layout shift).
- Hashed assets are cached forever (`vercel.json`).

Measure against a server that compresses ahead of time, like Vercel does: a local server that Brotli-compresses on every request inflates the simulated timings.

## Structure

```
public/                 Static files (HTML, CSS, icons, backup questions)
  questions/*.json      Local questions: ["Question?", "Right", "Wrong", "Wrong", "Wrong"]
supabase/schema.sql     Database: tables, security, functions and storage
src/
  main.ts               Start-up and flow between screens
  env.d.ts              Constants injected by scripts/build.mjs (Supabase keys, version)
  config/               Topics (30), modes (10 + Versus), slot multiplier, leagues and account rules
  account/              Supabase client (loaded on demand), session (log in, sign up, photo, points) and its UI
  online/ranking.ts     Leaderboard screen (points, league and records)
  online/profile.ts     My profile: league, numbers, friends and challenges
  online/versus.ts      Versus challenges (challenge, play the same questions, result)
  game/                 State, game (time, lives, points, multiplier, 50/50, climb), scoring and screens
  slot/                 Three-reel slot machine (topic, mode, multiplier) and the lever
  questions/            Continuous question supply, both APIs, local backup, translation, text normalisation and Versus fixed questions
  audio/                Synthesised effects, music player (with IndexedDB) and the beat-synced dancing
  settings/             Language toggle, volumes and reduced motion
  i18n/texts.ts         Texts in Spanish and English
  utils/                Randomness, storage, network, DOM, clipboard and right-click blocking
pnpm-lock.yaml          Exact dependency versions (pnpm)
scripts/build.mjs       esbuild build (hashed JS with a lazy Supabase chunk, inlined CSS, Supabase keys, version)
scripts/check.mjs       The full check behind `pnpm check`
scripts/run-tests.mjs   Bundles and runs the unit tests
check.bat / check.sh    Double-click shortcut for `pnpm check`
tests/                  Unit tests
vercel.json             Vercel deployment settings
```

## Deploying to Vercel

`vercel.json` already sets it up: Vercel runs `pnpm install --frozen-lockfile` and `pnpm run build` and publishes `dist/`. The framework preset must be "Other". Remember to add the two Supabase variables.

## Changelog

### 2.1.0

- 10 game modes instead of 5: new ⚡ Blitz, ☠️ Sudden death, 🌓 50/50, 🏃 Marathon and 📈 Climb (run `supabase/schema.sql` again).
- Animated **QUIZMANIA** neon sign on the slot machine (the old "7" in the middle is gone).
- New reel symbols: casino chips with the icon and the name instead of cards.
- New hold controls: ▲ ▼ arrows on the reel window and lit HOLD buttons with a padlock.
- Single language toggle button instead of two buttons.
- New three-part footer with the version and "Developed by Jondals".
- Lighthouse 100 on mobile and desktop (Supabase loaded on demand, no layout shift on phones).
- No SPIN button and no "Pull the lever!" text: the lever is the way to play. No red win line.
- Multipliers are chips like the other reels; the base bar is gone.
- Settings is a drop-down under the gear instead of a modal dialog.
- Animated "Developed by Jondals" in the footer.
- Songs can also be uploaded as mp4/webm/mov videos (only the audio plays).
- The background particles come back straight away after turning "Reduce animations" off.
- README, scripts and SQL comments in English; `public/preguntas/` renamed to `public/questions/` and `scripts/pruebas.mjs` to `scripts/run-tests.mjs`.
