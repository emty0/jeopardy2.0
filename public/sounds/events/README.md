# Special-Event-Sounds (TV-Surface)

Diese Slots werden vom `EventNotificationOverlay` (TV) abgespielt, wenn die jeweiligen
Spezial-Events triggern. Solange die Dateien fehlen, wird `Audio.play()` lautlos rejected — kein Crash.

## Slots

| Datei | Verwendet für |
|---|---|
| `on-fire.mp3` | `ON_FIRE`, `STREAK_BROKEN`, `SPEED_DEMON`, `BIG_SCORE` (Flammen-Whoosh / Bonus-Ding) |
| `cold.mp3` | `COLD_STREAK` (Frost-Crack / Eis-Knacken) |
| `snore.mp3` | `AFK` (kurzer Schnarchlaut) |
| `chime.mp3` | `CLOSE_BUZZ`, `FIRST_BLOOD`, `UNDERDOG`, `COMEBACK`, `ROBBED`, `PERFECT_CATEGORY` (positiver Ding) |

## Hinweise

- Empfohlene Länge: **0.5–1.5 s**, normalisierte Lautstärke (Code reduziert auf 60 %).
- Format: **MP3** (vom Code hardcoded). WAV/OGG funktionieren nicht ohne Code-Anpassung.
- Sound spielt **nur auf TV-Surface** (`/sessions/.../board`). Master- und Player-Phones sind stumm.
- Audio-Autoplay ist nur möglich nachdem User mit der Seite interagiert hat (Browser-Policy). Auf der TV-Ansicht reicht ein Klick irgendwohin.

Drop deine eigenen MP3s mit den genannten Dateinamen hier rein und sie werden automatisch genutzt.
