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
- Endpoint: `server/routes/api/media/process.ts` — POST `{ url, trim?, resizeHeight?, extractAudio? }` → `{ url, type }`.
- Nutzt `fluent-ffmpeg` + `ffmpeg-static` (FFmpeg-Binary kommt als npm-Paket, kein System-Install).
- Operationen kombinierbar in einem Aufruf (Trim + Resize gleichzeitig).
- Resize via `-vf scale=-2:HEIGHT` (Breite auf gerade Zahl gerundet für libx264).
- Audio-Extract → `.mp3` (libmp3lame, 192k); Antwort-`type` wechselt automatisch auf `'audio'`.
- Upload-Limit liegt bei **200 MB** (Image/Audio/Video, in `server/routes/api/upload.ts`).

### Helper
- `src/lib/canvas-utils.ts` — `loadImage`, `pixelateRegion`, `getCroppedBlob`, `canvasToBlob`, `uploadBlob`.
- `src/lib/media-types.ts` — `MediaType`, `isImage/isVideo/isAudio/isEditable`, `mediaTypeFromMime`.

### Bekannte Limits
- Audio-Dateien sind in Phase 1 nicht editierbar (Editor öffnet nicht für `audio`).
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
- **Vollbild**: Jeder Carousel hat ein Maximize-Icon (oben rechts). Klick → CSS-Overlay (`fixed inset-0 z-[200] bg-black/95`), Esc beendet. Auf Audio nicht aktiv. Steuerung via `allowFullscreen`-Prop (Default `true`).
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
- `MediaEditorModal` — Wrapper-Modal, dispatched zu Image- oder Video-Editor (Audio/YouTube nicht editierbar)
- `ImageEditor` — Tabs: Zuschneiden (`react-easy-crop`) · Zeichnen · Verpixeln; Master-Canvas wird zwischen Tabs geteilt, Speichern lädt Endresultat als PNG via `/api/upload`
- `PaintCanvas` — Pointer-basiertes Freihand-Zeichnen, 7 Farben + Stärke 1–40 px, Rückgängig/Löschen, "Auf Bild anwenden" flacht Strokes
- `PixelateCanvas` — Drag-Rectangle wählt Region, Block-Größe 4–48 px, mehrere Regionen möglich
- `VideoEditor` — Trim (Start-/End-Slider), Auflösung (Original/1080p/720p/480p), "Nur Audio extrahieren" → POST `/api/media/process`

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

## Noch ausstehend / bekannte Lücken

- Mehrere Medien-Carousel auf dem TV noch nicht vollständig integriert (Komponente `MediaCarousel` existiert, QuestionStage nutzt noch legacy `mediaUrl`)
- Skip-Vote-Feature implementiert in game-state, UI auf Spieler-Seite ggf. noch unvollständig
- E-Mail-Versand benötigt konfigurierte SMTP-Umgebungsvariablen
- TypeScript-Fehler in `admin/invites.tsx` (loader nutzt auth dynamisch — funktioniert, aber TS meckert)
- Neue DB-Spalten erfordern manuelles Ausführen von `node scripts/add-columns.mjs` nach dem Pull (drizzle-kit `push` scheitert an FK-Constraints im SQLite-Recreate)
