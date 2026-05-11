import { motion } from 'framer-motion'
import type { PlayerState } from '#/lib/game-state'
import { formatPoints, initials } from '#/lib/format'
import { PlayerStatusBadge } from './PlayerStatusBadge'

interface ScoreboardProps {
  players: PlayerState[]
  masterId: string
  activePlayerId: string | null
  selfPlayerId?: string | null
  mode: 'row' | 'list' | 'compact'
}

export function Scoreboard({
  players,
  masterId,
  activePlayerId,
  selfPlayerId,
  mode,
}: ScoreboardProps) {
  const ranked = [...players]
    .filter(p => p.userId !== masterId)
    .sort((a, b) => b.score - a.score)

  if (mode === 'row') {
    return (
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
        {ranked.map(p => {
          const active = p.id === activePlayerId
          return (
            <motion.div
              key={p.id}
              layout
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="flex items-center gap-2.5 shrink-0"
            >
              <Avatar name={p.displayName} active={active} connected={p.isConnected} player={p} />
              <div className="leading-tight">
                <p
                  className={`text-[11px] uppercase tracking-wider truncate max-w-[7rem] ${
                    active ? 'text-amber-400' : 'text-ink-300'
                  }`}
                >
                  {p.displayName}
                </p>
                <p
                  className={`font-board text-2xl ${
                    active ? 'text-amber-400' : 'text-cyan-400'
                  }`}
                >
                  {formatPoints(p.score)}
                </p>
              </div>
            </motion.div>
          )
        })}
        {ranked.length === 0 && (
          <p className="text-ink-500 text-xs italic">Noch keine Spieler</p>
        )}
      </div>
    )
  }

  if (mode === 'compact') {
    return (
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {ranked.map(p => {
          const isSelf = p.id === selfPlayerId
          return (
            <div
              key={p.id}
              className={`flex items-center gap-1.5 shrink-0 px-2.5 h-8 rounded-full border ${
                isSelf
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                  : 'border-bg-700 bg-bg-800 text-ink-200'
              }`}
            >
              <span className="text-[11px] font-semibold truncate max-w-[5rem]">
                {p.displayName}
              </span>
              <span className="text-xs font-bold tabular-nums">{formatPoints(p.score)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {ranked.map((p, i) => {
        const isSelf = p.id === selfPlayerId
        const active = p.id === activePlayerId
        return (
          <motion.li
            key={p.id}
            layout
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={`flex items-center gap-3 px-3 h-11 rounded-xl border ${
              isSelf
                ? 'border-cyan-500/40 bg-cyan-500/5'
                : 'border-bg-700 bg-bg-800'
            }`}
          >
            <span className="text-ink-500 text-xs font-bold w-4 tabular-nums">{i + 1}</span>
            <Avatar name={p.displayName} active={active} connected={p.isConnected} size="sm" player={p} />
            <span
              className={`flex-1 truncate text-sm font-semibold ${
                isSelf ? 'text-cyan-300' : 'text-ink-50'
              }`}
            >
              {p.displayName}
              {isSelf && <span className="text-ink-500 font-normal ml-1">(Du)</span>}
            </span>
            <span
              className={`font-board text-xl tabular-nums ${
                active ? 'text-amber-400' : 'text-cyan-400'
              }`}
            >
              {formatPoints(p.score)}
            </span>
          </motion.li>
        )
      })}
    </ul>
  )
}

interface AvatarProps {
  name: string
  active?: boolean
  connected?: boolean
  size?: 'sm' | 'md'
  /** Optional: Spieler-Daten zur Anzeige des Status-Badges (Flammen / Frost / Zzz). */
  player?: PlayerState
}

export function Avatar({ name, active = false, connected = true, size = 'md', player }: AvatarProps) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  return (
    <div className="relative shrink-0">
      <div
        className={`${dim} rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center font-bold text-white border-2 ${
          active ? 'border-amber-400' : 'border-bg-900'
        }`}
      >
        {initials(name)}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-900 ${
          connected ? 'bg-good' : 'bg-bg-600'
        }`}
      />
      {player && <PlayerStatusBadge player={player} size={size} />}
    </div>
  )
}
