# Jeopardy 2.0 — Projekt-Doku & Agent-Briefing

> Projektpfad: `C:\Users\alexe\Jeopardy 2.0\jeopardy2.0`
> Stack: TanStack Start · React 19 · Drizzle ORM · better-sqlite3 · Better Auth · Tailwind CSS v4 · Vite 8 · WebSockets (Nitro)

---

## ⚠️ Agent-Workflow (für Claude / KI-Assistenten)

**Bevor du loslegst:**
1. Lies diese Datei einmal komplett — sie ist die einzige Quelle für Projekt-Konventionen, kritische Stolperfallen und State-of-the-Art.
2. Halte Änderungen mental gegen die "Kritische Hinweise"-Sektion — besonders Vite/better-sqlite3 dynamische Imports und das DB-Migrations-Workflow.

**Während der Arbeit:**
- Sprache mit dem User: **Deutsch**.
- Server-only-Code (`#/db/index`, `#/lib/auth`) **nur** dynamisch importiert in Handler-Funktionen, nie auf Top-Level einer Route-Datei.
- Bei DB-Schema-Änderungen: Spalte in `src/db/schema.ts` **und** `scripts/add-columns.mjs` ergänzen, nicht nur eines.
- Spielansichten (`play.tsx`, `master.tsx`, `board.tsx`): Layout ist `h-[100dvh] overflow-hidden` mit `shrink-0` Header/Footer und `flex-1 overflow-y-auto` Main. Nichts daran ändern ohne triftigen Grund.
- Globaler Header wird auf Game-Routen ausgeblendet (`isGameRoute()` in `__root.tsx`).

**Nach jeder relevanten Änderung — diese Datei aktualisieren:**
- Neues Feature, neue Komponente, neue UX-Konvention, DB-Schema-Änderung, neuer Bug-Fix mit Verhaltensänderung → direkt im selben Turn hier dokumentieren.
- Triviale Style-Tweaks, reine Bugfixes ohne API/Verhalten-Änderung, interne Refactors → muss nicht rein.
- Bei DB-Schema-Änderungen: zusätzlich `scripts/add-columns.mjs` ergänzen.
- Bei neuen Routen / Komponenten: in der entsprechenden Sektion (Spielansichten / Komponenten-Bibliothek) nachziehen.

**Don't-Touch-Zonen (außer User fragt explizit):**
- WebSocket-Server-Handler (Nitro-Route) — wird über das Client-`useGameSocket`-Hook angesprochen; kein direkter Eingriff nötig für UI-Arbeit.
- `better-auth`-Konfiguration in `src/lib/auth.ts`.

**Kommandos:**
- Dev: `npm run dev`
- Migration nach Schema-Änderung: `node scripts/add-columns.mjs` (idempotent, sicher mehrfach ausführbar)
- TypeCheck (falls verlangt): `npm run typecheck` oder via IDE

---

## Tech-Stack & kritische Hinweise

### Vite + better-sqlite3 (Server-only)
`better-sqlite3` darf **niemals** im Client-Bundle landen. Alle Imports von `#/lib/auth` und `#/db/index` müssen **dynamisch** innerhalb von Handler-Funktionen erfolgen:
```ts
// RICHTIG — innerhalb createServerFn oder server.handlers
const { db } = await import('#/db/index')
const { auth } = await import('#/lib/auth')

// FALSCH — Top-Level-Import in Route-Dateien
import { db } from '#/db/index'
```
`src/routes/api/auth/$.ts` verwendet `server.handlers` (kein createServerFn) — dort sind dynamische Imports besonders wichtig.

### Env-Variablen (`.env.local`)
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

### DB-Schema-Änderungen
`drizzle-kit push` scheitert bei NOT-NULL-Spalten in SQLite wegen Table-Recreate + FK-Constraints.
Workflow für neue Spalten:

1. Spalte in `src/db/schema.ts` ergänzen (mit `.notNull().default(...)`)
2. Eintrag in `scripts/add-columns.mjs` ergänzen (idempotenter ALTER)
3. `node scripts/add-columns.mjs` ausführen
4. Dev-Server neustarten

> **Migrations-Hilfsskript**: `scripts/add-columns.mjs` führt manuelle ALTER-Befehle idempotent aus. Bei jeder neuen Spalte → dort ergänzen.
>
> Aktuell tracked:
> - `question.autoplay_media` (INTEGER NOT NULL DEFAULT 0)
> - `game_player.color` (TEXT NOT NULL DEFAULT `'#7C3AED'`)
> - `question.show_media_on_player` (INTEGER NOT NULL DEFAULT 0)
> - `question.media_placeholder` (INTEGER NOT NULL DEFAULT 0)
> - `question_media.role` (TEXT NOT NULL DEFAULT `'question'`) — `'question' | 'answer'`
> - `game_session.winner_player_id`, `started_at`, `total_questions`, `answered_count`
> - `question_attempt.attempt_order`, `no_penalty_applied`, `was_rapid_fire`, `revealed_media_index_at_buzz`, `reaction_ms`
> - `buzz_log.revealed_at`, `reaction_ms`
> - `answered_question.resolution` (`'solved' | 'skipped' | 'rapid_fire' | 'unanswered'`), `solved_at`, `first_solver_player_id`
> - **Neue Tabellen**: `game_event` (volles Audit-Log), `question_reveal` (Frage-Reveal-Timestamps)

---

## Authentifizierung

- **Better Auth** (`src/lib/auth.ts`) mit Username-Plugin
- Login: `src/routes/auth/login.tsx`
- Registrierung **nur per Einladungslink**: `src/routes/auth/register.tsx?token=XXX`
- Auth-API-Route: `src/routes/api/auth/$.ts` — verwendet `server.handlers` mit dynamischen Imports

---

## Einladungssystem

### Flow
1. Admin/User öffnet Einlade-Modal im Header → gibt Email ein
2. `quickInvite` Server-Fn erstellt Token (nanoid, 8 Zeichen, 7 Tage gültig) in `invite`-Tabelle
3. Email wird via Nodemailer (`src/lib/email.ts`) versendet mit Link: `BETTER_AUTH_URL/auth/register?token=TOKEN`
4. Empfänger öffnet Link → `validateInvite` prüft Token → Registrierungsformular (Name, Username, Passwort)
5. `completeRegistration` markiert Invite als `usedAt` → `authClient.signUp.email()` erstellt Account

### Relevante Dateien
- `src/routes/__root.tsx` — `quickInvite` Server-Fn + `InviteModal` Komponente
- `src/routes/admin/invites.tsx` — Admin-Übersicht aller Einladungen
- `src/routes/auth/register.tsx` — Registrierungsseite mit Token-Validierung
- `src/lib/email.ts` — Nodemailer-Wrapper `sendInviteEmail(email, link)`
- DB-Tabelle: `invite` (id=token, email, invitedById, usedAt, expiresAt)

---

## Media-Editor

Nach jedem Bild- oder Video-Upload im Quiz-Editor öffnet automatisch ein Mini-Editor (`MediaEditorModal`). Der User kann das Original behalten ("Original behalten"-Button) oder bearbeitete Version speichern. Bereits hochgeladene Medien sind über das Stift-Icon neben dem Trash-Icon im Frage-Modal erneut bearbeitbar.

### Bilder (browser-seitig, Canvas API)
- **Zuschneiden** via `react-easy-crop` (Aspect: Frei/1:1/4:3/16:9, Zoom-Slider). "Auf Bild anwenden" schneidet → neue PNG → wird Master.
- **Zeichnen** mit Pointer-Events: 7-Farb-Palette + Stärke-Slider 1–40 px, Rückgängig + Alles löschen, "Auf Bild anwenden" flacht Strokes ins Master-Bild.
- **Verpixeln** durch Drag-Rectangle: Block-Größe 4–48 px (`pixelateRegion()` in `src/lib/canvas-utils.ts` mittelt jeden Block, schreibt zurück mit `putImageData`). Mehrere Regionen pro Apply möglich.
- "Speichern" lädt finalen Canvas als PNG via `/api/upload` → ersetzt URL im `mediaItems[idx]`.

### Videos (server-seitig via FFmpeg)
- Endpoint: `server/routes/api/media/process.ts` — POST `{ url, trim?, resizeHeight?, extractAudio?, audioFx? }` → `{ url, type }`.
- Nutzt `fluent-ffmpeg` + `ffmpeg-static` (FFmpeg-Binary kommt als npm-Paket, kein System-Install).
- Operationen kombinierbar in einem Aufruf (Trim + Resize gleichzeitig).
- Resize via `-vf scale=-2:HEIGHT` (Breite auf gerade Zahl gerundet für libx264).
- Audio-Extract → `.mp3` (libmp3lame, 192k); Antwort-`type` wechselt automatisch auf `'audio'`.
- Upload-Limit liegt bei **200 MB** (Image/Audio/Video, in `server/routes/api/upload.ts`).

### Audio (server-seitig via FFmpeg)
- Gleiches Endpoint wie Video. Audio-Pipeline wird automatisch aktiviert wenn Input eine Audio-Datei ist (`.mp3 .wav .ogg .m4a .aac .flac .opus`) **oder** `extractAudio: true` **oder** ein `audioFx` mitgeschickt wird.
- `audioFx`-Parameter: `{ reverse?: boolean, pitchSemitones?: number (-12..12), speed?: number (0.5..2) }`. Server clampt `speed` intern auf `[0.25, 4]` und kettet mehrere `atempo`-Stufen, falls außerhalb `[0.5, 2.0]`.
- Filter-Reihenfolge: Pitch (`asetrate=44100*p, aresample=44100, atempo=1/p` → Tonhöhe ohne Dauer-Änderung) → Speed (`atempo=s` → Dauer ohne Tonhöhen-Änderung) → `areverse`.
- Trim wird **vor** dem Filter angewendet (`-ss`/`-t`), funktioniert kombiniert mit den Effekten.
- Output immer `.mp3` (libmp3lame, 192k).

### Helper
- `src/lib/canvas-utils.ts` — `loadImage`, `pixelateRegion`, `getCroppedBlob`, `canvasToBlob`, `uploadBlob`.
- `src/lib/media-types.ts` — `MediaType`, `isImage/isVideo/isAudio/isEditable`, `mediaTypeFromMime`.

### Bekannte Limits
- Audio-Editor (`AudioEditor`): Trim, Reverse, Pitch (Halbtöne, dauer-erhaltend), Speed (tonhöhen-erhaltend). Keine browser-seitige Live-Preview der Effekte — Ergebnis erst nach „Speichern" hörbar.
- YouTube-Medien sind weiterhin nicht editierbar (`isEditable` schließt `'youtube'` aus).
- FFmpeg-Job ist sync — sehr lange Videos (>5 min Verarbeitung) können HTTP-Timeout treffen. Loading-State im Modal zeigt "Verarbeite…".
- `public/uploads/` sammelt Original + bearbeitete Versionen, kein GC implementiert.

---

## Quiz-Verwaltung

- `src/routes/quizzes/index.tsx` — Liste eigener Quizze mit Löschen-Button
- `src/routes/quizzes/new.tsx` — Neues Quiz erstellen (Titel, Kategorienanzahl, Reihenanzahl, Punktwerte, Malus-Faktor)
- `src/routes/quizzes/$quizId/edit.tsx` — Board-Editor

### Quiz-Editor Features
- **Responsive Layout**: Auf `md` und größer das klassische Board-Grid; auf Mobile (`<md`) wird stattdessen `EditorMobileBoard` (`src/components/editor/EditorMobileBoard.tsx`) gerendert — Drill-down im QuestionPicker-Stil: Kategorienliste → Fragenliste mit Punkten + Fragentext (line-clamp-2) + Testen-Button. Kategorie-Rename im Schritt-2-Header via Inline-Input.
- Kategorienamen inline editierbar (onBlur speichert)
- Jede Zelle = eine Frage → Modal öffnet sich zum Bearbeiten
- **Frage-Modal mit Tabs**: „Inhalt" (Frage, Antwort, Frage-/Antwort-Medien) und „Optionen" (alle Verhaltens-Toggles wie `allowRebuzz`, `autoplayMedia`, `rapidFire`, `showMediaOnPlayer`, `mediaPlaceholder`). Tab „Optionen" zeigt eine Badge mit der Anzahl aktiver Abweichungen vom Default. Tab-State wird beim Öffnen jeder Frage auf „Inhalt" zurückgesetzt. Neue Optionen-Toggles immer in den Optionen-Tab und in den Counter aufnehmen.
- **Mehrere Medien pro Frage** (Bilder, Audio, Video, YouTube) via `questionMedia`-Tabelle
- **Frage- vs. Antwort-Medien** (`questionMedia.role`): Im „Inhalt"-Tab zwei separate Sektionen — **Frage-Medien** (cyan, werden während QUESTION_OPEN/JUDGING auf TV / optional auf Spieler-Handy gezeigt) und **Antwort-Medien** (violet, erscheinen erst in Phase ANSWER_REVEALED — auf TV beim Antwort-Banner, auf Spieler unter der Antwort-Karte, beim Master immer sichtbar in `MasterAnswerCard`). `revealedMediaIndex` zählt nur die Frage-Medien. Beim Hinzufügen wird die Sektion fest mit dem `role` verknüpft, der Sortier-Index wird per Rolle resequenced beim Entfernen.
- Upload via `/api/upload` → gespeichert in `public/uploads/`
- Einstellungen pro Frage:
  - Wiederholtes Buzzern erlaubt (`allowRebuzz`)
  - Erstes Medium automatisch abspielen (`autoplayMedia`) — **Default: false**
  - **Mehrmals antworten möglich** (`rapidFire`) — Master entscheidet wann Frage endet
  - **Medien auf Spieler-Handy anzeigen** (`showMediaOnPlayer`) — Master gibt Medien stückweise via „Nächstes Medium freigeben"-Button frei
  - **Placeholder auf TV** (`mediaPlaceholder`) — TV zeigt zuerst Platzhalter, Medien erscheinen erst nach Freigabe durch Master
- **„Testen"-Button** unten rechts auf befüllten Kacheln öffnet `TestQuestionModal` (`src/components/editor/TestQuestionModal.tsx`): zeigt TV / Master / Spieler gleichzeitig in einem Fullscreen-Dialog, wiederverwendet `QuestionStage` / `MasterAnswerCard` / `JudgeBar` / `BuzzerButton` mit lokalem Mock-State (Phase, Buzz, RevealMediaIndex, Score) — kein WebSocket, keine DB. Tabs „Alle / TV / Master / Spieler" zum Fokussieren einzelner Ansichten, Reset-Button. Click-Handler nutzt `e.stopPropagation()`, damit das Edit-Modal nicht parallel öffnet.

### DB-Schema (Fragen)
```ts
question: { id, categoryId, quizId, rowIndex, questionText, answerText,
  mediaUrl, mediaType, youtubeUrl,  // Legacy-Felder (single media)
  allowRebuzz, autoplayMedia, rapidFire,
  showMediaOnPlayer, mediaPlaceholder }

questionMedia: { id, questionId, url, type, role, sortOrder }
// type: 'image' | 'audio' | 'video' | 'youtube'
// role: 'question' | 'answer'  (Default 'question')
```

---

## Session / Spiel-System

### Session erstellen & joinen
- `src/routes/sessions/new.tsx` — Quiz auswählen → Session erstellen (generiert 6-stelligen `joinCode`)
- `src/routes/join.tsx` — Code manuell eingeben (öffentliche Seite, auch ohne eingeloggt sein)
- `src/routes/sessions/$sessionId/join.tsx` — QR-Code-Link-Handler, legt `gamePlayer`-Eintrag an
- `src/routes/sessions/$sessionId/index.tsx` — Lobby mit QR-Code, Live-Spielerliste (via WebSocket), TV-Link

### Echtzeit via WebSocket
- Hook: `src/hooks/useGameSocket.ts`
- Verbindet sich mit `ws://host/api/ws/$sessionId`
- Sendet `JOIN`-Event mit `playerId`
- Empfängt `STATE_UPDATE`-Events → `GameState`
- Lobby (`index.tsx`) zeigt Spieler **live** ohne F5 (useGameSocket mit `playerId: null`)

### Session verlassen (Header)
- `leaveSession` Server-Fn in `__root.tsx`
- Spieler: löscht eigenen `gamePlayer`-Eintrag
- Master: setzt Session auf `status: 'finished'`
- Header-Button „✕" neben „Laufendes Spiel" — verschwindet danach sofort

---

## Game-State-Machine (`src/lib/game-state.ts`)

### Phasen
```
LOBBY → SELECTING → QUESTION_OPEN → JUDGING → ANSWER_REVEALED → SELECTING → ...
                                                               ↘ GAME_OVER
```

### Events (via WebSocket `send(type, payload)`)
| Event | Wer | Beschreibung |
|---|---|---|
| `START_GAME` | Master | Lobby → SELECTING, zufälliger Startspieler |
| `SELECT_QUESTION` | Master/Spieler | SELECTING → QUESTION_OPEN |
| `BUZZ` | Spieler | QUESTION_OPEN → JUDGING |
| `JUDGE` | Master | JUDGING → ANSWER_REVEALED oder QUESTION_OPEN |
| `NEXT_ROUND` | Master | ANSWER_REVEALED → SELECTING |
| `TOGGLE_NO_PENALTY` | Master | Schaltet Malus-freie Runde ein/aus |
| `SKIP_QUESTION` | Master | Frage überspringen (als beantwortet markieren) |
| `VOTE_SKIP` | Spieler | Vote zum Skippen — alle müssen zustimmen |
| `END_RAPID_FIRE` | Master | Rapid-Fire-Frage beenden, alle Solver bleiben getrackt |
| `REVEAL_NEXT_MEDIA` | Master | Gibt nächstes Medium frei (`revealedMediaIndex + 1`) |

### State-Interfaces
```ts
interface GameState {
  sessionId, phase, masterId,
  players: PlayerState[],          // alle inkl. Master
  activePlayerId,                  // wer wählt/dran ist
  activeQuestion: ActiveQuestion | null,
  buzzedPlayerId,                  // wer gerade gebuzzert hat
  buzzedPlayerIds,                 // alle die schon gebuzzert haben (Runde)
  answeredQuestionIds,
  board: BoardCategory[],
  winnerId,
  pointValues, wrongAnswerPenalty,
  noNegativePoints,                // Malus-frei Toggle
  skipVotes,                       // PlayerIds die für Skip gestimmt haben
  rapidFireSolvedIds,              // PlayerIds die in rapidFire richtig geantwortet haben
  revealedMediaIndex: number,      // wie viele Medien freigegeben wurden (−1 = keines)
}

interface PlayerState {
  id, displayName, score, isConnected, userId,
  color: string                    // HEX-Farbe — pro Session eindeutig zugewiesen
}

interface BoardQuestion {
  id, pointValue, answered,
  solverColors: string[]           // Farben der Spieler die richtig beantwortet haben (chronologisch, außen→innen)
  empty?: boolean                  // True wenn der Slot keine Frage hat (Platzhalter)
}
```

---

## Spieler-Farben

Jeder Spieler bekommt beim Join eine eindeutige Farbe aus einer 10er-Palette zugewiesen.

- Helper: `src/lib/playerColors.ts` → `PLAYER_COLOR_PALETTE` + `pickPlayerColor(used, seed)`
- Palette: `#EF4444` (rot), `#F97316` (orange), `#EAB308` (gelb), `#22C55E` (grün), `#3B82F6` (blau), `#EC4899` (pink), `#84CC16` (lime), `#14B8A6` (teal), `#A855F7` (lila), `#F43F5E` (rose)
- Auswahl: erste freie Farbe in der Session; bei mehr als 10 Spielern deterministischer Hash auf `userId`
- DB: `game_player.color` (TEXT NOT NULL DEFAULT `'#7C3AED'`)
- Zuweisung an allen 3 `gamePlayer.insert`-Stellen: `routes/join.tsx`, `routes/sessions/new.tsx`, `routes/sessions/$sessionId/join.tsx`

### Solver-Tracking
- Wer eine Frage richtig beantwortet hat, wird aus `questionAttempt` (isCorrect=true, sortiert nach `resolvedAt`) abgeleitet
- `loadGameState` baut `BoardQuestion.solverColors` daraus
- `applyEvent` JUDGE pusht die Farbe live an `solverColors` — funktioniert auch im Rapid-Fire-Verlauf

---

## Spielansichten

> **Layout-Konvention**: Game-Views nutzen `h-[100dvh] overflow-hidden` mit `shrink-0` für Header/Bottom und `flex-1 overflow-y-auto` für Main. Globaler Header wird auf Game-Routen via `isGameRoute()` in `__root.tsx` ausgeblendet.

### TV-Board (`src/routes/sessions/$sessionId/board.tsx`)
- Vollbild-Ansicht für großen Bildschirm
- `BoardGrid` zeigt immer das vollständige Raster (`rowCount × categoriesCount`); nicht ausgefüllte Zellen erscheinen als inaktive Platzhalter
- `QuestionStage` Overlay bei aktiver Frage (Phase QUESTION_OPEN/JUDGING/ANSWER_REVEALED)
- Media-Carousel für mehrere Medien pro Frage; **Autoplay** richtet sich nach `autoplayMedia`-Flag der Frage
- **Auto-Advance bei Reveal**: Sobald `revealedMediaIndex` wächst (Master gibt nächstes Medium frei), springt der Carousel automatisch auf den neuen Slide — kein manueller Klick nötig. Manuelle Navigation (Pfeile/Dots) deaktiviert Autoplay für die Sitzung des aktuellen Carousels.
- **Vollbild** (`MediaCarousel`): Maximize-Icon (oben rechts) + **Esc-Shortcut** triggern medien-spezifisch:
  - **YouTube** → `iframeEl.requestFullscreen()` auf dem YT-Iframe (native YT-Vollbild; `enablejsapi=1` gesetzt). `YoutubeEmbed` exportiert `YoutubeEmbedHandle` (`forwardRef` + `useImperativeHandle`).
  - **MP4-Video** → `videoEl.requestFullscreen()` (native Browser-Fullscreen mit nativen Controls).
  - **Bild** → `ImageZoomPopup` (`src/components/ui/ImageZoomPopup.tsx`): Auto-Zoom für kleine Bilder, Wheel-Zoom, Pointer-Drag-Pan, Reset, Esc schließt.
  - **Audio** → kein Vollbild.
  - YT-Iframe und `<video>` rendern mit nativen Controls — User kann direkt klicken um zu pausieren/spulen.
  - Esc-Handler split keydown/keyup (arm + fire) damit dieselbe Esc-Taste nicht vom OS-Fullscreen-Exit-Shortcut wieder geschlossen wird.
  - **Bekannte Einschränkung:** Esc-Shortcut funktioniert nur, wenn die Seite Tastatur-Fokus hat (nach dem ersten Klick irgendwohin). Nach F5 oder nach Vollbild-Exit kann Fokus auf URL-Bar bzw. iframe liegen — dann erst irgendwohin klicken, dann geht Esc wieder.
  - Steuerung via `allowFullscreen`-Prop (Default `true`).
- **Placeholder-Modus** (`mediaPlaceholder`): TV zeigt zunächst einen Platzhalter-Block statt des Mediums; Master gibt Medien stückweise via „Nächstes Medium freigeben" frei → `revealedMediaIndex` steuert wie viele Medien angezeigt werden
- Scoreboard in der Kopfzeile (Reihe)
- Game-Over-Screen mit Rangliste

### Board-Kachel-States (`src/components/game/BoardGrid.tsx`)
- **Verfügbar**: Punktwert in Cyan, dezente Shine-Animation (`.tile-available` in `styles.css`, 9s Loop, cyan-getönt)
- **Erledigt + niemand gelöst (übersprungen)**: dunkle Kachel, durchgestrichener Punktwert in `bg-600`
- **Gelöst (1 Spieler)**: Kachel in Spielerfarbe (radial-gradient mit einem Stop), dunkle Vignette für „verbraucht"-Look, Punktwert weiß
- **Rapid-Fire (N Spieler)**: konzentrische Ringe via `radial-gradient(circle at center, ...)` — `solverColors[0]` außen (= erste richtige Antwort), `solverColors[N-1]` innen
- **Empty-Placeholder**: minimal sichtbar, kein Punktwert

### Master-Ansicht (`src/routes/sessions/$sessionId/master.tsx`)
- Mobile-optimiert (max-w-md)
- **Home-Button** (Haus-Icon) im Header → navigiert zur Startseite
- **TV-Button** im Header → öffnet `/sessions/$sessionId/board` in neuem Tab (TV-Ansicht auf dem großen Bildschirm)
- `JudgeBar` am unteren Rand — kontextsensitiv:
  - **LOBBY**: „Spiel starten"-Button
  - **QUESTION_OPEN / JUDGING** (wenn `showMediaOnPlayer` oder `mediaPlaceholder` aktiv): „Nächstes Medium freigeben"-Button mit Zähler „X / Y freigegeben"
  - **QUESTION_OPEN**: Kein-Malus-Toggle + Skippen-Button
  - **QUESTION_OPEN + rapidFire**: Amber-Badge „Mehrmals antworten möglich" + Skippen
  - **JUDGING**: Richtig (+Punkte) / Falsch (−Punkte)
  - **JUDGING + rapidFire**: „Richtig · Zurück zur Frage" / „Richtig · Frage beenden" / „Falsch — weiter buzzern"
  - **ANSWER_REVEALED**: „Weiter →"
- Override-Sheet: Master kann manuell jede Frage wählen (QuestionPicker)
- Live Scoreboard + PhaseBadge + Verbindungsstatus
- Antwort immer sichtbar für Master (`MasterAnswerCard`)
- **Kein Autoplay** für Video/Audio — unabhängig vom `autoplayMedia`-Flag der Frage

### Spieler-Ansicht (`src/routes/sessions/$sessionId/play.tsx`)
- **Home-Button** (Haus-Icon) im Header → navigiert zur Startseite
- `BuzzerButton` — großer Buzzer-Button
- Zeigt eigene Punkte, aktuelle Phase, Frage-Text
- Buzzer gesperrt wenn bereits gebuzzert oder nicht an der Reihe
- Skip-Vote-Button in QUESTION_OPEN
- Wenn `showMediaOnPlayer` aktiv: Medien erscheinen oberhalb des Buzzers sobald Master sie freigibt (`revealedMediaIndex ≥ 0`)

---

## Rapid-Fire Modus

Aktiviert per `rapidFire: true` auf einer Frage.

### Ablauf
1. Frage öffnet sich normal
2. Spieler buzzern wie gewohnt
3. Master sieht im JUDGING zwei grüne Buttons:
   - **„Richtig · Zurück zur Frage"** → Punkte werden vergeben, Phase → QUESTION_OPEN, Spieler kann erneut buzzern (nächster kommt dran)
   - **„Richtig · Frage beenden"** → Punkte vergeben, Phase → ANSWER_REVEALED (normale Weiter-Logik)
4. **„Falsch — weiter buzzern"** → kein Malus, zurück zu QUESTION_OPEN
5. `rapidFireSolvedIds` trackt wer schon Punkte bekommen hat
6. Auf dem TV-Board werden alle korrekten Solver später als konzentrische Ringe (Spielerfarben) auf der Kachel sichtbar

---

## Header & Navigation

- `src/routes/__root.tsx` — Root-Layout mit Navbar
- Eingeloggt: Meine Quizze · Spiel starten · Einladen · Admin (nur admins) · Username · Abmelden
- **„Laufendes Spiel"** grüner Pill mit Pulse-Animation — erscheint wenn User in aktiver Session
  - Klick → navigiert zur Spielansicht (Master → `/master`, Spieler → `/play`)
  - **✕-Button** daneben → verlässt Session sofort
- Auf Mobile: Hamburger-Menü
- **Header wird auf Game-Routen ausgeblendet** (`isGameRoute()` matched `/master`, `/play`, `/board`)

---

## Admin

- `src/routes/admin/invites.tsx` — Liste aller Einladungen (Email, Status: Offen/Genutzt/Abgelaufen, Ablaufdatum)
- Neue Einladung direkt von der Seite versenden
- Nur zugänglich wenn `user.isAdmin === true`

### Admin-Debug-Ansicht (`src/routes/admin/debug.tsx`)

Reine Client-Seite (kein WebSocket / DB) zum isolierten Testen schwer-manuell-reproduzierbarer Features. Loader-Guard: redirect bei nicht-eingeloggt → `/auth/login`, bei nicht-admin → `/`. Erreichbar via Navbar-Eintrag „Debug" (nur für Admins, neben „Admin").

**Aktueller Tab „Special Events":** drei Spalten — 4 Mock-Spieler mit Slidern für `correctStreak` / `wrongStreak` / `idleQuestionsCount` (Live-Avatar-Preview via `PlayerStatusBadge`), Trigger-Panel mit einem Button pro `SpecialEventType` + Default-Inputs (`streak`, `reactionMs`, `deltaMs`, `pointValue`, `finalStreak`, `categoryName`, `idleCount`) + „Alle durchspielen" + „Clear", und Surface-Preview-Spalte (Tabs Alle/TV/Master/Player) die jede Surface in einer eigenen Box rendert. Self-Spieler-Auswahl steuert den `selfPlayerId`-Filter für die Player-Surface.

**Architektur:** Lokaler `GameState` mit `useState` (players + notifications), `pushNotification` aus `specialEvents.ts` schreibt direkt in den Notifications-Buffer. `EventNotificationOverlay` bekommt `containerMode` (Wrapper `absolute` statt `fixed`, damit die Overlays in den Preview-Boxen bleiben) und `enableSound` (TV-Sound-Toggle, Default off im Container-Modus).

**Erweitern:** Neuer Tab → in `Tab`-Type einen weiteren String aufnehmen, `TabButton` ergänzen, neue Tab-Komponente schreiben. Pattern bleibt: Mock-State + existierende Spielkomponenten unter Kontrolle rendern.

---

## Einstellungen (`src/routes/settings.tsx`)

- Profilname ändern
- Buzzer-Sound auswählen (vorinstalliert: Standard, Bell, Siren + Upload eigener WAV/MP3)
- Sounds in `public/sounds/`

---

## Komponenten-Bibliothek

### `src/components/ui/`
- `Button` — variant: primary/accent/success/danger/subtle/ghost, size: sm/md/lg/xl
- `Card`, `Modal` (size: sm/md/lg/xl), `Sheet` (Bottom-Sheet)
- `Input`, `Textarea`, `FormField`
- `Pill` — tone: good/bad/amber/violet/neutral
- `MediaFrame` — rendert Image/Audio/Video/YouTube
- `MediaCarousel` — Carousel für mehrere MediaItems
- `YoutubeEmbed` — kapselt YouTube-Iframe. Vor Klick: Thumbnail (`i.ytimg.com/vi/{id}/maxresdefault.jpg`, Fallback `hqdefault.jpg`) + eigener violetter Play-Button. Beim Klick / wenn `autoplay={true}`: iframe mit `autoplay=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`. **YT bietet keinen API-Weg den Video-Titel auszublenden** (`showinfo` ist seit 2018 entfernt) — daher Crop per Default (Spoiler-Schutz für Frage-Medien): iframe `top: -15%; height: 115%` (extends 15% oben über den Container, Boden bündig). Title-Overlay sitzt im versteckten oberen Bereich. Bottom-YT-Steuerleiste bleibt am Container-Boden sichtbar (User kann Pausieren / Vorspulen). Sichtbares Video füllt ~92.5% der Container-Höhe, untere ~7.5% sind schwarzer Balken mit YT-Controls. Prop `cropChrome={false}` deaktiviert den Crop (volle 16:9-Iframe ohne Verschiebung) — verwenden für **Antwort-Medien** (in `MediaCarousel`-/`MediaFrame`-Aufrufen mit `answerMedia`), wo Spoiler nicht mehr relevant sind. `cropChrome` ist sowohl auf `YoutubeEmbed` als auch auf `MediaCarousel`/`MediaFrame` verfügbar und wird durchgereicht. Für YouTube-Embeds immer diese Komponente verwenden statt direkt `<iframe>`.
- `PageContainer`, `PageHeader`
- `Wordmark`

### `src/components/editor/`
- `MediaEditorModal` — Wrapper-Modal, dispatched zu Image-, Video- oder Audio-Editor (YouTube nicht editierbar)
- `ImageEditor` — Tabs: Zuschneiden (`react-easy-crop`) · Zeichnen · Verpixeln; Master-Canvas wird zwischen Tabs geteilt, Speichern lädt Endresultat als PNG via `/api/upload`
- `PaintCanvas` — Pointer-basiertes Freihand-Zeichnen, 7 Farben + Stärke 1–40 px, Rückgängig/Löschen, "Auf Bild anwenden" flacht Strokes
- `PixelateCanvas` — Drag-Rectangle wählt Region, Block-Größe 4–48 px, mehrere Regionen möglich
- `VideoEditor` — Trim (Start-/End-Slider), Auflösung (Original/1080p/720p/480p), "Nur Audio extrahieren" → POST `/api/media/process`
- `AudioEditor` — Trim (Start-/End-Slider) + Effekte: Pitch (-12…+12 Halbtöne, dauer-erhaltend), Speed (0.5×…2×, tonhöhen-erhaltend), Reverse-Checkbox; sendet `audioFx` an `/api/media/process`, Output ist immer `.mp3`

### `src/components/game/`
- `BoardGrid` — Jeopardy-Board-Raster
- `QuestionStage` — Fragen-Overlay auf dem TV
- `Scoreboard` — mode: 'row' (Header) oder 'list' (Game-Over)
- `BuzzerButton` — animierter Buzzer
- `JudgeBar` — Master-Steuerleiste
- `MasterAnswerCard` — Frage + Antwort für Master
- `PhaseBadge` — farbiges Phase-Label
- `QuestionPicker` — Board-Mini-Ansicht zum manuellen Wählen
- `ConnectionGuard` — zeigt Ladescreen bis WebSocket verbunden

---

## Design-System (Tailwind v4 + `@theme`)

Alle Tokens in `src/styles.css` unter `@theme`:
- Hintergrund: `bg-950`/`bg-900`/.../`bg-600` (near-black bis mid-grey)
- Akzente: `violet-700` bis `violet-400`, `cyan-500` bis `cyan-300`, `amber-500`/`amber-400`
- Ink (Text): `ink-50` bis `ink-700`
- Status: `good` (grün), `bad` (rot)
- Schriften: `font-display` (Bebas Neue), `font-board` (Bebas Neue display), Body = Inter Tight
- Radius/Shadow Custom-Tokens für Tile, Card, Glow

Animations-Keyframes: `tile-sheen` (verfügbare Kacheln), `breathing-ring` (aktive States).

---

## Stats & Tracking

Jede relevante Spielaktion wird persistiert, damit lustige Statistiken und Career-Stats abgeleitet werden können. Spieler haben **immer einen User-Account**, daher hängen alle Aggregate an `user.id` (via `gamePlayer.userId`).

### Was wird getrackt
- **`gameEvent`** — Volles Audit-Log. Jeder durch `applyEvent` verarbeitete Event (`START_GAME`, `SELECT_QUESTION`, `START_QUESTION`, `BUZZ`, `JUDGE`, `NEXT_ROUND`, `END_RAPID_FIRE`, `REVEAL_NEXT_MEDIA`, `TOGGLE_NO_PENALTY`, `SKIP_QUESTION`, `VOTE_SKIP`, `PLAYER_CONNECTED/DISCONNECTED`, plus synthetisches `GAME_OVER`) bekommt eine Zeile mit `seq` (lückenlos pro Session), `actorPlayerId/UserId`, `questionId`, JSON-`payload` und `createdAt`. Erlaubt Replay & Ad-hoc-Analysen ohne Schema-Migration.
- **`questionReveal`** — Pro `(sessionId, questionId)` der Zeitpunkt, an dem die Frage in Phase `QUESTION_OPEN` ging. Wird beim `START_QUESTION`-Event geschrieben und beim `loadGameState` für den aktuellen Question wieder in den In-Memory-Map nachgeladen → Reaktionszeiten überleben Server-Restart.
- **`questionAttempt`** — pro Buzz/Judge-Aktion: `isCorrect`, `pointsAwarded`, `buzzedAt`, `resolvedAt`, `attemptOrder` (wievielter Versuch auf diese Frage in der Session), `noPenaltyApplied`, `wasRapidFire`, `revealedMediaIndexAtBuzz`, `reactionMs` (denormalisiert).
- **`buzzLog`** — alle Buzzes mit `revealedAt` + `reactionMs`.
- **`answeredQuestion`** — `resolution` (`solved | skipped | rapid_fire`), `solvedAt`, `firstSolverPlayerId`.
- **`gameSession`** — `winnerPlayerId`, `startedAt` (≠ `createdAt`), `totalQuestions`, `answeredCount`.

### Wo lebt was
- Tracking-Logik: `src/lib/game-state.ts` — Helper `logEvent(sessionId, opts)` schreibt in `gameEvent`. Per-Session-Counter (`seqCounters`) und `questionRevealedAtMap` (für Reaktionszeit) sind In-Memory-Maps **außerhalb** des broadcasteten `GameState`. Beide werden in `loadGameState` aus DB initialisiert.
- Aggregat-Queries: `src/lib/statsQueries.ts` (server-only — nur dynamisch aus `createServerFn`-Handlern importieren). Funktionen: `getCareerStats(userId)`, `getSessionRecap(sessionId)`, `getHallOfFame()`, `getUserSessionHistory(userId)`.

### UI-Routen
- `/sessions/$sessionId/recap` — Recap nach Spielende: Score-Verlauf-Chart (Recharts), Highlight-Cards (schnellster Buzz, beste Trefferquote, längste Streak, größter Verlust …), Spieler-Tabelle, Per-Kategorie-Stats, Per-Frage-Details (collapsible).
- `/stats` — Hall of Fame: globale Top-10-Listen.
- `/stats/users/$userId` — Career-KPIs + Spiel-Historie (mit Recap-Links).

Game-Over-Screens (Master + TV-Board) verlinken automatisch auf den Recap. Header-Navbar hat einen `/stats`-Eintrag für eingeloggte User.

### Wenn du neue Events hinzufügst
1. Neues `case` in `applyEvent` → ruf `logEvent(sessionId, { type, actorPlayerId/UserId, questionId, payload })` auf.
2. Wenn dabei eine neue strukturierte Spalte hinzukommt: Schema + `add-columns.mjs` ergänzen.
3. Wenn der Event in den Recap soll: `getSessionRecap` in `statsQueries.ts` erweitern.

---

## Special-Event-Notifications

Lustige In-Game-Banner für besondere Spielmomente — sichtbar auf TV (groß + Sound), Master (kompakte Toasts) und Player-Phone (personalisiert, nur eigene Beteiligung).

### Persistente Player-Flags (in `PlayerState`)
- `correctStreak`: aktuell korrekt-in-Folge. Reset bei falscher Antwort. Inkrementiert in `applyJudgeEffects`.
- `wrongStreak`: aktuell falsch-in-Folge. Reset bei korrekter Antwort. Bei `noPenaltyApplied=true` unverändert.
- `idleQuestionsCount`: Fragen seit letzter Interaktion. +1 für alle Nicht-Teilnehmer pro abgeschlossener Frage, Reset auf 0 bei Buzz / VOTE_SKIP / SELECT_QUESTION.
- Alle drei werden in `loadGameState` aus `questionAttempt`/`buzzLog`-History rekonstruiert → überlebt Server-Restart.
- Steuern den `PlayerStatusBadge` (Flammen-Ring / Frost-Ring / Zzz-Animation auf Avatar im Scoreboard). Priorität: Fire > Frost > Zzz.

### Ephemere Notifications (in `GameState.eventNotifications`)
Rolling Buffer (max 8, älter als 6 s wird verworfen). Server pusht via `pushNotification(state, type, payload)` aus `src/lib/specialEvents.ts`. Client (`EventNotificationOverlay`) dedupliziert per `id`, rendert für ~4 s, fadet aus.

### Event-Katalog
| Type | Trigger | Schwelle |
|---|---|---|
| `CLOSE_BUZZ` | Zweitplatzierter buzzert ≤ 500 ms nach Gewinner | `CLOSE_BUZZ_WINDOW_MS=500` |
| `SPEED_DEMON` | Gewinner-Buzz mit `reactionMs` < Schwelle | `SPEED_DEMON_MS=250` |
| `ON_FIRE` | Korrekter Judge bringt `correctStreak ≥ 3` (re-trigger bei jedem +1) | `STREAK_THRESHOLD=3` |
| `COLD_STREAK` | Falscher Judge bringt `wrongStreak ≥ 3` | `STREAK_THRESHOLD=3` |
| `STREAK_BROKEN` | Falscher Judge nach `prevCorrectStreak ≥ 3` | — |
| `FIRST_BLOOD` | Erste korrekte Antwort der Session | — |
| `BIG_SCORE` | Korrekte Antwort auf Frage mit höchstem Punktwert | — |
| `ROBBED` | Korrekte Antwort, vorheriger Versuch der gleichen Frage war falsch von anderem Spieler | — |
| `UNDERDOG` | Letzter im Score (mit `≥ 200` Abstand) beantwortet richtig | `UNDERDOG_MIN_GAP=200` |
| `COMEBACK` | War `≥ 1000` hinter Leader, jetzt `< 200` | `COMEBACK_DEFICIT/RECOVERY` |
| `AFK` | `idleQuestionsCount` erreicht Schwelle (genau bei Erreichen) | `AFK_THRESHOLD=4` |
| `PERFECT_CATEGORY` | Kategorie komplett gelöst (alle Fragen mit `solverColors.length > 0`) | — |

Schwellen sind Konstanten in `src/lib/specialEvents.ts`.

### Detection-Hooks in `applyEvent`
- **`BUZZ`**: ruft `detectBuzzEvents(state, newBuzz, allBuzzes)` → SPEED_DEMON / CLOSE_BUZZ. Markiert Buzzer als Participant.
- **`JUDGE`**: erfasst `prevCorrectStreak`, `prevWrongStreak`, `prevScore`, `isFirstCorrectInSession`, `isHighestPointValue`, `prevAttemptOnSameQuestionWasWrongByOther` VOR Mutation; ruft `applyJudgeEffects(state, ctx)` für Streak-Updates + alle Judge-bezogenen Notifications. Bei `state.phase === 'ANSWER_REVEALED' || 'GAME_OVER'`: zusätzlich `onQuestionClosed(state, participants, qId)` → AFK + PERFECT_CATEGORY.
- **`SELECT_QUESTION`**: setzt Participant-Set zurück und markt den auswählenden Spieler.
- **`VOTE_SKIP`**: markt Voter als Participant.
- **`SKIP_QUESTION` / `END_RAPID_FIRE`**: `onQuestionClosed` für AFK-Erhöhung der Nicht-Teilnehmer.

### Persistierung im Audit-Log
Jede neue Notification wird zusätzlich via `logEvent` als `type='SPECIAL_EVENT'` in `gameEvent` gespeichert (Payload: `{ specialType, ...notificationPayload }`). Hilfsfunktion: `persistNewNotifications(sessionId, before, after)`.

### Surfaces
- **TV** (`board.tsx`): `<EventNotificationOverlay surface="tv" />` — alle Events. Hero-Banner mittig (für ON_FIRE / COLD_STREAK / BIG_SCORE etc.), kompakter Stack unten links für CLOSE_BUZZ / AFK / SPEED_DEMON / ROBBED. **Sound-Trigger** via `new Audio('/sounds/events/*.mp3')` (siehe `public/sounds/events/README.md`).
- **Master** (`master.tsx`): `<EventNotificationOverlay surface="master" />` — nur `CLOSE_BUZZ` + `AFK` als kompakter Toast oben rechts (z-30, unter dem Header). Kein Sound.
- **Player** (`play.tsx`): `<EventNotificationOverlay surface="player" selfPlayerId={playerId} />` — personalisiert: filtert auf Notifications, an denen der eigene `playerId` beteiligt ist (via `payload.playerId / winnerPlayerId / loserPlayerId / thiefPlayerId / robbedPlayerId`). Eigener Wortlaut („Du bist on fire!", „Du um 23 ms verpasst"). Toast oben mittig, kein Sound.

### Sound-Slots (TV-only)
Slots in `public/sounds/events/` (Code referenziert `.mp3`):
- `on-fire.mp3` — ON_FIRE / STREAK_BROKEN / SPEED_DEMON / BIG_SCORE
- `cold.mp3` — COLD_STREAK
- `snore.mp3` — AFK
- `chime.mp3` — CLOSE_BUZZ / FIRST_BLOOD / UNDERDOG / COMEBACK / ROBBED / PERFECT_CATEGORY

Fehlende Files → `Audio.play()` rejected stillschweigend, kein Crash. User dropped MP3s einfach mit den Slot-Namen rein.

### CSS-Animations in `src/styles.css`
- `flame-pulse` → `.fx-flame-ring` (Hot-Streak-Avatar-Glow)
- `frost-shimmer` → `.fx-frost-ring` (Cold-Streak-Avatar-Frost)
- `zzz-float` → `.fx-zzz` mit `.fx-zzz-delay-1/2` (AFK-Z-Stapel)
- `banner-slam` → `.fx-banner-slam` (Hero-Banner-Einschlag)
- `shake-fast` → `.fx-shake` (STREAK_BROKEN / ROBBED)
- `flame-flicker` → `.fx-flame-flicker` (Flammen-Icons im Banner)

### Wenn du neue Events hinzufügst
1. `SpecialEventType` in `game-state.ts` erweitern.
2. Detection in `specialEvents.ts` (entweder neue Funktion oder bestehende erweitern).
3. Hook in passendem `applyEvent`-Case → `pushNotification` + `persistNewNotifications`.
4. Visual in `EventNotificationOverlay` ergänzen — `HeroBanner` (TV-groß) und/oder `CompactToast` (Stack), Sound-Mapping in `SOUND_MAP`, ggf. `isHeroEvent` und `isVisibleOnSurface` anpassen.
5. Diesen Abschnitt updaten.

---

## Noch ausstehend / bekannte Lücken

- Mehrere Medien-Carousel auf dem TV noch nicht vollständig integriert (Komponente `MediaCarousel` existiert, QuestionStage nutzt noch legacy `mediaUrl`)
- Skip-Vote-Feature implementiert in game-state, UI auf Spieler-Seite ggf. noch unvollständig
- E-Mail-Versand benötigt konfigurierte SMTP-Umgebungsvariablen
- TypeScript-Fehler in `admin/invites.tsx` (loader nutzt auth dynamisch — funktioniert, aber TS meckert)
- Neue DB-Spalten erfordern manuelles Ausführen von `node scripts/add-columns.mjs` nach dem Pull (drizzle-kit `push` scheitert an FK-Constraints im SQLite-Recreate)
