import { Pill } from '#/components/ui'
import type { GamePhase } from '#/lib/game-state'

const phaseConfig: Record<
  GamePhase,
  { label: string; tone: 'neutral' | 'violet' | 'cyan' | 'amber' | 'good' | 'bad' }
> = {
  LOBBY: { label: 'Lobby', tone: 'neutral' },
  SELECTING: { label: 'Auswahl', tone: 'violet' },
  QUESTION_PREVIEW: { label: 'Vorschau', tone: 'violet' },
  QUESTION_OPEN: { label: 'Buzzer offen', tone: 'amber' },
  BUZZING: { label: 'Buzzer offen', tone: 'amber' },
  JUDGING: { label: 'Bewertung', tone: 'cyan' },
  ANSWER_REVEALED: { label: 'Antwort', tone: 'good' },
  GAME_OVER: { label: 'Beendet', tone: 'neutral' },
  SESSION_CLOSED: { label: 'Beendet', tone: 'bad' },
}

export function PhaseBadge({ phase }: { phase: GamePhase }) {
  const cfg = phaseConfig[phase]
  return <Pill tone={cfg.tone}>{cfg.label}</Pill>
}
