# Jeopardy 2.0 — Agent Guide

> Path: `C:\Users\alexe\Jeopardy 2.0\jeopardy2.0`  
> Stack: TanStack Start · React 19 · Drizzle ORM · better-sqlite3 · Better Auth · Tailwind CSS v4 · Vite 8 · Nitro WebSockets

---

## Agent Rules

1. **Read this file fully** before starting work — it contains the only source of truth for conventions and traps.
2. **Language:** German when talking to the user.
3. **Server-only imports:** `#/db/index` and `#/lib/auth` must **only** be imported **dynamically** inside handler functions (`createServerFn` / `server.handlers`). Never at the top level of a route file.
4. **DB schema changes:** Add the column to `src/db/schema.ts` **and** to `scripts/add-columns.mjs`, then run `node scripts/add-columns.mjs`. Do **not** rely on `drizzle-kit push` for SQLite NOT-NULL additions.
5. **Game-view layout:** `play.tsx`, `master.tsx`, and `board.tsx` use `h-[100dvh] overflow-hidden` with `shrink-0` header/footer and `flex-1 overflow-y-auto` main. Do not change this without a strong reason.
6. **Global header:** Hidden on game routes via `isGameRoute()` in `__root.tsx`.
7. **Update this doc** after every relevant change (new feature, component, DB change, behaviour-changing bug fix). Trivial style tweaks or internal refactors do not require an update.
8. **Don't touch unless asked:** WebSocket server handlers (Nitro route) and `better-auth` config in `src/lib/auth.ts`.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `node scripts/add-columns.mjs` | Idempotent migration helper for SQLite ALTERs |
| `npm run typecheck` | TypeScript check |

---

## Critical: Vite + better-sqlite3

`better-sqlite3` must never end up in the client bundle.

```ts
// ✅ Correct — inside createServerFn or server.handlers
const { db } = await import('#/db/index')
const { auth } = await import('#/lib/auth')

// ❌ Wrong — top-level import in route files
import { db } from '#/db/index'
```

`src/routes/api/auth/$.ts` uses `server.handlers` (not `createServerFn`) — dynamic imports are especially important there.

---

## Environment (`.env.local`)

```
DATABASE_URL="dev.db"
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<32-byte-hex>
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

---

## DB Schema Changes

`drizzle-kit push` fails on SQLite table recreates when FK constraints exist.

**Workflow:**
1. Add column to `src/db/schema.ts` (with `.notNull().default(...)`)
2. Add idempotent ALTER entry to `scripts/add-columns.mjs`
3. Run `node scripts/add-columns.mjs`
4. Restart the dev server

Currently tracked columns / tables (see `scripts/add-columns.mjs` for full list):
- `question.autoplay_media`, `show_media_on_player`, `media_placeholder`
- `game_player.color`
- `question_media.role`
- `game_session.winner_player_id`, `started_at`, `total_questions`, `answered_count`
- `question_attempt.attempt_order`, `no_penalty_applied`, `was_rapid_fire`, `revealed_media_index_at_buzz`, `reaction_ms`
- `buzz_log.revealed_at`, `reaction_ms`
- `answered_question.resolution`, `solved_at`, `first_solver_player_id`
- Tables: `game_event`, `question_reveal`

---

## Auth

- **Better Auth** with username plugin (`src/lib/auth.ts`)
- Login: `/auth/login`
- Registration **only via invite link**: `/auth/register?token=XXX`
- Auth API route: `src/routes/api/auth/$.ts` (uses `server.handlers` + dynamic imports)

---

## Invite System

Flow: Header invite modal → `quickInvite` server fn → nanoid token (8 chars, 7 days) in `invite` table → Nodemailer email → user clicks link → `validateInvite` → registration form → `completeRegistration` marks invite used.

Key files:
- `src/routes/__root.tsx` — `quickInvite` + `InviteModal`
- `src/routes/admin/invites.tsx` — Admin overview
- `src/routes/auth/register.tsx` — Token validation + registration
- `src/lib/email.ts` — `sendInviteEmail(email, link)`

---

## Media Editor

After every image/video upload in the quiz editor, `MediaEditorModal` opens automatically. Users can keep the original or save edits. Existing media can be re-edited via the pencil icon in the question modal.

### Images (browser-side, Canvas)
- Crop via `react-easy-crop` (free / 1:1 / 4:3 / 16:9, zoom)
- Draw: 7-colour palette + stroke width 1–40 px, undo / clear, apply flattens strokes
- Pixelate: drag rectangle, block size 4–48 px (`pixelateRegion()` in `src/lib/canvas-utils.ts`)
- Save: upload final canvas as PNG to `/api/upload`

### Videos (server-side, FFmpeg)
- Endpoint: `server/routes/api/media/process.ts`
- Uses `fluent-ffmpeg` + `ffmpeg-static`
- Operations: trim, resize (`scale=-2:HEIGHT`), extract audio → `.mp3`
- Upload limit: **200 MB** (`server/routes/api/upload.ts`)

### Audio (server-side, FFmpeg)
- Same endpoint as video. Auto-detects audio input or `extractAudio: true` / `audioFx`
- `audioFx`: `{ reverse?: boolean, pitchSemitones?: number, speed?: number }`
- Filter order: pitch (`asetrate` + `atempo`) → speed (`atempo`) → `areverse`
- Output always `.mp3` (libmp3lame, 192k)

### Helpers
- `src/lib/canvas-utils.ts` — `loadImage`, `pixelateRegion`, `getCroppedBlob`, `canvasToBlob`, `uploadBlob`
- `src/lib/media-types.ts` — `MediaType`, `isImage/isVideo/isAudio/isEditable`, `mediaTypeFromMime`

---

## Quiz Management

- `src/routes/quizzes/index.tsx` — List own quizzes
- `src/routes/quizzes/new.tsx` — Create quiz (title, categories, rows, point values, penalty factor)
- `src/routes/quizzes/$quizId/edit.tsx` — Board editor

### Editor Features
- **Responsive:** Classic board grid on `md+`; `EditorMobileBoard` on mobile (drill-down categories → questions list)
- Inline category rename (onBlur saves)
- **Question modal with tabs:**
  - **Content** — question text, answer text, question media (cyan), answer media (violet)
  - **Options** — toggles (`allowRebuzz`, `autoplayMedia`, `rapidFire`, `showMediaOnPlayer`, `mediaPlaceholder`)
  - Options tab shows a badge with the count of non-default toggles.
  - Tab state resets to **Content** on every open.
- **Multiple media per question** via `questionMedia` table (`type: image | audio | video | youtube`, `role: question | answer`)
- Upload via `/api/upload` → `public/uploads/`
- **Test button** on filled tiles opens `TestQuestionModal` (fullscreen mock of TV / Master / Player with local state, no WebSocket)

### DB Schema (Questions)
```ts
question: { id, categoryId, quizId, rowIndex, questionText, answerText,
  mediaUrl, mediaType, youtubeUrl,  // Legacy single-media fields
  allowRebuzz, autoplayMedia, rapidFire,
  showMediaOnPlayer, mediaPlaceholder }

questionMedia: { id, questionId, url, type, role, sortOrder }
```

---

## Session / Game System

### Creating & Joining
- `src/routes/sessions/new.tsx` — Select quiz → create session (6-digit `joinCode`)
- `src/routes/join.tsx` — Enter code manually (public, no login required)
- `src/routes/sessions/$sessionId/join.tsx` — QR-code link handler, creates `gamePlayer`
- `src/routes/sessions/$sessionId/index.tsx` — Lobby with QR code, live player list (WebSocket), TV link

### Real-time (WebSocket)
- Hook: `src/hooks/useGameSocket.ts`
- Connects to `ws://host/api/ws/$sessionId`
- Sends `JOIN` with `playerId`
- Receives `STATE_UPDATE` → `GameState`
- Lobby shows players live without refresh (`playerId: null`)

### Leaving a Session
- `leaveSession` server fn in `__root.tsx`
- Player: deletes own `gamePlayer` row
- Master: sets session `status: 'finished'`
- Header shows "✕" next to the active-game pill.

---

## Game State Machine (`src/lib/game-state.ts`)

### Phases
```
LOBBY → SELECTING → QUESTION_OPEN → JUDGING → ANSWER_REVEALED → SELECTING → ...
                                                                ↘ GAME_OVER
```

### Events (WebSocket)
| Event | Actor | Effect |
|---|---|---|
| `START_GAME` | Master | LOBBY → SELECTING, random start player |
| `SELECT_QUESTION` | Master / Player | SELECTING → QUESTION_OPEN |
| `BUZZ` | Player | QUESTION_OPEN → JUDGING |
| `JUDGE` | Master | JUDGING → ANSWER_REVEALED or QUESTION_OPEN |
| `NEXT_ROUND` | Master | ANSWER_REVEALED → SELECTING |
| `TOGGLE_NO_PENALTY` | Master | Toggle no-penalty round |
| `SKIP_QUESTION` | Master | Mark question answered (skipped) |
| `VOTE_SKIP` | Player | Vote to skip (all must agree) |
| `END_RAPID_FIRE` | Master | End rapid-fire, keep all solvers tracked |
| `REVEAL_NEXT_MEDIA` | Master | `revealedMediaIndex + 1` |

### Key Interfaces
```ts
interface GameState {
  sessionId, phase, masterId,
  players: PlayerState[],
  activePlayerId,
  activeQuestion: ActiveQuestion | null,
  buzzedPlayerId,
  buzzedPlayerIds,
  answeredQuestionIds,
  board: BoardCategory[],
  winnerId,
  pointValues, wrongAnswerPenalty,
  noNegativePoints,
  skipVotes,
  rapidFireSolvedIds,
  revealedMediaIndex: number,
}

interface PlayerState {
  id, displayName, score, isConnected, userId,
  color: string
}

interface BoardQuestion {
  id, pointValue, answered,
  solverColors: string[],
  empty?: boolean
}
```

---

## Player Colours

10-colour palette (`src/lib/playerColors.ts`):
`#EF4444`, `#F97316`, `#EAB308`, `#22C55E`, `#3B82F6`, `#EC4899`, `#84CC16`, `#14B8A6`, `#A855F7`, `#F43F5E`

- First free colour in the session; deterministic hash on `userId` if > 10 players.
- DB: `game_player.color` (TEXT NOT NULL DEFAULT `'#7C3AED'`)
- Assign at all three `gamePlayer.insert` locations: `routes/join.tsx`, `routes/sessions/new.tsx`, `routes/sessions/$sessionId/join.tsx`

### Solver Tracking
- Correct solvers derived from `questionAttempt` (`isCorrect = true`, sorted by `resolvedAt`)
- `loadGameState` builds `BoardQuestion.solverColors`
- `applyEvent` (JUDGE) pushes colour live to `solverColors` (works in rapid-fire too)

---

## Game Views

> **Layout convention:** Game views use `h-[100dvh] overflow-hidden` with `shrink-0` header/footer and `flex-1 overflow-y-auto` main.

### TV Board (`src/routes/sessions/$sessionId/board.tsx`)
- Fullscreen for large screen.
- `BoardGrid` always renders the full `rowCount × categoriesCount` grid; empty cells are inactive placeholders.
- `QuestionStage` overlay during QUESTION_OPEN / JUDGING / ANSWER_REVEALED.
- **Media carousel:** Auto-advances when `revealedMediaIndex` increases (master releases next medium). Manual navigation disables autoplay for that carousel instance.
- **Fullscreen (`MediaCarousel`):**
  - YouTube → `iframeEl.requestFullscreen()` (native YT fullscreen, `enablejsapi=1`). `YoutubeEmbed` exports `YoutubeEmbedHandle`.
  - MP4 → `videoEl.requestFullscreen()`
  - Image → `ImageZoomPopup` (wheel zoom, pointer drag pan, auto-zoom for small images, Esc closes)
  - Audio → no fullscreen
  - YT iframe and `<video>` render with native controls.
  - Esc handler splits keydown/keyup to avoid conflict with OS fullscreen exit.
  - **Caveat:** Esc only works when the page has keyboard focus (click somewhere after F5 or exiting fullscreen).
  - `allowFullscreen` prop (default `true`).
- **Placeholder mode (`mediaPlaceholder`):** TV shows placeholder block first; master releases media piece by piece.
- Scoreboard in header row.
- Game-over screen with ranking.

### Board Tile States (`src/components/game/BoardGrid.tsx`)
- **Available:** Cyan point value, subtle `.tile-available` shine (9 s loop)
- **Skipped (nobody solved):** Dark tile, strikethrough point value in `bg-600`
- **Solved (1 player):** Tile in player colour (radial-gradient), dark vignette, white point value
- **Rapid-fire (N players):** Concentric rings (`solverColors[0]` outer → `solverColors[N-1]` inner)
- **Empty placeholder:** Barely visible, no point value

### Master View (`src/routes/sessions/$sessionId/master.tsx`)
- Mobile-optimised (`max-w-md`)
- **Home button** (house icon) → navigates home
- **TV button** → opens `/sessions/$sessionId/board` in new tab
- `JudgeBar` (bottom, context-sensitive):
  - **LOBBY:** "Start game"
  - **QUESTION_OPEN / JUDGING** (if `showMediaOnPlayer` or `mediaPlaceholder` active): "Release next medium" with counter "X / Y released"
  - **QUESTION_OPEN:** No-penalty toggle + skip button
  - **QUESTION_OPEN + rapidFire:** Amber badge "Multiple answers possible" + skip
  - **JUDGING:** Correct (+points) / Wrong (−points)
  - **JUDGING + rapidFire:** "Correct · Back to question" / "Correct · End question" / "Wrong — keep buzzing"
  - **ANSWER_REVEALED:** "Continue →"
- **Override sheet** (two tabs):
  - **Frage** – manual question picker (`QuestionPicker`)
  - **Punkte** – master can adjust any player's score. Quick buttons +100 / −100, or enter a custom amount and tap + / −. Closes sheet on apply.
- Live scoreboard + phase badge + connection status
- Answer always visible (`MasterAnswerCard`)
- **No autoplay** for video/audio on master (ignores `autoplayMedia` flag)

### Player View (`src/routes/sessions/$sessionId/play.tsx`)
- **Home button** (house icon) → navigates home
- `BuzzerButton` — large buzzer
- Shows own score, current phase, question text
- Buzzer disabled if already buzzed or not eligible
- Skip-vote button in QUESTION_OPEN
- If `showMediaOnPlayer` active: media appears above buzzer when master releases (`revealedMediaIndex ≥ 0`)

---

## Rapid-Fire Mode

Activated per question via `rapidFire: true`.

1. Question opens normally.
2. Players buzz as usual.
3. Master in JUDGING sees two green buttons:
   - **"Correct · Back to question"** → points awarded, phase → QUESTION_OPEN, player can buzz again (next player's turn)
   - **"Correct · End question"** → points awarded, phase → ANSWER_REVEALED
4. **"Wrong — keep buzzing"** → no penalty, back to QUESTION_OPEN
5. `rapidFireSolvedIds` tracks who already got points.
6. On TV board, all correct solvers appear as concentric rings.

---

## Header & Navigation

- `src/routes/__root.tsx` — Root layout with navbar
- Logged-in links: My Quizzes · Start Game · Invite · Admin (admins only) · Username · Log out
- **"Active game"** green pill with pulse — appears when user is in an active session
  - Click → navigates to game view (Master → `/master`, Player → `/play`)
  - **✕ button** → leaves session immediately
- Mobile: hamburger menu
- Header hidden on game routes (`isGameRoute()` matches `/master`, `/play`, `/board`)

---

## Admin

- `src/routes/admin/invites.tsx` — All invites (email, status, expiry)
- `src/routes/admin/debug.tsx` — Client-side debug sandbox (no WebSocket / DB). Tab "Special Events" with mock players, triggers, and surface preview. Loader guard redirects non-admin to `/`.
- Only accessible when `user.isAdmin === true`
- Navbar shows "Debug" next to "Admin" for admins.

---

## Settings (`src/routes/settings.tsx`)

- Change display name
- Choose buzzer sound (pre-installed: Standard, Bell, Siren + custom WAV/MP3 upload)
- Sounds live in `public/sounds/`

---

## Component Library

### `src/components/ui/`
- `Button` — variants: primary/accent/success/danger/subtle/ghost; sizes: sm/md/lg/xl
- `Card`, `Modal` (sm/md/lg/xl), `Sheet` (bottom sheet)
- `Input`, `Textarea`, `FormField`
- `Pill` — tones: good/bad/amber/violet/neutral
- `MediaFrame` — renders image/audio/video/YouTube
- `MediaCarousel` — carousel for multiple `MediaItem`s
- `YoutubeEmbed` — wraps YouTube iframe.
  - Before click: thumbnail + custom violet play button.
  - After click / `autoplay=true`: iframe with `autoplay=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`.
  - **Crop by default** (spoiler protection for question media): iframe `top: -15%; height: 115%`. Title overlay sits in the hidden top area. Bottom controls remain visible. Visible video fills ~92.5% of container height.
  - `cropChrome={false}` disables crop — use for **answer media** where spoilers no longer matter.
  - Always use this component instead of raw `<iframe>`.
- `PageContainer`, `PageHeader`
- `Wordmark`

### `src/components/editor/`
- `MediaEditorModal` — dispatches to Image / Video / Audio editor
- `ImageEditor` — tabs: Crop (`react-easy-crop`) · Draw · Pixelate
- `PaintCanvas` — pointer-based freehand drawing
- `PixelateCanvas` — drag-rectangle pixelation
- `VideoEditor` — trim, resolution, extract audio
- `AudioEditor` — trim, pitch, speed, reverse

### `src/components/game/`
- `BoardGrid` — Jeopardy board grid
- `QuestionStage` — question overlay on TV
- `Scoreboard` — modes: `row` (header) / `list` (game over)
- `BuzzerButton` — animated buzzer
- `JudgeBar` — master control bar
- `MasterAnswerCard` — question + answer for master
- `PhaseBadge` — coloured phase label
- `QuestionPicker` — mini board for manual selection
- `ConnectionGuard` — loading screen until WebSocket connects

---

## Design System (Tailwind v4 + `@theme`)

Tokens live in `src/styles.css` under `@theme`:
- Backgrounds: `bg-950` … `bg-600`
- Accents: `violet-700` … `violet-400`, `cyan-500` … `cyan-300`, `amber-500` / `amber-400`
- Text: `ink-50` … `ink-700`
- Status: `good` (green), `bad` (red)
- Fonts: `font-display` / `font-board` (Bebas Neue), body (Inter Tight)
- Custom radius / shadow tokens for tile, card, glow

Animation keyframes: `tile-sheen`, `breathing-ring`, `flame-pulse`, `frost-shimmer`, `zzz-float`, `banner-slam`, `shake-fast`, `flame-flicker`

---

## Stats & Tracking

All game actions are persisted for statistics.

### Tables
- **`gameEvent`** — full audit log of every `applyEvent` event (`START_GAME`, `SELECT_QUESTION`, `START_QUESTION`, `BUZZ`, `JUDGE`, `NEXT_ROUND`, `END_RAPID_FIRE`, `REVEAL_NEXT_MEDIA`, `TOGGLE_NO_PENALTY`, `SKIP_QUESTION`, `VOTE_SKIP`, `PLAYER_CONNECTED/DISCONNECTED`, synthetic `GAME_OVER`). Columns: `seq` (per session), `actorPlayerId/UserId`, `questionId`, JSON `payload`, `createdAt`.
- **`questionReveal`** — per `(sessionId, questionId)` timestamp when question entered `QUESTION_OPEN`. Used for reaction times across server restarts.
- **`questionAttempt`** — per buzz/judge: `isCorrect`, `pointsAwarded`, `buzzedAt`, `resolvedAt`, `attemptOrder`, `noPenaltyApplied`, `wasRapidFire`, `revealedMediaIndexAtBuzz`, `reactionMs`
- **`buzzLog`** — all buzzes with `revealedAt` + `reactionMs`
- **`answeredQuestion`** — `resolution` (`solved | skipped | rapid_fire | unanswered`), `solvedAt`, `firstSolverPlayerId`
- **`gameSession`** — `winnerPlayerId`, `startedAt`, `totalQuestions`, `answeredCount`

### Code locations
- Tracking logic: `src/lib/game-state.ts` (`logEvent()`)
- Aggregate queries: `src/lib/statsQueries.ts` (server-only, import dynamically from handlers)
  - `getCareerStats(userId)`, `getSessionRecap(sessionId)`, `getHallOfFame()`, `getUserSessionHistory(userId)`

### UI Routes
- `/sessions/$sessionId/recap` — Post-game recap (Recharts score chart, highlight cards, per-category stats, per-question details)
- `/stats` — Hall of Fame (global top-10 lists)
- `/stats/users/$userId` — Career KPIs + game history with recap links

Game-over screens link automatically to the recap. Header navbar has a `/stats` entry for logged-in users.

---

## Special-Event Notifications

In-game banners for notable moments. Visible on TV (large + sound), Master (compact toasts), and Player phone (personalised, only own involvement).

### Persistent Player Flags (in `PlayerState`)
- `correctStreak` — current correct streak (reset on wrong answer)
- `wrongStreak` — current wrong streak (reset on correct answer; unchanged if `noPenaltyApplied`)
- `idleQuestionsCount` — questions since last interaction (+1 for non-participants per closed question, reset on buzz / vote skip / select question)
- Reconstructed from history in `loadGameState` → survives server restart.
- Drive `PlayerStatusBadge` (fire / frost / zzz rings). Priority: Fire > Frost > Zzz.

### Ephemeral Notifications (`GameState.eventNotifications`)
Rolling buffer (max 8, > 6 s discarded). Server pushes via `pushNotification()` in `src/lib/specialEvents.ts`. Client (`EventNotificationOverlay`) deduplicates by `id`, renders ~4 s then fades.

### Event Catalogue
| Type | Trigger | Threshold |
|---|---|---|
| `CLOSE_BUZZ` | Second-place buzz ≤ 500 ms after winner | 500 ms |
| `SPEED_DEMON` | Winner buzz reaction < threshold | 250 ms |
| `ON_FIRE` | Correct judge brings `correctStreak ≥ 3` | 3 |
| `COLD_STREAK` | Wrong judge brings `wrongStreak ≥ 3` | 3 |
| `STREAK_BROKEN` | Wrong judge after `prevCorrectStreak ≥ 3` | — |
| `FIRST_BLOOD` | First correct answer of session | — |
| `BIG_SCORE` | Correct answer on highest point-value question | — |
| `ROBBED` | Correct answer, previous attempt on same question was wrong by another player | — |
| `UNDERDOG` | Last in score (gap ≥ 200) answers correctly | 200 |
| `COMEBACK` | Was ≥ 1000 behind leader, now < 200 | — |
| `AFK` | `idleQuestionsCount` reaches threshold | 4 |
| `PERFECT_CATEGORY` | Category fully solved (all questions have `solverColors.length > 0`) | — |

### Detection Hooks
- `BUZZ` → `detectBuzzEvents()` → SPEED_DEMON / CLOSE_BUZZ
- `JUDGE` → capture pre-mutation context → `applyJudgeEffects()` → all judge-related notifications. If phase becomes ANSWER_REVEALED / GAME_OVER → `onQuestionClosed()` → AFK + PERFECT_CATEGORY.
- `SELECT_QUESTION` → reset participants, mark selector
- `VOTE_SKIP` → mark voter as participant
- `SKIP_QUESTION` / `END_RAPID_FIRE` → `onQuestionClosed()` for AFK increment

### Persisting in Audit Log
Each notification is also stored as `type='SPECIAL_EVENT'` in `gameEvent` via `persistNewNotifications(sessionId, before, after)`.

### Surfaces
- **TV** (`board.tsx`): `<EventNotificationOverlay surface="tv" />` — all events. Hero banner centre for ON_FIRE / COLD_STREAK / BIG_SCORE etc.; compact stack bottom-left for CLOSE_BUZZ / AFK / SPEED_DEMON / ROBBED. Sound via `new Audio('/sounds/events/*.mp3')`.
- **Master** (`master.tsx`): `<EventNotificationOverlay surface="master" />` — only CLOSE_BUZZ + AFK as compact toast top-right (z-30, under header). No sound.
- **Player** (`play.tsx`): `<EventNotificationOverlay surface="player" selfPlayerId={playerId} />` — personalised, filters to notifications involving own `playerId`. Toast top-centre, no sound.

### Sound Slots (TV only)
`public/sounds/events/`:
- `on-fire.mp3` — ON_FIRE / STREAK_BROKEN / SPEED_DEMON / BIG_SCORE
- `cold.mp3` — COLD_STREAK
- `snore.mp3` — AFK
- `chime.mp3` — CLOSE_BUZZ / FIRST_BLOOD / UNDERDOG / COMEBACK / ROBBED / PERFECT_CATEGORY

Missing files fail silently.

---

## Known Gaps / Open Issues

- Multiple-media carousel on TV not fully integrated yet (`MediaCarousel` exists; `QuestionStage` still uses legacy `mediaUrl`)
- Skip-vote feature implemented in game-state; player-side UI may still be incomplete
- Email sending requires configured SMTP env vars
- TypeScript error in `admin/invites.tsx` (loader uses dynamic auth import — works, but TS complains)
- New DB columns require manual `node scripts/add-columns.mjs` after pull (`drizzle-kit push` fails on SQLite recreates with FK constraints)
