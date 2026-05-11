import { Flame, Snowflake } from 'lucide-react'
import type { PlayerState } from '#/lib/game-state'
import { STREAK_THRESHOLD, AFK_THRESHOLD } from '#/lib/specialEvents'

type StatusKind = 'fire' | 'frost' | 'zzz' | null

function statusForPlayer(p: PlayerState): StatusKind {
  if (p.correctStreak >= STREAK_THRESHOLD) return 'fire'
  if (p.wrongStreak >= STREAK_THRESHOLD) return 'frost'
  if (p.idleQuestionsCount >= AFK_THRESHOLD) return 'zzz'
  return null
}

interface Props {
  player: PlayerState
  size?: 'sm' | 'md'
}

/**
 * Overlay-Effekt auf einem Avatar: Flammen-Ring (Hot-Streak),
 * Frost-Ring (Cold-Streak) oder schwebende Z's (AFK).
 *
 * Wird absolut innerhalb des Avatar-Containers (`relative`) positioniert.
 * Priorität: Fire > Frost > Zzz (exklusiv).
 */
export function PlayerStatusBadge({ player, size = 'md' }: Props) {
  const kind = statusForPlayer(player)
  if (!kind) return null

  const dim = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'

  if (kind === 'fire') {
    return (
      <>
        <span
          aria-hidden
          className={`absolute inset-0 ${dim} rounded-full pointer-events-none fx-flame-ring`}
        />
        <span
          aria-hidden
          className="absolute -top-2 -right-1 text-amber-400 fx-flame-flicker pointer-events-none drop-shadow-[0_0_4px_rgba(245,158,11,0.7)]"
        >
          <Flame className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill="currentColor" />
        </span>
      </>
    )
  }

  if (kind === 'frost') {
    return (
      <>
        <span
          aria-hidden
          className={`absolute inset-0 ${dim} rounded-full pointer-events-none fx-frost-ring`}
        />
        <span
          aria-hidden
          className="absolute -top-2 -right-1 text-cyan-300 pointer-events-none drop-shadow-[0_0_4px_rgba(125,211,252,0.7)]"
        >
          <Snowflake className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </span>
      </>
    )
  }

  // zzz
  return (
    <span
      aria-hidden
      className="absolute -top-1 -right-1 pointer-events-none select-none"
    >
      <span className={`absolute font-board text-[10px] text-cyan-200 fx-zzz`}>z</span>
      <span className={`absolute font-board text-[12px] text-cyan-200 fx-zzz fx-zzz-delay-1`}>z</span>
      <span className={`absolute font-board text-[14px] text-cyan-200 fx-zzz fx-zzz-delay-2`}>z</span>
    </span>
  )
}
